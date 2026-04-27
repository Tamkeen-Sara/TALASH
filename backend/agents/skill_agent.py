"""
Module: Skill Alignment Engine
- LLM classifies each claimed CV skill as Strong / Partial / Weak / Unsupported
  based on evidence from job titles, job descriptions, and publication themes.
- When no skills section exists, infers skills from publications, employment, and education.
- JD alignment: if a job description is provided, compute an overall alignment score.
- Returns a SkillProfile with analyzed_skills and skills_score (0-100).
"""
import json
import asyncio
from backend.config import settings
from backend.schemas.candidate import SkillProfile, SkillRecord
from backend.utils.groq_client import groq_chat

_EVIDENCE_POINTS = {"Strong": 3, "Partial": 2, "Weak": 1, "Unsupported": 0}


def _build_context(employment_records: list, research_papers: list, degrees: list = []) -> str:
    """Summarize the candidate's evidence base for the LLM."""
    job_lines = []
    for r in employment_records[:8]:
        title = getattr(r, 'job_title', None) or "Unknown role"
        org   = getattr(r, 'organization', None) or ""
        raw   = getattr(r, 'raw_text', '') or ''
        resps = getattr(r, 'responsibilities', []) or []
        desc  = raw or "; ".join(resps[:3])
        job_lines.append(f"- {title} at {org}" + (f": {desc[:120]}" if desc else ""))

    pub_titles = [p.title for p in research_papers[:15] if p.title]

    deg_lines = []
    for d in degrees[:4]:
        title  = getattr(d, 'degree_title', '') or ''
        spec   = getattr(d, 'specialization', '') or ''
        inst   = getattr(d, 'institution', '') or ''
        if title:
            deg_lines.append(f"- {title}" + (f" ({spec})" if spec else "") + (f" — {inst}" if inst else ""))

    ctx = ""
    if deg_lines:
        ctx += "Degrees:\n" + "\n".join(deg_lines) + "\n\n"
    if job_lines:
        ctx += "Job roles held:\n" + "\n".join(job_lines) + "\n\n"
    if pub_titles:
        ctx += "Publication titles:\n" + "\n".join(f"- {t}" for t in pub_titles) + "\n\n"
    return ctx.strip()


async def _infer_skills(context: str, jd: str = "") -> list[SkillRecord]:
    """
    When the CV has no skills section, infer skills from publications,
    employment history, and education — classifying each at the same time.
    This avoids a second LLM call: inference + classification in one shot.
    """
    jd_block = f"\nJob Description (use to prioritize relevant skills):\n{jd[:400]}" if jd else ""

    prompt = f"""You are analyzing an academic candidate's profile to identify their technical and research skills.
The candidate's CV has NO explicit skills section. Infer their skills purely from the evidence below.

{context}
{jd_block}

TASK: Identify 6–15 specific skills this candidate demonstrably possesses based ONLY on the evidence above.
- Papers on "wireless sensor networks" → skills like "Wireless Sensor Networks", "Energy-Efficient Protocols"
- Papers on "machine learning" → "Machine Learning", "Neural Networks", "Deep Learning"
- Job title "Assistant Professor, CS" → "Teaching", "Curriculum Development"
- Degree in "Computer Engineering" → "Computer Architecture", "Embedded Systems"
- Do NOT invent skills with no evidence. Do NOT include generic non-skills like "teamwork" or "communication".
- Each skill name should be a concise phrase (1–4 words).

For EACH inferred skill, classify it immediately:
- "Strong": directly and explicitly evidenced (multiple papers on this topic, or job title names it)
- "Partial": indirectly evidenced (single mention, adjacent topic)
- "Weak": loosely implied, not explicitly stated

Return ONLY a JSON array — no extra keys, no wrapper object:
[
  {{"skill_name": "...", "evidence_level": "Strong|Partial|Weak", "evidence_source": "one sentence citing the specific paper/job/degree"}}
]"""

    resp = await groq_chat(
        model=settings.reasoning_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=1500,
        response_format={"type": "json_object"},
    )
    raw = resp.choices[0].message.content.strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            # unwrap {"skills": [...]} or any single-key wrapper
            parsed = next(iter(parsed.values()))
        records = []
        for item in parsed:
            level = item.get("evidence_level", "Weak")
            if level not in _EVIDENCE_POINTS:
                level = "Weak"
            name = (item.get("skill_name") or "").strip()
            if name:
                records.append(SkillRecord(
                    skill_name=name,
                    evidence_level=level,
                    evidence_source=item.get("evidence_source", ""),
                ))
        return records
    except Exception:
        return []


async def _classify_skills(
    claimed_skills: list[str],
    context: str,
    jd: str = "",
) -> list[SkillRecord]:
    """Ask LLM to classify each skill. Returns a list of SkillRecord."""
    if not claimed_skills:
        return []

    jd_block = f"\nJob Description to align with:\n{jd[:600]}" if jd else ""

    prompt = f"""You are evaluating a faculty job candidate.

Candidate's professional context:
{context or "No context available."}
{jd_block}

The candidate claims these skills:
{json.dumps(claimed_skills, indent=2)}

For EACH skill, classify it based on the evidence above:
- "Strong": the skill clearly appears in job roles AND/OR multiple publications
- "Partial": the skill appears in either job roles OR publications, but not both
- "Weak": the skill is tangentially related to the context but not explicitly evidenced
- "Unsupported": no evidence in the context supports this skill

Also write a one-sentence evidence_source explaining your classification.

Respond ONLY with a JSON array, one object per skill, in this exact format:
[
  {{"skill_name": "...", "evidence_level": "Strong|Partial|Weak|Unsupported", "evidence_source": "..."}}
]"""

    resp = await groq_chat(
        model=settings.reasoning_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=1200,
        response_format={"type": "json_object"},
    )

    raw = resp.choices[0].message.content.strip()
    try:
        parsed = json.loads(raw)
        # Handle both {"results": [...]} and plain [...]
        if isinstance(parsed, dict):
            parsed = next(iter(parsed.values()))
        records = []
        for item in parsed:
            level = item.get("evidence_level", "Unsupported")
            if level not in _EVIDENCE_POINTS:
                level = "Unsupported"
            records.append(SkillRecord(
                skill_name=item.get("skill_name", ""),
                evidence_level=level,
                evidence_source=item.get("evidence_source", ""),
            ))
        return records
    except Exception:
        # Fallback: mark all as Weak if LLM response is unparseable
        return [SkillRecord(skill_name=s, evidence_level="Weak", evidence_source="Could not verify.") for s in claimed_skills]


async def _jd_alignment_score(claimed_skills: list[str], analyzed: list[SkillRecord], jd: str) -> float:
    """Ask LLM for an overall JD alignment percentage."""
    if not jd or not claimed_skills:
        return 0.0

    strong_partial = [r.skill_name for r in analyzed if r.evidence_level in ("Strong", "Partial")]
    prompt = f"""A job description requires certain skills. A candidate has these evidenced skills: {json.dumps(strong_partial)}.

Job Description (excerpt):
{jd[:800]}

Give ONLY a JSON object: {{"alignment_score": <integer 0-100>}}
where 100 means the candidate's evidenced skills fully cover the JD requirements."""

    resp = await groq_chat(
        model=settings.reasoning_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        max_tokens=60,
        response_format={"type": "json_object"},
    )
    try:
        data = json.loads(resp.choices[0].message.content)
        return float(data.get("alignment_score", 0))
    except Exception:
        return 0.0


def _compute_skills_score(analyzed: list[SkillRecord]) -> tuple[float, dict]:
    """Convert evidence levels into a 0-100 score."""
    if not analyzed:
        return 0.0, {}

    counts = {"Strong": 0, "Partial": 0, "Weak": 0, "Unsupported": 0}
    total_points = 0
    for r in analyzed:
        level = r.evidence_level or "Unsupported"
        counts[level] = counts.get(level, 0) + 1
        total_points += _EVIDENCE_POINTS.get(level, 0)

    max_possible = len(analyzed) * 3  # all Strong
    raw_score = (total_points / max_possible * 100) if max_possible > 0 else 0

    # Bonus: cap at 100 and apply a slight boost if majority are Strong
    strong_ratio = counts["Strong"] / len(analyzed)
    bonus = min(10, strong_ratio * 10)
    score = min(100, raw_score + bonus)

    breakdown = {
        "strong_count":      counts["Strong"],
        "partial_count":     counts["Partial"],
        "weak_count":        counts["Weak"],
        "unsupported_count": counts["Unsupported"],
        "total_skills":      len(analyzed),
        "raw_score":         round(raw_score, 1),
    }
    return round(score, 1), breakdown


async def run(
    skill_profile: SkillProfile,
    employment_records: list,
    research_papers: list,
    jd: str = "",
    degrees: list = [],
) -> tuple[SkillProfile, float]:
    """
    Main entry point.
    Returns (updated SkillProfile, skills_score).

    If claimed_skills is empty, infers skills from publications, employment,
    and education degrees instead of returning a zero score.
    """
    claimed = skill_profile.claimed_skills
    context = _build_context(employment_records, research_papers, degrees)

    if not claimed:
        # No skills section — infer from available evidence
        if not context.strip():
            skill_profile.skills_score = 0.0
            return skill_profile, 0.0
        analyzed = await _infer_skills(context, jd)
        if not analyzed:
            skill_profile.skills_score = 0.0
            return skill_profile, 0.0
        # Populate claimed_skills so the UI shows the inferred list
        skill_profile.claimed_skills = [r.skill_name for r in analyzed]
    else:
        analyzed = await _classify_skills(claimed, context, jd)

    score, breakdown = _compute_skills_score(analyzed)
    jd_score = await _jd_alignment_score(skill_profile.claimed_skills, analyzed, jd) if jd else None

    skill_profile.analyzed_skills    = analyzed
    skill_profile.jd_alignment_score = jd_score
    skill_profile.skills_score       = score
    skill_profile.score_breakdown    = breakdown

    return skill_profile, score