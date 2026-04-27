"""
Module 5: Student Supervision Analysis
- Cross-reference supervised student names against publication author lists
- Supervision score formula (0-100)
"""
from rapidfuzz import fuzz
from backend.schemas.research import ResearchProfile, SupervisionRecord


def _name_in_authors(student_name: str, authors: list[str], threshold: int = 75) -> bool:
    """Check if a student name fuzzy-matches any author in a paper."""
    for author in authors:
        if fuzz.token_sort_ratio(student_name.lower(), author.lower()) >= threshold:
            return True
    return False


def cross_reference_publications(
    supervision: list[SupervisionRecord],
    profile: ResearchProfile,
) -> list[SupervisionRecord]:
    """Count joint publications for each supervised student."""
    all_papers = list(profile.journal_papers) + list(profile.conference_papers)
    for record in supervision:
        if not record.student_name or record.student_name in ("", "Unknown"):
            continue
        record.publications_together = sum(
            1 for paper in all_papers
            if _name_in_authors(record.student_name, paper.authors or [])
        )
    return supervision


def score_supervision(supervision: list[SupervisionRecord]) -> tuple[float, dict]:
    """
    Supervision Score (0-100):
      PhD main supervisor   15 pts each  max 45
      PhD co-supervisor      8 pts each  max 24
      MS  main supervisor    8 pts each  max 24
      MS  co-supervisor      4 pts each  max 12
      Joint publication bonus +2 per student with shared papers  max 10
    """
    if not supervision:
        return 0.0, {"total": 0.0}

    phd_main = [s for s in supervision if s.degree_level == "PhD" and s.role == "main"]
    phd_co   = [s for s in supervision if s.degree_level == "PhD" and s.role == "co-supervisor"]
    ms_main  = [s for s in supervision if s.degree_level == "MS"  and s.role == "main"]
    ms_co    = [s for s in supervision if s.degree_level == "MS"  and s.role == "co-supervisor"]

    phd_main_score = min(len(phd_main) * 15, 45)
    phd_co_score   = min(len(phd_co)   * 8,  24)
    ms_main_score  = min(len(ms_main)  * 8,  24)
    ms_co_score    = min(len(ms_co)    * 4,  12)
    pub_bonus      = min(sum(2 for s in supervision if s.publications_together > 0), 10)

    total = min(phd_main_score + phd_co_score + ms_main_score + ms_co_score + pub_bonus, 100)

    return round(total, 2), {
        "phd_main_score": phd_main_score,
        "phd_co_score":   phd_co_score,
        "ms_main_score":  ms_main_score,
        "ms_co_score":    ms_co_score,
        "publication_bonus": pub_bonus,
        "total_students": len(supervision),
        "total": round(total, 2),
    }


async def run(profile: ResearchProfile) -> tuple[list[SupervisionRecord], float, dict]:
    enriched        = cross_reference_publications(profile.supervision, profile)
    score, breakdown = score_supervision(enriched)
    return enriched, score, breakdown