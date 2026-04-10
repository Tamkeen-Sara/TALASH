# TALASH - System Architecture & Technical Design

**Institution:** SEECS, NUST  
**Version:** 1.0 (Milestone 1)

---

## 1. System Overview

TALASH (Talent Acquisition & Learning Automation for Smart Hiring) is an end-to-end AI-powered faculty recruitment platform. It ingests candidate CVs in PDF format, extracts structured information via an LLM pipeline, verifies academic credentials against external databases, and ranks candidates using a configurable scoring rubric.

```
┌─────────────────────────────────────────────────────────────────┐
│                          TALASH System                          │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌────────────────────┐    │
│  │  CV PDFs  │───-│ Preprocessing│───-│  Analysis Agents   │    │
│  │ (Upload)  │    │  Module (M0) │    │ (M1-M6, parallel)  │    │
│  └──────────┘    └──────────────┘    └────────────────────┘    │
│                                               │                  │
│  ┌─────────────┐    ┌──────────────┐          -                  │
│  │  React UI   │-───│  FastAPI +   │-── ┌──────────────┐        │
│  │ (Dashboard) │    │  SSE Stream  │    │ Scoring &    │        │
│  └─────────────┘    └──────────────┘    │ Ranking      │        │
│                                         └──────────────┘        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │             Verification Layer (External APIs)           │    │
│  │  QS Rankings │ OpenAlex │ CrossRef │ CORE │ Semantic    │    │
│  │              │          │          │      │ Scholar     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   SQLite Cache Layer                     │    │
│  │        data/cache.db  ·  data/candidates.db             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| LLM Extraction | Groq API - Llama 3.3 70B Versatile | Free tier; 70B parameters for strong structured extraction; <2s latency |
| Backend API | FastAPI (Python 3.11+) | Async-native; StreamingResponse for SSE; Pydantic v2 integration |
| Data Validation | Pydantic v2 | Schema-first approach; automatic type coercion; field validators |
| PDF Parsing | pdfplumber + PyMuPDF + pytesseract | Three-tier fallback for native text, complex layouts, and scanned PDFs |
| Caching | SQLite (aiosqlite) | Zero-config persistent cache; TTL per data type |
| Frontend | React 18 + Vite + Zustand | Fast HMR; lightweight state; no Redux overhead |
| Styling | CSS custom properties (dark/light) | Single source-of-truth theming without Tailwind overhead |
| Visualization | Recharts + D3.js | Radar chart, Gantt timeline, network graphs |
| University DB | QS World Rankings scraper | 170+ ranked institutions; fuzzy matched via RapidFuzz |
| Conference DB | CORE Rankings CSV | Offline dataset; A*/A/B/C tiers |

---

## 3. Backend Architecture

### 3.1 Module Structure

```
backend/
├── main.py                  # FastAPI app, SSE endpoints, request routing
├── config.py                # Pydantic Settings - all env vars, weights, thresholds
├── agents/                  # LLM-powered processing modules
│   ├── preprocessor.py      # M0: PDF → CandidateProfile JSON
│   ├── education_agent.py   # M1: CGPA normalisation, university ranking, gaps
│   ├── research_agent.py    # M2: journal/conference scoring, H-index, predatory
│   ├── employment_agent.py  # M3: career progression, overlap detection
│   ├── skill_agent.py       # M4: sentence-transformer JD alignment
│   ├── supervision_agent.py # M5: supervision record parsing + cross-reference
│   ├── books_patents_agent.py  # M6: ISBN/USPTO verification
│   ├── topic_agent.py       # M7: BERTopic publication clustering (M3)
│   └── coauthor_agent.py    # M8: NetworkX co-author network (M3)
├── verifiers/               # External API integration
│   ├── university_verifier.py  # QS/THE/HEC ranking lookup + fuzzy match
│   ├── journal_verifier.py     # 6-tier: Cache→CrossRef→OpenAlex→SemanticScholar→ISSN→unverified
│   └── conference_verifier.py  # CORE CSV + fuzzy match + edition/maturity check
├── schemas/                 # Pydantic data models
│   ├── candidate.py         # CandidateProfile, EmploymentProfile, SkillProfile
│   ├── education.py         # EducationProfile, DegreeRecord, SSERecord, HSERecord
│   └── research.py          # ResearchProfile, JournalPaper, ConferencePaper, Book, Patent
├── scoring/
│   ├── rubric.py            # Per-dimension scoring formulas
│   └── ranker.py            # Min-max normalisation, final ranking, recommendations
├── reports/
│   ├── pdf_generator.py     # ReportLab PDF report
│   └── email_drafter.py     # LLM-generated missing-info emails
└── utils/
    └── pdf_splitter.py      # Split multi-CV bulk PDFs into individual files
```

### 3.2 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/api/upload` | Upload individual CV PDFs → SSE stream |
| POST | `/api/upload/bulk` | Upload compiled PDF → auto-split → SSE stream |
| GET | `/api/candidates` | List all analyzed candidates (ranked) |
| GET | `/api/candidates/{id}` | Single candidate full detail |
| POST | `/api/candidates/{id}/supervision` | Manual supervision data entry |
| GET | `/api/export/csv` | Download all candidates as CSV |
| GET | `/api/export/xlsx` | Download all candidates as Excel |
| GET | `/api/report/{id}` | Download PDF report for a candidate |

### 3.3 SSE Event Protocol

All upload endpoints stream newline-delimited JSON events (SSE format):

```
data: {"status": "parsing",          "file": "cv.pdf"}\n\n
data: {"status": "extracted",        "candidate": "Dr. Khan", "id": "a1b2c3"}\n\n
data: {"status": "education_scored", "candidate": "Dr. Khan", "score": 82.5}\n\n
data: {"status": "complete",         "candidate": "Dr. Khan", "id": "a1b2c3"}\n\n
```

Error event:
```
data: {"status": "error", "file": "cv.pdf", "error": "PDF extraction failed"}\n\n
```

---

## 4. Frontend Architecture

```
frontend/src/
├── App.jsx               # Router, sidebar layout, auth guard
├── main.jsx              # Vite entry point
├── index.css             # CSS custom properties (Scholar's Warmth theme)
├── api/
│   └── talash.js         # Axios instance + XHR SSE streaming
├── context/
│   └── AuthContext.jsx   # Auth state (login/logout/googleLogin)
├── store/
│   └── candidateStore.js # Zustand store for candidates + weights
├── hooks/
│   ├── usePageTitle.js   # Dynamic document.title per route
│   └── useTheme.js       # Dark/light toggle with localStorage
├── pages/
│   ├── Login.jsx         # Two-panel layout + simulated Google picker
│   ├── Upload.jsx        # Drag-drop + SSE processing log
│   ├── Dashboard.jsx     # Ranked candidate table + filter bar
│   ├── CandidateView.jsx # Full candidate profile with all modules
│   ├── Compare.jsx       # Side-by-side 2-4 candidate comparison
│   └── Profile.jsx       # User profile + scoring weight sliders
└── components/
    ├── Sidebar.jsx        # Navigation + dark/light toggle
    ├── WeightSliders.jsx  # Configurable scoring dimension sliders
    └── ScoreRadar.jsx     # Pentagon radar chart (Recharts)
```

### 4.1 State Management

- **Zustand** (`candidateStore`): global candidates array + scoring weights
- **AuthContext**: current user, login/logout functions
- **Local state**: upload progress, drag-over, file list, comparison selection

### 4.2 Theming

CSS custom properties on `<html data-theme="dark|light">`:
- Dark (default): `--bg-base: #09080e`, `--accent: #f0a030` (amber)
- Light: `--bg-base: #faf7f0`, `--accent: #c87e0a`
- Toggled via `useTheme` hook; persisted in `localStorage`

---

## 5. Security Notes

- All API keys in `.env` (excluded from git via `.gitignore`)
- No real Google OAuth client - simulated picker for demo
- Input sanitization on CV filenames (`uuid + original name`)
- CORS restricted to `localhost:5173` and `localhost:3000`
- Pydantic v2 validation on all incoming data

---

## 6. Performance Targets

| Metric | Target | Approach |
|---|---|---|
| Single CV extraction | < 10s | Groq async API (< 2s LLM) |
| 5 CVs batch | < 60s | Sequential SSE stream |
| 10 CVs batch | < 20s | Parallel asyncio (M3 target) |
| University lookup | < 100ms | SQLite cache + in-memory dict |
| Journal lookup | < 3s | 6-tier fallback with cache-first |


