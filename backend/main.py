"""
TALASH — FastAPI Entry Point
Endpoints:
  GET  /health              — Health check
  POST /api/upload          — Upload CVs, returns SSE stream of processing events
  GET  /api/candidates      — List all analyzed candidates (ranked)
  GET  /api/candidates/{id} — Get single candidate detail
  POST /api/candidates/{id}/supervision — Add supervision data (manual entry)
  GET  /api/export/csv      — Download all candidates as CSV
  GET  /api/export/xlsx     — Download all candidates as Excel
  GET  /api/report/{id}     — Download PDF report for a candidate
"""
import asyncio
import json
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, Response

from backend.config import settings
from backend.agents.preprocessor import extract_cv
from backend.verifiers.university_verifier import scrape_and_store_rankings
from backend.verifiers.conference_verifier import load_core_rankings
from backend.reports.pdf_generator import generate_candidate_report

app = FastAPI(
    title="TALASH",
    description="Talent Acquisition & Learning Automation for Smart Hiring",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for demo (replace with candidates.db in production)
_candidates: dict = {}


@app.on_event("startup")
async def startup():
    Path("data/cvs").mkdir(parents=True, exist_ok=True)
    await scrape_and_store_rankings()
    await load_core_rankings()


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/upload")
async def upload_cvs(files: list[UploadFile] = File(...), jd: str = Form("")):
    """Upload CVs and return SSE stream of processing progress."""
    # Read all file contents eagerly — UploadFile closes when StreamingResponse starts
    file_data = []
    for file in files:
        content = await file.read()
        file_data.append((file.filename, content))

    async def event_stream():
        for filename, content in file_data:
            try:
                save_path = f"data/cvs/{uuid.uuid4()}_{filename}"
                Path(save_path).write_bytes(content)

                yield f"data: {json.dumps({'status': 'parsing', 'file': filename})}\n\n"

                # Extract CV
                profile = await extract_cv(save_path)
                _candidates[profile.candidate_id] = profile

                yield f"data: {json.dumps({'status': 'extracted', 'candidate': profile.full_name, 'id': profile.candidate_id})}\n\n"

                # TODO Week 3+: Run education_agent, research_agent, etc.
                yield f"data: {json.dumps({'status': 'complete', 'candidate': profile.full_name, 'id': profile.candidate_id})}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'status': 'error', 'file': filename, 'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/candidates")
async def get_candidates():
    return list(_candidates.values())


@app.get("/api/candidates/{candidate_id}")
async def get_candidate(candidate_id: str):
    c = _candidates.get(candidate_id)
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return c


@app.post("/api/candidates/{candidate_id}/supervision")
async def add_supervision(candidate_id: str, supervision_data: dict):
    """Manual entry of supervision records (spec §3.3 — often not in CV)."""
    c = _candidates.get(candidate_id)
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    from backend.schemas.research import SupervisionRecord
    record = SupervisionRecord(**supervision_data)
    c.research.supervision.append(record)
    return {"message": "Supervision record added", "total": len(c.research.supervision)}


@app.get("/api/export/csv")
async def export_csv():
    """Export all candidates to CSV (spec requirement)."""
    import pandas as pd
    import io
    rows = []
    for c in _candidates.values():
        rows.append({
            "candidate_id": c.candidate_id,
            "name": c.full_name,
            "email": c.email,
            "rank": c.rank,
            "score_total": c.score_total,
            "score_education": c.score_education,
            "score_research": c.score_research,
            "score_employment": c.score_employment,
            "score_skills": c.score_skills,
            "score_supervision": c.score_supervision,
            "recommendation": c.recommendation,
            "highest_degree": max((d.level for d in c.education.degrees), default="N/A"),
            "q1_papers": c.research.q1_count,
            "h_index": c.research.h_index,
        })
    df = pd.DataFrame(rows)
    output = io.BytesIO()
    df.to_csv(output, index=False)
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=talash_candidates.csv"}
    )


@app.get("/api/export/xlsx")
async def export_xlsx():
    """Export all candidates to Excel (spec requirement)."""
    import pandas as pd
    import io
    rows = []
    for c in _candidates.values():
        rows.append({
            "Name": c.full_name,
            "Email": c.email,
            "Rank": c.rank,
            "Total Score": c.score_total,
            "Education": c.score_education,
            "Research": c.score_research,
            "Employment": c.score_employment,
            "Skills": c.score_skills,
            "Supervision": c.score_supervision,
            "Recommendation": c.recommendation,
            "Q1 Papers": c.research.q1_count,
            "H-Index": c.research.h_index,
        })
    df = pd.DataFrame(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Candidates")
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=talash_candidates.xlsx"}
    )


@app.get("/api/report/{candidate_id}")
async def get_report(candidate_id: str):
    """Generate and download PDF report for a candidate."""
    c = _candidates.get(candidate_id)
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    pdf_bytes = generate_candidate_report(c)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={c.full_name}_report.pdf"}
    )
