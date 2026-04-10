from pydantic import BaseModel, model_validator
from typing import Optional, Literal, Any


class JournalPaper(BaseModel):
    title: str
    journal_name: str
    year: Optional[int] = None
    doi: Optional[str] = None
    issn: Optional[str] = None
    authors: list[str] = []
    candidate_position: Optional[int] = None
    is_corresponding: bool = False
    # Enriched by journal_verifier — all from REAL APIs, never LLM
    is_wos_indexed: Optional[bool] = None
    is_scopus_indexed: Optional[bool] = None
    impact_factor: Optional[float] = None
    wos_quartile: Optional[str] = None  # Q1, Q2, Q3, Q4
    citation_count: Optional[int] = None
    influential_citation_count: Optional[int] = None
    verification_source: Optional[str] = None
    is_predatory_flag: bool = False
    predatory_reason: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def coerce_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in ("is_corresponding", "is_predatory_flag"):
                if data.get(field) is None:
                    data[field] = False
            for field in ("authors",):
                if data.get(field) is None:
                    data[field] = []
        return data


class ConferencePaper(BaseModel):
    title: str
    conference_name: str
    year: Optional[int] = None
    authors: list[str] = []
    candidate_position: Optional[int] = None
    is_corresponding: bool = False
    proceedings_publisher: Optional[str] = None
    # Enriched by conference_verifier
    core_rank: Optional[str] = None  # A*, A, B, C, Unranked
    conference_edition: Optional[str] = None
    conference_number: Optional[int] = None   # maturity check (spec §3.2.ii.b)
    is_scopus_indexed: Optional[bool] = None
    verification_source: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def coerce_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if data.get("is_corresponding") is None:
                data["is_corresponding"] = False
            if data.get("authors") is None:
                data["authors"] = []
        return data


class Book(BaseModel):
    title: str
    authors: list[str] = []
    isbn: Optional[str] = None
    publisher: Optional[str] = None
    year: Optional[int] = None
    online_link: Optional[str] = None
    candidate_role: Optional[str] = None
    # Enriched by books_patents_agent
    is_verified: bool = False
    verification_source: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def coerce_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if data.get("is_verified") is None:
                data["is_verified"] = False
            if data.get("authors") is None:
                data["authors"] = []
        return data


class Patent(BaseModel):
    patent_number: Optional[str] = None
    title: str
    date: Optional[str] = None
    inventors: list[str] = []
    country: Optional[str] = None
    online_link: Optional[str] = None
    candidate_role: Optional[str] = None
    # Enriched by patent_verifier
    is_verified: bool = False
    verification_source: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def coerce_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if data.get("is_verified") is None:
                data["is_verified"] = False
            if data.get("inventors") is None:
                data["inventors"] = []
        return data


class SupervisionRecord(BaseModel):
    student_name: str
    degree_level: Literal["MS", "PhD"]
    role: Literal["main", "co-supervisor"]
    year_graduated: Optional[int] = None
    thesis_title: Optional[str] = None
    publications_together: int = 0


class ResearchProfile(BaseModel):
    journal_papers: list[JournalPaper] = []
    conference_papers: list[ConferencePaper] = []
    books: list[Book] = []
    patents: list[Patent] = []
    supervision: list[SupervisionRecord] = []
    # Computed metrics
    h_index: Optional[int] = None
    total_citations: Optional[int] = None
    q1_count: int = 0
    q2_count: int = 0
    astar_conf_count: int = 0
    a_conf_count: int = 0
    predatory_count: int = 0
    research_score: Optional[float] = None
    topic_diversity_score: Optional[float] = None
    dominant_topic: Optional[str] = None
    topic_distribution: dict = {}
    score_breakdown: dict = {}