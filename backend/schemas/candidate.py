from pydantic import BaseModel, field_validator
from typing import Optional
from .education import EducationProfile
from .research import ResearchProfile


class EmploymentRecord(BaseModel):
    job_title: str
    organization: str
    employment_type: Optional[str] = None  # full-time, part-time, contract
    start_year: Optional[int] = None
    start_month: Optional[int] = None
    end_year: Optional[int] = None
    end_month: Optional[int] = None
    is_current: bool = False
    responsibilities: list[str] = []
    seniority_score: Optional[int] = None  # computed: professor=10, intern=1
    raw_text: str = ""

    @field_validator("raw_text", mode="before")
    @classmethod
    def coerce_none_str(cls, v):
        return v if v is not None else ""

    @field_validator("is_current", "responsibilities", mode="before")
    @classmethod
    def coerce_none_defaults(cls, v, info):
        if v is None:
            return False if info.field_name == "is_current" else []
        return v


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
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    cv_filename: str

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

    # Processing metadata
    processing_status: str = "pending"
    processing_error: Optional[str] = None
