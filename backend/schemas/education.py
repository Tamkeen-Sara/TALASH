from pydantic import BaseModel
from typing import Optional, Literal


class SSERecord(BaseModel):
    percentage: Optional[float] = None
    board: Optional[str] = None
    year: Optional[int] = None
    grade: Optional[str] = None
    raw_text: str = ""


class HSERecord(BaseModel):
    percentage: Optional[float] = None
    board: Optional[str] = None
    year: Optional[int] = None
    grade: Optional[str] = None
    raw_text: str = ""


class DegreeRecord(BaseModel):
    degree_title: str
    level: Literal["BS", "BSc", "BE", "MS", "MPhil", "MBA", "PhD", "Other"]
    specialization: Optional[str] = None
    institution: str
    cgpa: Optional[float] = None
    cgpa_scale: Optional[float] = None
    percentage: Optional[float] = None
    cgpa_normalized: Optional[float] = None  # normalized to 4.0 scale
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    is_ongoing: bool = False
    # Enriched by university_verifier
    qs_rank: Optional[int] = None
    the_rank: Optional[int] = None
    qs_subject_rank: Optional[int] = None
    raw_text: str = ""


class EducationProfile(BaseModel):
    sse: Optional[SSERecord] = None
    hse: Optional[HSERecord] = None
    degrees: list[DegreeRecord] = []
    # Computed by education_agent
    education_gaps: list[dict] = []
    education_score: Optional[float] = None
    score_breakdown: dict = {}
