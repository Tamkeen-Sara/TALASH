"""
PDF report generator using ReportLab.
Generates candidate assessment reports as downloadable PDFs.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from io import BytesIO
from backend.schemas.candidate import CandidateProfile


def generate_candidate_report(candidate: CandidateProfile) -> bytes:
    """Generate a single-candidate PDF report. Returns bytes."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    # Title
    story.append(Paragraph(f"TALASH Candidate Report", styles["Title"]))
    story.append(Paragraph(f"{candidate.full_name}", styles["Heading1"]))
    story.append(Spacer(1, 12))

    # Scores table
    score_data = [
        ["Dimension", "Score"],
        ["Education", f"{candidate.score_education or 'N/A'}"],
        ["Research", f"{candidate.score_research or 'N/A'}"],
        ["Employment", f"{candidate.score_employment or 'N/A'}"],
        ["Skills", f"{candidate.score_skills or 'N/A'}"],
        ["Supervision", f"{candidate.score_supervision or 'N/A'}"],
        ["TOTAL", f"{candidate.score_total or 'N/A'}"],
    ]
    t = Table(score_data, colWidths=[200, 100])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3557")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e8f0fe")),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))

    # Key Strengths
    if candidate.key_strengths:
        story.append(Paragraph("Key Strengths", styles["Heading2"]))
        for s in candidate.key_strengths:
            story.append(Paragraph(f"• {s}", styles["Normal"]))
        story.append(Spacer(1, 8))

    # Key Concerns
    if candidate.key_concerns:
        story.append(Paragraph("Key Concerns", styles["Heading2"]))
        for c in candidate.key_concerns:
            story.append(Paragraph(f"• {c}", styles["Normal"]))
        story.append(Spacer(1, 8))

    # Recommendation
    if candidate.recommendation:
        story.append(Paragraph(f"Recommendation: {candidate.recommendation}", styles["Heading2"]))

    doc.build(story)
    return buffer.getvalue()
