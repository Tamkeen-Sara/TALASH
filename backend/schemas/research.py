from pydantic import BaseModel, model_validator
from typing import Optional, Literal, Any


def _clean(data: dict, str_fields=(), int_fields=(), bool_fields=(), list_fields=()):
    """Coerce LLM nulls: 'null'/'none' strings → None/default, None bools → False."""
    for f in str_fields:
        v = data.get(f)
        if v is None or (isinstance(v, str) and v.strip().lower() in ("null", "none")):
            data[f] = ""
    for f in int_fields:
        v = data.get(f)
        if isinstance(v, str) and v.strip().lower() in ("null", "none", ""):
            data[f] = None
    for f in bool_fields:
        if data.get(f) is None:
            data[f] = False
    for f in list_fields:
        if data.get(f) is None:
            data[f] = []
    return data


class JournalPaper(BaseModel):
    title: str = ""
    journal_name: str = ""
    year: Optional[int] = None
    doi: Optional[str] = None
    issn: Optional[str] = None
    authors: list[str] = []
    candidate_position: Optional[int] = None
    is_corresponding: bool = False
    is_wos_indexed: Optional[bool] = None
    is_scopus_indexed: Optional[bool] = None
    impact_factor: Optional[float] = None
    wos_quartile: Optional[str] = None
    citation_count: Optional[int] = None
    influential_citation_count: Optional[int] = None
    resolved_journal_name: Optional[str] = None  # actual name from OpenAlex (may differ from CV)
    verification_source: Optional[str] = None
    is_predatory_flag: bool = False
    predatory_reason: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def coerce_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            _clean(data,
                str_fields=("title", "journal_name"),
                int_fields=("year", "candidate_position", "citation_count", "influential_citation_count"),
                bool_fields=("is_corresponding", "is_predatory_flag"),
                list_fields=("authors",),
            )
        return data


class ConferencePaper(BaseModel):
    title: str = ""
    conference_name: str = ""
    year: Optional[int] = None
    authors: list[str] = []
    candidate_position: Optional[int] = None
    is_corresponding: bool = False
    proceedings_publisher: Optional[str] = None
    core_rank: Optional[str] = None
    scimago_quartile: Optional[str] = None          # Q1–Q4 from Scimago proceedings
    conference_publisher: Optional[str] = None      # IEEE / ACM / Springer etc.
    conference_edition: Optional[str] = None
    conference_number: Optional[int] = None
    is_scopus_indexed: Optional[bool] = None
    verification_source: Optional[str] = None
    resolved_conference_name: Optional[str] = None  # full name from CORE/DBLP/Scimago
    venue_h_index: Optional[int] = None             # OpenAlex h-index for this venue
    venue_quality_tier: Optional[str] = None        # Elite/Excellent/Good/Recognized/Known/Marginal

    @model_validator(mode="before")
    @classmethod
    def coerce_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            _clean(data,
                str_fields=("title", "conference_name"),
                int_fields=("year", "candidate_position", "conference_number"),
                bool_fields=("is_corresponding",),
                list_fields=("authors",),
            )
        return data


class Book(BaseModel):
    title: str = ""
    authors: list[str] = []
    isbn: Optional[str] = None
    publisher: Optional[str] = None
    year: Optional[int] = None
    online_link: Optional[str] = None
    candidate_role: Optional[str] = None
    is_verified: bool = False
    verification_source: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def coerce_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            _clean(data,
                str_fields=("title",),
                int_fields=("year",),
                bool_fields=("is_verified",),
                list_fields=("authors",),
            )
        return data


class Patent(BaseModel):
    patent_number: Optional[str] = None
    title: str = ""
    date: Optional[str] = None
    inventors: list[str] = []
    country: Optional[str] = None
    online_link: Optional[str] = None
    candidate_role: Optional[str] = None
    is_verified: bool = False
    verification_source: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def coerce_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            _clean(data,
                str_fields=("title",),
                bool_fields=("is_verified",),
                list_fields=("inventors",),
            )
        return data


class SupervisionRecord(BaseModel):
    student_name: str = ""
    degree_level: Literal["MS", "PhD"]
    role: Literal["main", "co-supervisor"]
    year_graduated: Optional[int] = None
    thesis_title: Optional[str] = None
    publications_together: int = 0

    @model_validator(mode="before")
    @classmethod
    def coerce_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            _clean(data,
                str_fields=("student_name",),
                int_fields=("year_graduated", "publications_together"),
            )
            if data.get("publications_together") is None:
                data["publications_together"] = 0
        return data


class ResearchProfile(BaseModel):
    journal_papers: list[JournalPaper] = []
    conference_papers: list[ConferencePaper] = []
    books: list[Book] = []
    patents: list[Patent] = []
    supervision: list[SupervisionRecord] = []
    h_index: Optional[int] = None
    total_citations: Optional[int] = None
    q1_count: int = 0
    q2_count: int = 0
    astar_conf_count: int = 0
    a_conf_count: int = 0
    predatory_count: int = 0
    research_score: Optional[float] = None
    # ── Topic variability (§3.6) ───────────────────────────────────────────────
    topic_diversity_score: Optional[float] = None   # 0.0 = focused, 1.0 = diverse
    dominant_topic: Optional[str] = None
    topic_distribution: dict = {}                   # {domain: count}
    topic_clusters: list[dict] = []                 # [{domain, count, percentage, papers[]}]
    topic_trend: list[dict] = []                    # [{period, dominant_domain, count}]
    # ── Co-author analysis (§3.7) ─────────────────────────────────────────────
    unique_coauthors: int = 0
    avg_coauthors_per_paper: float = 0.0
    top_collaborators: list[dict] = []              # [{name, count, papers[]}]
    recurring_collaborator_count: int = 0           # collaborators in > 1 paper
    recurring_proportion: float = 0.0               # papers containing a recurring collaborator / total
    collaboration_diversity_score: float = 0.0      # entropy of collaborator frequency distribution
    student_collaborations: list[str] = []          # student names found as co-authors
    score_breakdown: dict = {}