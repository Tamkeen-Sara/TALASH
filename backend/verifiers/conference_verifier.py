"""
Conference Verification via CORE Portal
- Fuzzy match conference name (partial ratio 70%)
- CORE ranks: A* (top), A, B, C, Unranked
- Extracts conference edition/maturity (spec §3.2.ii.b)
"""
import re
import asyncio
import aiohttp
from rapidfuzz import fuzz, process
from backend.config import settings
from backend.cache.cache_manager import cache

CORE_PORTAL_URL = "https://portal.core.edu.au/conf-ranks/"
_core_rankings: list[dict] = []


def _extract_conference_number(edition_str: str) -> int | None:
    """Extract edition number from strings like '13th International Conference'."""
    if not edition_str:
        return None
    match = re.search(r"(\d+)(st|nd|rd|th)", edition_str, re.IGNORECASE)
    if match:
        return int(match.group(1))
    match = re.search(r"(\d+)", edition_str)
    if match:
        return int(match.group(1))
    return None


def lookup_conference(name: str) -> dict:
    """Fuzzy-match a conference name against local CORE rankings."""
    if not _core_rankings:
        return {"core_rank": None, "matched_name": None}

    names = [r["name"] for r in _core_rankings]
    result = process.extractOne(
        name,
        names,
        scorer=fuzz.partial_ratio,
        score_cutoff=settings.conference_fuzzy_threshold
    )
    if result is None:
        return {"core_rank": None, "matched_name": None}

    matched_name, score, idx = result
    return {
        "core_rank": _core_rankings[idx].get("rank"),
        "matched_name": matched_name,
        "match_score": score,
    }


async def verify_conference(name: str, edition: str | None = None) -> dict:
    """Main entry — verify conference rank + extract maturity info."""
    cached = cache.get("conference", {"name": name})
    if cached:
        return cached

    result = {
        "conference_name": name,
        "core_rank": None,
        "matched_name": None,
        "conference_edition": edition,
        "conference_number": _extract_conference_number(edition) if edition else None,
        "is_mature": None,
        "verification_source": "unverified",
    }

    lookup = lookup_conference(name)
    if lookup.get("core_rank"):
        result.update(lookup)
        result["verification_source"] = "CORE"

    # Maturity: ≥5 editions = established conference
    if result["conference_number"]:
        result["is_mature"] = result["conference_number"] >= 5

    cache.set("conference", {"name": name}, result,
              ttl_days=settings.ttl_conference_ranks)
    return result


async def load_core_rankings():
    """
    Load CORE rankings from local CSV or scrape.
    Call at startup.
    """
    import sqlite3
    from pathlib import Path
    db_path = "data/core_rankings.db"
    if Path(db_path).exists():
        with sqlite3.connect(db_path) as conn:
            rows = conn.execute("SELECT name, rank FROM conference_rankings").fetchall()
            _core_rankings.extend({"name": r[0], "rank": r[1]} for r in rows)
        print(f"[conference_verifier] Loaded {len(_core_rankings)} CORE rankings.")
