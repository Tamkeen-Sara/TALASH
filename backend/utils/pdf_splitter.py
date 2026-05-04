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
    1000 chars captures name + contact block + opening section heading even for
    dense academic CVs, while staying well within the per-page token budget.
    """
    return text[:1000].strip()


_MAX_PAGES_PER_BATCH = 20   # keep each LLM call well within any model's context window


async def _detect_boundaries_batch(pages_text: list[str], offset: int) -> list[int]:
    """
    Single LLM call for one batch of pages.
    Returns 0-indexed boundary positions relative to the whole document.
    """
    from backend.utils.groq_client import groq_chat
    from backend.config import settings

    page_summaries = "\n\n".join(
        f"=== PAGE {offset + i + 1} ===\n{_page_snippet(text)}"
        for i, text in enumerate(pages_text)
    )
    first_num = offset + 1
    last_num  = offset + len(pages_text)

    prompt = f"""You are analyzing pages {first_num}–{last_num} of a PDF that may contain one or more academic CVs concatenated together.

Below are the first ~1000 characters of each page.

{page_summaries}

TASK: Return a JSON array of page numbers (1-indexed, from page 1 of the whole document) where a NEW candidate's CV begins within pages {first_num}–{last_num}.

RULES — apply carefully:
1. A new CV starts ONLY when there is strong evidence of a COMPLETELY DIFFERENT person:
   - A new person's full name prominently displayed at the top (as a CV header)
   - New personal contact information (email, phone, address) for a different person
   - A new personal statement, career objective, or profile summary for a different person
2. These are CONTINUATION pages — do NOT mark them as new CV starts:
   - Pages beginning with section headings: "References", "Bibliography", "Publications", "Education", "Experience", "Skills", "Research", "Projects", "Achievements", "Awards"
   - Pages beginning with numbered/bulleted items, tables, or mid-paragraph text
   - Pages with co-author lists, supervised student lists, or acknowledgments
3. CRITICAL — names in these contexts are NOT new candidates:
   - Co-authors in a publications list
   - Names of supervised students
   - Names in a References / Bibliography section
4. If all pages in this range belong to the same candidate, return [].

Respond with ONLY a valid JSON array of integers (may be empty). No explanation, no extra text."""

    try:
        response = await groq_chat(
            model=settings.extraction_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=400,
        )
        raw = response.choices[0].message.content.strip()
        # Robust parser: grab all integers found between [ and ], handles truncation
        m = re.search(r"\[([^\]]*)", raw)
        numbers = [int(x) for x in re.findall(r"\d+", m.group(1))] if m else []
        n_total = offset + len(pages_text)
        return [b - 1 for b in numbers if first_num <= b <= n_total]
    except Exception as e:
        print(f"[pdf_splitter] Batch detection failed (offset={offset}): {e}")
        return []


async def _detect_cv_boundaries(pages_text: list[str]) -> list[int]:
    """
    Identify which pages (0-indexed) start a new CV.

    For PDFs ≤ 20 pages a single LLM call is used.
    For larger files batches of 20 pages are sent with a 2-page overlap at
    each seam so boundary pages are never missing from both adjacent calls.
    Page 0 is always a CV boundary.
    """
    if len(pages_text) <= 1:
        return [0]

    all_boundaries: set[int] = {0}

    if len(pages_text) <= _MAX_PAGES_PER_BATCH:
        found = await _detect_boundaries_batch(pages_text, offset=0)
        all_boundaries.update(found)
    else:
        step = _MAX_PAGES_PER_BATCH - 2          # 2-page overlap between batches
        i = 0
        while i < len(pages_text):
            batch = pages_text[i: i + _MAX_PAGES_PER_BATCH]
            found = await _detect_boundaries_batch(batch, offset=i)
            all_boundaries.update(found)
            i += step

    boundaries = sorted(all_boundaries)
    if 0 not in boundaries:
        boundaries = [0] + boundaries
    return boundaries


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
