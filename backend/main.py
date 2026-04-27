"""TALASH FastAPI entry point.

Endpoints:
    GET  /health                  - Health check
    POST /api/upload              - Upload CVs (SSE stream of processing events)
    POST /api/upload/bulk         - Upload a single multi-CV PDF (auto-split and process)
    GET  /api/candidates          - List all analyzed candidates (ranked)
    GET  /api/candidates/{id}     - Get single candidate detail
    POST /api/candidates/{id}/supervision - Add supervision data (manual entry)
    GET  /api/export/csv          - Download all candidates as CSV
    GET  /api/export/xlsx         - Download all candidates as Excel
    GET  /api/report/{id}         - Download PDF report for a candidate
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
from backend.agents.education_agent import run as run_education_agent
from backend.agents.research_agent import run as run_research_agent
from backend.agents.employment_agent import run as run_employment_agent
from backend.agents.books_patents_agent import run as run_books_patents_agent
from backend.agents.supervision_agent import run as run_supervision_agent
from backend.agents.skill_agent import run as run_skill_agent
from backend.reports.email_drafter import draft_missing_info_email, generate_candidate_summary
from backend.scoring.rubric import compute_total_score
from backend.verifiers.university_verifier import scrape_and_store_rankings, clear_process_cache
from backend.verifiers.conference_verifier import load_core_rankings
from backend.reports.pdf_generator import generate_candidate_report
from backend.utils.pdf_splitter import split_pdf_into_cvs

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

_STORE_FILE = Path("data/candidates.json")

def _load_store() -> dict:
    if _STORE_FILE.exists():
        try:
            from backend.schemas.candidate import CandidateProfile
            raw = json.loads(_STORE_FILE.read_text(encoding="utf-8"))
            return {k: CandidateProfile.model_validate(v) for k, v in raw.items()}
        except Exception:
            return {}
    return {}

def _save_store():
    try:
        _STORE_FILE.write_text(
            json.dumps({k: v.model_dump() for k, v in _candidates.items()}, default=str, indent=2),
            encoding="utf-8",
        )
    except Exception:
        pass

_candidates: dict = _load_store()


async def _re_enrich_all_candidates():
    """
    Re-run university enrichment + education scoring for every candidate loaded
    from candidates.json.  This is called at startup so that:
      • Stale QS ranks baked into candidates.json are corrected from the current
        QS Excel file without requiring the user to re-upload CVs.
      • A freshly-loaded QS file (or a fixed _parse_rank bug) takes effect
        immediately on the next server restart.

    The expensive API calls (ROR, OpenAlex) are still served from the SQLite
    cache when available.  Only the QS rank patch (_qs_lookup) re-queries the
    in-memory cache — that costs nothing beyond a fuzzy string match.
    """
    if not _candidates:
        return

    clear_process_cache()   # empty in-process dict so every institution is
                            # re-looked-up (hits SQLite → refreshes QS rank there too)

    updated = 0
    for cid, candidate in list(_candidates.items()):
        try:
            if not (candidate.education and candidate.education.degrees):
                continue
            candidate.education = await run_education_agent(
                candidate.education, candidate.employment
            )
            candidate.score_education = candidate.education.education_score
            candidate.score_total = compute_total_score(
                candidate.score_education, candidate.score_research,
                candidate.score_employment, candidate.score_skills,
                candidate.score_supervision,
            )
            updated += 1
        except Exception as e:
            name = getattr(candidate, "full_name", cid)
            print(f"[startup] Re-enrich failed for '{name}': {e}")

    if updated:
        _save_store()
        print(f"[startup] Re-enriched {updated} candidate(s) with current QS data.")


@app.on_event("startup")
async def startup():
    Path("data/cvs").mkdir(parents=True, exist_ok=True)
    await scrape_and_store_rankings()
    await load_core_rankings()
    await _re_enrich_all_candidates()


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/upload")
async def upload_cvs(files: list[UploadFile] = File(...), jd: str = Form("")):
    """Upload CVs and return SSE stream of processing progress."""
    # Read file contents eagerly because UploadFile closes when StreamingResponse starts.
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

                # Step 1: Extract CV structure via LLM
                profile = await extract_cv(save_path)
                yield f"data: {json.dumps({'status': 'extracted', 'candidate': profile.full_name, 'id': profile.candidate_id})}\n\n"

                # Step 2: Education agent
                profile.education       = await run_education_agent(profile.education, profile.employment)
                profile.score_education = profile.education.education_score
                yield f"data: {json.dumps({'status': 'education_scored', 'candidate': profile.full_name, 'score': profile.score_education})}\n\n"

                # Step 3: Books & patents verification
                profile.research.books, profile.research.patents = await run_books_patents_agent(
                    profile.research.books, profile.research.patents
                )

                # Step 4: Research agent (journal/conference verification, H-index, research score)
                profile.research        = await run_research_agent(profile.research)
                profile.score_research  = profile.research.research_score
                yield f"data: {json.dumps({'status': 'research_scored', 'candidate': profile.full_name, 'score': profile.score_research})}\n\n"

                # Step 5: Employment agent (overlap detection, career progression, employment score)
                profile.employment       = await run_employment_agent(profile.employment, profile.education)
                profile.score_employment = profile.employment.employment_score
                yield f"data: {json.dumps({'status': 'employment_scored', 'candidate': profile.full_name, 'score': profile.score_employment})}\n\n"

                # Step 6: Supervision agent (cross-reference publications)
                profile.research.supervision, profile.score_supervision, _ = await run_supervision_agent(profile.research)

                # Step 6b: Skill alignment agent (non-fatal — degrades to score 0)
                try:
                    all_papers = profile.research.journal_papers + profile.research.conference_papers
                    profile.skills, profile.score_skills = await run_skill_agent(
                        profile.skills, profile.employment.records, all_papers, jd,
                        degrees=profile.education.degrees,
                    )
                except Exception:
                    profile.score_skills = 0.0

                # Step 7: Draft missing-info email if needed (non-fatal)
                if profile.missing_info:
                    try:
                        profile.missing_info_email_draft = await draft_missing_info_email(profile)
                    except Exception as e:
                        print(f"[email_drafter] Failed for {profile.full_name}: {e}")

                # Step 8: Compute total score FIRST so summary has the correct value
                profile.score_total = compute_total_score(
                    profile.score_education, profile.score_research,
                    profile.score_employment, profile.score_skills, profile.score_supervision
                )

                # Step 9: Generate candidate summary (non-fatal)
                try:
                    summary = await generate_candidate_summary(profile)
                    profile.recommendation      = summary["recommendation"]
                    profile.key_strengths       = summary["strengths"]
                    profile.key_concerns        = summary["concerns"]
                    profile.score_justification = summary["justification"]
                except Exception as e:
                    print(f"[candidate_summary] Failed for {profile.full_name}: {e}")

                _candidates[profile.candidate_id] = profile
                _save_store()
                yield f"data: {json.dumps({'status': 'complete', 'candidate': profile.full_name, 'id': profile.candidate_id, 'score': profile.score_total})}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'status': 'error', 'file': filename, 'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/upload/bulk")
async def upload_bulk_pdf(file: UploadFile = File(...), jd: str = Form("")):
    """
    Upload a single multi-CV PDF (e.g. a compiled applicant pack).
    Auto-splits into individual CVs, then processes each via SSE stream.
    """
    content = await file.read()
    save_path = f"data/cvs/{uuid.uuid4().hex[:8]}_{file.filename}"
    Path(save_path).write_bytes(content)

    async def event_stream():
        try:
            yield f"data: {json.dumps({'status': 'splitting', 'file': file.filename})}\n\n"
            loop = asyncio.get_running_loop()
            split_paths = await loop.run_in_executor(None, split_pdf_into_cvs, save_path)
            yield f"data: {json.dumps({'status': 'split_complete', 'count': len(split_paths)})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'file': file.filename, 'error': str(e)})}\n\n"
            return

        for i, cv_path in enumerate(split_paths):
            cv_name = f"CV {i+1} from {file.filename}"
            try:
                yield f"data: {json.dumps({'status': 'parsing', 'file': cv_name})}\n\n"
                profile = await extract_cv(cv_path)
                yield f"data: {json.dumps({'status': 'extracted', 'candidate': profile.full_name, 'id': profile.candidate_id})}\n\n"

                profile.education       = await run_education_agent(profile.education, profile.employment)
                profile.score_education = profile.education.education_score
                yield f"data: {json.dumps({'status': 'education_scored', 'candidate': profile.full_name, 'score': profile.score_education})}\n\n"

                profile.research.books, profile.research.patents = await run_books_patents_agent(
                    profile.research.books, profile.research.patents
                )
                profile.research        = await run_research_agent(profile.research)
                profile.score_research  = profile.research.research_score
                yield f"data: {json.dumps({'status': 'research_scored', 'candidate': profile.full_name, 'score': profile.score_research})}\n\n"

                profile.employment       = await run_employment_agent(profile.employment, profile.education)
                profile.score_employment = profile.employment.employment_score
                yield f"data: {json.dumps({'status': 'employment_scored', 'candidate': profile.full_name, 'score': profile.score_employment})}\n\n"

                profile.research.supervision, profile.score_supervision, _ = await run_supervision_agent(profile.research)

                try:
                    all_papers = profile.research.journal_papers + profile.research.conference_papers
                    profile.skills, profile.score_skills = await run_skill_agent(
                        profile.skills, profile.employment.records, all_papers, jd,
                        degrees=profile.education.degrees,
                    )
                except Exception:
                    profile.score_skills = 0.0

                if profile.missing_info:
                    try:
                        profile.missing_info_email_draft = await draft_missing_info_email(profile)
                    except Exception as e:
                        print(f"[email_drafter] Failed for {profile.full_name}: {e}")

                profile.score_total = compute_total_score(
                    profile.score_education, profile.score_research,
                    profile.score_employment, profile.score_skills, profile.score_supervision
                )

                try:
                    summary = await generate_candidate_summary(profile)
                    profile.recommendation      = summary["recommendation"]
                    profile.key_strengths       = summary["strengths"]
                    profile.key_concerns        = summary["concerns"]
                    profile.score_justification = summary["justification"]
                except Exception as e:
                    print(f"[candidate_summary] Failed for {profile.full_name}: {e}")

                _candidates[profile.candidate_id] = profile
                _save_store()
                yield f"data: {json.dumps({'status': 'complete', 'candidate': profile.full_name, 'id': profile.candidate_id, 'score': profile.score_total})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'status': 'error', 'file': cv_name, 'error': str(e)})}\n\n"

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


@app.delete("/api/candidates/{candidate_id}")
async def delete_candidate(candidate_id: str):
    """Permanently remove a candidate from the store."""
    if candidate_id not in _candidates:
        raise HTTPException(status_code=404, detail="Candidate not found")
    del _candidates[candidate_id]
    _save_store()
    return {"message": "Candidate deleted"}


@app.post("/api/candidates/{candidate_id}/supervision")
async def add_supervision(candidate_id: str, supervision_data: dict):
    """Manual entry of supervision records — appends, re-scores, re-ranks."""
    c = _candidates.get(candidate_id)
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    from backend.schemas.research import SupervisionRecord
    record = SupervisionRecord(**supervision_data)
    c.research.supervision.append(record)

    # Recompute supervision score and total score with the new record
    _, new_sup_score, _ = await run_supervision_agent(c.research)
    c.score_supervision = new_sup_score
    c.score_total = compute_total_score(
        c.score_education, c.score_research,
        c.score_employment, c.score_skills, c.score_supervision,
    )

    # Update ranks by sorting on score_total — no normalization, raw scores preserved
    all_sorted = sorted(_candidates.values(), key=lambda x: x.score_total or 0, reverse=True)
    for rank_i, rc in enumerate(all_sorted, start=1):
        rc.rank = rank_i

    _save_store()
    return {
        "message": "Supervision record added",
        "total": len(c.research.supervision),
        "score_supervision": c.score_supervision,
        "score_total": c.score_total,
    }


@app.post("/api/candidates/re-enrich")
async def re_enrich_all():
    """
    Re-run university enrichment for all candidates.
    Call this after replacing data/qs_rankings.xlsx to pick up new QS data
    without restarting the server.
    """
    from backend.verifiers.university_verifier import _qs_cache
    _qs_cache.clear()   # force reload from Excel on next lookup
    await _re_enrich_all_candidates()
    return {"message": f"Re-enriched {len(_candidates)} candidates", "count": len(_candidates)}


@app.delete("/api/cache/conferences")
async def clear_conference_cache():
    """Clear all cached conference entries so the next upload re-verifies every conference."""
    from backend.cache.cache_manager import cache
    import sqlite3
    with sqlite3.connect(cache.db_path) as conn:
        deleted = conn.execute("DELETE FROM cache WHERE key LIKE 'conference:%'").rowcount
        conn.commit()
    return {"message": f"Cleared {deleted} conference cache entries"}


@app.delete("/api/cache/journals")
async def clear_journal_cache():
    """
    Delete all cached journal entries so the next upload re-verifies every journal.
    Use this after fixing journal extraction issues or updating the journal verifier.
    """
    from backend.cache.cache_manager import cache
    import sqlite3
    with sqlite3.connect(cache.db_path) as conn:
        deleted = conn.execute("DELETE FROM cache WHERE key LIKE 'journal:%'").rowcount
        conn.commit()
    return {"message": f"Cleared {deleted} journal cache entries"}


@app.get("/api/candidates/{candidate_id}/email")
async def get_missing_info_email(candidate_id: str):
    """Return cached or freshly generated missing-info email for a candidate."""
    c = _candidates.get(candidate_id)
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if not c.missing_info_email_draft:
        c.missing_info_email_draft = await draft_missing_info_email(c)
        _save_store()
    return {"email": c.missing_info_email_draft, "missing_info": [m.model_dump() for m in c.missing_info]}


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



