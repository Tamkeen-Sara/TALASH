# TALASH - CV Ingestion Design

**Version:** 1.0 (Milestone 1)

---

## 1. Ingestion Modes

TALASH supports three CV ingestion patterns:

### Mode A: Individual PDF Upload (UI)
Upload one or more separate CV PDF files via the drag-and-drop interface.

```
User selects multiple PDFs → POST /api/upload
  FormData fields:
    files[]: cv1.pdf, cv2.pdf, cv3.pdf  (list of UploadFile)
    jd:      "We are hiring for..."      (optional job description text)
```

### Mode B: Bulk PDF Upload (UI)
Upload a single compiled PDF containing multiple CVs (e.g., an applicant pack from HR).

```
User selects one PDF → POST /api/upload/bulk
  FormData fields:
    file: applicant_pack.pdf  (single UploadFile)
    jd:   "..."               (optional)
```

### Mode C: Folder-Based Batch Ingestion (CLI / future)
Drop PDF files into a watched directory; a background worker processes new files.

```
data/
└── inbox/          ← Drop CVs here
    ├── john.pdf
    └── jane.pdf
→ Worker detects new files → calls extract_cv() for each
→ Processed files moved to data/cvs/
```

**Status:** Modes A and B are implemented. Mode C is designed for future CI/CD pipeline integration.

---

## 2. File Validation

Before processing, each uploaded file is validated:

| Check | Rule | Action on failure |
|---|---|---|
| File type | Must be `application/pdf` or `.pdf` extension | Rejected client-side (input accept=".pdf") |
| File size | < 50MB recommended | No hard limit; OCR may be slow for very large files |
| Readability | pdfplumber must open without exception | Falls back to PyMuPDF; then OCR |
| Text content | > 200 characters extracted | Triggers OCR fallback |
| Encoding | Any (pdfplumber handles UTF-8, Latin-1, etc.) | |

---

## 3. Upload Processing Flow

### Individual Upload (`/api/upload`)

```python
@app.post("/api/upload")
async def upload_cvs(files: list[UploadFile] = File(...), jd: str = Form("")):
    # 1. Read all file bytes eagerly BEFORE yielding to StreamingResponse
    #    (UploadFile closes when generator starts)
    file_data = []
    for file in files:
        content = await file.read()
        file_data.append((file.filename, content))

    async def event_stream():
        for filename, content in file_data:
            # 2. Save to disk with UUID prefix
            save_path = f"data/cvs/{uuid.uuid4()}_{filename}"
            Path(save_path).write_bytes(content)

            yield SSE_EVENT("parsing", file=filename)

            # 3. Extract via LLM pipeline
            profile = await extract_cv(save_path)
            yield SSE_EVENT("extracted", candidate=profile.full_name)

            # 4. Run education agent
            profile.education = await run_education_agent(profile.education, profile.employment)
            profile.score_education = profile.education.education_score
            yield SSE_EVENT("education_scored", score=profile.score_education)

            # 5. Store in memory
            _candidates[profile.candidate_id] = profile
            yield SSE_EVENT("complete", id=profile.candidate_id)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

### Bulk Upload (`/api/upload/bulk`)

```python
@app.post("/api/upload/bulk")
async def upload_bulk_pdf(file: UploadFile = File(...), jd: str = Form("")):
    content = await file.read()
    save_path = f"data/cvs/{uuid.uuid4().hex[:8]}_{file.filename}"
    Path(save_path).write_bytes(content)

    async def event_stream():
        yield SSE_EVENT("splitting", file=file.filename)
        # Run synchronous splitter in thread pool to avoid blocking event loop
        loop = asyncio.get_event_loop()
        split_paths = await loop.run_in_executor(None, split_pdf_into_cvs, save_path)
        yield SSE_EVENT("split_complete", count=len(split_paths))

        for i, cv_path in enumerate(split_paths):
            cv_name = f"CV {i+1} from {file.filename}"
            # ... same extract → education → store flow as Mode A
```

---

## 4. PDF Splitting Algorithm (`utils/pdf_splitter.py`)

The splitter detects CV boundaries within a multi-page PDF:

```
Strategy 1: Heuristic boundary detection
  For each page:
    1. Extract text (pdfplumber)
    2. Score "new CV likelihood":
       - Contains name pattern (Title Case words, 2-3 words)
       - Contains email address
       - Contains phone number
       - High density of contact-info keywords
       - First page of file OR page text is significantly different from previous
    3. If score > threshold → start new CV segment

Strategy 2: Uniform splitting (fallback)
  If heuristic finds 0 or 1 boundary → split every N pages
  Default N: inferred from total_pages / estimated_cv_count
```

Output: list of paths to individual CV PDF files saved in `data/cvs/`.

---

## 5. Duplicate Detection

Current behavior: **no deduplication** (by design for demo).

Production plan:
1. Compute SHA-256 hash of PDF bytes on upload
2. Check `file_hash` column in `candidates.db`
3. If match found → return existing candidate_id with `{status: "duplicate"}` SSE event
4. UI shows "already processed" instead of re-running

---

## 6. SSE Client Implementation

The frontend uses raw `XMLHttpRequest` (not the browser's `EventSource` API) because `EventSource` does not support POST requests with FormData:

```javascript
// frontend/src/api/talash.js
export const uploadCVs = (files, jd, onEvent) => {
  const formData = new FormData()
  for (const file of files) formData.append('files', file)
  formData.append('jd', jd || '')

  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/upload')
  const parse = makeSseParser(onEvent)
  xhr.onprogress = () => parse(xhr.responseText)  // incremental read
  xhr.send(formData)
  return () => xhr.abort()  // cleanup function
}
```

The SSE parser splits on `\n\n` boundaries (SSE block separator) to avoid duplicate events from cumulative `responseText`:

```javascript
function makeSseParser(onEvent) {
  let processedLen = 0
  let partial = ''
  return (text) => {
    partial += text.slice(processedLen)
    processedLen = text.length
    const chunks = partial.split('\n\n')
    partial = chunks.pop()             // keep incomplete trailing event
    for (const chunk of chunks) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          try { onEvent(JSON.parse(line.slice(6))) } catch { /* partial */ }
        }
      }
    }
  }
}
```


