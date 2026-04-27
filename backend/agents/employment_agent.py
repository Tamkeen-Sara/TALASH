"""
Module 7: Employment History Analysis
- IntervalTree overlap detection (job vs job)
- Career progression scoring via seniority keyword mapping
- Employment score formula (0-100)
"""
from intervaltree import IntervalTree
from backend.schemas.candidate import EmploymentProfile, EmploymentRecord
from backend.schemas.education import EducationProfile

SENIORITY_MAP = {
    "professor": 10, "associate professor": 9, "assistant professor": 8,
    "dean": 10, "head of department": 9, "department head": 9,
    "director": 9, "principal investigator": 8,
    "lecturer": 7, "visiting faculty": 6, "research fellow": 6,
    "postdoctoral": 5, "postdoc": 5,
    "director": 9, "manager": 7, "lead": 7, "principal": 8, "senior": 6,
    "engineer": 5, "developer": 5, "analyst": 5, "consultant": 5,
    "coordinator": 4, "specialist": 5, "officer": 4,
    "research assistant": 3, "teaching assistant": 3,
    "junior": 3, "assistant": 3, "trainee": 2, "intern": 2,
}

ACADEMIC_KEYWORDS  = {"professor", "lecturer", "faculty", "researcher", "postdoc",
                       "fellow", "instructor", "academic", "visiting"}
PART_TIME_KEYWORDS = {"part-time", "part time", "adjunct", "visiting", "honorary",
                       "volunteer", "casual", "freelance"}


def _is_academic(r: EmploymentRecord) -> bool:
    t = (r.job_title or "").lower()
    return any(kw in t for kw in ACADEMIC_KEYWORDS)


def _is_part_time(r: EmploymentRecord) -> bool:
    t = (r.job_title or "").lower()
    et = (r.employment_type or "").lower()
    return any(kw in t or kw in et for kw in PART_TIME_KEYWORDS)


def _seniority(r: EmploymentRecord) -> int:
    t = (r.job_title or "").lower()
    for kw, score in sorted(SENIORITY_MAP.items(), key=lambda x: -len(x[0])):
        if kw in t:
            return score
    return 4


def detect_employment_gaps(records: list[EmploymentRecord]) -> list[dict]:
    """Find unexplained gaps between consecutive employment periods."""
    if len(records) < 2:
        return []
    sorted_r = sorted(
        [r for r in records if r.start_year and (r.end_year or r.is_current)],
        key=lambda r: r.start_year
    )
    gaps = []
    for i in range(len(sorted_r) - 1):
        current = sorted_r[i]
        next_r  = sorted_r[i + 1]
        end     = current.end_year or (2025 if not current.is_current else 2026)
        start_next = next_r.start_year
        gap_yrs = start_next - end
        if gap_yrs > 1:
            gaps.append({
                "from_year": end,
                "to_year": start_next,
                "duration_years": gap_yrs,
                "after_role": current.job_title,
                "before_role": next_r.job_title,
                "justified": False,
                "reason": "No recorded employment during this period",
            })
    return gaps


def detect_edu_emp_overlaps(
    records: list[EmploymentRecord], edu: EducationProfile | None
) -> list[dict]:
    """Detect full-time job periods that overlap with full-time degree programs."""
    if not edu or not edu.degrees:
        return []
    overlaps = []
    for degree in edu.degrees:
        d_start = degree.start_year
        d_end   = degree.end_year
        if not d_start or not d_end:
            continue
        for r in records:
            if _is_part_time(r) or _is_academic(r):
                continue  # part-time or academic is acceptable
            j_start = r.start_year or 0
            j_end   = r.end_year or (2026 if r.is_current else 2025)
            overlap = min(j_end, d_end) - max(j_start, d_start)
            if overlap > 0:
                overlaps.append({
                    "degree": f"{degree.level} at {degree.institution}",
                    "job": r.job_title,
                    "org": r.organization,
                    "overlap_years": overlap,
                    "note": "Full-time employment overlaps with full-time degree — verify with candidate",
                })
    return overlaps


def detect_overlaps(records: list[EmploymentRecord]) -> list[dict]:
    """Flag full-time job overlaps using IntervalTree."""
    tree = IntervalTree()
    overlaps = []
    for i, r in enumerate(records):
        s = r.start_year or 0
        e = r.end_year or (2026 if r.is_current else 2025)
        if s >= e:
            continue
        for ov in tree.overlap(s, e):
            other = records[ov.data]
            overlap_yrs = min(e, ov.end) - max(s, ov.begin)
            both_ft = not _is_part_time(r) and not _is_part_time(other)
            flagged = both_ft and overlap_yrs > 0
            overlaps.append({
                "job_a": r.job_title, "org_a": r.organization,
                "job_b": other.job_title, "org_b": other.organization,
                "overlap_years": overlap_yrs,
                "flagged": flagged,
                "reason": "Two full-time roles overlap" if flagged
                          else "Acceptable (part-time or academic role)",
            })
        tree.addi(s, e, i)
    return overlaps


def score_employment(profile: EmploymentProfile) -> tuple[float, dict]:
    """
    Employment Score (0-100):
      Career progression  60 pts  (peak seniority 40 + upward trend 20)
      Experience years    20 pts  (1.5 pts/year, max 20)
      Academic bonus      10 pts  (5 per academic role, max 10)
      FT overlap penalty -10 per flagged overlap (floor 0)
    """
    records = profile.records
    if not records:
        return 0.0, {"total": 0.0, "reason": "No employment records"}

    sorted_r  = sorted(records, key=lambda r: r.start_year or 0)
    seniority = [_seniority(r) for r in sorted_r]
    for r, s in zip(sorted_r, seniority):
        r.seniority_score = s

    peak       = max(seniority)
    trend_ups  = sum(1 for i in range(1, len(seniority)) if seniority[i] > seniority[i - 1])
    prog_score = min((peak / 10) * 40 + trend_ups * 5, 60)

    years = sum(
        (r.end_year or 2025) - (r.start_year or 2000)
        for r in records if r.start_year
    )
    exp_score = min(years * 1.5, 20)

    academic_bonus = min(sum(5 for r in records if _is_academic(r)), 10)

    flagged    = sum(1 for o in profile.overlaps if o.get("flagged"))
    penalty    = min(flagged * 10, 30)

    total = max(0, min(100, prog_score + exp_score + academic_bonus - penalty))

    return round(total, 2), {
        "progression_score": round(prog_score, 2),
        "experience_score": round(exp_score, 2),
        "academic_bonus": academic_bonus,
        "overlap_penalty": penalty,
        "flagged_overlaps": flagged,
        "peak_seniority": peak,
        "total": round(total, 2),
    }


async def run(profile: EmploymentProfile, edu: EducationProfile | None = None) -> EmploymentProfile:
    profile.gaps            = detect_employment_gaps(profile.records)
    profile.overlaps        = detect_overlaps(profile.records)
    edu_emp_overlaps        = detect_edu_emp_overlaps(profile.records, edu)
    if edu_emp_overlaps:
        profile.overlaps.extend(edu_emp_overlaps)
    score, breakdown        = score_employment(profile)
    profile.employment_score = score
    profile.score_breakdown  = breakdown
    return profile