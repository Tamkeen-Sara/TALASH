"""
Scoring rubric with weight definitions and normalization strategy.
All scores are min-max normalized within the current cohort (0-100 relative).
"""
from dataclasses import dataclass
from backend.config import settings


@dataclass
class ScoringWeights:
    research: float = settings.weight_research
    education: float = settings.weight_education
    employment: float = settings.weight_employment
    skills: float = settings.weight_skills
    supervision: float = settings.weight_supervision

    def validate(self):
        total = self.research + self.education + self.employment + self.skills + self.supervision
        assert abs(total - 1.0) < 0.001, f"Weights must sum to 1.0, got {total}"


DEFAULT_WEIGHTS = ScoringWeights()


def min_max_normalize(scores: list[float]) -> list[float]:
    """Normalize a list of scores to [0, 100] range (relative within cohort)."""
    if not scores:
        return scores
    valid = [s for s in scores if s is not None]
    if not valid:
        return scores
    min_s, max_s = min(valid), max(valid)
    if max_s == min_s:
        return [100.0 if s is not None else None for s in scores]
    return [
        round(((s - min_s) / (max_s - min_s)) * 100, 2) if s is not None else None
        for s in scores
    ]


def compute_total_score(
    score_education: float,
    score_research: float,
    score_employment: float,
    score_skills: float,
    score_supervision: float,
    weights: ScoringWeights = DEFAULT_WEIGHTS,
) -> float:
    """Compute weighted composite score (0-100)."""
    components = [
        (score_education or 0, weights.education),
        (score_research or 0, weights.research),
        (score_employment or 0, weights.employment),
        (score_skills or 0, weights.skills),
        (score_supervision or 0, weights.supervision),
    ]
    return round(sum(s * w for s, w in components), 2)
