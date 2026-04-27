"""
Personalized Missing-Info Email Generator + Candidate Summary Generator
Uses Groq LLM to generate human-sounding emails and candidate summaries.
"""
from backend.schemas.candidate import CandidateProfile, MissingInfo
from backend.config import settings
from backend.utils.groq_client import groq_chat


async def draft_missing_info_email(candidate: CandidateProfile) -> str:
    if not candidate.missing_info:
        return ""

    missing_list = "\n".join(
        f"- {m.section}: {m.field} ({m.severity})"
        for m in candidate.missing_info
    )

    prompt = f"""Write a polite, professional email to {candidate.full_name} requesting missing information from their CV.

Missing information:
{missing_list}

Requirements:
- Address them by name
- Be specific about what is missing and why it matters for the evaluation
- Sound human-written, not robotic
- Keep it under 200 words
- Do not mention the scoring system
- Sign off as "The Recruitment Committee"
"""

    response = await groq_chat(
        model=settings.reasoning_model,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content.strip()


async def generate_candidate_summary(candidate: CandidateProfile) -> dict:
    """
    Generate a concise candidate summary with key strengths, concerns,
    a suitability recommendation, and a narrative assessment.
    Returns dict with keys: strengths, concerns, recommendation, justification.
    """
    edu  = candidate.education
    res  = candidate.research
    emp  = candidate.employment

    highest_degree = max(
        (d.level for d in (edu.degrees or [])),
        key=lambda l: {"PhD": 4, "MS": 3, "MPhil": 3, "MBA": 2, "BS": 1, "BSc": 1, "BE": 1, "Other": 0}.get(l, 0),
        default="Unknown"
    )

    context = f"""Candidate: {candidate.full_name}
Highest Degree: {highest_degree}
Education Score: {candidate.score_education or edu.education_score or 0}/100
Research Score: {candidate.score_research or res.research_score or 0}/100
Employment Score: {candidate.score_employment or emp.employment_score or 0}/100
Total Score: {candidate.score_total or 0}/100

Publications: {len(res.journal_papers or [])} journal papers, {len(res.conference_papers or [])} conference papers
Q1 Papers: {res.q1_count or 0} | H-Index: {res.h_index or 0} | Predatory: {res.predatory_count or 0}
Books: {len(res.books or [])} | Patents: {len(res.patents or [])}
Supervision: {len(res.supervision or [])} students supervised

Employment Records: {len(emp.records or [])}
Employment Gaps: {len(emp.gaps or [])} detected
Job Overlaps Flagged: {sum(1 for o in (emp.overlaps or []) if o.get('flagged', False))}

Education Gaps: {edu.score_breakdown.get('unjustified_gaps', 0)} unjustified
University Rankings: {[f"{d.institution} (QS {d.qs_rank or 'Unranked'})" for d in (edu.degrees or [])[:3]]}
Missing Info Items: {len(candidate.missing_info or [])}"""

    prompt = f"""You are evaluating a faculty candidate for a university position. Based on the data below, provide a structured assessment.

{context}

Respond in this exact JSON format:
{{
  "recommendation": "Strong" | "Conditional" | "Weak",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "concerns": ["concern 1", "concern 2"],
  "justification": "2-3 sentence narrative summary of the candidate's overall suitability."
}}

Base your recommendation on: Strong = highly suitable, Conditional = suitable with reservations, Weak = significant gaps.
Only return valid JSON, no other text."""

    try:
        response = await groq_chat(
            model=settings.reasoning_model,
            max_tokens=512,
            temperature=0.3,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}]
        )
        import json
        data = json.loads(response.choices[0].message.content.strip())
        return {
            "recommendation":  data.get("recommendation", "Conditional"),
            "strengths":       data.get("strengths", []),
            "concerns":        data.get("concerns", []),
            "justification":   data.get("justification", ""),
        }
    except Exception:
        return {
            "recommendation": "Conditional",
            "strengths": [],
            "concerns": [],
            "justification": "",
        }

