"""
Multi-CV PDF Splitter
Detects CV boundaries in a single large PDF (e.g. a compiled applicant pack)
and splits it into individual CV PDFs.

Detection strategy:
  A new CV is considered to start on a page where at least 2 of these signals
  appear in the top 30% of the page text:
    1. Email address pattern
    2. Phone number pattern (Pakistani/international)
    3. Keywords: 'curriculum vitae', 'resume', 'cv', 'objective', 'summary'
    4. A standalone name-like header (short line, title-case, no punctuation)

Each split CV is saved as data/cvs/split_{n}.pdf and the list of paths returned.
"""
import re
import uuid
from pathlib import Path

import fitz  # PyMuPDF


# ─── Regex patterns ───────────────────────────────────────────────────────────
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_PHONE_RE = re.compile(
    r"(\+?92[\s\-]?|0)[0-9]{3}[\s\-]?[0-9]{7}"   # Pakistani
    r"|(\+?[0-9]{1,3}[\s\-]?)?[\(]?[0-9]{3}[\).\-\s]?[0-9]{3}[\-.\s]?[0-9]{4}"  # International
)
_CV_KEYWORDS = re.compile(
    r"\b(curriculum\s+vitae|resume|c\.v\.|objective|career\s+objective|"
    r"personal\s+statement|professional\s+summary|education|experience)\b",
    re.IGNORECASE
)
_NAME_LINE_RE = re.compile(r"^[A-Z][a-zA-Z\s\-\.]{2,40}$")


def _score_page_as_cv_start(page_text: str) -> int:
    """Return a signal score (0-4) for how likely this page starts a new CV."""
    # Only look at top 30% of text (roughly first third of lines)
    lines = [l.strip() for l in page_text.strip().splitlines() if l.strip()]
    top_lines = lines[:max(1, len(lines) // 3)]
    top_text = "\n".join(top_lines)

    score = 0
    if _EMAIL_RE.search(top_text):
        score += 1
    if _PHONE_RE.search(top_text):
        score += 1
    if _CV_KEYWORDS.search(top_text[:500]):
        score += 1
    # Short title-case line near the top (likely a name)
    for line in top_lines[:6]:
        if _NAME_LINE_RE.match(line) and len(line.split()) <= 5:
            score += 1
            break
    return score


def split_pdf_into_cvs(
    pdf_path: str,
    output_dir: str = "data/cvs",
    min_signal_score: int = 2,
) -> list[str]:
    """
    Split a multi-CV PDF into individual CV PDFs.

    Args:
        pdf_path: Path to the combined PDF file.
        output_dir: Directory where split CVs are saved.
        min_signal_score: Minimum signal score (0-4) to treat a page as a CV start.

    Returns:
        List of paths to the individual CV PDF files.
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    total_pages = len(doc)

    if total_pages == 0:
        doc.close()
        return []

    # Find boundary pages
    boundary_pages = [0]  # first page always starts a CV
    for page_num in range(1, total_pages):
        page = doc[page_num]
        text = page.get_text()
        score = _score_page_as_cv_start(text)
        if score >= min_signal_score:
            boundary_pages.append(page_num)

    boundary_pages.append(total_pages)  # sentinel

    # Extract each CV segment
    output_paths = []
    for i in range(len(boundary_pages) - 1):
        start = boundary_pages[i]
        end = boundary_pages[i + 1]

        cv_doc = fitz.open()
        cv_doc.insert_pdf(doc, from_page=start, to_page=end - 1)

        out_path = f"{output_dir}/split_{uuid.uuid4().hex[:8]}_cv{i+1}.pdf"
        cv_doc.save(out_path)
        cv_doc.close()
        output_paths.append(out_path)

    doc.close()
    print(f"[pdf_splitter] Split {total_pages} pages into {len(output_paths)} CVs.")
    return output_paths
