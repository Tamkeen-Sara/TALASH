# TALASH - UI/UX Wireframes

**Version:** 1.0 (Milestone 1)

All wireframes use ASCII layout notation. Final implementation in React 18 + Vite.

---

## Screen 1: Login Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  ------------------------------  │                                  │
│  -  Left Panel (52% width)    -  │   Right Panel                    │
│  -                            -  │                                  │
│  -  [T] TALASH                -  │   Welcome back                   │
│  -       Recruitment AI       -  │   Sign in to access the platform │
│  -                            -  │                                  │
│  -  Intelligent               -  │   ┌─────────────────────────┐   │
│  -  Faculty Hiring            -  │   │  G  Continue with Google │   │
│  -                            -  │   └─────────────────────────┘   │
│  -  - Education scoring       -  │                                  │
│  -  - Journal verification    -  │   ──── or sign in with email ──── │
│  -  - Cohort ranking          -  │                                  │
│  -  - AI emails               -  │   Email address                  │
│  -                            -  │   ┌─────────────────────────┐   │
│  -  TALASH Platform  -  │   │ you@talash.ai            │   │
│  ------------------------------  │   └─────────────────────────┘   │
│                                  │   Password                       │
│  Dark gradient with purple orbs  │   ┌─────────────────────────┐   │
│                                  │   │ ••••••••                 │   │
│                                  │   └─────────────────────────┘   │
│                                  │                                  │
│                                  │   ┌─────────────────────────┐   │
│                                  │   │      Sign in  →          │   │
│                                  │   └─────────────────────────┘   │
│                                  │                                  │
│                                  │   - Demo credentials             │
└─────────────────────────────────────────────────────────────────────┘

Google Picker Modal (overlay):
┌─────────────────────────────┐
│         [G] Google          │
│   Sign in to TALASH         │
│   with your Google Account  │
│                             │
│  [AU] Admin User            │
│       admin@talash.ai       │
│                             │
│  [TS] Tamkeen Sara          │
│       tamkeen@talash.ai     │
│                             │
│  [FR] Furqan Raza           │
│       furqan@talash.ai      │
│                             │
│  Privacy · Terms  [Cancel]  │
└─────────────────────────────┘
```

---

## Screen 2: Sidebar (persistent navigation)

```
┌──────────────────┐
│  [T] TALASH      │   Logo + wordmark
│                  │
│  ≡  Dashboard    │   ← Active page highlighted (amber accent)
│  ↑  Upload CVs   │
│  ≈  Compare      │
│  -  Profile      │
│                  │
│  ────────────    │
│                  │
│  [AU]            │   User avatar (initial or picture)
│  Admin User      │   Name + role
│  Administrator   │
│                  │
│  - ── - [dark]  │   Dark/light toggle pill
└──────────────────┘
Width: 220px, fixed left
```

---

## Screen 3: Upload Page

```
┌────────────────────────────────────────┐
│  Upload CVs                            │
│  AI-powered extraction in seconds.     │
│                                        │
│  ┌──────────────┬──────────────┐       │
│  │ [FILE] Individual│ [BULK] Bulk PDF  │       │   Mode toggle (pill)
│  │   CVs        │  One file    │       │
│  └──────────────┴──────────────┘       │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │                                  │  │
│  │           [UPLOAD] Upload              │  │   Drop zone (dashed border)
│  │   Drag & drop PDF files,         │  │   Click to browse
│  │   or click to browse             │  │
│  │         PDF files only           │  │
│  │                                  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────┐ [-]     │   File list (per file)
│  │ [FILE] cv_john_smith.pdf  2.3MB │      │
│  └──────────────────────────┘         │
│                                        │
│  Job Description (optional)            │
│  ┌──────────────────────────────────┐  │
│  │ Paste the job description...     │  │
│  │                                  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────┐  [Cancel]        │
│  │ Analyze 2 CVs →  │                  │   Primary action button
│  └──────────────────┘                  │
│                                        │
│  Processing Log                        │
│  ┌──────────────────────────────────┐  │
│  │  1  PARSING    - cv_john.pdf     │  │
│  │  2  EXTRACTED  - Dr. John Smith  │  │
│  │  3  EDUCATION  - score 82.5      │  │   Scrollable monospace log
│  │  4  COMPLETE   - Dr. John Smith  │  │
│  │  -  Processing…                  │  │
│  └──────────────────────────────────┘  │
│                                        │
│       [View Results →]                 │   Appears when done
└────────────────────────────────────────┘
```

---

## Screen 4: Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  Candidate Dashboard            [↓ CSV]  [↓ Excel]           │
│  8 candidates ranked                                          │
│                                                               │
│  Filter: [All degrees -]  [Q1 ≥ __]  [H-index ≥ __]         │
│                                                               │
│  ┌──┬────────────────┬───────┬──────┬────────┬────────────┐  │
│  │# │ Name           │ Total │ Edu  │ Res    │ Rec        │  │
│  ├──┼────────────────┼───────┼──────┼────────┼────────────┤  │
│  │1│ Dr. Ayesha Khan│ 87.3  │ 91   │ 89     │ ✓ Strong   │  │
│  │2│ Dr. Omar Farooq│ 82.1  │ 85   │ 84     │ ✓ Strong   │  │
│  │3│ Dr. Sara Malik │ 78.4  │ 79   │ 76     │ ~ Conditnl │  │
│  │  │ ...            │       │      │        │            │  │
│  └──┴────────────────┴───────┴──────┴────────┴────────────┘  │
│                                                               │
│  Scoring Weights  [Research 35%] [Education 20%] [Employ 20%]│
│  (sliders - adjusting re-ranks in real-time in browser)      │
└──────────────────────────────────────────────────────────────┘
```

---

## Screen 5: Candidate View

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard                                          │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  [Hero gradient banner]                              │    │   Profile hero
│  │  [Avatar] Dr. Ayesha Khan                            │    │
│  │           ayesha@university.edu · Rank #1            │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────┐  ┌──────────────────────────────────────┐  │
│  │ Score Radar  │  │  Total: 87.3/100    ✓ Strong         │  │
│  │  [Pentagon]  │  │  ----------------  Education 91      │  │
│  │              │  │  ----------------  Research  89      │  │
│  │              │  │  ----------------  Employ    78      │  │
│  └──────────────┘  └──────────────────────────────────────┘  │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Education                                           │    │
│  │  PhD ML, University of Toronto (2015-2020)  ★★★★★   │    │
│  │  BSc CS, NUST (2010-2014) CGPA: 3.7/4.0   ★★★★☆   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Publications (23 total)                             │    │
│  │  [Q1] Deep Learning for Medical Imaging · IEEE TMI  │    │
│  │  [A*] Attention Mechanisms in NLP · ICML 38th       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Employment Timeline                                 │    │
│  │  2020 ─────────────────────── present               │    │
│  │  Assistant Professor · NUST --------------          │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Missing Info                  [📧 Draft Email]      │    │
│  │  [!] H-index not stated (important)                   │    │
│  │  [!] Supervision count unclear (optional)             │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## Screen 6: Compare Page

```
┌──────────────────────────────────────────────────────────────┐
│  Compare Candidates                                           │
│                                                               │
│  Add candidates to compare:  [+ Add candidate -]             │
│                                                               │
│  ┌────────────────┬────────────────┬────────────────┐        │
│  │  Dr. A. Khan   │  Dr. O. Farooq │  Dr. S. Malik  │        │
│  │  Rank #1       │  Rank #2       │  Rank #3       │        │
│  │                │                │                │        │
│  │  Score: 87.3   │  Score: 82.1   │  Score: 78.4   │        │
│  │  ────────────  │  ────────────  │  ────────────  │        │
│  │  Edu:    91    │  Edu:    85    │  Edu:    79    │        │
│  │  Research: 89  │  Research: 84  │  Research: 76  │        │
│  │  Employ:  78   │  Employ:  72   │  Employ:  81   │        │
│  │  PhD: ✓        │  PhD: ✓        │  PhD: - (MS)   │        │
│  │  Q1: 8 papers  │  Q1: 5 papers  │  Q1: 2 papers  │        │
│  │  H-index: 12   │  H-index: 8    │  H-index: 5    │        │
│  └────────────────┴────────────────┴────────────────┘        │
│                                                               │
│  Radar Overlay:                                               │
│  ┌──────────────────────┐                                     │
│  │   [Pentagon radar]   │  Purple · Blue · Teal               │
│  │   All 3 overlaid     │  per candidate                      │
│  └──────────────────────┘                                     │
└──────────────────────────────────────────────────────────────┘
```

---

## Screen 7: Profile Page

```
┌──────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────┐    │
│  │  [Banner: dark gradient with orbs]                   │    │
│  │                                                      │    │
│  │  [Avatar: 72-72, amber gradient]                     │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │      Admin User          [email badge] [Active]      │    │
│  │      Administrator · TALASH System                   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                     │
│  │  8   │  │ 84.2 │  │  45  │  │  3   │                     │   Stats row
│  │ Cand │  │ Avg  │  │  Q1  │  │ PhD  │                     │
│  └──────┘  └──────┘  └──────┘  └──────┘                     │
│                                                               │
│  ┌────────────────────┐  ┌────────────────────┐              │
│  │  Scoring Weights   │  │  System Info       │              │
│  │                    │  │                    │              │
│  │  Research  [===35%]│  │  LLM: Groq Llama   │              │
│  │  Education [=20%]  │  │  Backend: FastAPI  │              │
│  │  Employ    [=20%]  │  │  Frontend: React   │              │
│  │  Skills    [=15%]  │  │  DB: SQLite        │              │
│  │  Supervise [=10%]  │  │  Build: v1.0.0     │              │
│  └────────────────────┘  └────────────────────┘              │
└──────────────────────────────────────────────────────────────┘
```


