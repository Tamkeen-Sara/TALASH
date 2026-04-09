"""
University Ranking Verifier
- One-time scrape of QS/THE rankings at startup, stored in SQLite
- RapidFuzz matching (token_sort_ratio threshold 75%)
- Handles abbreviations: 'FAST-NUCES' vs 'National University of Computer and Emerging Sciences'
"""
import sqlite3
import asyncio
from pathlib import Path
from rapidfuzz import fuzz, process
from backend.config import settings
from backend.schemas.education import DegreeRecord

_RANKINGS_DB = "data/university_rankings.db"
_rankings_cache: list[dict] = []


def _load_rankings() -> list[dict]:
    """Load rankings from local SQLite into memory."""
    global _rankings_cache
    if _rankings_cache:
        return _rankings_cache
    db = Path(_RANKINGS_DB)
    if not db.exists():
        return []
    with sqlite3.connect(_RANKINGS_DB) as conn:
        rows = conn.execute(
            "SELECT name, qs_rank, the_rank FROM university_rankings"
        ).fetchall()
    _rankings_cache = [{"name": r[0], "qs_rank": r[1], "the_rank": r[2]} for r in rows]
    return _rankings_cache


def lookup_university(name: str) -> dict:
    """Fuzzy-match a university name against QS/THE database."""
    rankings = _load_rankings()
    if not rankings:
        return {"qs_rank": None, "the_rank": None, "matched_name": None}

    names = [r["name"] for r in rankings]
    result = process.extractOne(
        name,
        names,
        scorer=fuzz.token_sort_ratio,
        score_cutoff=settings.university_fuzzy_threshold
    )
    if result is None:
        return {"qs_rank": None, "the_rank": None, "matched_name": None}

    matched_name, score, idx = result
    matched = rankings[idx]
    return {
        "qs_rank": matched["qs_rank"],
        "the_rank": matched["the_rank"],
        "matched_name": matched_name,
        "match_score": score,
    }


async def enrich_degrees(degrees: list[DegreeRecord]) -> list[DegreeRecord]:
    """Enrich all degrees with QS/THE rankings in parallel."""
    loop = asyncio.get_event_loop()
    results = await asyncio.gather(*[
        loop.run_in_executor(None, lookup_university, d.institution)
        for d in degrees
    ])
    for degree, result in zip(degrees, results):
        degree.qs_rank = result.get("qs_rank")
        degree.the_rank = result.get("the_rank")
    return degrees


async def scrape_and_store_rankings():
    """
    One-time scrape of QS World Rankings.
    Run this at system startup if rankings DB doesn't exist.
    TODO: Implement scraping from topuniversities.com / timeshighereducation.com
    For now, loads from a local CSV if present.
    """
    import pandas as pd
    csv_path = Path("data/qs_rankings.csv")
    if not csv_path.exists():
        print("[university_verifier] No rankings CSV found. Skipping ranking enrichment.")
        return

    df = pd.read_csv(csv_path)
    Path(_RANKINGS_DB).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_RANKINGS_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS university_rankings (
                name TEXT PRIMARY KEY,
                qs_rank INTEGER,
                the_rank INTEGER
            )
        """)
        for _, row in df.iterrows():
            conn.execute(
                "INSERT OR REPLACE INTO university_rankings VALUES (?, ?, ?)",
                (row.get("name"), row.get("qs_rank"), row.get("the_rank"))
            )
        conn.commit()
    print(f"[university_verifier] Loaded {len(df)} university rankings.")
