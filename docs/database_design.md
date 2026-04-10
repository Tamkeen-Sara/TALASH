# TALASH - Database & Storage Design

**Version:** 1.0 (Milestone 1)

---

## 1. Storage Architecture Overview

TALASH uses a **two-database design**:
- `data/cache.db` - SQLite cache for external API results (verification data)
- `data/candidates.db` - SQLite persistent store for candidate profiles (production)
- `_candidates` dict in `main.py` - in-memory store for demo/development

```
data/
├── cache.db          ← External API cache (TTL-managed)
├── candidates.db     ← Candidate profiles (persistent, production)
└── cvs/              ← Raw PDF files (UUID-prefixed filenames)
    ├── a1b2c3_john_smith_cv.pdf
    ├── d4e5f6_jane_doe_cv.pdf
    └── ...
```

---

## 2. Cache Database Schema (`data/cache.db`)

### 2.1 University Rankings Table

```sql
CREATE TABLE IF NOT EXISTS university_rankings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    institution_key TEXT    UNIQUE NOT NULL,   -- normalized name for lookup
    institution_raw TEXT    NOT NULL,           -- original name from QS/THE
    qs_rank         INTEGER,
    the_rank        INTEGER,
    hec_recognized  BOOLEAN DEFAULT FALSE,
    hec_category    TEXT,                       -- W, X, Y, Z (HEC tiers)
    country         TEXT,
    tier            TEXT,                       -- Top50, Top200, Top500, Ranked, Unranked
    fetched_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP                   -- fetched_at + 90 days
);

CREATE INDEX idx_university_key ON university_rankings(institution_key);
```

### 2.2 Journal Cache Table

```sql
CREATE TABLE IF NOT EXISTS journal_cache (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    issn         TEXT,
    doi_prefix   TEXT,
    journal_name TEXT    NOT NULL,
    quartile     TEXT,                -- Q1, Q2, Q3, Q4, Unranked
    impact_factor REAL,
    is_predatory BOOLEAN DEFAULT FALSE,
    source       TEXT,                -- CrossRef, OpenAlex, SemanticScholar, ISSN
    raw_response TEXT,                -- JSON of full API response for audit
    fetched_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at   TIMESTAMP            -- fetched_at + 30 days
);

CREATE INDEX idx_journal_issn ON journal_cache(issn);
CREATE INDEX idx_journal_name ON journal_cache(journal_name);
```

### 2.3 Conference Cache Table

```sql
CREATE TABLE IF NOT EXISTS conference_cache (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_key  TEXT    UNIQUE NOT NULL,   -- normalized name
    conference_raw  TEXT    NOT NULL,           -- name from CORE CSV
    core_rank       TEXT,                       -- A*, A, B, C, Unranked
    field           TEXT,                       -- CORE discipline field
    editions        TEXT,                       -- JSON list of known editions/years
    maturity_years  INTEGER,                    -- years since first edition
    latest_edition  TEXT,                       -- e.g. "38th"
    fetched_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP                   -- fetched_at + 180 days
);

CREATE INDEX idx_conference_key ON conference_cache(conference_key);
```

### 2.4 Citation Cache Table

```sql
CREATE TABLE IF NOT EXISTS citation_cache (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    doi            TEXT    UNIQUE NOT NULL,
    title          TEXT,
    cited_by_count INTEGER DEFAULT 0,
    influential_citations INTEGER DEFAULT 0,
    source         TEXT,                        -- SemanticScholar, OpenAlex
    fetched_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at     TIMESTAMP                    -- fetched_at + 14 days
);
```

### 2.5 Patent Cache Table

```sql
CREATE TABLE IF NOT EXISTS patent_cache (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    patent_number  TEXT    UNIQUE NOT NULL,
    title          TEXT,
    inventors      TEXT,                        -- JSON list
    country        TEXT,
    grant_date     TEXT,
    online_link    TEXT,
    verified       BOOLEAN DEFAULT FALSE,
    fetched_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at     TIMESTAMP                    -- fetched_at + 90 days
);
```

---

## 3. Candidates Database Schema (`data/candidates.db`)

For production (replaces in-memory `_candidates` dict):

```sql
CREATE TABLE IF NOT EXISTS candidates (
    candidate_id   TEXT    PRIMARY KEY,
    full_name      TEXT    NOT NULL,
    email          TEXT,
    phone          TEXT,
    cv_filename    TEXT,
    profile_json   TEXT    NOT NULL,   -- Full CandidateProfile serialized as JSON
    score_total    REAL,
    score_education REAL,
    score_research  REAL,
    score_employment REAL,
    score_skills    REAL,
    score_supervision REAL,
    rank           INTEGER,
    recommendation TEXT,
    processing_status TEXT DEFAULT 'pending',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_candidates_rank ON candidates(rank ASC);
CREATE INDEX idx_candidates_score ON candidates(score_total DESC);
CREATE INDEX idx_candidates_status ON candidates(processing_status);
```

**Note:** `profile_json` stores the full Pydantic model as JSON for flexibility. Score columns are denormalized for fast sorting/filtering in the UI without deserializing the full profile.

---

## 4. File Storage - CV PDFs

### 4.1 Naming Convention

All uploaded CVs are stored as:
```
data/cvs/{uuid}_{original_filename}
```
Example: `data/cvs/a1b2c3d4_john_smith_cv.pdf`

**Rationale:**
- UUID prefix prevents filename collisions
- Original filename preserved for audit trail
- Directory structure is flat (no subdirectories) for simplicity

### 4.2 Bulk PDF Splitting

Bulk uploads (multi-CV PDFs) are split and stored as:
```
data/cvs/{8hex}_{original}_{chunk_index}.pdf
```
Example: `data/cvs/ff3a12bc_applicant_pack_0.pdf`

Splitting heuristic (in `utils/pdf_splitter.py`):
1. Detect page boundaries where a new CV begins (name pattern + contact info density)
2. Fallback: split at fixed page intervals if heuristic confidence < threshold
3. Each chunk saved as separate PDF file

### 4.3 Storage Lifecycle

| Stage | Action |
|---|---|
| Upload | Save raw PDF to `data/cvs/` |
| Processing | Read from disk during extraction |
| After extraction | File retained for audit (not deleted) |
| Production cleanup | Cron job to delete files older than 90 days |

---

## 5. In-Memory Store (Demo Mode)

During demo/development, `main.py` uses:

```python
_candidates: dict[str, CandidateProfile] = {}
```

This is a simple dictionary keyed by `candidate_id`. All Pydantic objects are stored directly - no serialization overhead. Data is lost on server restart.

**Migration path to production:** Replace `_candidates` dict operations with async SQLite reads/writes via aiosqlite + the `candidates` table above. The `CandidateProfile.model_dump()` and `CandidateProfile.model_validate()` methods handle serialization.

---

## 6. Configuration

All database paths and cache TTLs are in `backend/config.py`:

```python
# Database paths
db_path:            str = "data/cache.db"         # verification cache
candidates_db_path: str = "data/candidates.db"    # candidate store

# Cache TTL (days)
ttl_university_rankings: int = 90
ttl_journal_metrics:     int = 30
ttl_conference_ranks:    int = 180
ttl_citation_counts:     int = 14
ttl_patent_data:         int = 90
```

TTL values are chosen based on data volatility:
- University rankings: updated annually → 90 days safe
- Journal metrics: impact factors change yearly → 30 days
- Conference ranks: CORE updates infrequently → 180 days
- Citation counts: most volatile → 14 days


