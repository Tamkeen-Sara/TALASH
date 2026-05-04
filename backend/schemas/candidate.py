from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, Any
from .education import EducationProfile
from .research import ResearchProfile


def _null_str(v):
    if v is None:
        return ""
    if isinstance(v, str) and v.strip().lower() in ("null", "none"):
        return ""
    return v


def _null_int(v):
    if v is None:
        return None
    if isinstance(v, str) and v.strip().lower() in ("null", "none", ""):
        return None
    return v


class EmploymentRecord(BaseModel):
    job_title: str = ""
    organization: str = ""
    employment_type: Optional[str] = None
    start_year: Optional[int] = None
    start_month: Optional[int] = None
    end_year: Optional[int] = None
    end_month: Optional[int] = None
    is_current: bool = False
    responsibilities: list[str] = []
    seniority_score: Optional[int] = None
    raw_text: str = ""

    @field_validator("job_title", "organization", "raw_text", mode="before")
    @classmethod
    def coerce_strs(cls, v): return _null_str(v) if v is None or isinstance(v, str) else v

    @field_validator("employment_type", mode="before")
    @classmethod
    def coerce_emp_type(cls, v):
        """LLM returns 'null'/'none' string — map to None so the badge is hidden."""
        if v is None:
            return None
        if isinstance(v, str) and v.strip().lower() in ("null", "none", ""):
            return None
        return v

    @field_validator("start_year", "start_month", "end_year", "end_month", "seniority_score", mode="before")
    @classmethod
    def coerce_ints(cls, v): return _null_int(v)

    @field_validator("is_current", mode="before")
    @classmethod
    def coerce_bool(cls, v): return False if v is None else v

    @field_validator("responsibilities", mode="before")
    @classmethod
    def coerce_list(cls, v): return [] if v is None else v


class EmploymentProfile(BaseModel):
    records: list[EmploymentRecord] = []
    gaps: list[dict] = []
    overlaps: list[dict] = []
    career_progression_score: Optional[float] = None
    employment_score: Optional[float] = None
    score_breakdown: dict = {}


class SkillRecord(BaseModel):
    skill_name: str
    evidence_level: Optional[str] = None  # Strong, Partial, Weak, Unsupported
    similarity_score: Optional[float] = None
    evidence_source: Optional[str] = None


class SkillProfile(BaseModel):
    claimed_skills: list[str] = []
    analyzed_skills: list[SkillRecord] = []
    jd_alignment_score: Optional[float] = None
    skills_score: Optional[float] = None
    score_breakdown: dict = {}


class MissingInfo(BaseModel):
    field: str
    section: str
    severity: str  # critical, important, optional


class CandidateProfile(BaseModel):
    # Identity
    candidate_id: str
    full_name: str = ""
    email: Optional[str] = None
    phone: Optional[str] = None
    cv_filename: str = ""

    @field_validator("full_name", mode="before")
    @classmethod
    def coerce_full_name(cls, v):
        """
        LLM returns null when it can't find the candidate's name (short CV fragment,
        scanned page with no header, etc.).  Accept whatever partial name is extracted;
        only substitute a placeholder when the value is truly absent.
        """
        if v is None:
            return "Unnamed Candidate"
        if isinstance(v, str) and v.strip().lower() in ("null", "none"):
            return "Unnamed Candidate"
        return v if isinstance(v, str) else str(v)

    # Core profiles
    education: EducationProfile = EducationProfile()
    research: ResearchProfile = ResearchProfile()
    employment: EmploymentProfile = EmploymentProfile()
    skills: SkillProfile = SkillProfile()

    # Composite scoring
    score_education: Optional[float] = None
    score_research: Optional[float] = None
    score_employment: Optional[float] = None
    score_skills: Optional[float] = None
    score_supervision: Optional[float] = None
    score_total: Optional[float] = None
    rank: Optional[int] = None
    recommendation: Optional[str] = None  # Strong, Conditional, Weak

    # Missing info
    missing_info: list[MissingInfo] = []
    missing_info_email_draft: Optional[str] = None

    # Novel features
    interview_questions: list[dict] = []
    research_trajectory: Optional[str] = None
    cv_quality_score: Optional[float] = None

    # Raw audit trail
    score_justification: Optional[str] = None
    key_strengths: list[str] = []
    key_concerns: list[str] = []

    # Academic identity enrichment (profile_enricher agent)
    orcid_id:             Optional[str] = None
    orcid_profile_url:    Optional[str] = None
    openalex_author_id:   Optional[str] = None
    openalex_profile_url: Optional[str] = None
    semantic_scholar_id:  Optional[str] = None
    enriched_email:       Optional[str] = None   # from ORCID public profile only
    enriched_h_index:     Optional[int] = None   # independently verified
    enriched_citations:   Optional[int] = None   # independently verified

    # Processing metadata
    processing_status: str = "pending"
    processing_error: Optional[str] = None
