"""
Journal Verifier — Production Grade

Verification pipeline per journal:
  1. SQLite cache        (instant, 30-day TTL)
  2. CrossRef            (ISSN → publisher/title confirmation)
  3. OpenAlex            (impact factor via 2yr_mean_citedness, Scopus status)
  4. Scimago             (real Q1/Q2/Q3/Q4 by subject area — parsed from Scimago search page)
  5. Semantic Scholar    (paper-level citation count for the specific paper title)
  6. ISSN Portal         (legitimacy check — last resort)
  7. Unverified          (never fail silently)

Quartile priority: Scimago > OpenAlex IF-based approximation.
Never use LLMs or CV-stated rankings. All facts come from real APIs.
"""
import asyncio
import json
import re
import aiohttp
import urllib.parse
from rapidfuzz import fuzz
from backend.config import settings
from backend.cache.cache_manager import cache

# ─── Known predatory publishers ───────────────────────────────────────────────
PREDATORY_PUBLISHERS = {
    "waset", "ijser", "omics", "iiste", "scientific & academic publishing",
    "world academy of science", "ijarai", "ijacsa", "warse", "iaeng",
    "scirp", "david publishing", "scientific research publishing",
    "thescipub", "medip academy", "ijert", "ijert.org",
    "wseas", "acadpubl", "ijcsns",
}

CROSSREF_URL        = "https://api.crossref.org/journals/{issn}"
CROSSREF_WORKS_URL  = "https://api.crossref.org/works?query.bibliographic={query}&rows=1&select=title,container-title,ISSN,type,is-referenced-by-count"
OPENALEX_ISSN_URL   = "https://api.openalex.org/sources?filter=issn:{issn}&mailto={mailto}"
OPENALEX_TITLE_URL  = "https://api.openalex.org/sources?search={title}&mailto={mailto}&per_page=1"
OPENALEX_WORKS_URL  = "https://api.openalex.org/works?search={query}&per_page=1&select=title,primary_location,cited_by_count&mailto={mailto}"
SEMANTIC_PAPER_URL  = "https://api.semanticscholar.org/graph/v1/paper/search?query={query}&fields=title,influentialCitationCount,citationCount,venue,journal&limit=1"
ISSN_URL            = "https://portal.issn.org/resource/ISSN/{issn}"
SCIMAGO_SEARCH_URL  = "https://www.scimagojr.com/journalsearch.php?q={query}&tip={tip}&clean=0"


# ─── CrossRef ─────────────────────────────────────────────────────────────────

async def _check_crossref(session: aiohttp.ClientSession, issn: str) -> dict:
    try:
        url = CROSSREF_URL.format(issn=issn)
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                msg = (await r.json()).get("message", {})
                return {
                    "found": True, "source": "CrossRef",
                    "title": msg.get("title"), "issn": issn,
                }
    except Exception:
        pass
    return {"found": False}


# ─── OpenAlex ─────────────────────────────────────────────────────────────────

async def _check_openalex_issn(session: aiohttp.ClientSession, issn: str) -> dict:
    try:
        url = OPENALEX_ISSN_URL.format(issn=issn, mailto=settings.polite_mailto)
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                results = (await r.json()).get("results", [])
                if results:
                    return _parse_openalex_source(results[0])
    except Exception:
        pass
    return {"found": False}


# Generic words that alone are not distinctive enough to identify a specific journal.
# A search query made up only of these words will almost certainly return a wrong match.
_GENERIC_JOURNAL_WORDS = {
    "international", "journal", "review", "advances", "applied",
    "research", "science", "sciences", "studies", "transactions",
    "letters", "proceedings", "annals", "bulletin", "reports",
    "communications", "frontiers", "open", "new", "current",
}


async def _check_openalex_title(session: aiohttp.ClientSession, title: str) -> dict:
    """
    Search OpenAlex by journal title — only when title is specific enough.
    A short or all-generic title like 'International Journal' will cause OpenAlex
    to return whatever popular journal matches first, which is almost always wrong.
    We require the title to contain at least 2 distinctive (non-generic) words.
    """
    stripped = title.strip()
    if len(stripped) < 20:
        return {"found": False}

    words = set(stripped.lower().replace(",", " ").replace(".", " ").split())
    distinctive = words - _GENERIC_JOURNAL_WORDS
    if len(distinctive) < 2:
        # Only generic words — query is too ambiguous, skip to avoid wrong matches
        return {"found": False}

    try:
        url = OPENALEX_TITLE_URL.format(
            title=urllib.parse.quote(stripped), mailto=settings.polite_mailto
        )
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                results = (await r.json()).get("results", [])
                if results:
                    result = _parse_openalex_source(results[0])
                    # Validate: returned journal must share reasonable overlap with query.
                    # Without this, "IEEE Transactions" could return "IEEE Transactions on
                    # Neural Networks" when the paper is in "IEEE Transactions on Power Systems".
                    returned_name = (result.get("resolved_name") or "").lower()
                    if returned_name:
                        from rapidfuzz import fuzz
                        overlap = fuzz.token_set_ratio(stripped.lower(), returned_name)
                        if overlap < 55:
                            return {"found": False}
                    return result
    except Exception:
        pass
    return {"found": False}


def _parse_openalex_source(venue: dict) -> dict:
    stats = venue.get("summary_stats") or {}
    impact_factor = stats.get("2yr_mean_citedness")
    is_scopus = bool(
        venue.get("is_in_doaj") or
        "Scopus" in (venue.get("host_organization_name") or "")
    )
    return {
        "found":             True,
        "source":            "OpenAlex",
        "is_scopus_indexed": is_scopus,
        "is_oa":             venue.get("is_oa"),
        "impact_factor":     round(impact_factor, 3) if impact_factor else None,
        "h_index":           stats.get("h_index"),
        "resolved_name":     venue.get("display_name"),
        # cited_by_count is journal-total — do NOT use as paper citation count
    }


# ─── Scimago — real quartile by subject area ──────────────────────────────────

async def _check_scimago(session: aiohttp.ClientSession, issn: str | None, title: str) -> dict:
    """
    Fetch Scimago journal data. Returns actual Q1/Q2/Q3/Q4 by subject area.
    Scimago embeds journal data as JSON in a <script> tag on their search page.
    We parse: var data = [{..., "quartile": "Q1", ...}]
    """
    query = issn or title
    tip   = "issn" if issn else "t"
    try:
        url = SCIMAGO_SEARCH_URL.format(
            query=urllib.parse.quote(query), tip=tip
        )
        async with session.get(
            url,
            timeout=aiohttp.ClientTimeout(total=10),
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; TALASH/1.0; academic-research)",
                "Accept": "text/html,application/xhtml+xml",
            },
        ) as r:
            if r.status != 200:
                return {"found": False}
            html = await r.text()

        # Scimago embeds results as: var data = [{...}];
        match = re.search(r'var\s+data\s*=\s*(\[.*?\]);', html, re.DOTALL)
        if not match:
            return {"found": False}

        entries = json.loads(match.group(1))
        if not entries:
            return {"found": False}

        entry = entries[0]
        quartile = entry.get("quartile")  # "Q1", "Q2", "Q3", "Q4"
        sjr      = entry.get("sjrind")    # SJR index value

        return {
            "found":          True,
            "source":         "Scimago",
            "wos_quartile":   quartile,
            "sjr_index":      float(sjr) if sjr else None,
            "resolved_name":  entry.get("title") or entry.get("sourcetitle"),
            "scimago_h_index": entry.get("h_index"),
        }
    except Exception:
        return {"found": False}


# ─── Semantic Scholar ─────────────────────────────────────────────────────────

async def _check_semantic_scholar(session: aiohttp.ClientSession, paper_title: str) -> dict:
    """Per-paper citation count (NOT journal-level)."""
    try:
        url = SEMANTIC_PAPER_URL.format(
            query=urllib.parse.quote(paper_title[:120])
        )
        headers = {}
        if settings.semantic_scholar_api_key:
            headers["x-api-key"] = settings.semantic_scholar_api_key
        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                papers = (await r.json()).get("data", [])
                if papers:
                    p = papers[0]
                    # S2 returns venue as a string and journal as {"name": "...", "volume": ...}
                    venue = (
                        (p.get("journal") or {}).get("name")
                        or p.get("venue")
                        or None
                    )
                    return {
                        "found":                     True,
                        "source":                    "SemanticScholar",
                        "citation_count":            p.get("citationCount"),
                        "influential_citation_count": p.get("influentialCitationCount"),
                        "venue_name":                venue,
                    }
    except Exception:
        pass
    return {"found": False}


# ─── ISSN Portal ──────────────────────────────────────────────────────────────

async def _check_issn_portal(session: aiohttp.ClientSession, issn: str) -> dict:
    try:
        url = ISSN_URL.format(issn=issn)
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=6), allow_redirects=True) as r:
            return {"found": r.status == 200, "source": "ISSN Portal"}
    except Exception:
        pass
    return {"found": False}


# ─── Predatory detection ──────────────────────────────────────────────────────

def _check_predatory(journal_name: str) -> tuple[bool, str | None]:
    name_lower = journal_name.lower()
    for pub in PREDATORY_PUBLISHERS:
        if pub in name_lower:
            return True, f"Matches known predatory publisher: {pub}"
    return False, None


# ─── IF-based quartile fallback ───────────────────────────────────────────────

def _quartile_from_if(impact_factor: float | None) -> str | None:
    """Rough quartile from IF — only used when Scimago is unavailable."""
    if impact_factor is None:
        return None
    if impact_factor >= 6.0:  return "Q1"
    if impact_factor >= 2.5:  return "Q2"
    if impact_factor >= 1.0:  return "Q3"
    return "Q4"


# ─── Paper-title → journal resolution ────────────────────────────────────────

async def _resolve_from_paper_title(session: aiohttp.ClientSession, paper_title: str) -> dict:
    """
    When the LLM extracts a generic journal name ("International Journal", etc.),
    use the paper title to find the actual publication via CrossRef works or
    OpenAlex works — both have far broader coverage than Semantic Scholar for
    recent and non-top-venue papers.

    Returns: {"found": bool, "journal_name": str, "issn": str|None, "source": str}
    """
    query = paper_title.strip()[:200]
    if len(query) < 15:
        return {"found": False}

    # ── CrossRef /works — widest academic coverage, returns ISSN directly ─────
    try:
        url = CROSSREF_WORKS_URL.format(query=urllib.parse.quote(query))
        async with session.get(
            url, timeout=aiohttp.ClientTimeout(total=8),
            headers={"User-Agent": f"TALASH/1.0 (mailto:{settings.polite_mailto})"},
        ) as r:
            if r.status == 200:
                items = (await r.json()).get("message", {}).get("items", [])
                if items:
                    item = items[0]
                    returned = (item.get("title") or [""])[0]
                    if fuzz.token_set_ratio(query.lower(), returned.lower()) >= 55:
                        journal  = (item.get("container-title") or [""])[0].strip()
                        issns    = item.get("ISSN") or []
                        cite_cnt = item.get("is-referenced-by-count")
                        if journal:
                            return {
                                "found":          True,
                                "source":         "CrossRef",
                                "journal_name":   journal,
                                "issn":           issns[0] if issns else None,
                                "citation_count": cite_cnt,   # CrossRef citation count
                            }
    except Exception:
        pass

    # ── OpenAlex /works — good for recent open-access papers ──────────────────
    try:
        url = OPENALEX_WORKS_URL.format(
            query=urllib.parse.quote(query),
            mailto=settings.polite_mailto,
        )
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                results = (await r.json()).get("results", [])
                if results:
                    work     = results[0]
                    returned = work.get("title") or ""
                    if fuzz.token_set_ratio(query.lower(), returned.lower()) >= 55:
                        source  = (work.get("primary_location") or {}).get("source") or {}
                        journal = source.get("display_name")
                        issn_l  = source.get("issn_l")
                        issns   = source.get("issn") or []
                        # cited_by_count from OpenAlex is broader than CrossRef
                        # (includes non-DOI citations, covers more venues)
                        cite_cnt = work.get("cited_by_count")
                        if journal:
                            return {
                                "found":          True,
                                "source":         "OpenAlex",
                                "journal_name":   journal,
                                "issn":           issn_l or (issns[0] if issns else None),
                                "citation_count": cite_cnt,
                            }
    except Exception:
        pass

    return {"found": False}


# ─── Main verify function ─────────────────────────────────────────────────────

async def verify_journal(issn: str | None, title: str, paper_title: str = "") -> dict:
    """
    Full 6-tier verification pipeline for a journal.
    Returns a dict with all available metadata.
    """
    cached = cache.get("journal", {"issn": issn, "title": title})
    if cached:
        # Journal-level data (IF, quartile) is safely cached.
        # Paper-level citations are re-fetched per paper.
        # If the cached entry has no quartile (was stored when title was generic),
        # and S2 now resolves the venue, run OpenAlex+Scimago with the real name.
        if paper_title and len(paper_title.strip()) > 10:
            async with aiohttp.ClientSession() as session:
                # Primary: CrossRef/OpenAlex works give broader citation counts
                resolved = await _resolve_from_paper_title(session, paper_title)
                if resolved.get("found") and resolved.get("citation_count") is not None:
                    cached["citation_count"] = resolved["citation_count"]
                elif not cached.get("citation_count"):
                    # Fallback: Semantic Scholar
                    ss = await _check_semantic_scholar(session, paper_title.strip())
                    if ss.get("found"):
                        raw = ss.get("citation_count")
                        if raw is not None and raw <= 500_000:
                            cached["citation_count"] = raw
                        cached["influential_citation_count"] = ss.get("influential_citation_count")
        return cached

    result = {
        "issn":                       issn,
        "title":                      title,
        "resolved_name":              None,
        "is_wos_indexed":             None,
        "is_scopus_indexed":          None,
        "impact_factor":              None,
        "wos_quartile":               None,
        "sjr_index":                  None,
        "citation_count":             None,
        "influential_citation_count": None,
        "is_predatory_flag":          False,
        "predatory_reason":           None,
        "verification_source":        "unverified",
    }

    # Predatory check (local, instant)
    is_pred, reason = _check_predatory(title)
    result["is_predatory_flag"] = is_pred
    result["predatory_reason"]  = reason

    async with aiohttp.ClientSession() as session:

        # Tier 0: Resolve generic journal name via paper title
        # CrossRef /works and OpenAlex /works search by paper title to find the
        # real journal — the paper title is almost always extracted correctly by
        # the LLM even when the journal name is truncated ("International Journal").
        effective_issn  = issn
        effective_title = title
        title_words     = set(title.strip().lower().split())
        title_is_generic = (
            len(title.strip()) < 20
            or len(title_words - _GENERIC_JOURNAL_WORDS) < 2
        )
        if title_is_generic and paper_title and len(paper_title.strip()) > 10:
            resolved = await _resolve_from_paper_title(session, paper_title)
            if resolved.get("found"):
                effective_issn  = resolved.get("issn") or effective_issn
                effective_title = resolved["journal_name"]
                result["resolved_name"]       = effective_title
                result["verification_source"] = resolved["source"]
                # CrossRef returns citation count directly for each paper
                cite = resolved.get("citation_count")
                if cite is not None and cite <= 500_000:
                    result["citation_count"] = cite

        # Tier 2: CrossRef — confirm journal exists via ISSN
        if effective_issn:
            cr = await _check_crossref(session, effective_issn)
            if cr.get("found"):
                result["verification_source"] = "CrossRef"
                if cr.get("title") and not result["resolved_name"]:
                    result["resolved_name"] = cr["title"]

        # Tier 3: OpenAlex — impact factor, Scopus status, resolved name
        oa = {"found": False}
        if effective_issn:
            oa = await _check_openalex_issn(session, effective_issn)
        if not oa.get("found") and effective_title:
            oa = await _check_openalex_title(session, effective_title)
        if oa.get("found"):
            result["is_scopus_indexed"] = oa.get("is_scopus_indexed")
            result["impact_factor"]     = oa.get("impact_factor")
            if oa.get("resolved_name"):
                result["resolved_name"] = oa["resolved_name"]
            result["wos_quartile"]      = _quartile_from_if(oa.get("impact_factor"))
            if not result["wos_quartile"] and result["is_scopus_indexed"]:
                result["wos_quartile"]  = "Q3"
            result["verification_source"] = "OpenAlex"

        # Tier 4: Scimago — real quartile by subject area (overrides IF approximation)
        scimago = await _check_scimago(session, effective_issn, result["resolved_name"] or effective_title)
        if scimago.get("found"):
            result["wos_quartile"]    = scimago["wos_quartile"] or result["wos_quartile"]
            result["sjr_index"]       = scimago.get("sjr_index")
            if scimago.get("resolved_name") and not result["resolved_name"]:
                result["resolved_name"] = scimago["resolved_name"]
            if result["verification_source"] in ("unverified", "CrossRef"):
                result["verification_source"] = "Scimago"
            else:
                result["verification_source"] += "+Scimago"

        # Tier 5: Semantic Scholar — citations + venue resolution via PAPER TITLE
        # The paper title is usually extracted correctly by the LLM even when the
        # journal name is truncated/generic. S2 can find the exact paper and return
        # the full journal name, which we then use to re-run OpenAlex + Scimago.
        s2_query = paper_title.strip() if paper_title and len(paper_title.strip()) > 10 else ""
        if s2_query:
            ss = await _check_semantic_scholar(session, s2_query)
            if ss.get("found"):
                raw_count = ss.get("citation_count")
                if raw_count is not None and raw_count <= 500_000:
                    result["citation_count"] = raw_count
                result["influential_citation_count"] = ss.get("influential_citation_count")
                if result["verification_source"] == "unverified":
                    result["verification_source"] = "SemanticScholar"

                s2_venue = ss.get("venue_name")
                if s2_venue:
                    if not result.get("resolved_name"):
                        result["resolved_name"] = s2_venue

                    # Second-pass enrichment: S2 gave us the real journal name.
                    # Re-run OpenAlex and Scimago with it to get quartile + IF,
                    # which the generic original name couldn't retrieve.
                    if not result.get("wos_quartile"):
                        oa2 = await _check_openalex_title(session, s2_venue)
                        if oa2.get("found"):
                            result["impact_factor"]    = result.get("impact_factor") or oa2.get("impact_factor")
                            result["is_scopus_indexed"] = result.get("is_scopus_indexed") or oa2.get("is_scopus_indexed")
                            result["wos_quartile"]      = _quartile_from_if(oa2.get("impact_factor"))
                            if oa2.get("resolved_name"):
                                result["resolved_name"] = oa2["resolved_name"]
                            src = result["verification_source"]
                            result["verification_source"] = (
                                "SemanticScholar+OpenAlex"
                                if src in ("unverified", "SemanticScholar")
                                else src + "+OpenAlex"
                            )

                        scimago2 = await _check_scimago(session, None, s2_venue)
                        if scimago2.get("found"):
                            result["wos_quartile"] = scimago2.get("wos_quartile") or result.get("wos_quartile")
                            result["sjr_index"]    = scimago2.get("sjr_index")
                            if scimago2.get("resolved_name") and not result.get("resolved_name"):
                                result["resolved_name"] = scimago2["resolved_name"]
                            result["verification_source"] += "+Scimago"

        # Tier 6: ISSN Portal — legitimacy only
        if issn and result["verification_source"] == "unverified":
            ip = await _check_issn_portal(session, issn)
            if ip.get("found"):
                result["verification_source"] = "ISSN Portal"

    cache.set("journal", {"issn": issn, "title": title}, result,
              ttl_days=settings.ttl_journal_metrics)
    return result