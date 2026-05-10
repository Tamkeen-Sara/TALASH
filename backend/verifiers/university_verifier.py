"""
University Verifier — Production Grade

Pipeline per institution:
  1. SQLite cache        (instant, 90-day TTL)
  2. ROR API             (ror.org — 110k+ institutions, free, resolves name aliases)
  3. OpenAlex            (real-time h-index, citations, research output per institution)
                         Computes quality tier from actual academic output data.
  4. QS rank lookup      (from curated CSV or seed data — supplementary, annual)
  5. Unranked / Unknown

Why OpenAlex instead of just QS:
  - OpenAlex updates continuously from actual publication data
  - QS = 40% employer surveys + 40% academic reputation polls (subjective)
  - OpenAlex covers every institution that has published — QS only ranks ~1400
  - Quality tier from h-index/citations is more objective for academic hiring

The QS CSV (data/qs_rankings.csv) is optional — if present it adds the rank number.
It does NOT drive recognition or quality tier — OpenAlex does that.
"""
import asyncio
import aiohttp
import csv
import json
import sqlite3
import urllib.parse
from pathlib import Path
from rapidfuzz import fuzz, process
from backend.config import settings
from backend.schemas.education import DegreeRecord

_RANKINGS_DB  = "data/university_rankings.db"
_QS_CSV_PATH  = "data/qs_rankings.xlsx"
_ROR_API      = "https://api.ror.org/organizations"
_OPENALEX_ROR = "https://api.openalex.org/institutions?filter=ror:{ror_id}&mailto={mailto}"
_OPENALEX_NAME= "https://api.openalex.org/institutions?search={name}&mailto={mailto}&per_page=1"

_qs_cache: dict[str, dict] = {}      # canonical_name → all QS fields
_qs_aliases: dict[str, str] = {}     # normalized alias → canonical QS name
_db_cache: dict[str, dict] = {}      # institution name → full result (in-process cache)


# ─── Quality tier from OpenAlex metrics ───────────────────────────────────────
# Based on actual research output: h-index of the institution's full body of work.
# These thresholds are calibrated to roughly correlate with global standing.

def _quality_tier_from_metrics(h_index: int, works_count: int, cited_by_count: int) -> dict:
    """
    Compute a research quality tier from OpenAlex institution metrics.
    Calibrated against real OpenAlex values:
      MIT ~1200, Oxford ~900, NUST ~180, COMSATS ~80, IST ~30
    Returns tier label, approximate QS band, and the raw metrics.
    """
    if h_index >= 800 or cited_by_count >= 50_000_000:
        tier, band = "Elite",     "Global Top 50"
    elif h_index >= 500 or cited_by_count >= 15_000_000:
        tier, band = "Excellent", "Global Top 200"
    elif h_index >= 300 or cited_by_count >= 5_000_000:
        tier, band = "Strong",    "Global Top 500"
    elif h_index >= 150 or cited_by_count >= 1_000_000:
        tier, band = "Good",      "Global Top 1000"
    elif h_index >= 50  or cited_by_count >= 100_000:
        tier, band = "Recognized","Nationally Ranked"
    elif works_count >= 200:
        tier, band = "Known",     "HEC Recognized"
    else:
        tier, band = "Known",     "Recognized Institution"

    return {
        "quality_tier": tier,
        "quality_band": band,
        "h_index":      h_index,
        "works_count":  works_count,
        "cited_by_count": cited_by_count,
    }


# ─── QS data helpers ──────────────────────────────────────────────────────────

def _parse_rank(val) -> int | None:
    """
    Parse rank value from Excel or CSV.
    Handles: 664, 664.0, "664", "664.0", "801-1000", "1001+", "=664"
    Excel stores numbers as floats — "664.0" is the common case.
    """
    if val is None or val == "":
        return None
    # Already numeric (openpyxl returns int/float for number cells)
    if isinstance(val, (int, float)):
        v = int(val)
        return v if v > 0 else None
    val = str(val).strip().lstrip("=#▲▼ ")  # strip QS indicator symbols
    if not val:
        return None
    # Float string like "664.0"
    try:
        return int(float(val))
    except ValueError:
        pass
    # Range like "801-1000" or "801–1000"
    import re
    m = re.match(r"(\d+)\s*[-–]\s*(\d+)", val)
    if m:
        return (int(m.group(1)) + int(m.group(2))) // 2
    # "1001+" style
    m2 = re.match(r"(\d+)\+", val)
    if m2:
        return int(m2.group(1)) + 50
    return None


def _parse_rank_label(val) -> str | None:
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        v = int(val)
        return str(v) if v > 0 else None
    text = str(val).strip().lstrip("=#▲▼ ")
    return text or None


def _parse_float(val: str) -> float | None:
    try:
        return float(str(val).strip()) if val and str(val).strip() else None
    except (ValueError, TypeError):
        return None


def _normalize_country(value: str) -> str:
    return _normalize_alias(value)


def _country_matches(qs_country: str | None, expected_country: str | None) -> bool:
    if not expected_country:
        return True
    if not qs_country:
        return False

    qs_norm = _normalize_country(qs_country)
    exp_norm = _normalize_country(expected_country)
    if not qs_norm or not exp_norm:
        return False

    return qs_norm == exp_norm or qs_norm in exp_norm or exp_norm in qs_norm


def _normalize_alias(value: str) -> str:
    return "".join(ch for ch in str(value).upper() if ch.isalnum())


def _alias_candidates(name: str) -> set[str]:
    import re

    aliases: set[str] = set()
    if not name:
        return aliases

    stripped = str(name).strip()
    normalized = _normalize_alias(stripped)
    if normalized:
        aliases.add(normalized)

    # Parenthetical acronyms are the strongest explicit aliases in QS names.
    for match in re.findall(r"\(([^)]+)\)", stripped):
        compact = _normalize_alias(match)
        if 2 <= len(compact) <= 12:
            aliases.add(compact)

    words = [w for w in re.split(r"[^A-Za-z0-9]+", stripped) if w]

    # Any short all-caps token in the name is a likely explicit alias,
    # e.g. "FAST" or "NUST" when the QS row includes it in parentheses.
    for token in words:
        if token.upper() == token and 2 <= len(token) <= 12:
            aliases.add(_normalize_alias(token))

    return aliases


def _register_qs_aliases(name: str):
    canonical = str(name or "").strip()
    if not canonical:
        return
    for alias in _alias_candidates(canonical):
        _qs_aliases.setdefault(alias, canonical)


# Column name aliases — QS uses different column names across years
_COL_ALIASES = {
    "name":                   ["Institution", "institution", "Name", "name", "University"],
    "qs_rank":                ["2026", "2025", "2024", "Rank", "rank", "qs_rank", "Overall Rank"],
    "overall":                ["Overall", "overall", "Overall Score", "Score"],
    "academic_reputation":    ["Academic Reputation", "Academic Rep", "AR"],
    "employer_reputation":    ["Employer Reputation", "Employer Rep", "ER"],
    "citations_per_faculty":  ["Citations per Faculty", "Citations/Faculty", "CPF", "CF"],
    "faculty_student":        ["Faculty Student", "Faculty/Student", "FSR"],
    "international_faculty":  ["International Faculty", "IFR"],
    "international_students": ["International Students", "ISR"],
}


def _find_col(headers: list[str], aliases: list[str]) -> str | None:
    """Return first header that matches any alias.
    Tries exact match first, then case-insensitive partial containment.
    Strips leading/trailing whitespace and internal newlines from headers.
    """
    cleaned = [h.replace("\n", " ").strip() for h in headers]
    # Exact match (case-insensitive)
    for alias in aliases:
        for orig, h in zip(headers, cleaned):
            if h.lower() == alias.lower():
                return orig
    # Partial containment
    for alias in aliases:
        for orig, h in zip(headers, cleaned):
            if alias.lower() in h.lower() or h.lower() in alias.lower():
                return orig
    return None


def _load_qs_data():
    """Load QS data from CSV (all columns) or fall back to seed data."""
    global _qs_cache, _qs_aliases
    if _qs_cache:
        return

    csv_path = Path(_QS_CSV_PATH)

    if csv_path.exists():
        try:
            # Try reading as Excel first, then CSV
            suffix = csv_path.suffix.lower()
            if suffix in (".xlsx", ".xls"):
                try:
                    import openpyxl
                    wb       = openpyxl.load_workbook(csv_path, data_only=True)
                    ws       = wb.active
                    rows_raw = list(ws.iter_rows(values_only=True))

                    # QS Excel has complex multi-row headers — find the row that
                    # contains BOTH a rank-like column AND "Institution"
                    header_idx = 0
                    for i, row in enumerate(rows_raw[:15]):
                        cells = [str(c or "").strip() for c in row]
                        has_inst = any("institution" in c.lower() or c.lower() == "name"
                                       for c in cells)
                        has_rank = any(c in ("2026","2025","2024","Rank","rank") or
                                       "rank" in c.lower() for c in cells)
                        if has_inst and has_rank:
                            header_idx = i
                            break
                        elif has_inst:
                            header_idx = i
                            break

                    headers = [str(c or "").strip() for c in rows_raw[header_idx]]
                    # Skip blank headers (merged cells leave empty strings)
                    # Give blank headers a placeholder so zip works correctly
                    headers = [h if h else f"_col{i}" for i, h in enumerate(headers)]

                    data_rows = []
                    # Skip sub-header rows (QS Excel has Row 1: category names, Row 2: metric names like "AR SCORE", "CPF RANK")
                    # Find the first row that doesn't look like a sub-header (not mostly "SCORE"/"RANK" keywords)
                    start_idx = header_idx + 1
                    while start_idx < len(rows_raw):
                        row_cells = [str(c or "").strip().upper() for c in rows_raw[start_idx]]
                        # Count how many cells contain "SCORE" or "RANK" (sub-header marker)
                        sub_header_count = sum(1 for c in row_cells if "SCORE" in c or "RANK" in c)
                        # If >= 3 cells are sub-header markers, skip this row
                        if sub_header_count >= 3:
                            start_idx += 1
                        else:
                            break
                    
                    for row in rows_raw[start_idx:]:
                        # Keep raw values (int/float) so _parse_rank handles them correctly.
                        # Only stringify None → empty string for string fields.
                        cells = [c if c is not None else "" for c in row]
                        if not any(str(c).strip() for c in cells):
                            continue  # skip blank rows
                        data_rows.append(dict(zip(headers, cells)))

                except ImportError:
                    print("[university_verifier] openpyxl not installed, trying as CSV.")
                    data_rows = []
            else:
                with open(csv_path, newline="", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    data_rows = list(reader)

            if data_rows:
                headers = list(data_rows[0].keys())
                print(f"[university_verifier] Excel headers ({len(headers)}): "
                    f"{[h for h in headers if h and not h.startswith('_col')]}")
                col_name = _find_col(headers, _COL_ALIASES["name"])
                col_rank = _find_col(headers, _COL_ALIASES["qs_rank"])
                col_over = _find_col(headers, _COL_ALIASES["overall"])
                col_country = _find_col(headers, ["Location", "Country/Territory", "Country", "Country Territory"])
                col_ar = _find_col(headers, _COL_ALIASES["academic_reputation"])
                col_cpf = _find_col(headers, _COL_ALIASES["citations_per_faculty"])
                print(f"[university_verifier] Detected columns — name:{col_name!r} "
                    f"rank:{col_rank!r} overall:{col_over!r} country:{col_country!r} "
                    f"acad_rep:{col_ar!r} cit_fac:{col_cpf!r}")

                loaded = 0
                for row in data_rows:
                    name = (row.get(col_name) or "").strip() if col_name else ""
                    rank_raw = row.get(col_rank, "") if col_rank else None
                    rank = _parse_rank(rank_raw) if col_rank else None
                    if not name or not rank:
                        continue
                    _qs_cache[name] = {
                        "qs_rank":                rank,
                        "qs_rank_label":          _parse_rank_label(rank_raw),
                        "overall":                _parse_float(row.get(col_over))  if col_over else None,
                        "country":                (row.get(col_country) or "").strip() if col_country else None,
                        "academic_reputation":    _parse_float(row.get(col_ar))    if col_ar   else None,
                        "citations_per_faculty":  _parse_float(row.get(col_cpf))   if col_cpf  else None,
                    }
                    _register_qs_aliases(name)
                    loaded += 1
                print(f"[university_verifier] Built {len(_qs_aliases)} QS aliases from loaded institutions")
                print(f"[university_verifier] Loaded {loaded} universities from {csv_path.name}")
                return
        except Exception as e:
            print(f"[university_verifier] QS CSV/Excel load failed: {e}")

    # Seed fallback
    seed = [
        ("Massachusetts Institute of Technology", 1),
        ("University of Cambridge", 2),
        ("University of Oxford", 3),
        ("Harvard University", 4),
        ("Stanford University", 5),
        ("Imperial College London", 6),
        ("ETH Zurich", 7),
        ("National University of Singapore", 8),
        ("University College London", 9),
        ("University of California Berkeley", 10),
        ("Carnegie Mellon University", 52),
        ("Cornell University", 13),
        ("Princeton University", 17),
        ("Columbia University", 22),
        ("University of Toronto", 21),
        ("University of Michigan", 23),
        ("Johns Hopkins University", 24),
        ("Nanyang Technological University", 26),
        ("University of Edinburgh", 22),
        ("University of Manchester", 32),
        ("University of Melbourne", 33),
        ("Australian National University", 34),
        ("Kyoto University", 46),
        ("University of Tokyo", 28),
        ("Seoul National University", 41),
        ("Peking University", 14),
        ("Tsinghua University", 16),
        ("Indian Institute of Technology Bombay", 149),
        ("Indian Institute of Technology Delhi", 150),
        ("Indian Institute of Science Bangalore", 225),
        ("University of Cape Town", 226),
        ("National University of Sciences and Technology", 391),
        ("Lahore University of Management Sciences", 631),
        ("Quaid-i-Azam University", 871),
        ("COMSATS University Islamabad", 981),
        ("Pakistan Institute of Engineering and Applied Sciences", 801),
    ]
    for name, rank in seed:
        _qs_cache[name] = {"qs_rank": rank, "overall": None,
                           "country": None,
                           "qs_rank_label": str(rank),
                           "academic_reputation": None, "citations_per_faculty": None}
        _register_qs_aliases(name)
    print(f"[university_verifier] Using seed data: {len(_qs_cache)} universities.")


def _qs_lookup(canonical_name: str, country: str | None = None) -> dict:
    """
    Match a canonical institution name against the QS dataset.

    Two-gate approach eliminates false positives from shared generic tokens:
      Gate 1 — WRatio ≥ threshold  (weighted combination of ratio strategies,
                handles minor typos, word-order differences, extra tokens)
      Gate 2 — fuzz.ratio ≥ 68     (Levenshtein similarity of the full strings,
                order-sensitive; rejects cases where only generic words match)

    Why Gate 2 is essential:
      token_set_ratio("Institute of Space Technology",
                      "Massachusetts Institute of Technology (MIT)") = 88
        → false match: both share "Institute", "of", "Technology"
      fuzz.ratio(same pair) ≈ 57
        → correctly rejected by Gate 2

    Threshold source: settings.university_fuzzy_threshold (default 80).
    Raising to 80 (from the old 75) plus Gate 2 makes the matcher precise
    enough for canonical names that already come from ROR (i.e. mostly correct).
    """
    _load_qs_data()
    if not _qs_cache:
        return {}

    normalized_input = _normalize_alias(canonical_name)
    if normalized_input and normalized_input in _qs_aliases:
        matched_name = _qs_aliases[normalized_input]
        data = _qs_cache.get(matched_name)
        if data and _country_matches(data.get("country"), country):
            print(f"[QS] '{canonical_name}' → alias match '{matched_name}' rank={data.get('qs_rank')}")
            return data

    for alias in _alias_candidates(canonical_name):
        matched_name = _qs_aliases.get(alias)
        if matched_name:
            data = _qs_cache.get(matched_name)
            if data and _country_matches(data.get("country"), country):
                print(f"[QS] '{canonical_name}' → alias match '{matched_name}' rank={data.get('qs_rank')}")
                return data

    names  = [name for name, data in _qs_cache.items() if _country_matches(data.get("country"), country)]
    if not names:
        names = list(_qs_cache.keys())
    result = process.extractOne(
        canonical_name, names,
        scorer=fuzz.WRatio,
        score_cutoff=max(settings.university_fuzzy_threshold, 80),
    )
    if not result:
        print(f"[QS] '{canonical_name}' → no match found")
        return {}

    matched_name, score, _ = result

    # Gate 2: full-string Levenshtein must also be reasonable
    direct_ratio = fuzz.ratio(canonical_name, matched_name)
    if direct_ratio < 68:
        print(f"[QS] '{canonical_name}' → rejected '{matched_name}' "
              f"(WRatio={score:.1f} passed but ratio={direct_ratio:.1f} < 68 — likely false match)")
        return {}

    data = _qs_cache[matched_name]
    print(f"[QS] '{canonical_name}' → '{matched_name}' "
          f"(WRatio={score:.1f}, ratio={direct_ratio:.1f}) rank={data.get('qs_rank')}")
    return data


# ─── ROR API ──────────────────────────────────────────────────────────────────

def _clean_institution_name(name: str) -> str:
    """
    Strip campus/branch suffixes before querying ROR.
    'COMSATS University Islamabad, Abbottabad Campus' → 'COMSATS University Islamabad'
    """
    import re
    # Remove everything after a comma that contains campus/branch keywords
    cleaned = re.sub(
        r',?\s*(abbottabad|attock|lahore|wah|sahiwal|vehari|campus|branch|'
        r'constituent college|city campus|main campus|satellite)\b.*',
        '', name, flags=re.IGNORECASE
    ).strip()
    # Remove any trailing comma left after stripping (e.g. "COMSATS University, Islamabad,")
    cleaned = cleaned.rstrip(',').strip()
    return cleaned or name


def _parse_ror_org(org: dict, score: float = 1.0) -> dict:
    return {
        "canonical_name": org.get("name"),
        "country":        org.get("country", {}).get("country_name"),
        "types":          org.get("types", []),
        "ror_id":         org.get("id", "").replace("https://ror.org/", ""),
        "confidence":     score,
    }


async def _ror_lookup(name: str) -> dict:
    """
    Real-time institution resolution via ROR with three-strategy fallback:

    Strategy 1 — affiliation endpoint (?affiliation=):
      Designed for noisy affiliation strings from paper metadata.
      Handles full names, campus variants, common misspellings.

    Strategy 2 — full-text query endpoint (?query=):
      Searches ROR's full corpus including acronyms, aliases, and
      abbreviations stored per-institution (e.g. NUST, LUMS, KAIST).
      Catches cases where the affiliation endpoint returns no result
      because the input is a bare acronym with no surrounding context.

    Strategy 3 — retry affiliation with original (un-cleaned) name:
      Last resort when campus-suffix stripping removed too much context.
    """
    cleaned = _clean_institution_name(name)
    query   = cleaned if cleaned != name else name

    async with aiohttp.ClientSession() as session:
        headers = {"User-Agent": "TALASH/1.0 (academic-hiring; mailto:talash@seecs.edu.pk)"}
        timeout = aiohttp.ClientTimeout(total=7)

        # ── Strategy 1: affiliation endpoint (cleaned name) ──────────────────
        try:
            url = f"{_ROR_API}?{urllib.parse.urlencode({'affiliation': query})}"
            async with session.get(url, timeout=timeout, headers=headers) as r:
                if r.status == 200:
                    items = (await r.json()).get("items", [])
                    if items:
                        best = items[0]
                        return _parse_ror_org(best.get("organization", {}), best.get("score", 0))
        except Exception as e:
            print(f"[ROR] affiliation lookup error for '{query}': {e}")

        # ── Strategy 2: full-text query (searches acronyms/aliases in ROR) ───
        # This resolves bare abbreviations like NUST, LUMS, PIEAS that ROR
        # stores as official acronyms in its institution records.
        try:
            url2 = f"{_ROR_API}?{urllib.parse.urlencode({'query': query, 'page': '1'})}"
            async with session.get(url2, timeout=timeout, headers=headers) as r2:
                if r2.status == 200:
                    items2 = (await r2.json()).get("items", [])
                    if items2:
                        # ROR full-text returns items directly (not scored like affiliation)
                        org2 = items2[0]
                        if isinstance(org2, dict) and org2.get("name"):
                            return _parse_ror_org(org2)
        except Exception as e:
            print(f"[ROR] query lookup error for '{query}': {e}")

        # ── Strategy 3: affiliation with original (un-cleaned) name ──────────
        if query != name:
            try:
                url3 = f"{_ROR_API}?{urllib.parse.urlencode({'affiliation': name})}"
                async with session.get(url3, timeout=timeout, headers=headers) as r3:
                    if r3.status == 200:
                        items3 = (await r3.json()).get("items", [])
                        if items3:
                            best3 = items3[0]
                            return _parse_ror_org(best3.get("organization", {}), best3.get("score", 0))
            except Exception as e:
                print(f"[ROR] fallback affiliation error for '{name}': {e}")

    return {}


# ─── OpenAlex institutions ─────────────────────────────────────────────────────

async def _openalex_by_ror(session: aiohttp.ClientSession, ror_id: str) -> dict:
    try:
        url = _OPENALEX_ROR.format(ror_id=ror_id, mailto=settings.polite_mailto)
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                results = (await r.json()).get("results", [])
                if results:
                    return _parse_openalex_institution(results[0])
    except Exception:
        pass
    return {}


async def _openalex_by_name(session: aiohttp.ClientSession, name: str) -> dict:
    try:
        url = _OPENALEX_NAME.format(
            name=urllib.parse.quote(name), mailto=settings.polite_mailto
        )
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                results = (await r.json()).get("results", [])
                if results:
                    return _parse_openalex_institution(results[0])
    except Exception:
        pass
    return {}


def _parse_openalex_institution(inst: dict) -> dict:
    stats = inst.get("summary_stats") or {}
    return {
        "openalex_id":    inst.get("id"),
        "display_name":   inst.get("display_name"),
        "country_code":   inst.get("country_code"),
        "type":           inst.get("type"),
        "h_index":        stats.get("h_index") or 0,
        "works_count":    inst.get("works_count") or 0,
        "cited_by_count": inst.get("cited_by_count") or 0,
    }


# ─── SQLite cache ─────────────────────────────────────────────────────────────

def _init_db():
    Path(_RANKINGS_DB).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_RANKINGS_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS university_cache (
                name       TEXT PRIMARY KEY,
                result_json TEXT NOT NULL,
                fetched_at  REAL NOT NULL
            )
        """)
        conn.commit()


def _db_get(name: str, ttl_days: int = 90) -> dict | None:
    import time
    try:
        with sqlite3.connect(_RANKINGS_DB) as conn:
            row = conn.execute(
                "SELECT result_json, fetched_at FROM university_cache WHERE name=?", (name,)
            ).fetchone()
        if row:
            result, fetched_at = row
            if (time.time() - fetched_at) < ttl_days * 86400:
                return json.loads(result)
    except Exception:
        pass
    return None


def _db_set(name: str, result: dict):
    import time
    try:
        with sqlite3.connect(_RANKINGS_DB) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO university_cache VALUES (?, ?, ?)",
                (name, json.dumps(result), time.time())
            )
            conn.commit()
    except Exception:
        pass


# ─── Main lookup ──────────────────────────────────────────────────────────────

async def lookup_university(name: str) -> dict:
    """
    Full production pipeline:
    1. SQLite cache  → instant hit if recently looked up
                       QS rank is ALWAYS refreshed from current in-memory cache even on hit
                       (so new QS Excel files take effect without cache invalidation)
    2. ROR           → canonical name resolution + ROR ID
    3. OpenAlex      → institution h-index, citation count, research output tier
    4. QS CSV        → add exact rank number if available
    """
    if not name or not name.strip():
        return {"qs_rank": None, "the_rank": None, "recognized": False}

    # In-process cache (avoid duplicate API calls within one upload batch)
    if name in _db_cache:
        return _db_cache[name]

    # When two degrees are from different campuses of the same institution
    # (e.g. "COMSATS University, Islamabad, Attock Campus" and "... Abbottabad Campus"),
    # asyncio.gather() launches both concurrently. The campus suffix is stripped before
    # the ROR lookup, so both ultimately resolve to the same canonical institution.
    # If the cleaned name is already in the in-process cache, reuse that result instead
    # of making a duplicate API call that might get rate-limited.
    cleaned = _clean_institution_name(name)
    if cleaned != name:
        if cleaned in _db_cache:
            _db_cache[name] = _db_cache[cleaned]
            return _db_cache[name]
        cached_clean = _db_get(cleaned)
        if cached_clean:
            canonical = cached_clean.get("canonical_name") or cleaned
            qs_data = _qs_lookup(canonical, country=cached_clean.get("country"))
            if qs_data:
                cached_clean["qs_rank"]                  = qs_data.get("qs_rank")
                cached_clean["qs_rank_label"]            = qs_data.get("qs_rank_label")
                cached_clean["qs_overall_score"]         = qs_data.get("overall")
                cached_clean["qs_academic_reputation"]   = qs_data.get("academic_reputation")
                cached_clean["qs_citations_per_faculty"] = qs_data.get("citations_per_faculty")
                _db_set(cleaned, cached_clean)
            _db_cache[name] = cached_clean
            return cached_clean

    # SQLite cache — use for expensive API results (ROR/OpenAlex) but always
    # re-apply QS rank from current in-memory _qs_cache so stale ranks self-heal.
    cached = _db_get(name)
    if cached:
        # A completely failed previous result (no API data, no QS rank) should be
        # retried rather than served stale.  This handles rate-limited concurrent lookups
        # that got cached as empty results.
        completely_failed = (
            not cached.get("recognized")
            and not cached.get("quality_tier")
            and not cached.get("qs_rank")
        )
        if completely_failed:
            pass  # fall through to fresh API lookup below
        else:
            canonical = cached.get("canonical_name") or name
            qs_data = _qs_lookup(canonical, country=cached.get("country"))
            if qs_data:
                cached["qs_rank"]                  = qs_data.get("qs_rank")
                cached["qs_rank_label"]            = qs_data.get("qs_rank_label")
                cached["qs_overall_score"]         = qs_data.get("overall")
                cached["qs_academic_reputation"]   = qs_data.get("academic_reputation")
                cached["qs_citations_per_faculty"] = qs_data.get("citations_per_faculty")
                cached["recognized"]               = True   # QS knows it → it is recognized
                _db_set(name, cached)
            _db_cache[name] = cached
            return cached

    result = {
        "qs_rank":       None,
        "the_rank":      None,
        "recognized":    False,
        "canonical_name": name,
        "country":       None,
        "ror_id":        None,
        "quality_tier":  None,
        "quality_band":  None,
        "h_index":       None,
        "works_count":   None,
        "cited_by_count": None,
    }

    # Step 1: ROR — name resolution
    ror = await _ror_lookup(name)
    canonical = name
    if ror.get("canonical_name"):
        canonical               = ror["canonical_name"]
        result["canonical_name"] = canonical
        result["country"]        = ror.get("country")
        result["ror_id"]         = ror.get("ror_id")
        result["recognized"]     = True

    # Step 2: OpenAlex — real-time institution metrics
    async with aiohttp.ClientSession() as session:
        oa = {}
        if result["ror_id"]:
            oa = await _openalex_by_ror(session, result["ror_id"])
        if not oa and canonical:
            oa = await _openalex_by_name(session, canonical)

    if oa:
        result["recognized"]    = True
        result["works_count"]   = oa.get("works_count")
        result["cited_by_count"] = oa.get("cited_by_count")
        result["h_index"]       = oa.get("h_index")
        if not result["country"] and oa.get("country_code"):
            result["country"]   = oa["country_code"]
        tier = _quality_tier_from_metrics(
            oa.get("h_index") or 0,
            oa.get("works_count") or 0,
            oa.get("cited_by_count") or 0,
        )
        result.update(tier)

    # Step 3: QS data — rank + additional scores if available
    qs_data = _qs_lookup(canonical, country=result.get("country"))
    if qs_data:
        result["qs_rank"]                  = qs_data.get("qs_rank")
        result["qs_rank_label"]            = qs_data.get("qs_rank_label")
        result["qs_overall_score"]         = qs_data.get("overall")
        result["qs_academic_reputation"]   = qs_data.get("academic_reputation")
        result["qs_citations_per_faculty"] = qs_data.get("citations_per_faculty")
        result["recognized"]               = True

    _db_set(name, result)
    _db_cache[name] = result
    # Also cache under the cleaned name so other campus variants find it immediately
    if cleaned != name:
        _db_set(cleaned, result)
        _db_cache[cleaned] = result
    return result


async def enrich_degrees(degrees: list[DegreeRecord]) -> list[DegreeRecord]:
    """
    Enrich all degrees, with one API call per unique institution.

    Why deduplicate?  asyncio.gather() runs all lookups concurrently.  When a
    candidate has two degrees from different campuses of the same university
    (e.g. Attock Campus and Abbottabad Campus), both calls would hit ROR at the
    same time, causing rate-limit failures on both.  By looking up each unique
    institution exactly once we avoid the race, and campus variants automatically
    share the same result.
    """
    # ── 1. Collect unique institutions by cleaned name ────────────────────────
    # Use the CLEANED name (campus suffix stripped) as both the dedup key AND
    # the actual argument to lookup_university.
    # Why? The original name "COMSATS University, Islamabad, Abbottabad Campus"
    # causes ROR to fail silently, leaving canonical = original, and then
    # _qs_lookup("...Abbottabad Campus") scores just under the 75 threshold
    # against "COMSATS University Islamabad" in the QS cache.
    # "COMSATS University, Islamabad" (cleaned) goes through ROR cleanly and
    # _qs_lookup gets the correct canonical name to match against.
    seen: dict[str, str] = {}        # cleaned_name → cleaned_name (key == value)
    for d in degrees:
        key = _clean_institution_name(d.institution)
        if key not in seen:
            seen[key] = key          # look up the CLEANED name, not the original

    # ── 2. Look up each unique institution once ───────────────────────────────
    keys    = list(seen.keys())
    lookups = await asyncio.gather(*[lookup_university(k) for k in keys])
    results_map: dict[str, dict] = {k: r for k, r in zip(keys, lookups)}

    # ── 3. Apply result to every degree sharing that institution ──────────────
    for degree in degrees:
        key = _clean_institution_name(degree.institution)
        res = results_map.get(key, {})
        degree.qs_rank                   = res.get("qs_rank")
        degree.qs_rank_label             = res.get("qs_rank_label")
        degree.the_rank                  = res.get("the_rank")
        degree.hec_recognized            = res.get("recognized", False)
        degree.quality_tier              = res.get("quality_tier")
        degree.quality_band              = res.get("quality_band")
        degree.institution_h_index       = res.get("h_index")
        degree.qs_overall_score          = res.get("qs_overall_score")
        degree.qs_academic_reputation    = res.get("qs_academic_reputation")
        degree.qs_citations_per_faculty  = res.get("qs_citations_per_faculty")
    return degrees


def clear_process_cache():
    """Clear in-process dict cache — forces SQLite / API re-lookup next call."""
    global _db_cache
    _db_cache.clear()


async def scrape_and_store_rankings():
    """Called at startup — initialize DB and preload QS data."""
    _init_db()
    _load_qs_data()
    print(f"[university_verifier] Ready. QS data: {len(_qs_cache)} entries. "
          "Institution metrics fetched on-demand via ROR + OpenAlex.")