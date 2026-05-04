"""
Profile Enricher — Academic Identity Resolution

Disambiguates and enriches candidate profiles using three legitimate open APIs:
  ORCID            pub.orcid.org/v3.0
  OpenAlex         api.openalex.org
  Semantic Scholar api.semanticscholar.org/graph/v1

NOT used: LinkedIn (ToS), Google Scholar (robots.txt), any private source.

─── Disambiguation strategy ────────────────────────────────────────────────────

Name-first search is fundamentally fragile:
  "Nasir Ali Shah"  → "Syed Nasir Ali Shah" (medicine, wrong person, ratio ≈ 85)
  "Shaheer"         → "Muhammad Shaheer"     (different field, wrong person)

Paper-first search is robust because paper titles are unique identifiers:
  1. Take up to 6 paper titles extracted from the candidate's CV.
  2. Search OpenAlex (and Semantic Scholar as fallback) for each title.
  3. Among the returned authorships, collect author IDs where the author's
     name fuzzy-matches the candidate (ratio ≥ 75 — loose, because the
     paper already provides strong specificity).
  4. The author ID that appears in the most papers is the candidate.
  5. Accept if that ID appeared in ≥ 40% of the papers checked (≥ 2 of 5).

When the candidate has no indexed papers (fresh PhD grad, new researcher):
  Fall back to name+institution search with a stricter threshold (ratio ≥ 90).

─── H-index resolution ─────────────────────────────────────────────────────────

Different citation databases index different subsets of publications.
OpenAlex may count 8 papers while Semantic Scholar counts 14 for the same
author, producing different h-index values.  We take the maximum across all
sources — a higher h-index means more papers were found, so it is always the
more accurate value.  A source that misses papers cannot inflate the h-index;
it can only understate it.
"""
import asyncio
import urllib.parse
from collections import Counter

import aiohttp
from rapidfuzz import fuzz

from backend.schemas.candidate import CandidateProfile
from backend.config import settings

# ── API endpoints ──────────────────────────────────────────────────────────────
_ORCID_SEARCH   = "https://pub.orcid.org/v3.0/search?q={query}&rows=5"
_ORCID_PERSON   = "https://pub.orcid.org/v3.0/{orcid_id}/person"
_OA_WORKS       = ("https://api.openalex.org/works"
                   "?filter=title.search:{title}"
                   "&per_page=3&select=id,title,authorships&mailto={mailto}")
_OA_AUTHOR_ID   = "https://api.openalex.org/authors/{id}?mailto={mailto}"
_OA_AUTHOR_NAME = ("https://api.openalex.org/authors"
                   "?search={name}&per_page=5&mailto={mailto}")
_OA_AUTHOR_INS  = ("https://api.openalex.org/authors"
                   "?search={name}"
                   "&filter=last_known_institution.display_name.search:{inst}"
                   "&per_page=3&mailto={mailto}")
_S2_PAPER       = ("https://api.semanticscholar.org/graph/v1/paper/search"
                   "?query={query}&fields=title,authors&limit=3")
_S2_AUTHOR      = ("https://api.semanticscholar.org/graph/v1/author/search"
                   "?query={query}"
                   "&fields=name,affiliations,paperCount,citationCount,hIndex,externalIds"
                   "&limit=5")
_S2_AUTHOR_ID   = ("https://api.semanticscholar.org/graph/v1/author/{id}"
                   "?fields=name,affiliations,paperCount,citationCount,hIndex,externalIds")

_TIMEOUT = aiohttp.ClientTimeout(total=9)
_JSON    = {"Accept": "application/json"}


# ── Utilities ─────────────────────────────────────────────────────────────────

def _cv_paper_titles(candidate: CandidateProfile) -> list[str]:
    titles = []
    for p in (candidate.research.journal_papers or []):
        if p.title and len(p.title.strip()) > 12:
            titles.append(p.title.strip())
    for p in (candidate.research.conference_papers or []):
        if p.title and len(p.title.strip()) > 12:
            titles.append(p.title.strip())
    return titles[:8]


def _best_institution(candidate: CandidateProfile) -> str:
    for rec in (candidate.employment.records or []):
        if rec.organization and rec.organization.strip():
            return rec.organization.strip()
    for deg in (candidate.education.degrees or []):
        if deg.institution and deg.institution.strip():
            return deg.institution.strip()
    return ""


def _split_name(full: str) -> tuple[str, str]:
    parts = full.strip().split()
    return (" ".join(parts[:-1]), parts[-1]) if len(parts) > 1 else (parts[0], parts[0])


def _clean_orcid(raw: str | None) -> str | None:
    return (raw or "").replace("https://orcid.org/", "").strip() or None


def _s2_headers() -> dict:
    h = {}
    if settings.semantic_scholar_api_key:
        h["x-api-key"] = settings.semantic_scholar_api_key
    return h


# ── Paper-anchored author discovery ───────────────────────────────────────────

async def _oa_paper_authorships(
    session: aiohttp.ClientSession,
    title: str,
) -> list[dict]:
    """
    Search OpenAlex for a paper by title.
    Returns list of authorship dicts for papers whose title matches well.
    Each dict: {author_id, author_name, orcid}
    """
    try:
        url = _OA_WORKS.format(
            title=urllib.parse.quote(title[:100]),
            mailto=settings.polite_mailto,
        )
        async with session.get(url, timeout=_TIMEOUT) as r:
            if r.status != 200:
                return []
            works = (await r.json()).get("results", [])
    except Exception:
        return []

    results = []
    for work in works:
        returned = work.get("title") or ""
        if fuzz.token_set_ratio(title.lower(), returned.lower()) < 72:
            continue
        for a in (work.get("authorships") or []):
            author = a.get("author") or {}
            raw_id = (author.get("id") or "").replace("https://openalex.org/", "")
            results.append({
                "author_id":   raw_id,
                "author_name": author.get("display_name") or "",
                "orcid":       _clean_orcid(author.get("orcid")),
            })
    return results


async def _s2_paper_authorships(
    session: aiohttp.ClientSession,
    title: str,
) -> list[dict]:
    """Search Semantic Scholar for a paper by title. Returns author dicts."""
    try:
        url = _S2_PAPER.format(query=urllib.parse.quote(title[:120]))
        async with session.get(url, headers=_s2_headers(), timeout=_TIMEOUT) as r:
            if r.status != 200:
                return []
            papers = (await r.json()).get("data", [])
    except Exception:
        return []

    results = []
    for paper in papers:
        returned = paper.get("title") or ""
        if fuzz.token_set_ratio(title.lower(), returned.lower()) < 72:
            continue
        for a in (paper.get("authors") or []):
            results.append({
                "author_id":   a.get("authorId") or "",
                "author_name": a.get("name") or "",
                "orcid":       None,
            })
    return results


async def _find_via_papers(
    session: aiohttp.ClientSession,
    candidate: CandidateProfile,
    name: str,
) -> tuple[dict, dict]:
    """
    Paper-first disambiguation.

    For each CV paper, fetch who authored it from OpenAlex and Semantic Scholar.
    Among those authorships, keep only authors whose name loosely matches the
    candidate (ratio ≥ 75).  The author IDs that appear in the most papers are
    the candidate — we accept the best match if it appears in ≥ 40% of papers
    checked (and in at least 2 papers, or 1 if only 2 papers exist on CV).

    Returns (oa_hit: dict, s2_hit: dict) — either may be empty.
    """
    titles = _cv_paper_titles(candidate)
    if not titles:
        return {}, {}

    # Run all paper lookups concurrently
    oa_tasks = [_oa_paper_authorships(session, t) for t in titles]
    s2_tasks = [_s2_paper_authorships(session, t) for t in titles]
    oa_results, s2_results = await asyncio.gather(
        asyncio.gather(*oa_tasks),
        asyncio.gather(*s2_tasks),
    )

    def _best_id(results_per_paper: list[list[dict]]) -> tuple[str | None, float, str | None]:
        """Find the most-cited author ID across papers; return (id, confidence, orcid)."""
        id_counts: Counter = Counter()
        id_to_orcid: dict[str, str | None] = {}

        for per_paper in results_per_paper:
            seen_this_paper: set[str] = set()
            for a in per_paper:
                if not a["author_id"]:
                    continue
                if fuzz.ratio(name.lower(), a["author_name"].lower()) < 75:
                    continue
                if a["author_id"] not in seen_this_paper:
                    id_counts[a["author_id"]] += 1
                    seen_this_paper.add(a["author_id"])
                if a.get("orcid"):
                    id_to_orcid[a["author_id"]] = a["orcid"]

        if not id_counts:
            return None, 0.0, None

        best_id, count = id_counts.most_common(1)[0]
        papers_with_data = sum(1 for r in results_per_paper if r)
        # Require at least 40% of checked papers AND minimum 1 absolute match
        min_required = max(1, round(0.4 * papers_with_data))
        if count < min_required:
            return None, 0.0, None

        confidence = count / max(papers_with_data, 1)
        return best_id, confidence, id_to_orcid.get(best_id)

    oa_id, oa_conf, oa_orcid = _best_id(list(oa_results))
    s2_id, s2_conf, _        = _best_id(list(s2_results))

    oa_hit: dict = {}
    s2_hit: dict = {}

    if oa_id:
        try:
            url = _OA_AUTHOR_ID.format(id=oa_id, mailto=settings.polite_mailto)
            async with session.get(url, timeout=_TIMEOUT) as r:
                if r.status == 200:
                    data  = await r.json()
                    stats = data.get("summary_stats") or {}
                    oa_hit = {
                        "found":               True,
                        "openalex_author_id":  oa_id,
                        "openalex_profile_url": data.get("id"),
                        "orcid_id":            _clean_orcid(data.get("orcid")) or oa_orcid,
                        "h_index":             stats.get("h_index"),
                        "cited_by_count":      data.get("cited_by_count"),
                        "works_count":         data.get("works_count"),
                        "display_name":        data.get("display_name"),
                        "confidence":          oa_conf,
                        "method":              "paper-anchored",
                    }
        except Exception:
            pass

    if s2_id:
        try:
            url = _S2_AUTHOR_ID.format(id=s2_id)
            async with session.get(url, headers=_s2_headers(), timeout=_TIMEOUT) as r:
                if r.status == 200:
                    data = await r.json()
                    orcid_raw = (data.get("externalIds") or {}).get("ORCID")
                    s2_hit = {
                        "found":              True,
                        "semantic_scholar_id": s2_id,
                        "h_index":            data.get("hIndex"),
                        "cited_by_count":     data.get("citationCount"),
                        "works_count":        data.get("paperCount"),
                        "orcid_id":           _clean_orcid(orcid_raw),
                        "confidence":         s2_conf,
                        "method":             "paper-anchored",
                    }
        except Exception:
            pass

    return oa_hit, s2_hit


# ── Name-search fallback (strict) ─────────────────────────────────────────────

async def _find_via_name(
    session: aiohttp.ClientSession,
    name: str,
    institution: str,
) -> tuple[dict, dict]:
    """
    Name+institution search — used only when paper-anchored search found nothing
    (e.g. fresh PhD grad with no indexed publications yet).

    Threshold raised to 90 to avoid the "Syed Nasir Ali Shah" false-match
    problem.  Even at 90, we only accept when the institution also matches.
    """
    oa_hit: dict = {}
    s2_hit: dict = {}

    # OpenAlex
    try:
        url = (_OA_AUTHOR_INS if institution else _OA_AUTHOR_NAME).format(
            name=urllib.parse.quote(name),
            inst=urllib.parse.quote(institution),
            mailto=settings.polite_mailto,
        )
        async with session.get(url, timeout=_TIMEOUT) as r:
            if r.status == 200:
                authors = (await r.json()).get("results", [])
        for author in authors:
            returned_name = author.get("display_name") or ""
            returned_inst = (author.get("last_known_institution") or {}).get("display_name") or ""
            # Strict threshold for name-only search
            if fuzz.ratio(name.lower(), returned_name.lower()) < 90:
                continue
            if institution and fuzz.token_set_ratio(institution.lower(), returned_inst.lower()) < 60:
                continue
            stats  = author.get("summary_stats") or {}
            oa_id  = (author.get("id") or "").replace("https://openalex.org/", "")
            oa_hit = {
                "found":               True,
                "openalex_author_id":  oa_id,
                "openalex_profile_url": author.get("id"),
                "orcid_id":            _clean_orcid(author.get("orcid")),
                "h_index":             stats.get("h_index"),
                "cited_by_count":      author.get("cited_by_count"),
                "works_count":         author.get("works_count"),
                "display_name":        returned_name,
                "confidence":          fuzz.ratio(name.lower(), returned_name.lower()) / 100,
                "method":              "name-search",
            }
            break
    except Exception:
        pass

    # Semantic Scholar
    try:
        url = _S2_AUTHOR.format(query=urllib.parse.quote(name))
        async with session.get(url, headers=_s2_headers(), timeout=_TIMEOUT) as r:
            if r.status == 200:
                authors = (await r.json()).get("data", [])
        for author in authors:
            returned_name = author.get("name") or ""
            if fuzz.ratio(name.lower(), returned_name.lower()) < 90:
                continue
            affiliations = [a.get("name", "") for a in (author.get("affiliations") or [])]
            if institution and affiliations:
                if not any(fuzz.token_set_ratio(institution.lower(), a.lower()) >= 60
                           for a in affiliations):
                    continue
            orcid_raw = (author.get("externalIds") or {}).get("ORCID")
            s2_hit = {
                "found":              True,
                "semantic_scholar_id": author.get("authorId"),
                "h_index":            author.get("hIndex"),
                "cited_by_count":     author.get("citationCount"),
                "works_count":        author.get("paperCount"),
                "orcid_id":           _clean_orcid(orcid_raw),
                "confidence":         fuzz.ratio(name.lower(), returned_name.lower()) / 100,
                "method":             "name-search",
            }
            break
    except Exception:
        pass

    return oa_hit, s2_hit


# ── ORCID ─────────────────────────────────────────────────────────────────────

async def _search_orcid(
    session: aiohttp.ClientSession,
    given: str,
    family: str,
    institution: str,
) -> str | None:
    q = [f'family-name:"{family}"', f'given-names:"{given}"']
    if institution:
        q.append(f'affiliation-org-name:"{institution.replace(chr(34), " ")}"')
    try:
        url = _ORCID_SEARCH.format(query=urllib.parse.quote(" AND ".join(q)))
        async with session.get(url, headers=_JSON, timeout=_TIMEOUT) as r:
            if r.status != 200:
                return None
            items = (await r.json()).get("result") or []
        if items:
            return items[0].get("orcid-identifier", {}).get("path") or None
    except Exception:
        pass
    return None


async def _fetch_orcid_email(session: aiohttp.ClientSession, orcid_id: str) -> str | None:
    try:
        url = _ORCID_PERSON.format(orcid_id=orcid_id)
        async with session.get(url, headers=_JSON, timeout=_TIMEOUT) as r:
            if r.status != 200:
                return None
            data = await r.json()
        for entry in ((data.get("emails") or {}).get("email") or []):
            if entry.get("visibility") == "public" and entry.get("email"):
                return entry["email"]
    except Exception:
        pass
    return None


# ── Main entry point ──────────────────────────────────────────────────────────

async def run(candidate: CandidateProfile) -> CandidateProfile:
    """
    Enrich candidate profile with academic identity data.

    Flow:
      1. Paper-anchored search (primary) — uses CV papers to find the correct
         author profile without relying on name disambiguation alone.
      2. Name-search fallback (strict, threshold 90) — for candidates with no
         indexed publications yet.
      3. ORCID search — run concurrently with the above; provides email.
      4. H-index: take the maximum across all sources.
    """
    name = candidate.full_name.strip()
    if not name or name == "Unnamed Candidate":
        return candidate

    institution   = _best_institution(candidate)
    given, family = _split_name(name)

    async with aiohttp.ClientSession() as session:

        # Run paper-anchored search and ORCID search concurrently
        paper_task = _find_via_papers(session, candidate, name)
        orcid_task = _search_orcid(session, given, family, institution)

        (oa_hit, s2_hit), orcid_direct = await asyncio.gather(
            paper_task, orcid_task, return_exceptions=True
        )

        if isinstance(oa_hit, Exception):
            oa_hit = {}
        if isinstance(s2_hit, Exception):
            s2_hit = {}
        if isinstance(orcid_direct, Exception):
            orcid_direct = None

        # Fall back to name-search only if paper-anchored found nothing
        if not oa_hit and not s2_hit:
            oa_hit, s2_hit = await _find_via_name(session, name, institution)

        # Resolve ORCID iD: prefer paper-anchored sources (already validated),
        # then ORCID direct search
        orcid_id = (
            oa_hit.get("orcid_id")
            or s2_hit.get("orcid_id")
            or orcid_direct
        )

        # Fetch ORCID email (if we have a verified iD)
        enriched_email = None
        if orcid_id:
            try:
                enriched_email = await _fetch_orcid_email(session, orcid_id)
            except Exception:
                pass

    # ── H-index: maximum across all sources ───────────────────────────────────
    # A higher h-index means more papers were found — always more accurate.
    h_candidates = [v for v in [oa_hit.get("h_index"), s2_hit.get("h_index")]
                    if v is not None]
    h_index  = max(h_candidates) if h_candidates else None

    cited_candidates = [v for v in [oa_hit.get("cited_by_count"), s2_hit.get("cited_by_count")]
                        if v is not None]
    cited_by = max(cited_candidates) if cited_candidates else None

    # ── Write back ────────────────────────────────────────────────────────────
    if orcid_id:
        candidate.orcid_id          = orcid_id
        candidate.orcid_profile_url = f"https://orcid.org/{orcid_id}"

    if oa_hit.get("openalex_author_id"):
        candidate.openalex_author_id   = oa_hit["openalex_author_id"]
        candidate.openalex_profile_url = oa_hit.get("openalex_profile_url")

    if s2_hit.get("semantic_scholar_id"):
        candidate.semantic_scholar_id = s2_hit["semantic_scholar_id"]

    if enriched_email and not candidate.email:
        candidate.enriched_email = enriched_email

    if h_index is not None:
        candidate.enriched_h_index = h_index
    if cited_by is not None:
        candidate.enriched_citations = cited_by

    # ── Log ───────────────────────────────────────────────────────────────────
    oa_conf  = oa_hit.get("confidence", 0)
    s2_conf  = s2_hit.get("confidence", 0)
    oa_meth  = oa_hit.get("method", "-")
    found_any = oa_hit.get("found") or s2_hit.get("found")

    if found_any:
        print(
            f"[profile_enricher] {name}: ORCID={orcid_id} | "
            f"OA={oa_hit.get('openalex_author_id')} ({oa_meth}, conf={oa_conf:.2f}) | "
            f"S2={s2_hit.get('semantic_scholar_id')} ({s2_meth if (s2_meth := s2_hit.get('method')) else '-'}, conf={s2_conf:.2f}) | "
            f"h_max={h_index} | email={'yes' if enriched_email else 'no'}"
        )
    else:
        print(f"[profile_enricher] {name}: no profiles found (papers checked: {len(_cv_paper_titles(candidate))})")

    return candidate
