"""
Module 1: Educational Profile Analysis
- CGPA normalization to 4.0 scale (HEC standard for percentages)
- University ranking lookup via university_verifier
- Education gap detection via IntervalTree
- Gap justification against employment history
- Education score formula (0-100)
"""
from intervaltree import IntervalTree
from backend.schemas.education import EducationProfile, DegreeRecord
from backend.schemas.candidate import EmploymentProfile


def _degree_tier(level: str) -> str:
    """
    Map a free-form degree level string to one of three tiers used for scoring:
    'doctoral', 'postgrad', 'undergrad', or 'other'.
    Uses keyword detection so non-standard level strings still score correctly.
    """
    if not level:
        return "other"
    sl = level.lower()
    if any(k in sl for k in ("phd", "ph.d", "doctor", "doctorate", "dphil")):
        return "doctoral"
    if any(k in sl for k in ("ms", "msc", "mphil", "mba", "master", "postgrad",
                              "m.sc", "m.eng", "meng", "m.tech", "laurea magistrale")):
        return "postgrad"
    if any(k in sl for k in ("bs", "bsc", "be", "bachelor", "undergrad",
                              "b.sc", "b.eng", "beng", "b.tech", "laurea triennale")):
        return "undergrad"
    return "other"


def normalize_to_4_scale(value: float, scale: float = None, is_percentage: bool = False) -> float:
    """Normalize any academic score to 4.0 scale."""
    if value is None:
        return None
    if is_percentage:
        # Pakistan HEC standard conversion
        thresholds = [(85, 4.0), (80, 3.67), (75, 3.33), (70, 3.0),
                      (65, 2.67), (60, 2.33), (55, 2.0), (50, 1.67)]
        for threshold, gpa in thresholds:
            if value >= threshold:
                return gpa
        return 1.0
    elif scale and scale > 0:
        return (value / scale) * 4.0
    return value


def _degree_duration(level: str) -> int:
    """Estimate typical duration in years from a free-form degree level string."""
    t = _degree_tier(level)
    if t == "doctoral":
        return 5
    if t == "postgrad":
        return 2
    if t == "undergrad":
        return 4
    return 3  # unknown — assume mid-length


def detect_education_gaps(edu: EducationProfile, emp: EmploymentProfile) -> list[dict]:
    """Use IntervalTree to find gaps between milestones, justify via employment OR enrollment."""
    emp_tree = IntervalTree()
    for job in emp.records:
        s = job.start_year or 0
        e = job.end_year or 9999
        if s < e:
            emp_tree.addi(s, e, job)

    edu_tree = IntervalTree()
    for d in edu.degrees:
        s = d.start_year
        e = d.end_year
        if s and e and s < e:
            edu_tree.addi(s, e, d)
        elif e:
            duration = _degree_duration(d.level)
            edu_tree.addi(e - duration, e, d)

    sse_yr = edu.sse.year if edu.sse else None
    hse_yr = edu.hse.year if edu.hse else None
    if sse_yr and hse_yr and sse_yr < hse_yr:
        edu_tree.addi(sse_yr, hse_yr, "hse_enrollment")
    elif hse_yr:
        edu_tree.addi(hse_yr - 2, hse_yr, "hse_enrollment")

    years = set()
    for d in edu.degrees:
        if d.start_year:
            years.add(d.start_year)
        if d.end_year:
            years.add(d.end_year)
    if sse_yr:
        years.add(sse_yr)
    if hse_yr:
        years.add(hse_yr)

    sorted_years = sorted(years)
    gaps = []
    for i in range(len(sorted_years) - 1):
        gap = sorted_years[i + 1] - sorted_years[i]
        if gap > 1:
            overlapping_emp = emp_tree.overlap(sorted_years[i], sorted_years[i + 1])
            overlapping_edu = edu_tree.overlap(sorted_years[i], sorted_years[i + 1])
            justified = len(overlapping_emp) > 0 or len(overlapping_edu) > 0
            gaps.append({
                "from_year": sorted_years[i],
                "to_year": sorted_years[i + 1],
                "duration_years": gap,
                "justified": justified,
                "justifying_roles": [o.data.job_title for o in overlapping_emp],
            })
    return gaps


def score_education(edu: EducationProfile, emp: EmploymentProfile) -> tuple[float, dict]:
    """
    Education Score Formula (0-100):
    - Academic Performance: 40 pts (PG CGPA × 25 + UG CGPA × 15, normalized to 4.0)
    - Highest Qualification: 25 pts
    - Institutional Quality: 20 pts (QS rank bands)
    - Gap Penalty: 15 pts base − 5 per unjustified gap > 1 year (min 0)
    """
    breakdown = {}

    # Normalize all CGPAs
    for d in edu.degrees:
        if d.cgpa and d.cgpa_scale:
            d.cgpa_normalized = normalize_to_4_scale(d.cgpa, d.cgpa_scale)
        elif d.percentage:
            d.cgpa_normalized = normalize_to_4_scale(d.percentage, is_percentage=True)

    # Academic Performance (40 pts)
    tiers = [(d, _degree_tier(d.level)) for d in edu.degrees]
    pg_degrees = [d for d, t in tiers if t in ("doctoral", "postgrad")]
    ug_degrees = [d for d, t in tiers if t == "undergrad"]
    pg_cgpa = max((d.cgpa_normalized for d in pg_degrees if d.cgpa_normalized), default=None)
    ug_cgpa = max((d.cgpa_normalized for d in ug_degrees if d.cgpa_normalized), default=None)
    perf_score = 0
    if pg_cgpa:
        perf_score += (pg_cgpa / 4.0) * 25
    if ug_cgpa:
        perf_score += (ug_cgpa / 4.0) * 15
    perf_score = min(perf_score, 40)
    breakdown["academic_performance"] = round(perf_score, 2)

    # Highest Qualification (25 pts)
    degree_tiers = {t for _, t in tiers}
    qual_score = 0
    if "doctoral" in degree_tiers:
        qual_score = 25
    elif "postgrad" in degree_tiers:
        qual_score = 18
    elif "undergrad" in degree_tiers:
        qual_score = 12
    breakdown["highest_qualification"] = qual_score

    # Institutional Quality (20 pts)
    inst_score = 0
    for d in edu.degrees:
        rank = d.qs_rank or d.the_rank
        if rank:
            if rank <= 100:
                inst_score = max(inst_score, 20)
            elif rank <= 500:
                inst_score = max(inst_score, 15)
            elif rank <= 1000:
                inst_score = max(inst_score, 10)
            else:
                inst_score = max(inst_score, 5)
        else:
            inst_score = max(inst_score, 5)  # unranked but known institution
    breakdown["institutional_quality"] = inst_score

    # Gap Penalty (15 pts base)
    gaps = detect_education_gaps(edu, emp)
    edu.education_gaps = gaps
    unjustified = sum(1 for g in gaps if not g["justified"])
    gap_score = max(0, 15 - unjustified * 5)
    breakdown["gap_score"] = gap_score
    breakdown["gaps_detected"] = len(gaps)
    breakdown["unjustified_gaps"] = unjustified

    total = perf_score + qual_score + inst_score + gap_score
    breakdown["total"] = round(total, 2)
    return round(total, 2), breakdown


async def run(edu: EducationProfile, emp: EmploymentProfile) -> EducationProfile:
    from backend.verifiers.university_verifier import enrich_degrees
    edu.degrees = await enrich_degrees(edu.degrees)
    score, breakdown = score_education(edu, emp)
    edu.education_score = score
    edu.score_breakdown = breakdown
    return edu
