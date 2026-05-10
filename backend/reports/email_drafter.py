"""
Personalized Missing-Info Email Generator + Candidate Summary Generator
+ Interview Question Generator + Research Trajectory Predictor
+ CV Quality Score + Comparison Narrative

All LLM calls use Groq (llama-3.3-70b-versatile).
"""
import json
from backend.schemas.candidate import CandidateProfile, MissingInfo
from backend.config import settings
from backend.utils.groq_client import groq_chat


def _fallback_candidate_summary(candidate: CandidateProfile) -> dict:
    edu = candidate.education
    res = candidate.research
    emp = candidate.employment

    score_total = candidate.score_total or 0
    paper_count = len(res.journal_papers or []) + len(res.conference_papers or [])
    degree_count = len(edu.degrees or [])
    h_index = res.h_index or 0
    recommendations = (
        "Strong" if score_total >= 75 or (paper_count >= 5 and h_index >= 10)
        else "Conditional" if score_total >= 50 or paper_count >= 2
        else "Weak"
    )

    strengths = []
    if paper_count:
        strengths.append(f"Has {paper_count} verified publication{'s' if paper_count != 1 else ''}.")
    if h_index:
        strengths.append(f"Research impact is measurable with an H-index of {h_index}.")
    if degree_count:
        strengths.append(f"Education profile includes {degree_count} degree{'s' if degree_count != 1 else ''}.")
    if emp.records:
        strengths.append(f"Employment history includes {len(emp.records)} role{'s' if len(emp.records) != 1 else ''}.")

    if not strengths:
        strengths = ["Profile parsed successfully and can be reviewed further."]

    concerns = []
    if not paper_count:
        concerns.append("No verified publications were extracted from the CV.")
    if not (candidate.email or candidate.phone):
        concerns.append("Contact information is incomplete.")
    if not emp.records:
        concerns.append("Employment history is sparse or missing.")
    if not edu.degrees:
        concerns.append("Education details are limited.")

    if not concerns:
        concerns = ["No major structural issues detected in the parsed profile."]

    justification = (
        f"This candidate presents a {recommendations.lower()} profile with {paper_count} publication"
        f"{'s' if paper_count != 1 else ''} and a total score of {score_total:.1f}/100. "
        f"The record suggests a {('well-verified' if h_index or paper_count else 'partially parsed')} academic profile that can be reviewed further."
    )

    return {
        "recommendation": recommendations,
        "strengths": strengths[:3],
        "concerns": concerns[:2],
        "justification": justification,
    }


def _fallback_research_trajectory(candidate: CandidateProfile) -> str:
    res = candidate.research
    clusters = res.topic_clusters or []
    trend = res.topic_trend or []
    total_pubs = len(res.journal_papers or []) + len(res.conference_papers or [])
    dominant = res.dominant_topic or (clusters[0]["domain"] if clusters else None)
    diversity = res.topic_diversity_score

    if clusters:
        lead = clusters[0]
        if trend:
            last = trend[-1]
            return (
                f"The publication record suggests continued growth in {dominant or lead['domain']}, "
                f"with the strongest cluster centered on {lead['domain']} and a measured shift toward "
                f"{last['dominant_domain']} in the latest window. With {total_pubs} publications and an H-index of {res.h_index or 0}, "
                f"the researcher is likely to keep working on technically specific problems in this area, especially where the current themes overlap with applied systems or methods."
            )
        return (
            f"The researcher appears to be consolidating work around {dominant or lead['domain']}. "
            f"The portfolio is led by {lead['domain']} and shows {diversity if diversity is not None else 'moderate'} topical breadth across {len(clusters)} themes. "
            f"With {total_pubs} publications, the next stage is likely to stay within the same research lane while extending the methods into adjacent application domains."
        )

    if total_pubs:
        return (
            f"The publication record indicates an emerging research profile with {total_pubs} papers, but the topic clustering signal is too sparse for a fine-grained prediction. "
            f"The trajectory is most likely to consolidate around the candidate's established publication areas as more papers are added."
        )

    return "No research trajectory could be inferred because no publication record was available."


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
    except Exception as e:
        print(f"[candidate_summary] Falling back for {candidate.full_name}: {e}")
        return _fallback_candidate_summary(candidate)


# ── CV Quality Score (formula — no LLM) ──────────────────────────────────────

def compute_cv_quality_score(candidate: CandidateProfile) -> float:
    """
    Objective, formula-based quality score (0–100) across three dimensions:

    Completeness (40 pts) — are the key CV sections present?
    Verifiability (40 pts) — could the system independently confirm stated facts?
    Integrity     (20 pts) — absence of red flags (predatory venues, unexplained gaps)

    No LLM involved — runs instantly after all verifiers have completed.
    """
    score = 0.0
    edu   = candidate.education
    res   = candidate.research
    emp   = candidate.employment

    degrees  = edu.degrees  or []
    journals = res.journal_papers    or []
    confs    = res.conference_papers or []

    # ── Completeness (40 pts) ─────────────────────────────────────────────────
    if candidate.email or candidate.phone:
        score += 8                               # contact info present
    if degrees:
        score += 6                               # at least one degree
    if any(d.cgpa or d.percentage for d in degrees):
        score += 6                               # academic marks on file
    if journals or confs:
        score += 8                               # has publications
    if emp.records:
        score += 6                               # employment history present
    if candidate.skills.claimed_skills:
        score += 6                               # skills section filled

    # ── Verifiability (40 pts) ────────────────────────────────────────────────
    # Journals — fraction that were resolved beyond "unverified"
    if journals:
        verified_j = sum(1 for p in journals
                         if p.verification_source and p.verification_source != "unverified")
        score += (verified_j / len(journals)) * 15
    else:
        score += 15   # no journals to verify — neutral

    # Conferences — fraction with any CORE rank or Scimago quartile
    if confs:
        verified_c = sum(1 for p in confs
                         if p.core_rank or p.scimago_quartile or p.venue_quality_tier)
        score += (verified_c / len(confs)) * 10
    else:
        score += 10   # neutral

    # Institution recognized by HEC / ROR
    if any(getattr(d, "hec_recognized", False) for d in degrees):
        score += 10

    # Academic profile independently confirmed online
    if candidate.orcid_id or candidate.openalex_author_id:
        score += 5

    # ── Integrity (20 pts) ────────────────────────────────────────────────────
    # Predatory penalty: -3 per predatory paper, floor 0
    pred = res.predatory_count or 0
    score += max(0.0, 10.0 - pred * 3)

    # Unjustified education gaps: -2 per gap, floor 0
    unjustified = edu.score_breakdown.get("unjustified_gaps", 0) or 0
    score += max(0.0, 10.0 - unjustified * 2)

    return round(min(100.0, max(0.0, score)), 1)


# ── Interview Question Generator ──────────────────────────────────────────────

async def generate_interview_questions(candidate: CandidateProfile) -> list[dict]:
    """
    Generate 8 targeted interview questions using Groq:
      3 × strength  — probe and validate the candidate's strongest areas
      3 × gap       — directly address specific weaknesses or concerns
      2 × future    — explore research plans and teaching vision

    Returns list[dict] with keys: question, category, rationale
    """
    res = candidate.research
    emp = candidate.employment

    total_papers  = len(res.journal_papers or []) + len(res.conference_papers or [])
    top_papers    = sorted(
        (res.journal_papers or []),
        key=lambda p: (p.wos_quartile == "Q1", p.citation_count or 0),
        reverse=True
    )[:3]
    paper_lines   = "\n".join(
        f"  - {p.title[:80]} ({p.resolved_journal_name or p.journal_name}, {p.wos_quartile or 'Unranked'})"
        for p in top_papers
    ) or "  None listed"

    context = f"""Candidate: {candidate.full_name}
Research Score: {candidate.score_research or 0}/100 | Education: {candidate.score_education or 0}/100
Employment Score: {candidate.score_employment or 0}/100 | Supervision: {candidate.score_supervision or 0}/100
H-Index: {res.h_index or 0} | Q1 Papers: {res.q1_count or 0} | Total Papers: {total_papers}
Dominant Research Area: {res.dominant_topic or 'Unknown'}
Predatory Papers: {res.predatory_count or 0}
Employment Gaps Flagged: {len(emp.gaps or [])}
Recommendation: {candidate.recommendation or 'Conditional'}
Key Strengths: {', '.join(candidate.key_strengths[:3]) if candidate.key_strengths else 'None identified'}
Key Concerns: {', '.join(candidate.key_concerns[:3]) if candidate.key_concerns else 'None identified'}

Top Publications:
{paper_lines}"""

    prompt = f"""You are a faculty hiring committee preparing for an interview with a specific candidate.

{context}

Generate exactly 8 targeted interview questions for this specific candidate.

Return ONLY this JSON object:
{{"questions": [
  {{"question": "...", "category": "strength", "rationale": "one sentence why this question matters for this candidate"}},
  ...
]}}

Distribution: exactly 3 "strength", exactly 3 "gap", exactly 2 "future".
- strength: probe depth and validate their best areas (cite specifics from their profile)
- gap: directly address the concerns listed above (be direct, not generic)
- future: explore research direction and teaching contributions to the department
Questions must be specific to this candidate — no generic PhD interview questions."""

    try:
        response = await groq_chat(
            model=settings.reasoning_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=900,
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content.strip())
        questions = data.get("questions", [])
        # Validate structure
        valid = [
            q for q in questions
            if isinstance(q, dict) and q.get("question") and q.get("category") and q.get("rationale")
        ]
        return valid[:8]
    except Exception as e:
        print(f"[interview_questions] Failed for {candidate.full_name}: {e}")
        return []


# ── Research Trajectory Predictor ────────────────────────────────────────────

async def generate_research_trajectory(candidate: CandidateProfile) -> str:
    """
    Generate a 120-150 word narrative predicting the candidate's future research
    direction based on their topic cluster distribution and temporal trend.
    Returns empty string if no topic data is available.
    """
    res     = candidate.research
    clusters = res.topic_clusters or []
    trend    = res.topic_trend    or []

    if not clusters:
        return _fallback_research_trajectory(candidate)

    theme_lines = "\n".join(
        f"  {c['domain']} — {c['count']} papers ({c['percentage']}%)"
        for c in clusters[:6]
    )
    trend_lines = "\n".join(
        f"  {t['period']}: {t['dominant_domain']} ({t['count']} papers)"
        for t in trend
    ) if trend else "  Insufficient data for temporal trend"

    prompt = f"""You are analyzing a researcher's publication record to predict their future direction.

Researcher: {candidate.full_name}
Dominant Research Area: {res.dominant_topic or 'Unknown'}
Research Diversity Score: {('N/A' if res.topic_diversity_score is None else f'{res.topic_diversity_score:.2f}')} (0=deep specialist, 1=broad generalist)
H-Index: {res.h_index or 0} | Total Publications: {len(res.journal_papers or []) + len(res.conference_papers or [])}

Publication Theme Distribution:
{theme_lines}

Research Trend Over Time:
{trend_lines}

Write exactly 120-150 words predicting this researcher's likely future research direction.
Be technically specific — name actual research areas, methods, and application domains.
Base it strictly on the trajectory shown above. Third person. No bullet points. No headers."""

    try:
        response = await groq_chat(
            model=settings.reasoning_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=300,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"[research_trajectory] Failed for {candidate.full_name}: {e}")
        return _fallback_research_trajectory(candidate)


# ── Comparison Narrative ──────────────────────────────────────────────────────

async def generate_comparison_narrative(candidates: list[CandidateProfile]) -> str:
    """
    Generate a 200-word comparative analysis of 2–4 candidates using Groq.
    Identifies the strongest candidate and explains why.
    """
    if len(candidates) < 2:
        return ""

    ranked = sorted(candidates, key=lambda c: c.score_total or 0, reverse=True)

    candidate_blocks = []
    for c in ranked:
        res = c.research
        block = (
            f"{c.full_name} (Total: {c.score_total or 0:.1f}/100)\n"
            f"  Research {c.score_research or 0} | Education {c.score_education or 0} | "
            f"Employment {c.score_employment or 0} | Skills {c.score_skills or 0}\n"
            f"  H-Index: {res.h_index or 0} | Q1 Papers: {res.q1_count or 0} | "
            f"Predatory: {res.predatory_count or 0}\n"
            f"  Dominant Area: {res.dominant_topic or 'N/A'}\n"
            f"  Recommendation: {c.recommendation or 'Conditional'}\n"
            f"  Strengths: {'; '.join(c.key_strengths[:2]) if c.key_strengths else 'N/A'}\n"
            f"  Concerns:  {'; '.join(c.key_concerns[:2]) if c.key_concerns else 'N/A'}"
        )
        candidate_blocks.append(block)

    prompt = f"""You are the chair of a faculty hiring committee. You have reviewed {len(ranked)} candidates:

{chr(10).join(candidate_blocks)}

Write a 180-220 word comparative analysis covering:
1. Why {ranked[0].full_name} leads the field — be specific about their measurable advantages
2. How the candidates differ in research quality, depth, and breadth
3. Notable strengths or red flags for the second-ranked candidate
4. A clear, actionable hiring recommendation

Professional prose, third person, no bullet points, no headers."""

    try:
        response = await groq_chat(
            model=settings.reasoning_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.35,
            max_tokens=450,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"[comparison_narrative] Failed: {e}")
        return ""

