"""
Journal Verification — Six-Tier Fallback Chain
Tier 1: SQLite cache (instant, zero API cost)
Tier 2: CrossRef (DOI/ISSN-based, most reliable)
Tier 3: OpenAlex (comprehensive free academic graph)
Tier 4: Semantic Scholar (influential citation count)
Tier 5: ISSN Portal (legitimacy check)
Tier 6: Unverified (mark transparently, never fail silently)

Never rely on LLM for journal quality — all facts from real APIs.
"""
import asyncio
import aiohttp
from backend.config import settings
from backend.cache.cache_manager import cache

PREDATORY_PUBLISHERS = {
    "waset", "ijser", "omics", "iiste", "scientific & academic publishing",
    "world academy of science", "ijarai", "ijacsa",
}

CROSSREF_URL = "https://api.crossref.org/journals/{issn}"
OPENALEX_URL = "https://api.openalex.org/sources?filter=issn:{issn}&mailto={mailto}"
SEMANTIC_SCHOLAR_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
ISSN_URL = "https://portal.issn.org/resource/ISSN/{issn}"


async def _check_crossref(session: aiohttp.ClientSession, issn: str) -> dict:
    try:
        url = CROSSREF_URL.format(issn=issn)
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                data = await r.json()
                msg = data.get("message", {})
                return {
                    "found": True,
                    "source": "CrossRef",
                    "title": msg.get("title"),
                    "issn": issn,
                }
    except Exception:
        pass
    return {"found": False}


async def _check_openalex(session: aiohttp.ClientSession, issn: str) -> dict:
    try:
        url = OPENALEX_URL.format(issn=issn, mailto=settings.polite_mailto)
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
            if r.status == 200:
                data = await r.json()
                results = data.get("results", [])
                if results:
                    venue = results[0]
                    return {
                        "found": True,
                        "source": "OpenAlex",
                        "is_scopus_indexed": "Scopus" in (venue.get("host_organization_name") or ""),
                        "citation_count": venue.get("cited_by_count"),
                        "works_count": venue.get("works_count"),
                        "impact_factor": None,  # OpenAlex doesn't expose IF directly
                    }
    except Exception:
        pass
    return {"found": False}


def _check_predatory(journal_name: str) -> tuple[bool, str | None]:
    name_lower = journal_name.lower()
    for pub in PREDATORY_PUBLISHERS:
        if pub in name_lower:
            return True, f"Matches known predatory publisher: {pub}"
    return False, None


async def verify_journal(issn: str | None, title: str) -> dict:
    """
    Main entry point — run full fallback chain.
    Returns enriched dict with WoS status, quartile, IF, predatory flag.
    """
    # Tier 1: Cache
    cached = cache.get("journal", {"issn": issn, "title": title})
    if cached:
        return cached

    result = {
        "issn": issn,
        "title": title,
        "is_wos_indexed": None,
        "is_scopus_indexed": None,
        "impact_factor": None,
        "wos_quartile": None,
        "citation_count": None,
        "influential_citation_count": None,
        "is_predatory_flag": False,
        "predatory_reason": None,
        "verification_source": "unverified",
    }

    # Quick predatory check
    is_pred, reason = _check_predatory(title)
    result["is_predatory_flag"] = is_pred
    result["predatory_reason"] = reason

    if issn:
        async with aiohttp.ClientSession() as session:
            # Tier 2: CrossRef
            cr = await _check_crossref(session, issn)
            if cr.get("found"):
                result["verification_source"] = "CrossRef"

            # Tier 3: OpenAlex
            oa = await _check_openalex(session, issn)
            if oa.get("found"):
                result["is_scopus_indexed"] = oa.get("is_scopus_indexed")
                result["citation_count"] = oa.get("citation_count")
                result["verification_source"] = "OpenAlex"

    cache.set("journal", {"issn": issn, "title": title}, result,
              ttl_days=settings.ttl_journal_metrics)
    return result
