"""
Multi-CV PDF Splitter — LLM-based boundary detection.

Production approach: extract all page texts, send to LLM in a single call,
ask it to identify which pages start a new candidate's CV.

Why LLM instead of heuristics:
  Heuristic patterns (email, phone, keywords) are inherently fragile:
  - Multi-page CVs repeat section headers ("Education", "Experience") on every page
  - Many CVs omit email/phone entirely
  - Application form CVs (NUST, HEC) have unique structures
  The LLM understands context and intent regardless of format or language.

Fallback: if the LLM call fails, treat the whole file as one CV and let
the preprocessor extract whatever it can. Never crash silently.
"""
import asyncio
import json
import re
import uuid
from pathlib import Path

import fitz  # PyMuPDF


def _page_snippet(text: str) -> str:
    """
    Return a representative excerpt for boundary detection.
    Uses the first 600 chars — enough to see identity signals on a cover page
    without drowning the LLM in body text.
    """
    return text[:600].strip()


async def _detect_cv_boundaries(pages_text: list[str]) -> list[int]:
    """
    Ask the LLM which pages (0-indexed) start a new CV.
    Returns a sorted list of page indices; index 0 is always included.

    Design rationale:
    - We send the first 600 chars of every page in a single LLM call.
    - The prompt explicitly distinguishes "new identity" from "continuation":
      references sections, mid-section pages, and acknowledgments all list
      other people's names but are NOT new CVs.
    - A references page almost always starts with the word "References" or
      "[1] Author..." — the LLM recognizes this as a continuation.
    - This single-call approach is cheaper and more consistent than per-page
      classification because the LLM sees global context (it can compare all
      pages simultaneously and catch subtle identity shifts).
    """
    from backend.utils.groq_client import groq_chat
    from backend.config import settings

    if len(pages_text) <= 1:
        return [0]

    page_summaries = "\n\n".join(
        f"=== PAGE {i + 1} ===\n{_page_snippet(text)}"
        for i, text in enumerate(pages_text)
    )

    prompt = f"""You are analyzing a PDF file that may contain one or more academic CVs concatenated together.

Below are the first ~600 characters of each page ({len(pages_text)} pages total).

{page_summaries}

TASK: Return a JSON array of page numbers (1-indexed) where a NEW candidate's CV begins.

RULES — apply carefully:
1. Page 1 always starts the first CV — always include 1.
2. A new CV starts ONLY when there is strong evidence of a COMPLETELY DIFFERENT person:
   - A new person's full name prominently displayed at the top (as a CV header)
   - New personal contact information (email, phone, address) for a different person
   - A new personal statement, career objective, or profile summary for a different person
3. These are CONTINUATION pages of the same CV — do NOT mark them as new CV starts:
   - Pages that begin with section headings: "References", "Bibliography", "Publications", "Education", "Experience", "Skills", "Research", "Projects", "Achievements", "Awards"
   - Pages that begin with numbered/bulleted items, tables, or mid-paragraph text
   - Pages with acknowledgments or supervision records listing co-workers or students
4. CRITICAL — names in these contexts are NOT new candidates:
   - Names listed in a References / Bibliography section (e.g. "[1] Smith, J. et al...")
   - Co-authors in a publications list
   - Names of supervised students ("PhD students: Ahmad, 2020")
   - Names after "Co-supervised with" or "Collaborators:"
5. If the entire PDF belongs to a single candidate, return [1].

Examples:
  • Single 3-page CV → [1]
  • Two CVs, first 3 pages then next 3 pages → [1, 4]
  • Three CVs: pages 1-2, 3, 4-6 → [1, 3, 4]

Respond with ONLY a valid JSON array of integers. No explanation, no extra text."""

    try:
        response = await groq_chat(
            model=settings.extraction_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=150,
        )
        raw = response.choices[0].message.content.strip()
        m = re.search(r"\[[\d,\s]+\]", raw)
        if not m:
            print(f"[pdf_splitter] LLM returned unparseable response: {raw!r} — treating as single CV.")
            return [0]
        boundaries_1indexed = json.loads(m.group())
        n = len(pages_text)
        boundaries = sorted({b - 1 for b in boundaries_1indexed if 1 <= b <= n})
        if 0 not in boundaries:
            boundaries = [0] + boundaries
        return boundaries
    except Exception as e:
        print(f"[pdf_splitter] LLM boundary detection failed: {e} — treating as single CV.")
        return [0]


def split_pdf_into_cvs(
    pdf_path: str,
    output_dir: str = "data/cvs",
) -> list[str]:
    """
    Split a multi-CV PDF into individual CV PDFs using LLM-based boundary detection.
    Runs the async detection inside a new event loop so it works from a thread executor.

    Returns:
        List of paths to the individual CV PDF files.
        Returns [pdf_path] (unchanged) if only one CV is detected or on any error.
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    try:
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
    except Exception as e:
        print(f"[pdf_splitter] Could not open PDF: {e}")
        return [pdf_path]

    if total_pages <= 1:
        doc.close()
        return [pdf_path]

    # Extract text from every page
    pages_text = []
    for i in range(total_pages):
        try:
            pages_text.append(doc[i].get_text())
        except Exception:
            pages_text.append("")

    # Run async LLM detection — this function is called from run_in_executor
    # so we need a fresh event loop
    try:
        loop = asyncio.new_event_loop()
        boundaries = loop.run_until_complete(_detect_cv_boundaries(pages_text))
        loop.close()
    except Exception as e:
        print(f"[pdf_splitter] Boundary detection error: {e} — treating as single CV.")
        doc.close()
        return [pdf_path]

    print(f"[pdf_splitter] LLM detected {len(boundaries)} CV(s) starting at pages: "
          f"{[b + 1 for b in boundaries]}")

    # If only one boundary found, no split needed
    if len(boundaries) == 1:
        doc.close()
        return [pdf_path]

    # Split the PDF at detected boundaries
    boundaries_with_sentinel = boundaries + [total_pages]
    output_paths = []

    for i in range(len(boundaries_with_sentinel) - 1):
        start = boundaries_with_sentinel[i]
        end   = boundaries_with_sentinel[i + 1]
        try:
            cv_doc = fitz.open()
            cv_doc.insert_pdf(doc, from_page=start, to_page=end - 1)
            out_path = f"{output_dir}/split_{uuid.uuid4().hex[:8]}_cv{i + 1}.pdf"
            cv_doc.save(out_path)
            cv_doc.close()
            output_paths.append(out_path)
            print(f"[pdf_splitter] CV {i + 1}: pages {start + 1}–{end} → {out_path}")
        except Exception as e:
            print(f"[pdf_splitter] Failed to write CV {i + 1}: {e}")

    doc.close()

    if not output_paths:
        return [pdf_path]

    print(f"[pdf_splitter] Split {total_pages} pages into {len(output_paths)} CVs.")
    return output_paths
