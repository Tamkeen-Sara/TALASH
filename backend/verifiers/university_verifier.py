"""
University Ranking Verifier
- Curated QS/THE rankings dataset seeded into SQLite at startup
- RapidFuzz token_sort_ratio matching (threshold 75%)
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

# ─────────────────────────────────────────────────────────────────────────────
# Curated QS World University Rankings 2024 (top 200 global + all Pakistani)
# Source: QS World University Rankings 2024 (public data)
# Format: (full_name, qs_rank, the_rank)
# ─────────────────────────────────────────────────────────────────────────────
_QS_DATA: list[tuple] = [
    # Top 50 Global
    ("Massachusetts Institute of Technology", 1, 5),
    ("University of Cambridge", 2, 3),
    ("University of Oxford", 3, 1),
    ("Harvard University", 4, 4),
    ("Stanford University", 5, 2),
    ("Imperial College London", 6, 11),
    ("ETH Zurich", 7, 10),
    ("National University of Singapore", 8, 19),
    ("University College London", 9, 22),
    ("University of California Berkeley", 10, 6),
    ("University of Chicago", 11, 13),
    ("University of Pennsylvania", 12, 14),
    ("Cornell University", 13, 20),
    ("Peking University", 14, 17),
    ("Yale University", 14, 9),
    ("Tsinghua University", 16, 16),
    ("Columbia University", 22, 12),
    ("Princeton University", 17, 7),
    ("University of Michigan", 23, 21),
    ("Johns Hopkins University", 24, 8),
    ("University of Toronto", 21, 18),
    ("Nanyang Technological University", 26, 55),
    ("University of Edinburgh", 22, 30),
    ("McGill University", 30, 46),
    ("Australian National University", 34, 62),
    ("University of Melbourne", 33, 33),
    ("King's College London", 40, 35),
    ("University of Sydney", 19, 60),
    ("Kyoto University", 46, 55),
    ("University of Tokyo", 28, 39),
    ("Seoul National University", 41, 62),
    ("Hong Kong University of Science and Technology", 40, 93),
    ("University of Hong Kong", 26, 36),
    ("Delft University of Technology", 47, None),
    ("University of Amsterdam", 55, 56),
    ("Technical University of Munich", 37, 30),
    ("Heidelberg University", 87, 43),
    ("London School of Economics", 45, None),
    ("University of Manchester", 32, 51),
    ("University of Bristol", 54, None),
    ("Georgia Institute of Technology", 88, None),
    ("Carnegie Mellon University", 52, None),
    ("New York University", 38, None),
    ("University of California Los Angeles", 44, 15),
    ("University of California San Diego", 60, None),
    ("Duke University", 65, 18),
    ("Northwestern University", 55, 24),
    ("University of Wisconsin Madison", 79, None),
    ("University of Illinois Urbana Champaign", 72, None),
    ("Purdue University", 99, None),
    # 51–200 Global (selective)
    ("University of Glasgow", 73, None),
    ("University of Birmingham", 84, None),
    ("University of Sheffield", 97, None),
    ("University of Warwick", 67, None),
    ("University of Leeds", 86, None),
    ("University of Nottingham", 100, None),
    ("University of Southampton", 91, None),
    ("University of Reading", None, None),
    ("University of Lancaster", None, None),
    ("University of Bath", None, None),
    ("Monash University", 57, None),
    ("University of Queensland", 47, None),
    ("University of New South Wales", 19, None),
    ("University of Western Australia", 90, None),
    ("Maastricht University", None, None),
    ("Eindhoven University of Technology", None, None),
    ("KU Leuven", 70, None),
    ("Ghent University", None, None),
    ("Uppsala University", None, None),
    ("Lund University", None, None),
    ("University of Copenhagen", 97, None),
    ("Aarhus University", None, None),
    ("University of Helsinki", None, None),
    ("University of Oslo", None, None),
    ("University of Bergen", None, None),
    ("University of Zurich", 83, None),
    ("École Polytechnique", None, None),
    ("Paris Sciences et Lettres", None, None),
    ("Sorbonne University", None, None),
    ("Technical University of Berlin", None, None),
    ("RWTH Aachen University", None, None),
    ("Humboldt University of Berlin", None, None),
    ("Free University of Berlin", None, None),
    ("University of Munich", None, None),
    ("University of Bonn", None, None),
    ("University of Freiburg", None, None),
    ("Fudan University", 50, None),
    ("Shanghai Jiao Tong University", 51, None),
    ("Zhejiang University", 47, None),
    ("University of Science and Technology of China", 65, None),
    ("Wuhan University", None, None),
    ("Sun Yat-sen University", None, None),
    ("Indian Institute of Technology Bombay", 149, None),
    ("Indian Institute of Technology Delhi", 150, None),
    ("Indian Institute of Technology Madras", 285, None),
    ("Indian Institute of Technology Kanpur", 263, None),
    ("Indian Institute of Technology Kharagpur", 271, None),
    ("Indian Institute of Science Bangalore", 225, None),
    ("University of Tehran", None, None),
    ("Sharif University of Technology", None, None),
    ("University of Cape Town", 226, None),
    ("University of Johannesburg", None, None),
    ("American University of Beirut", None, None),
    ("King Abdullah University of Science and Technology", 186, None),
    ("King Abdulaziz University", 149, None),
    ("Qatar University", None, None),
    ("University of Jordan", None, None),
    ("Cairo University", None, None),
    ("University of São Paulo", 104, None),
    ("Pontifical Catholic University of Chile", None, None),
    ("University of Chile", None, None),
    # ─── Pakistani Universities (full coverage) ───────────────────────────────
    ("Quaid-i-Azam University", 801, None),
    ("University of the Punjab", None, None),
    ("University of Karachi", None, None),
    ("University of Peshawar", None, None),
    ("University of Sindh", None, None),
    ("University of Balochistan", None, None),
    ("National University of Sciences and Technology", 401, None),
    ("NUST", 401, None),
    ("COMSATS University Islamabad", None, None),
    ("COMSATS Institute of Information Technology", None, None),
    ("Lahore University of Management Sciences", 601, None),
    ("LUMS", 601, None),
    ("Institute of Business Administration Karachi", None, None),
    ("IBA Karachi", None, None),
    ("University of Engineering and Technology Lahore", None, None),
    ("UET Lahore", None, None),
    ("University of Engineering and Technology Taxila", None, None),
    ("UET Taxila", None, None),
    ("National University of Computer and Emerging Sciences", None, None),
    ("FAST National University", None, None),
    ("FAST-NUCES", None, None),
    ("FAST NUCES", None, None),
    ("Air University", None, None),
    ("Bahria University", None, None),
    ("Capital University of Science and Technology", None, None),
    ("CUST", None, None),
    ("Aga Khan University", None, None),
    ("Aga Khan University Hospital", None, None),
    ("Dow University of Health Sciences", None, None),
    ("King Edward Medical University", None, None),
    ("Army Medical College", None, None),
    ("National Defence University", None, None),
    ("Pakistan Institute of Engineering and Applied Sciences", 801, None),
    ("PIEAS", 801, None),
    ("Institute of Space Technology", None, None),
    ("IST", None, None),
    ("Ghulam Ishaq Khan Institute", None, None),
    ("GIK Institute", None, None),
    ("GIKI", None, None),
    ("International Islamic University Islamabad", None, None),
    ("IIUI", None, None),
    ("Riphah International University", None, None),
    ("Virtual University of Pakistan", None, None),
    ("Allama Iqbal Open University", None, None),
    ("University of Agriculture Faisalabad", None, None),
    ("University of Veterinary and Animal Sciences", None, None),
    ("Fatima Jinnah Women University", None, None),
    ("Hazara University", None, None),
    ("Islamia University of Bahawalpur", None, None),
    ("Khyber Medical University", None, None),
    ("Pir Mehr Ali Shah Arid Agriculture University", None, None),
    ("University of Gujrat", None, None),
    ("University of Lahore", None, None),
    ("University of Central Punjab", None, None),
    ("Superior University", None, None),
    ("Forman Christian College", None, None),
    ("Government College University Lahore", None, None),
    ("Government College University Faisalabad", None, None),
    ("University of Sargodha", None, None),
    ("University of Azad Jammu and Kashmir", None, None),
    ("Muhammad Ali Jinnah University", None, None),
    ("Hamdard University", None, None),
    ("Ziauddin University", None, None),
    ("Beaconhouse National University", None, None),
    ("Namal University", None, None),
    ("Sukkur IBA University", None, None),
    ("Mehran University of Engineering and Technology", None, None),
    ("NED University of Engineering and Technology", None, None),
    ("NED University", None, None),
    ("Sir Syed University of Engineering and Technology", None, None),
    ("SSUET", None, None),
    ("Dawood University of Engineering and Technology", None, None),
    ("Indus University", None, None),
    ("Iqra University", None, None),
    ("Foundation University Islamabad", None, None),
    ("Army Public College of Management and Sciences", None, None),
    ("APCOMS", None, None),
    ("National Textile University", None, None),
    ("University of Information Technology", None, None),
    ("Information Technology University", None, None),
    ("ITU Lahore", None, None),
    ("Lahore Leads University", None, None),
    ("Preston University", None, None),
    ("Karachi Institute of Technology and Entrepreneurship", None, None),
    ("KITE University", None, None),
    ("University of Turbat", None, None),
    ("Women University Multan", None, None),
    ("Khwaja Fareed University of Engineering and IT", None, None),
    ("Muhammad Nawaz Sharif University of Agriculture", None, None),
    ("PMAS Arid Agriculture University Rawalpindi", None, None),
    ("Shaheed Zulfikar Ali Bhutto Institute of Science and Technology", None, None),
    ("SZABIST", None, None),
    ("University of South Asia", None, None),
]


def _load_rankings() -> list[dict]:
    """Load rankings from SQLite into memory (cached after first load)."""
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
    """Seed university rankings into SQLite from curated dataset."""
    global _rankings_cache
    Path(_RANKINGS_DB).parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(_RANKINGS_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS university_rankings (
                name TEXT PRIMARY KEY,
                qs_rank INTEGER,
                the_rank INTEGER
            )
        """)
        conn.executemany(
            "INSERT OR IGNORE INTO university_rankings VALUES (?, ?, ?)",
            _QS_DATA
        )
        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM university_rankings").fetchone()[0]

    _rankings_cache = []  # force reload on next lookup
    print(f"[university_verifier] Rankings ready: {count} universities in database.")
