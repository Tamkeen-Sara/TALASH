"""
Module 0: Preprocessing Pipeline
PDF CV → validated CandidateProfile JSON in under 10 seconds.
Two-pass extraction: pdfplumber (tables) + PyMuPDF (complex layouts)
OCR fallback for scanned PDFs (pytesseract).
Claude Haiku converts extracted text to validated Pydantic JSON.
"""
import asyncio
import json
import uuid
from pathlib import Path

import pdfplumber
import fitz  # PyMuPDF
from groq import AsyncGroq

from backend.config import settings
from backend.schemas.candidate import (
    CandidateProfile, EmploymentProfile, EmploymentRecord, SkillProfile, MissingInfo
)
from backend.schemas.education import EducationProfile, SSERecord, HSERecord, DegreeRecord
from backend.schemas.research import (
    ResearchProfile, JournalPaper, ConferencePaper, Book, Patent, SupervisionRecord
)

client = AsyncGroq(api_key=settings.groq_api_key)

EXTRACTION_SYSTEM_PROMPT = """You are a precise CV data extractor for an academic HR system.

RULES:
1. NEVER invent information not explicitly stated. Use null for missing fields.
2. Preserve original text in raw_text fields for audit trail.
3. For CGPA: extract BOTH value AND scale (e.g. 3.8 out of 4.0 → cgpa=3.8, cgpa_scale=4.0).
4. For dates: extract years as integers. Use null if uncertain.
5. For publications: extract EVERY paper listed. Do NOT skip or summarize.
6. For authors: preserve full list exactly as written.
7. Detect candidate position in author list (1=first, 2=second, etc.).
8. For degree level: map to one of: BS, BSc, BE, MS, MPhil, MBA, PhD, Other.
9. Flag missing_info for any field that appears intentionally omitted.

Return ONLY valid JSON matching the schema below. No preamble. No explanation.

SCHEMA:
{
  "full_name": string,
  "email": string | null,
  "phone": string | null,
  "education": {
    "sse": {"percentage": float|null, "board": str|null, "year": int|null, "grade": str|null, "raw_text": str},
    "hse": {"percentage": float|null, "board": str|null, "year": int|null, "grade": str|null, "raw_text": str},
    "degrees": [{"degree_title": str, "level": str, "specialization": str|null, "institution": str,
                 "cgpa": float|null, "cgpa_scale": float|null, "percentage": float|null,
                 "start_year": int|null, "end_year": int|null, "is_ongoing": bool, "raw_text": str}]
  },
  "research": {
    "journal_papers": [{"title": str, "journal_name": str, "year": int|null, "doi": str|null,
                        "issn": str|null, "authors": [str], "candidate_position": int|null,
                        "is_corresponding": bool}],
    "conference_papers": [{"title": str, "conference_name": str, "year": int|null,
                           "authors": [str], "candidate_position": int|null,
                           "is_corresponding": bool, "proceedings_publisher": str|null,
                           "conference_edition": str|null}],
    "books": [{"title": str, "authors": [str], "isbn": str|null, "publisher": str|null,
               "year": int|null, "online_link": str|null, "candidate_role": str|null}],
    "patents": [{"patent_number": str|null, "title": str, "date": str|null,
                 "inventors": [str], "country": str|null, "online_link": str|null,
                 "candidate_role": str|null}],
    "supervision": [{"student_name": str, "degree_level": str, "role": str,
                     "year_graduated": int|null, "thesis_title": str|null}]
  },
  "employment": {
    "records": [{"job_title": str, "organization": str, "employment_type": str|null,
                 "start_year": int|null, "start_month": int|null, "end_year": int|null,
                 "end_month": int|null, "is_current": bool,
                 "responsibilities": [str], "raw_text": str}]
  },
  "skills": {
    "claimed_skills": [str]
  },
  "missing_info": [{"field": str, "section": str, "severity": str}]
}"""


def _extract_text_pdfplumber(pdf_path: str) -> str:
    try:
        with pdfplumber.open(pdf_path) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception:
        return ""


def _extract_text_pymupdf(pdf_path: str) -> str:
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    except Exception:
        return ""


def _extract_text_ocr(pdf_path: str) -> str:
    try:
        import pytesseract
        from pdf2image import convert_from_path
        images = convert_from_path(pdf_path, dpi=300)
        return "\n".join(pytesseract.image_to_string(img) for img in images)
    except Exception:
        return ""


def extract_raw_text(pdf_path: str) -> str:
    text_plumber = _extract_text_pdfplumber(pdf_path)
    text_mupdf = _extract_text_pymupdf(pdf_path)
    # Take whichever gives more text
    text = text_plumber if len(text_plumber) >= len(text_mupdf) else text_mupdf
    # OCR fallback for scanned PDFs
    if len(text.strip()) < 200:
        text = _extract_text_ocr(pdf_path)
    return text


async def extract_cv(pdf_path: str) -> CandidateProfile:
    raw_text = extract_raw_text(pdf_path)
    filename = Path(pdf_path).name

    response = await client.chat.completions.create(
        model=settings.extraction_model,
        max_tokens=4096,
        temperature=0.1,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": f"Extract all information from this CV:\n\n{raw_text}"}
        ]
    )

    raw_json = response.choices[0].message.content.strip()
    if raw_json.startswith("```"):
        raw_json = raw_json.split("```")[1]
        if raw_json.startswith("json"):
            raw_json = raw_json[4:]

    data = json.loads(raw_json)
    candidate_id = str(uuid.uuid4())[:8]

    edu_data = data.get("education", {})
    res_data = data.get("research", {})
    emp_data = data.get("employment", {})
    skills_data = data.get("skills", {})

    profile = CandidateProfile(
        candidate_id=candidate_id,
        full_name=data.get("full_name", "Unknown"),
        email=data.get("email"),
        phone=data.get("phone"),
        cv_filename=filename,
        education=EducationProfile(
            sse=SSERecord(**edu_data["sse"]) if edu_data.get("sse") else None,
            hse=HSERecord(**edu_data["hse"]) if edu_data.get("hse") else None,
            degrees=[DegreeRecord(**d) for d in edu_data.get("degrees", [])],
        ),
        research=ResearchProfile(
            journal_papers=[JournalPaper(**p) for p in res_data.get("journal_papers", [])],
            conference_papers=[ConferencePaper(**p) for p in res_data.get("conference_papers", [])],
            books=[Book(**b) for b in res_data.get("books", [])],
            patents=[Patent(**p) for p in res_data.get("patents", [])],
            supervision=[_parse_supervision(s) for s in res_data.get("supervision", [])],
        ),
        employment=EmploymentProfile(
            records=[EmploymentRecord(**r) for r in emp_data.get("records", [])],
        ),
        skills=SkillProfile(claimed_skills=skills_data.get("claimed_skills", [])),
        missing_info=[MissingInfo(**m) for m in data.get("missing_info", [])],
        processing_status="extracted",
    )
    return profile


def _parse_supervision(raw: dict) -> SupervisionRecord:
    """Normalise LLM supervision output to match schema literals."""
    role_map = {"main": "main", "co": "co-supervisor", "co-supervisor": "co-supervisor"}
    degree_map = {"phd": "PhD", "ms": "MS", "mphil": "MS", "msc": "MS"}
    role = role_map.get(str(raw.get("role", "main")).lower(), "main")
    degree = degree_map.get(str(raw.get("degree_level", "PhD")).lower(), "PhD")
    return SupervisionRecord(
        student_name=raw.get("student_name", "Unknown"),
        degree_level=degree,
        role=role,
        year_graduated=raw.get("year_graduated"),
        thesis_title=raw.get("thesis_title"),
    )
