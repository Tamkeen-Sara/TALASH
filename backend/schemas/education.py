from pydantic import BaseModel, field_validator
from typing import Optional


def _null_str(v):
    """Convert None or the string 'null'/'none' to empty string."""
    if v is None:
        return ""
    if isinstance(v, str) and v.strip().lower() in ("null", "none"):
        return ""
    return v


def _null_float(v):
    """Convert None or the string 'null'/'none'/'' to None for Optional[float]."""
    if v is None:
        return None
    if isinstance(v, str) and v.strip().lower() in ("null", "none", ""):
        return None
    return v


def _null_int(v):
    """Convert None or the string 'null'/'none'/'' to None for Optional[int]."""
    if v is None:
        return None
    if isinstance(v, str) and v.strip().lower() in ("null", "none", ""):
        return None
    return v


class SSERecord(BaseModel):
    percentage: Optional[float] = None
    board: Optional[str] = None
    year: Optional[int] = None
    grade: Optional[str] = None
    raw_text: str = ""

    @field_validator("raw_text", mode="before")
    @classmethod
    def coerce_raw(cls, v): return _null_str(v)

    @field_validator("percentage", mode="before")
    @classmethod
    def coerce_pct(cls, v): return _null_float(v)

    @field_validator("year", mode="before")
    @classmethod
    def coerce_year(cls, v): return _null_int(v)


class HSERecord(BaseModel):
    percentage: Optional[float] = None
    board: Optional[str] = None
    year: Optional[int] = None
    grade: Optional[str] = None
    raw_text: str = ""

    @field_validator("raw_text", mode="before")
    @classmethod
    def coerce_raw(cls, v): return _null_str(v)

    @field_validator("percentage", mode="before")
    @classmethod
    def coerce_pct(cls, v): return _null_float(v)

    @field_validator("year", mode="before")
    @classmethod
    def coerce_year(cls, v): return _null_int(v)


class DegreeRecord(BaseModel):
    degree_title: str
    # Free-form string — the LLM extracts whatever the CV says ("PhD", "Master of Engineering",
    # "Laurea Magistrale", "Ingenieur Diplome", etc.).  No hardcoded Literal restriction.
    level: str = "Other"
    specialization: Optional[str] = None
    institution: str
    cgpa: Optional[float] = None
    cgpa_scale: Optional[float] = None
    percentage: Optional[float] = None
    cgpa_normalized: Optional[float] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    is_ongoing: bool = False
    qs_rank: Optional[int] = None
    the_rank: Optional[int] = None
    qs_subject_rank: Optional[int] = None
    hec_recognized: Optional[bool] = None
    quality_tier: Optional[str] = None
    quality_band: Optional[str] = None
    institution_h_index: Optional[int] = None
    qs_overall_score: Optional[float] = None
    qs_academic_reputation: Optional[float] = None
    qs_citations_per_faculty: Optional[float] = None
    raw_text: str = ""

    @field_validator("level", mode="before")
    @classmethod
    def coerce_level(cls, v):
        """Null/empty → 'Other' so missing level never crashes the pipeline."""
        if v is None:
            return "Other"
        if isinstance(v, str) and v.strip().lower() in ("null", "none", ""):
            return "Other"
        return v if isinstance(v, str) else "Other"

    @field_validator("raw_text", mode="before")
    @classmethod
    def coerce_raw(cls, v): return _null_str(v)

    @field_validator("degree_title", "institution", mode="before")
    @classmethod
    def coerce_required_str(cls, v): return _null_str(v) if v is None else v

    @field_validator("cgpa", "cgpa_scale", "percentage", "cgpa_normalized", mode="before")
    @classmethod
    def coerce_floats(cls, v): return _null_float(v)

    @field_validator("start_year", "end_year", "qs_rank", "the_rank", "qs_subject_rank", mode="before")
    @classmethod
    def coerce_ints(cls, v): return _null_int(v)

    @field_validator("is_ongoing", mode="before")
    @classmethod
    def coerce_bool(cls, v): return False if v is None else v


class EducationProfile(BaseModel):
    sse: Optional[SSERecord] = None
    hse: Optional[HSERecord] = None
    degrees: list[DegreeRecord] = []
    education_gaps: list[dict] = []
    education_score: Optional[float] = None
    score_breakdown: dict = {}