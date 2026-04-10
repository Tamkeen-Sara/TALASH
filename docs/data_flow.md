# TALASH - Module Interaction & Data Flow

**Version:** 1.0 (Milestone 1)

---

## 1. End-to-End Data Flow

```
User uploads PDF(s)
        │
        -
┌───────────────────────────────────────┐
│  POST /api/upload or /api/upload/bulk │
│  FastAPI endpoint                     │
└───────────────────────────────────────┘
        │ (bulk only)
        -
┌───────────────────────┐
│  pdf_splitter.py      │  Splits multi-CV PDF into individual files
│  Output: [cv1.pdf,    │  using pdfplumber page detection heuristics
│           cv2.pdf…]   │
└───────────────────────┘
        │
        -  (per CV file)
┌───────────────────────────────────────────────────────────────┐
│                    MODULE 0: preprocessor.py                   │
│                                                               │
│  1. extract_raw_text()                                        │
│     ├─ pdfplumber  (tables + native text)                     │
│     ├─ PyMuPDF     (complex layouts, if pdfplumber < 200 ch)  │
│     └─ pytesseract (OCR fallback for scanned PDFs)            │
│                                                               │
│  2. Groq LLM (llama-3.3-70b-versatile)                       │
│     Input:  raw text + EXTRACTION_SYSTEM_PROMPT               │
│     Output: JSON matching CandidateProfile schema             │
│                                                               │
│  3. Pydantic v2 validation → CandidateProfile object         │
│                                                               │
│  SSE event: {status: "extracted", candidate, id}             │
└───────────────────────────────────────────────────────────────┘
        │
        │  CandidateProfile (partial - scores = None)
        -
┌───────────────────────────────────────────────────────────────┐
│                    MODULE 1: education_agent.py                │
│                                                               │
│  Input:  profile.education (EducationProfile)                 │
│          profile.employment (for gap cross-referencing)       │
│                                                               │
│  Steps:                                                       │
│  ├─ university_verifier.py → ranked_institution flag         │
│  │    QS/THE scrape → SQLite cache → RapidFuzz match         │
│  ├─ CGPA normaliser → 4.0 scale (HEC table for %)           │
│  ├─ Gap detector → IntervalTree over degree date ranges      │
│  └─ Score formula:                                            │
│       Academic Performance  40%                               │
│       Highest Qualification 25%                               │
│       Institution Quality   20%                               │
│       Gap Penalty          -15%                               │
│                                                               │
│  Output: EducationProfile with education_score populated      │
│  SSE event: {status: "education_scored", score}              │
└───────────────────────────────────────────────────────────────┘
        │
        │  [Milestone 2+]
        -
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ MODULE 2:        │  │ MODULE 3:        │  │ MODULE 4:        │
│ research_agent   │  │ employment_agent │  │ skill_agent      │
│                  │  │                  │  │                  │
│ journal_verifier │  │ IntervalTree     │  │ sentence-        │
│ (6-tier chain)   │  │ gap/overlap      │  │ transformers     │
│ conference_verif │  │ detection        │  │ JD alignment     │
│ H-index compute  │  │ career progress  │  │ cosine sim       │
│ predatory detect │  │ seniority score  │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               -
┌──────────────────┐  ┌──────────────────────────────────────────┐
│ MODULE 5:        │  │            SCORING ENGINE                │
│ supervision_agent│  │            rubric.py + ranker.py         │
│                  │  │                                          │
│ Parse CV records │  │  score_total = Σ(weight_i - score_i)    │
│ Cross-ref papers │  │                                          │
│ Manual API entry │  │  Research    35%  │  Education   20%    │
└──────────────────┘  │  Employment  20%  │  Skills      15%    │
                       │  Supervision 10%  │                     │
                       │                                          │
                       │  Min-max normalisation within cohort     │
                       │  → rank assignment + recommendation      │
                       └──────────────────────────────────────────┘
                               │
                               -
                    ┌──────────────────────┐
                    │    REPORTS           │
                    │  pdf_generator.py    │  ReportLab PDF
                    │  email_drafter.py    │  LLM-generated email
                    └──────────────────────┘
```

---

## 2. Data Schemas

### 2.1 CandidateProfile (top-level)

```python
CandidateProfile
├── candidate_id: str            # UUID8
├── full_name: str
├── email: Optional[str]
├── phone: Optional[str]
├── cv_filename: str
│
├── education: EducationProfile
│   ├── sse: SSERecord           # Secondary school
│   ├── hse: HSERecord           # Higher secondary
│   ├── degrees: [DegreeRecord]  # BS, MS, PhD, etc.
│   ├── gaps: [GapRecord]        # Detected temporal gaps
│   └── education_score: float
│
├── research: ResearchProfile
│   ├── journal_papers: [JournalPaper]
│   ├── conference_papers: [ConferencePaper]
│   ├── books: [Book]
│   ├── patents: [Patent]
│   ├── supervision: [SupervisionRecord]
│   ├── h_index: int
│   ├── q1_count: int
│   └── research_score: float
│
├── employment: EmploymentProfile
│   ├── records: [EmploymentRecord]
│   ├── gaps: [dict]
│   ├── overlaps: [dict]
│   └── employment_score: float
│
├── skills: SkillProfile
│   ├── claimed_skills: [str]
│   ├── analyzed_skills: [SkillRecord]
│   ├── jd_alignment_score: float
│   └── skills_score: float
│
├── score_education: float
├── score_research: float
├── score_employment: float
├── score_skills: float
├── score_supervision: float
├── score_total: float
├── rank: int
└── recommendation: str          # "Strong" | "Conditional" | "Weak"
```

### 2.2 Inter-Module Data Contracts

| From Module | To Module | Data Passed |
|---|---|---|
| preprocessor | education_agent | `EducationProfile` + `EmploymentProfile` (for gap cross-ref) |
| preprocessor | research_agent | `ResearchProfile` |
| preprocessor | employment_agent | `EmploymentProfile` + `EducationProfile` (for overlap detection) |
| preprocessor | skill_agent | `SkillProfile` + JD text |
| preprocessor | supervision_agent | `ResearchProfile.supervision` |
| university_verifier | education_agent | `{institution_name, qs_rank, hec_recognized, tier}` |
| journal_verifier | research_agent | `{journal_name, quartile, impact_factor, is_predatory}` |
| conference_verifier | research_agent | `{conference_name, core_rank, edition, maturity_years}` |
| education_agent | ranker | `education_score` (0-100) |
| research_agent | ranker | `research_score` (0-100) |
| employment_agent | ranker | `employment_score` (0-100) |
| skill_agent | ranker | `skills_score` (0-100) |
| supervision_agent | ranker | `supervision_score` (0-100) |

---

## 3. SSE Event Sequence (Single CV Upload)

```
Client                          Server
  │                               │
  │─── POST /api/upload ─────────-│
  │                               │  [file read]
  │-── data: {status:parsing} ───│
  │                               │  [extract_cv() → Groq LLM]
  │-── data: {status:extracted} ─│
  │                               │  [run_education_agent()]
  │-── data: {status:education_scored}
  │                               │  [_candidates[id] = profile]
  │-── data: {status:complete} ──│
  │                               │
  │─── GET /api/candidates ──────-│
  │-── [CandidateProfile list] ───│
```

---

## 4. Caching Strategy

| Data Type | TTL | Storage | Key |
|---|---|---|---|
| University rankings | 90 days | SQLite: `university_rankings` | institution name (normalized) |
| Journal metrics | 30 days | SQLite: `journal_cache` | ISSN or DOI |
| Conference ranks | 180 days | SQLite: `conference_cache` | conference name (normalized) |
| Citation counts | 14 days | SQLite: `citation_cache` | DOI |
| Patent data | 90 days | SQLite: `patent_cache` | patent number |
| Candidates | Session | In-memory dict `_candidates` | candidate_id |

Cache lookup always precedes external API call. Cache is populated on first fetch.

---

## 5. Parallel Processing (Milestone 3 Target)

For 10 CV batch with `asyncio.gather()`:

```python
profiles = await asyncio.gather(*[
    process_single_cv(cv_path, jd) for cv_path in cv_paths
])
```

Each `process_single_cv()` runs the full agent pipeline independently.
Verifier lookups are cache-first - concurrent reads from SQLite are safe with aiosqlite.


