"""
Conference Verifier — Production Grade

Pipeline:
  1. SQLite cache     (instant, 180-day TTL)
  2. CORE rankings    (loaded at startup by fetching CORE portal CSV export)
                      Stored in SQLite, refreshed every 180 days.
                      Falls back to seed list if CORE portal is unreachable.
  3. DBLP API         (resolves partial/ambiguous names to full conference titles)
  4. Fuzzy match      (RapidFuzz partial_ratio, threshold 70%)
  5. Unverified       (mark transparently)

CORE ranks: A* (elite), A (excellent), B (good), C (limited), Unranked
Spec §3.2.ii.b: also extract conference edition for maturity assessment.
"""
import asyncio
import csv
import io
import json
import re
import sqlite3
import urllib.parse
import aiohttp
from pathlib import Path
from rapidfuzz import fuzz, process
from backend.config import settings
from backend.cache.cache_manager import cache

_CORE_DB        = "data/core_rankings.db"
_CORE_CSV_URL   = "https://portal.core.edu.au/conf-ranks/?search=&by=all&source=all&sort=atitle&page=1&do=Export"
_DBLP_API       = "https://dblp.org/search/venue/api?q={query}&h=5&format=json"
_SCIMAGO_PROC   = "https://www.scimagojr.com/journalsearch.php?q={query}&tip=p&clean=0"
_core_rankings: list[dict] = []

# Publishers whose IEEE/ACM/Springer sponsorship is worth surfacing even when unranked
_REPUTABLE_PUBLISHERS = {"ieee", "acm", "springer", "elsevier", "wiley", "informs"}

# ─── Top CS/Engineering conferences — seed used when CORE portal is unreachable ──
# Source: CORE 2023. Update by replacing the CORE CSV file.
_SEED_CONFERENCES: list[tuple] = [
    # A* — Elite
    ("Neural Information Processing Systems", "NeurIPS", "A*"),
    ("International Conference on Machine Learning", "ICML", "A*"),
    ("International Conference on Computer Vision", "ICCV", "A*"),
    ("IEEE Conference on Computer Vision and Pattern Recognition", "CVPR", "A*"),
    ("AAAI Conference on Artificial Intelligence", "AAAI", "A*"),
    ("International Joint Conference on Artificial Intelligence", "IJCAI", "A*"),
    ("ACM SIGKDD Conference on Knowledge Discovery and Data Mining", "KDD", "A*"),
    ("ACM Symposium on Theory of Computing", "STOC", "A*"),
    ("ACM-SIAM Symposium on Discrete Algorithms", "SODA", "A*"),
    ("IEEE Symposium on Security and Privacy", "S&P", "A*"),
    ("ACM Conference on Computer and Communications Security", "CCS", "A*"),
    ("USENIX Security Symposium", "USENIX Security", "A*"),
    ("European Conference on Computer Vision", "ECCV", "A*"),
    ("ACM SIGCOMM", "SIGCOMM", "A*"),
    ("USENIX Symposium on Operating Systems Design and Implementation", "OSDI", "A*"),
    ("ACM Symposium on Operating Systems Principles", "SOSP", "A*"),
    ("International Conference on Software Engineering", "ICSE", "A*"),
    ("ACM SIGPLAN Conference on Programming Language Design and Implementation", "PLDI", "A*"),
    ("Very Large Data Bases", "VLDB", "A*"),
    ("IEEE International Conference on Data Engineering", "ICDE", "A*"),
    ("Web Search and Data Mining", "WSDM", "A*"),
    ("International World Wide Web Conference", "WWW", "A*"),
    ("USENIX Symposium on Networked Systems Design and Implementation", "NSDI", "A*"),
    ("IEEE Real-Time Systems Symposium", "RTSS", "A*"),
    ("International Conference on Automated Software Engineering", "ASE", "A*"),
    ("ACM SIGPLAN International Conference on Functional Programming", "ICFP", "A*"),
    ("ACM Conference on Human Factors in Computing Systems", "CHI", "A*"),
    ("International Conference on Dependable Systems and Networks", "DSN", "A*"),
    ("IEEE European Symposium on Security and Privacy", "EuroS&P", "A*"),
    ("ACM SIGMETRICS", "SIGMETRICS", "A*"),
    ("International Symposium on Computer Architecture", "ISCA", "A*"),
    ("Micro", "MICRO", "A*"),
    ("Hot Chips", "Hot Chips", "A*"),
    # A — Excellent
    ("International Conference on Learning Representations", "ICLR", "A"),
    ("European Conference on Machine Learning and Principles and Practice of Knowledge Discovery", "ECML PKDD", "A"),
    ("ACM SIGIR Conference on Research and Development in Information Retrieval", "SIGIR", "A"),
    ("Association for Computational Linguistics", "ACL", "A"),
    ("Empirical Methods in Natural Language Processing", "EMNLP", "A"),
    ("North American Chapter of the Association for Computational Linguistics", "NAACL", "A"),
    ("International Conference on Computational Linguistics", "COLING", "A"),
    ("IEEE International Conference on Robotics and Automation", "ICRA", "A"),
    ("International Joint Conference on Autonomous Agents and Multi-Agent Systems", "AAMAS", "A"),
    ("Uncertainty in Artificial Intelligence", "UAI", "A"),
    ("International Conference on Principles of Knowledge Representation and Reasoning", "KR", "A"),
    ("IEEE/RSJ International Conference on Intelligent Robots and Systems", "IROS", "A"),
    ("European Symposium on Algorithms", "ESA", "A"),
    ("USENIX Annual Technical Conference", "ATC", "A"),
    ("ACM International Symposium on Mobile Ad Hoc Networking and Computing", "MobiHoc", "A"),
    ("International Symposium on Information Theory", "ISIT", "A"),
    ("IEEE International Conference on Communications", "ICC", "A"),
    ("IEEE Global Communications Conference", "GLOBECOM", "A"),
    ("Design Automation Conference", "DAC", "A"),
    ("IEEE International Symposium on High Performance Computer Architecture", "HPCA", "A"),
    ("ACM International Conference on Architectural Support for Programming Languages and Operating Systems", "ASPLOS", "A"),
    ("ACM SIGPLAN Symposium on Principles of Programming Languages", "POPL", "A"),
    ("IEEE Transactions on Software Engineering", "TSE", "A"),
    ("ACM SIGSOFT International Symposium on Foundations of Software Engineering", "FSE", "A"),
    ("International Symposium on Software Testing and Analysis", "ISSTA", "A"),
    ("Object-Oriented Programming, Systems, Languages and Applications", "OOPSLA", "A"),
    ("IEEE Conference on Decision and Control", "CDC", "A"),
    ("American Control Conference", "ACC", "A"),
    ("European Control Conference", "ECC", "A"),
    ("VLSI Test Symposium", "VTS", "A"),
    ("ACM Conference on Embedded Networked Sensor Systems", "SenSys", "A"),
    ("ACM MobiSys", "MobiSys", "A"),
    ("IEEE International Conference on Network Protocols", "ICNP", "A"),
    ("IEEE International Conference on Distributed Computing Systems", "ICDCS", "A"),
    ("IEEE International Conference on Parallel and Distributed Systems", "ICPADS", "A"),
    ("International Conference on Parallel Processing", "ICPP", "A"),
    ("USENIX Workshop on Hot Topics in Storage and File Systems", "HotStorage", "A"),
    ("IEEE Symposium on Reliable Distributed Systems", "SRDS", "A"),
    ("ACM Symposium on Parallelism in Algorithms and Architectures", "SPAA", "A"),
    ("International Conference on Compiler Construction", "CC", "A"),
    ("International Middleware Conference", "Middleware", "A"),
    ("IEEE INFOCOM", "INFOCOM", "A"),
    # B — Good
    ("International Conference on Data Mining", "ICDM", "B"),
    ("Pacific-Asia Conference on Knowledge Discovery and Data Mining", "PAKDD", "B"),
    ("International Conference on Artificial Intelligence and Statistics", "AISTATS", "B"),
    ("IEEE International Conference on Data Mining", "ICDM", "B"),
    ("International Conference on Database and Expert Systems Applications", "DEXA", "B"),
    ("International Conference on Extending Database Technology", "EDBT", "B"),
    ("International Symposium on Databases and Applications", "ISDA", "B"),
    ("IEEE International Conference on Cloud Computing", "CLOUD", "B"),
    ("International Conference on Service-Oriented Computing", "ICSOC", "B"),
    ("International Conference on Web Services", "ICWS", "B"),
    ("IEEE International Conference on Web Services", "ICWS", "B"),
    ("International Conference on Advanced Information Networking and Applications", "AINA", "B"),
    ("International Conference on Information and Communication Technologies", "ICT", "B"),
    ("IEEE International Conference on Computer and Information Technology", "CIT", "B"),
    ("International Conference on Computational Science", "ICCS", "B"),
    ("International Conference on Scientific Computing", "CSC", "B"),
    ("IEEE International Symposium on Information Theory", "ISIT", "B"),
    ("International Conference on Systems and Networks Communications", "ICSNC", "B"),
    ("International Conference on Signal Processing", "ICSP", "B"),
    ("International Conference on Pattern Recognition", "ICPR", "B"),
    ("British Machine Vision Conference", "BMVC", "B"),
    ("Asian Conference on Computer Vision", "ACCV", "B"),
    ("International Conference on Image Processing", "ICIP", "B"),
    ("IEEE Wireless Communications and Networking Conference", "WCNC", "B"),
    ("IEEE Vehicular Technology Conference", "VTC", "B"),
    ("International Conference on Wireless and Mobile Computing", "WiMob", "B"),
    ("International Conference on Embedded and Real-Time Computing Systems and Applications", "RTCSA", "B"),
    ("International Conference on High Performance Computing", "HiPC", "B"),
    ("International Conference on Grid Computing", "GRID", "B"),
    ("International Conference on Natural Language Processing", "ICON", "B"),
    ("International Conference on Intelligent Systems", "INTELLI", "B"),
    ("International Conference on Knowledge Engineering and Ontology Development", "KEOD", "B"),
    ("International Conference on Computer Applications Technology", "ICCAT", "B"),
    ("International Conference on Informatics and Applications", "ICIA", "B"),
    ("International Conference on Software and Systems Engineering", "ICSSE", "B"),
    ("International Conference on Software Engineering and Service Science", "ICSESS", "B"),
    ("International Conference on Computer Science and Engineering", "ICCSE", "B"),
    ("IEEE International Conference on Computer Science and Automation Engineering", "CSAE", "B"),
    ("International Conference on Electrical Engineering and Computer Science", "ICEECS", "B"),
    ("International Conference on Energy Efficient Technologies for Sustainability", "ICEETS", "B"),
    ("International Conference on Wireless Sensor Networks", "WSN", "B"),
    ("International Conference on Sensor Technologies and Applications", "SENSORCOMM", "B"),
    ("IEEE Conference on Energy Conversion", "CENCON", "B"),
]


# ─── Database helpers ─────────────────────────────────────────────────────────

def _init_db():
    Path(_CORE_DB).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_CORE_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conference_rankings (
                name TEXT PRIMARY KEY,
                acronym TEXT,
                rank TEXT,
                source TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY, value TEXT
            )
        """)
        conn.commit()


def _db_last_fetched() -> float:
    """Return unix timestamp of last CORE fetch, or 0 if never."""
    try:
        with sqlite3.connect(_CORE_DB) as conn:
            row = conn.execute("SELECT value FROM meta WHERE key='last_fetched'").fetchone()
            return float(row[0]) if row else 0.0
    except Exception:
        return 0.0


def _db_store_conferences(rows: list[tuple], source: str = "CORE"):
    with sqlite3.connect(_CORE_DB) as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO conference_rankings VALUES (?, ?, ?, ?)", rows
        )
        import time
        conn.execute(
            "INSERT OR REPLACE INTO meta VALUES ('last_fetched', ?)",
            (str(time.time()),)
        )
        conn.commit()
    count = sum(1 for _ in rows)
    print(f"[conference_verifier] Stored {count} conferences from {source}.")


def _db_load() -> list[dict]:
    if not Path(_CORE_DB).exists():
        return []
    try:
        with sqlite3.connect(_CORE_DB) as conn:
            rows = conn.execute(
                "SELECT name, acronym, rank FROM conference_rankings"
            ).fetchall()
        return [{"name": r[0], "acronym": r[1], "rank": r[2]} for r in rows]
    except Exception:
        return []


# ─── CORE portal CSV fetch ────────────────────────────────────────────────────

async def _fetch_core_csv() -> list[tuple]:
    """
    Fetch fresh CORE rankings CSV from portal.core.edu.au.
    Returns list of (name, acronym, rank, source) tuples.
    """
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                _CORE_CSV_URL,
                timeout=aiohttp.ClientTimeout(total=30),
                headers={
                    "User-Agent": "TALASH/1.0 (academic-hiring-tool)",
                    "Accept": "text/csv,text/plain,*/*",
                },
                allow_redirects=True,
            ) as r:
                if r.status != 200:
                    print(f"[conference_verifier] CORE portal returned {r.status}.")
                    return []
                text = await r.text(encoding="utf-8", errors="replace")

        rows = []
        raw_rows = list(csv.reader(io.StringIO(text)))

        # CORE's CSV export has NO header row — data starts immediately.
        # Observed format (positional):
        #   [0]=ID  [1]=Title  [2]=Acronym  [3]=Source  [4]=Rank  [5+]=other
        # Rank values: "A*", "A", "B", "C", "Unranked", "National"
        # Log first row so format changes are visible in the startup log.
        if raw_rows:
            print(f"[conference_verifier] CORE CSV first row sample: {raw_rows[0][:6]}")

        _VALID_RANKS = {"A*", "A", "B", "C"}

        for row in raw_rows:
            if len(row) < 5:
                continue

            # Try known positional layout first
            title   = row[1].strip()
            acronym = row[2].strip() if len(row) > 2 else ""
            source  = row[3].strip() if len(row) > 3 else "CORE"
            rank    = row[4].strip().upper() if len(row) > 4 else ""

            # Normalise rank variants
            rank = rank.replace("A_STAR", "A*").replace("A STAR", "A*").replace("A+", "A*")

            # If rank not found at position 4, scan all positions (defensive)
            if rank not in _VALID_RANKS:
                for cell in row[3:7]:
                    c = cell.strip().upper().replace("A_STAR", "A*")
                    if c in _VALID_RANKS:
                        rank = c
                        break

            if title and rank in _VALID_RANKS:
                rows.append((title, acronym, rank, source))

        print(f"[conference_verifier] Fetched {len(rows)} ranked conferences from CORE portal.")
        return rows

    except Exception as e:
        print(f"[conference_verifier] CORE CSV fetch failed: {e}")
        return []


def _seed_from_builtin() -> list[tuple]:
    """Return built-in seed data as DB rows."""
    rows = []
    for item in _SEED_CONFERENCES:
        if len(item) == 3:
            name, acronym, rank = item
        else:
            name, rank = item[0], item[-1]
            acronym = ""
        rows.append((name, acronym, rank, "seed"))
    return rows


# ─── DBLP API ─────────────────────────────────────────────────────────────────

async def _dblp_resolve(name: str) -> str | None:
    """
    Use DBLP to resolve a partial/ambiguous conference name to its full title.
    Returns the best matching venue name, or None.
    """
    try:
        url = _DBLP_API.format(query=urllib.parse.quote(name))
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=6)) as r:
                if r.status != 200:
                    return None
                data = await r.json(content_type=None)

        hits = data.get("result", {}).get("hits", {}).get("hit", [])
        if hits:
            info = hits[0].get("info", {})
            return info.get("venue") or info.get("booktitle")
    except Exception:
        pass
    return None


# ─── Scimago conference proceedings ──────────────────────────────────────────

async def _check_scimago_proceedings(name: str) -> dict:
    """
    Search Scimago for a conference proceedings series.
    Scimago ranks proceedings just like journals (Q1-Q4) using tip=p.
    Gives quartile + SJR for major IEEE/ACM/Springer conference series.
    """
    if not name or len(name.strip()) < 10:
        return {}
    try:
        url = _SCIMAGO_PROC.format(query=urllib.parse.quote(name.strip()))
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=10),
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; TALASH/1.0; academic-research)",
                    "Accept": "text/html,application/xhtml+xml",
                },
            ) as r:
                if r.status != 200:
                    return {}
                html = await r.text()

        import re, json
        match = re.search(r'var\s+data\s*=\s*(\[.*?\]);', html, re.DOTALL)
        if not match:
            return {}
        entries = json.loads(match.group(1))
        if not entries:
            return {}
        entry    = entries[0]
        quartile = entry.get("quartile")   # "Q1", "Q2", "Q3", "Q4"
        sjr      = entry.get("sjrind")
        title    = entry.get("title") or entry.get("sourcetitle") or ""
        return {
            "found":       True,
            "scimago_quartile": quartile,
            "sjr_index":   float(sjr) if sjr else None,
            "resolved_name": title,
        }
    except Exception:
        return {}


# ─── Fuzzy matching ───────────────────────────────────────────────────────────

def _fuzzy_lookup(name: str, threshold: int | None = None) -> dict:
    """Fuzzy-match name against in-memory CORE rankings."""
    if not _core_rankings:
        return {}
    cutoff = threshold or settings.conference_fuzzy_threshold

    # Match against full names
    names  = [r["name"] for r in _core_rankings]
    result = process.extractOne(name, names, scorer=fuzz.token_set_ratio, score_cutoff=cutoff)
    if result:
        _, score, idx = result
        return {"core_rank": _core_rankings[idx]["rank"],
                "matched_name": _core_rankings[idx]["name"], "match_score": score}

    # Also match against acronyms
    acronyms = [r.get("acronym", "") for r in _core_rankings]
    result   = process.extractOne(
        name.upper(), [a.upper() for a in acronyms],
        scorer=fuzz.ratio, score_cutoff=85,
    )
    if result:
        _, score, idx = result
        return {"core_rank": _core_rankings[idx]["rank"],
                "matched_name": _core_rankings[idx]["name"], "match_score": score}

    return {}


_GENERIC_CONF_PATTERNS = {
    "international conference", "annual conference", "conference on",
    "proceedings of", "workshop on", "symposium on", "international symposium",
}

def _is_generic(name: str) -> bool:
    if not name or len(name.strip()) < 15:
        return True
    lower = name.strip().lower()
    return any(lower == pat or (lower.startswith(pat) and len(lower) < len(pat) + 10)
               for pat in _GENERIC_CONF_PATTERNS)


# ─── Edition / maturity ───────────────────────────────────────────────────────

def _extract_edition(text: str | None) -> int | None:
    """
    Extract conference edition number from a text string.
    Only matches explicit ordinals (1st, 2nd, 13th, 28th …) or
    "Nth edition" patterns.  Never matches bare 4-digit years like 2024.
    """
    if not text:
        return None
    # "13th", "1st", "22nd", "3rd" — explicit ordinal suffix
    m = re.search(r"\b(\d{1,3})\s*(?:st|nd|rd|th)\b", text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    # "edition 5" or "5 edition"
    m = re.search(r"edition\s+(\d{1,3})|(\d{1,3})\s+edition", text, re.IGNORECASE)
    if m:
        return int(m.group(1) or m.group(2))
    return None


# ─── Main verify function ─────────────────────────────────────────────────────

async def verify_conference(
    name: str,
    edition: str | None = None,
    paper_title: str = "",
    authors: list[str] | None = None,
) -> dict:
    cache_key = {"name": name, "pt": paper_title[:60]}
    cached = cache.get("conference", cache_key)
    if cached:
        return cached

    result = {
        "conference_name":       name,
        "core_rank":             None,
        "scimago_quartile":      None,
        "conference_publisher":  None,
        "matched_name":          None,
        "resolved_conference_name": None,
        "conference_edition":    edition,
        "conference_number":     _extract_edition(edition),
        "is_mature":             None,
        "verification_source":   "unverified",
    }

    # 1. Direct fuzzy match on conference name
    if not _is_generic(name):
        hit = _fuzzy_lookup(name)
        if hit.get("core_rank"):
            result.update(hit)
            result["verification_source"] = "CORE"

    # 2. DBLP resolution — ONLY for non-generic names.
    # Never call DBLP with a generic string like "International Conference" —
    # it returns the first conference that lexically matches, which is almost
    # always wrong (e.g. "International Conference" → DEXA, a database conference).
    # For generic names we rely on paper-title resolution in step 3 instead.
    if not result["core_rank"] and not _is_generic(name):
        dblp_name = await _dblp_resolve(name)
        if dblp_name and dblp_name.lower() != name.lower():
            # DBLP booktitles often include the edition: "13th International Conference on..."
            if not result["conference_number"]:
                result["conference_number"] = _extract_edition(dblp_name)
                if result["conference_number"]:
                    result["is_mature"] = result["conference_number"] >= 5
            hit = _fuzzy_lookup(dblp_name)
            if hit.get("core_rank"):
                result.update(hit)
                result["verification_source"] = "CORE+DBLP"

    # 3. CrossRef: title + author search — uniquely identifies the exact paper.
    # Searching title alone is unreliable (similar titles appear across many venues).
    # Combining with the author name produces a near-exact DOI match, giving us
    # the real conference name, publisher, and edition with high confidence.
    if paper_title and len(paper_title.strip()) > 10:
        try:
            from rapidfuzz import fuzz as _fuzz
            title_q  = paper_title.strip()[:200]
            # Use first author surname for disambiguation (most stable part of author string)
            first_author = ""
            if authors:
                raw = authors[0].strip()
                # Handle "Surname, Firstname" or "Firstname Surname" formats
                first_author = raw.split(",")[0].strip() if "," in raw else raw.split()[-1].strip()

            params = f"query.bibliographic={urllib.parse.quote(title_q)}"
            if first_author:
                params += f"&query.author={urllib.parse.quote(first_author)}"

            cr_url = (
                "https://api.crossref.org/works"
                f"?{params}&rows=3"
                "&select=title,container-title,event,publisher,type,author,DOI"
            )
            async with aiohttp.ClientSession() as _s:
                async with _s.get(cr_url, timeout=aiohttp.ClientTimeout(total=10),
                                  headers={"User-Agent": f"TALASH/1.0 (mailto:{settings.polite_mailto})"}) as r:
                    if r.status == 200:
                        items = (await r.json()).get("message", {}).get("items", [])
                        for item in items:
                            returned_title = (item.get("title") or [""])[0]
                            title_score = _fuzz.token_set_ratio(title_q.lower(), returned_title.lower())
                            if title_score < 75:
                                continue    # wrong paper — try next result

                            # This is the right paper — extract conference facts
                            event_name  = (item.get("event") or {}).get("name") or ""
                            proc_titles = item.get("container-title") or []
                            proc_title  = proc_titles[0] if proc_titles else ""
                            publisher   = (item.get("publisher") or "").strip()

                            # Prefer event.name (actual conference) over container-title (proceedings book)
                            conf_name_from_cr = event_name or proc_title
                            if conf_name_from_cr:
                                result["resolved_conference_name"] = conf_name_from_cr

                            # Publisher: IEEE, ACM, Springer etc.
                            for pub in _REPUTABLE_PUBLISHERS:
                                if pub in publisher.lower():
                                    result["conference_publisher"] = publisher
                                    break

                            # Edition from event name
                            if event_name and not result["conference_number"]:
                                result["conference_number"] = _extract_edition(event_name)
                                if result["conference_number"]:
                                    result["is_mature"] = result["conference_number"] >= 5

                            # Now try to CORE-match the real conference name
                            if conf_name_from_cr and not result["core_rank"]:
                                hit = _fuzzy_lookup(conf_name_from_cr)
                                if hit.get("core_rank"):
                                    result.update(hit)
                                    result["verification_source"] = "CORE+CrossRef"

                            src = result["verification_source"]
                            if src == "unverified":
                                result["verification_source"] = "CrossRef"
                            break   # found and processed the right paper
        except Exception:
            pass

    # 4. Title-keyword fallback — use distinctive words from the paper title
    if not result["core_rank"] and paper_title and len(paper_title) > 10:
        words = [w for w in paper_title.split() if len(w) > 4][:6]
        if words:
            hit = _fuzzy_lookup(" ".join(words), threshold=60)
            if hit.get("core_rank"):
                result.update(hit)
                result["verification_source"] = "CORE (title-keywords)"

    # 5. Scimago proceedings + Scopus indexing check
    # Use best available name: CORE-matched > CrossRef-resolved > original
    scimago_query = result.get("matched_name") or result.get("resolved_conference_name") or name
    if scimago_query and not _is_generic(scimago_query):
        scimago = await _check_scimago_proceedings(scimago_query)
        if scimago.get("found"):
            result["scimago_quartile"] = scimago.get("scimago_quartile")
            # Scimago only indexes proceedings that are Scopus-tracked
            result["is_scopus_indexed"] = True
            if scimago.get("resolved_name") and not result.get("matched_name"):
                result["matched_name"] = scimago["resolved_name"]
            src = result["verification_source"]
            result["verification_source"] = (
                "Scimago" if src == "unverified" else src + "+Scimago"
            )

    # 6. Publisher extraction from CrossRef result (already fetched in step 3)
    # Stored in result["conference_publisher"] during the CrossRef pass above.
    # This is a separate field — IEEE/ACM sponsorship is useful even when Unranked.

    # Maturity: ≥5 editions = established conference
    if result["conference_number"]:
        result["is_mature"] = result["conference_number"] >= 5

    cache.set("conference", cache_key, result, ttl_days=settings.ttl_conference_ranks)
    return result


# ─── Startup ──────────────────────────────────────────────────────────────────

async def load_core_rankings():
    """
    Called at startup:
    1. Initialize DB
    2. If data is stale (>180 days) or missing → fetch fresh CORE CSV
    3. If CORE unreachable → use built-in seed list
    4. Load everything into _core_rankings memory list for fast fuzzy matching
    """
    import time
    global _core_rankings

    _init_db()

    ttl_seconds  = settings.ttl_conference_ranks * 86400
    last_fetched = _db_last_fetched()
    loaded       = _db_load()

    # If the DB has ≤ seed count rows it means a previous CORE fetch returned 0
    # (bad format / unreachable). Force a re-fetch regardless of TTL.
    force_refetch = len(loaded) <= len(_SEED_CONFERENCES)
    data_fresh    = (time.time() - last_fetched) < ttl_seconds and last_fetched > 0 and not force_refetch

    if not data_fresh:
        print("[conference_verifier] Fetching fresh CORE rankings from portal.core.edu.au …")
        rows = await _fetch_core_csv()
        if rows:
            _db_store_conferences(rows, source="CORE portal")
        else:
            print("[conference_verifier] CORE portal unreachable — seeding from built-in list.")
            seed_rows = _seed_from_builtin()
            _db_store_conferences(seed_rows, source="seed")
    else:
        print("[conference_verifier] CORE rankings cache is fresh, skipping fetch.")

    _core_rankings = _db_load()
    print(f"[conference_verifier] Loaded {len(_core_rankings)} conferences into memory.")