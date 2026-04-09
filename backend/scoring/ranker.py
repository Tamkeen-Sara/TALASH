"""
Candidate Ranking Engine
- Min-max normalization within cohort
- Weighted composite score computation
- Full audit trail per candidate
"""
from backend.schemas.candidate import CandidateProfile
from backend.scoring.rubric import ScoringWeights, DEFAULT_WEIGHTS, min_max_normalize, compute_total_score


def rank_candidates(
    candidates: list[CandidateProfile],
    weights: ScoringWeights = DEFAULT_WEIGHTS,
) -> list[CandidateProfile]:
    """
    Rank all candidates:
    1. Normalize each dimension within the cohort (min-max)
    2. Compute weighted total score
    3. Sort descending and assign ranks
    """
    if not candidates:
        return []

    # Min-max normalize each dimension within the cohort
    edu_scores = [c.score_education for c in candidates]
    res_scores = [c.score_research for c in candidates]
    emp_scores = [c.score_employment for c in candidates]
    ski_scores = [c.score_skills for c in candidates]
    sup_scores = [c.score_supervision for c in candidates]

    norm_edu = min_max_normalize(edu_scores)
    norm_res = min_max_normalize(res_scores)
    norm_emp = min_max_normalize(emp_scores)
    norm_ski = min_max_normalize(ski_scores)
    norm_sup = min_max_normalize(sup_scores)

    for i, c in enumerate(candidates):
        c.score_education = norm_edu[i]
        c.score_research = norm_res[i]
        c.score_employment = norm_emp[i]
        c.score_skills = norm_ski[i]
        c.score_supervision = norm_sup[i]
        c.score_total = compute_total_score(
            c.score_education, c.score_research,
            c.score_employment, c.score_skills, c.score_supervision,
            weights
        )

    candidates.sort(key=lambda c: c.score_total or 0, reverse=True)
    for rank, c in enumerate(candidates, start=1):
        c.rank = rank

    return candidates
