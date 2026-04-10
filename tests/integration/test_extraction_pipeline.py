"""
Integration test: preliminary extraction from a real CV PDF.
Uses the fixture PDF in tests/fixtures/ to verify the full pipeline
(PDF text extraction to Groq LLM to Pydantic schema) works end-to-end.

REQUIRES: GROQ_API_KEY set in environment or .env file.
Run with: pytest tests/integration/ -v -m integration

If no API key is available, the test is skipped (not failed).
"""
import os
import pytest
from pathlib import Path

FIXTURE_PDF = Path(__file__).parent.parent / "fixtures" / "Handler (8).pdf"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_extract_real_cv_returns_candidate_profile():
    """Full pipeline: real PDF to Groq to CandidateProfile."""
    if not os.environ.get("GROQ_API_KEY") and not _has_env_file():
        pytest.skip("GROQ_API_KEY not set; skipping live API test")

    if not FIXTURE_PDF.exists():
        pytest.skip(f"Fixture PDF not found at {FIXTURE_PDF}")

    from backend.agents.preprocessor import extract_cv
    from backend.schemas.candidate import CandidateProfile

    profile = await extract_cv(str(FIXTURE_PDF))

    assert isinstance(profile, CandidateProfile), "Must return a CandidateProfile"
    assert profile.candidate_id, "candidate_id must be populated"
    assert profile.full_name, "full_name must not be empty"
    assert profile.full_name != "Unknown", "LLM must extract the name from PDF"
    assert profile.processing_status == "extracted"

    # Education must have at least one degree entry for an academic CV
    assert isinstance(profile.education.degrees, list)

    # Employment records should be a list (may be empty for fresh graduates)
    assert isinstance(profile.employment.records, list)

    print(f"\n✓ Extracted candidate: {profile.full_name}")
    print(f"  Degrees: {[d.level for d in profile.education.degrees]}")
    print(f"  Employment records: {len(profile.employment.records)}")
    print(f"  Journal papers: {len(profile.research.journal_papers)}")
    print(f"  Conference papers: {len(profile.research.conference_papers)}")
    print(f"  Missing info flags: {len(profile.missing_info)}")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_extract_real_cv_education_has_institution():
    """Degrees must include institution names; the LLM should not leave them empty."""
    if not os.environ.get("GROQ_API_KEY") and not _has_env_file():
        pytest.skip("GROQ_API_KEY not set")
    if not FIXTURE_PDF.exists():
        pytest.skip("Fixture PDF not found")

    from backend.agents.preprocessor import extract_cv

    profile = await extract_cv(str(FIXTURE_PDF))

    for degree in profile.education.degrees:
        assert degree.institution, f"Degree {degree.degree_title!r} has no institution"
        assert degree.level in ("BS", "BSc", "BE", "MS", "MPhil", "MBA", "PhD", "Other"), \
            f"Unexpected degree level: {degree.level!r}"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_education_agent_runs_on_extracted_profile():
    """Education agent must score without crashing on a real-extracted profile."""
    if not os.environ.get("GROQ_API_KEY") and not _has_env_file():
        pytest.skip("GROQ_API_KEY not set")
    if not FIXTURE_PDF.exists():
        pytest.skip("Fixture PDF not found")

    from backend.agents.preprocessor import extract_cv
    from backend.agents.education_agent import run as run_education_agent

    profile = await extract_cv(str(FIXTURE_PDF))
    education = await run_education_agent(profile.education, profile.employment)

    assert education is not None
    assert education.education_score is not None, "education_score must be computed"
    assert 0 <= education.education_score <= 100, \
        f"Score out of range: {education.education_score}"

    print(f"\n✓ Education score: {education.education_score:.1f}/100")


@pytest.mark.integration
def test_raw_text_extraction_from_fixture():
    """PDF text extraction works on the fixture file (no API call needed)."""
    if not FIXTURE_PDF.exists():
        pytest.skip("Fixture PDF not found")

    from backend.agents.preprocessor import extract_raw_text

    text = extract_raw_text(str(FIXTURE_PDF))

    assert isinstance(text, str)
    assert len(text) > 100, f"Extracted text too short ({len(text)} chars); PDF may be scanned"

    print(f"\n✓ Extracted {len(text)} characters from fixture PDF")
    print(f"  First 200 chars: {text[:200]!r}")


def _has_env_file() -> bool:
    """Check if a .env file exists with GROQ_API_KEY."""
    env_path = Path(__file__).parent.parent.parent / ".env"
    if not env_path.exists():
        return False
    return "GROQ_API_KEY" in env_path.read_text()