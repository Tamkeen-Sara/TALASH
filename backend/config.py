from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # API Keys
    anthropic_api_key: str = ""
    core_api_key: str = ""
    semantic_scholar_api_key: str = ""
    polite_mailto: str = "talash@example.com"

    # App
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # Models
    extraction_model: str = "claude-haiku-4-5-20251001"
    reasoning_model: str = "claude-sonnet-4-6"

    # Scoring weights (must sum to 1.0)
    weight_research: float = 0.35
    weight_education: float = 0.20
    weight_employment: float = 0.20
    weight_skills: float = 0.15
    weight_supervision: float = 0.10

    # Matching thresholds
    university_fuzzy_threshold: int = 75
    conference_fuzzy_threshold: int = 70
    skill_strong_threshold: float = 0.65
    skill_partial_threshold: float = 0.60

    # Cache TTL (days)
    ttl_university_rankings: int = 90
    ttl_journal_metrics: int = 30
    ttl_conference_ranks: int = 180
    ttl_citation_counts: int = 14
    ttl_patent_data: int = 90

    # Database
    db_path: str = "data/cache.db"
    candidates_db_path: str = "data/candidates.db"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
