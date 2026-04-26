"""
Module 2: Research Profile Analysis
- Journal verification via 6-tier fallback chain
- Conference verification via CORE portal
- H-index computation (local, no API needed)
- Predatory journal detection
- Research score formula (0-100)
"""
import asyncio
from backend.schemas.research import ResearchProfile, JournalPaper, ConferencePaper
from backend.verifiers.journal_verifier import verify_journal
from backend.verifiers.conference_verifier import verify_conference


def compute_h_index(papers: list[JournalPaper]) -> int:
    """Largest h such that h papers each have >= h citations."""
    counts = sorted([p.citation_count or 0 for p in papers], reverse=True)
    h = 0
    for i, c in enumerate(counts):
        if c >= i + 1:
            h = i + 1
        else:
            break
    return h


async def _enrich_journal(paper: JournalPaper) -> JournalPaper:
    result = await verify_journal(paper.issn, paper.journal_name, paper.title)
    paper.is_wos_indexed             = result.get("is_wos_indexed")
    paper.is_scopus_indexed          = result.get("is_scopus_indexed")
    paper.impact_factor              = result.get("impact_factor")
    paper.wos_quartile               = result.get("wos_quartile")
    paper.citation_count             = result.get("citation_count")  # paper-level from Semantic Scholar
    paper.influential_citation_count = result.get("influential_citation_count")
    paper.verification_source        = result.get("verification_source")
    paper.is_predatory_flag          = result.get("is_predatory_flag", False)
    paper.predatory_reason           = result.get("predatory_reason")
    paper.resolved_journal_name      = result.get("resolved_name")
    return paper


async def _enrich_conference(paper: ConferencePaper) -> ConferencePaper:
    result = await verify_conference(
        paper.conference_name,
        paper.conference_edition,
        paper.title,
        paper.authors,          # pass authors for precise CrossRef disambiguation
    )
    paper.core_rank                = result.get("core_rank")
    paper.scimago_quartile         = result.get("scimago_quartile")
    paper.conference_publisher     = result.get("conference_publisher")
    paper.conference_number        = result.get("conference_number")
    paper.is_scopus_indexed        = result.get("is_scopus_indexed")
    paper.verification_source      = result.get("verification_source")
    matched     = result.get("matched_name")
    match_score = result.get("match_score", 0)
    resolved    = result.get("resolved_conference_name")
    # Show resolved name from CrossRef/Scimago when available
    if resolved and resolved.lower() != paper.conference_name.lower():
        paper.resolved_conference_name = resolved
    elif matched and match_score >= 80 and matched.lower() != paper.conference_name.lower():
        paper.resolved_conference_name = matched
    return paper


def _conf_tier(p) -> str:
    """
    Classify a conference paper into a quality tier using all available signals.
    Priority: CORE rank > Scimago quartile > Scopus indexing > publisher reputation.
    Returns: 'top' (A*/A), 'good' (B / SJR Q1-Q2 / Scopus), 'known' (C / SJR Q3-Q4), 'none'
    """
    if p.core_rank in ("A*", "A"):
        return "top"
    if p.core_rank == "B":
        return "good"
    if p.core_rank == "C":
        return "known"
    # No CORE rank — fall back to Scimago proceedings quartile
    if p.scimago_quartile in ("Q1", "Q2"):
        return "top"
    if p.scimago_quartile in ("Q3",):
        return "good"
    if p.scimago_quartile == "Q4":
        return "known"
    # Scopus-indexed proceedings without quartile
    if p.is_scopus_indexed:
        return "good"
    # Reputable publisher (IEEE / ACM / Springer) with no other ranking
    pub = (p.conference_publisher or "").lower()
    if any(x in pub for x in ("ieee", "acm", "springer", "elsevier")):
        return "known"
    return "none"


def score_research(profile: ResearchProfile) -> tuple[float, dict]:
    """
    Research Score (0-100) — aligned with HEC Pakistan faculty evaluation criteria.

    Journals (max 55):
      Q1 papers      8 pts each  cap 40  — top 25% globally by SJR/JCR, highly selective
      Q2 papers      5 pts each  cap 15  — 25-50th percentile, solid mainstream research
      Q3 papers      2 pts each  cap  6  — Scopus/WoS indexed, lower tier but legitimate
      (Q4 and unindexed journals: 0 pts)

    Conferences (max 18):
      CORE A*/A or SJR Q1-Q2 proceedings  4 pts each  cap 12
      CORE B or SJR Q3 or Scopus-indexed  2 pts each  cap  6

    Impact metrics (max 15):
      H-index        1 pt/point  cap 15  — cumulative citation impact

    Other outputs (max 12):
      Verified book  3 pts each  cap  6  — published with ISBN, verifiable
      Verified patent 3 pts each cap  6  — registered patent, verifiable

    Penalty:
      Predatory paper  −3 per paper  — false research output, capped at earned score
    """
    q1   = [p for p in profile.journal_papers if p.wos_quartile == "Q1" and not p.is_predatory_flag]
    q2   = [p for p in profile.journal_papers if p.wos_quartile == "Q2" and not p.is_predatory_flag]
    q3   = [p for p in profile.journal_papers if p.wos_quartile == "Q3" and not p.is_predatory_flag
            and (p.is_scopus_indexed or p.is_wos_indexed)]   # Q3 only counts if actually indexed
    pred = [p for p in profile.journal_papers if p.is_predatory_flag]

    top_conf  = [p for p in profile.conference_papers if _conf_tier(p) == "top"]
    good_conf = [p for p in profile.conference_papers if _conf_tier(p) == "good"]

    q1_score    = min(len(q1)       * 8, 40)
    q2_score    = min(len(q2)       * 5, 15)
    q3_score    = min(len(q3)       * 2,  6)
    conf_score  = min(len(top_conf) * 4 + len(good_conf) * 2, 18)
    h_score     = min(profile.h_index or 0, 15)
    book_score  = min(len([b for b in profile.books   if b.is_verified]) * 3, 6)
    pat_score   = min(len([p for p in profile.patents if p.is_verified]) * 3, 6)
    penalty     = min(len(pred) * 3, q1_score + q2_score + q3_score + conf_score)

    total = max(0, min(100, q1_score + q2_score + q3_score + conf_score + h_score + book_score + pat_score - penalty))

    profile.q1_count         = len(q1)
    profile.q2_count         = len(q2)
    profile.astar_conf_count = len([p for p in profile.conference_papers if p.core_rank == "A*"])
    profile.a_conf_count     = len([p for p in profile.conference_papers if p.core_rank == "A"])
    profile.predatory_count  = len(pred)
    # Count all top-tier conferences including Scimago Q1/Q2 without CORE rank
    profile.astar_conf_count += len([p for p in profile.conference_papers
                                     if not p.core_rank and p.scimago_quartile == "Q1"])
    profile.a_conf_count     += len([p for p in profile.conference_papers
                                     if not p.core_rank and p.scimago_quartile == "Q2"])

    return round(total, 2), {
        "q1_score": q1_score, "q2_score": q2_score, "q3_score": q3_score,
        "conference_score": conf_score, "h_index_score": h_score,
        "book_score": book_score, "patent_score": pat_score,
        "predatory_penalty": penalty, "total": round(total, 2),
    }


async def run(profile: ResearchProfile) -> ResearchProfile:
    journal_tasks = [_enrich_journal(p)    for p in profile.journal_papers]
    conf_tasks    = [_enrich_conference(p) for p in profile.conference_papers]

    if journal_tasks:
        profile.journal_papers    = list(await asyncio.gather(*journal_tasks))
    if conf_tasks:
        profile.conference_papers = list(await asyncio.gather(*conf_tasks))

    profile.h_index         = compute_h_index(profile.journal_papers)
    profile.total_citations = sum(p.citation_count or 0 for p in profile.journal_papers)

    score, breakdown        = score_research(profile)
    profile.research_score  = score
    profile.score_breakdown = breakdown
    return profile