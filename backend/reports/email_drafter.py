"""
Personalized Missing-Info Email Generator
Uses Claude Sonnet to generate human-sounding emails per candidate.
"""
from groq import AsyncGroq
from backend.schemas.candidate import CandidateProfile, MissingInfo
from backend.config import settings

client = AsyncGroq(api_key=settings.groq_api_key)


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

    response = await client.chat.completions.create(
        model=settings.reasoning_model,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content.strip()
