"""Unit tests for Module 0: preprocessor.

Tests cover text extraction, JSON parsing, Pydantic mapping, and edge cases.
All LLM calls are mocked, so no real API calls are made.
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path

from backend.agents.preprocessor import (
    extract_raw_text,
    extract_cv,
    _parse_supervision,
)
from backend.schemas.candidate import CandidateProfile
from backend.schemas.research import SupervisionRecord

# ---------------------------------------------------------------------------
# Fixture: minimal valid LLM response for a typical academic CV
# ---------------------------------------------------------------------------
SAMPLE_LLM_RESPONSE = {
    "full_name": "Dr. Ayesha Khan",
    "email": "ayesha.khan@example.com",
    "phone": "+92-300-1234567",
    "education": {
        "sse": {"percentage": 85.5, "board": "FBISE", "year": 2008, "grade": "A", "raw_text": "SSE 85.5%"},
        "hse": {"percentage": 88.0, "board": "FBISE", "year": 2010, "grade": "A", "raw_text": "HSE 88%"},
        "degrees": [
            {
                "degree_title": "Bachelor of Science in Computer Science",
                "level": "BSc",
                "specialization": "Computer Science",
                "institution": "NUST",
                "cgpa": 3.7,
                "cgpa_scale": 4.0,
                "percentage": None,
                "start_year": 2010,
                "end_year": 2014,
                "is_ongoing": False,
                "raw_text": "BSc CS NUST 3.7/4.0"
            },
            {
                "degree_title": "Doctor of Philosophy",
                "level": "PhD",
                "specialization": "Machine Learning",
                "institution": "University of Toronto",
                "cgpa": None,
                "cgpa_scale": None,
                "percentage": None,
                "start_year": 2015,
                "end_year": 2020,
                "is_ongoing": False,
                "raw_text": "PhD ML University of Toronto"
            }
        ]
    },
    "research": {
        "journal_papers": [
            {
                "title": "Deep Learning for Medical Imaging",
                "journal_name": "IEEE Transactions on Medical Imaging",
                "year": 2022,
                "doi": "10.1109/TMI.2022.123456",
                "issn": "0278-0062",
                "authors": ["Ayesha Khan", "John Smith"],
                "candidate_position": 1,
                "is_corresponding": True
            }
        ],
        "conference_papers": [
            {
                "title": "Attention Mechanisms in NLP",
                "conference_name": "International Conference on Machine Learning",
                "year": 2021,
                "authors": ["Ayesha Khan", "Ali Raza"],
                "candidate_position": 1,
                "is_corresponding": False,
                "proceedings_publisher": "PMLR",
                "conference_edition": "38th"
            }
        ],
        "books": [
            {
                "title": "Applied Deep Learning",
                "authors": ["Ayesha Khan"],
                "isbn": "978-3-16-148410-0",
                "publisher": "Springer",
                "year": 2023,
                "online_link": None,
                "candidate_role": "sole"
            }
        ],
        "patents": [
            {
                "patent_number": "US10123456B2",
                "title": "Method for Medical Image Segmentation",
                "date": "2023-05-15",
                "inventors": ["Ayesha Khan", "John Smith"],
                "country": "US",
                "online_link": None,
                "candidate_role": "lead"
            }
        ],
        "supervision": [
            {
                "student_name": "Bilal Ahmed",
                "degree_level": "PhD",
                "role": "main",
                "year_graduated": 2023,
                "thesis_title": "Deep Neural Networks for Drug Discovery"
            },
            {
                "student_name": "Sara Malik",
                "degree_level": "MS",
                "role": "co",
                "year_graduated": 2022,
                "thesis_title": None
            }
        ]
    },
    "employment": {
        "records": [
            {
                "job_title": "Assistant Professor",
                "organization": "NUST",
                "employment_type": "full-time",
                "start_year": 2020,
                "start_month": 9,
                "end_year": None,
                "end_month": None,
                "is_current": True,
                "responsibilities": ["Teaching ML courses", "Supervising PhD students"],
                "raw_text": "Assistant Professor at NUST since Sep 2020"
            }
        ]
    },
    "skills": {
        "claimed_skills": ["Python", "PyTorch", "TensorFlow", "Deep Learning", "NLP"]
    },
    "missing_info": [
        {"field": "h_index", "section": "research", "severity": "important"}
    ]
}


def _make_mock_response(content: dict) -> MagicMock:
    """Build a mock Groq API response object."""
    msg = MagicMock()
    msg.content = json.dumps(content)
    choice = MagicMock()
    choice.message = msg
    response = MagicMock()
    response.choices = [choice]
    return response


# ---------------------------------------------------------------------------
# Tests: _parse_supervision
# ---------------------------------------------------------------------------
class TestParseSupervision:
    def test_main_phd(self):
        rec = _parse_supervision({"student_name": "Ali", "degree_level": "PhD", "role": "main"})
        assert rec.role == "main"
        assert rec.degree_level == "PhD"

    def test_co_supervisor_normalised(self):
        rec = _parse_supervision({"student_name": "Sara", "degree_level": "MS", "role": "co"})
        assert rec.role == "co-supervisor"
        assert rec.degree_level == "MS"

    def test_mphil_mapped_to_ms(self):
        rec = _parse_supervision({"student_name": "Usman", "degree_level": "MPhil", "role": "main"})
        assert rec.degree_level == "MS"

    def test_unknown_degree_defaults_phd(self):
        rec = _parse_supervision({"student_name": "X", "degree_level": "Diploma", "role": "main"})
        assert rec.degree_level == "PhD"

    def test_thesis_title_preserved(self):
        rec = _parse_supervision({
            "student_name": "Test",
            "degree_level": "PhD",
            "role": "main",
            "thesis_title": "AI in Healthcare",
            "year_graduated": 2023,
        })
        assert rec.thesis_title == "AI in Healthcare"
        assert rec.year_graduated == 2023


# ---------------------------------------------------------------------------
# Tests: extract_cv (LLM mocked)
# ---------------------------------------------------------------------------
class TestExtractCV:
    @pytest.mark.asyncio
    async def test_returns_candidate_profile(self, tmp_path):
        dummy_pdf = tmp_path / "test_cv.pdf"
        dummy_pdf.write_bytes(b"%PDF-1.4 dummy content for testing purposes only")

        mock_resp = _make_mock_response(SAMPLE_LLM_RESPONSE)

        with patch("backend.agents.preprocessor.extract_raw_text", return_value="Fake CV text with enough content for extraction"):
            with patch("backend.agents.preprocessor.client") as mock_client:
                mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)
                profile = await extract_cv(str(dummy_pdf))

        assert isinstance(profile, CandidateProfile)

    @pytest.mark.asyncio
    async def test_full_name_extracted(self, tmp_path):
        dummy_pdf = tmp_path / "test_cv.pdf"
        dummy_pdf.write_bytes(b"%PDF dummy")
        mock_resp = _make_mock_response(SAMPLE_LLM_RESPONSE)

        with patch("backend.agents.preprocessor.extract_raw_text", return_value="CV text"):
            with patch("backend.agents.preprocessor.client") as mock_client:
                mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)
                profile = await extract_cv(str(dummy_pdf))

        assert profile.full_name == "Dr. Ayesha Khan"
        assert profile.email == "ayesha.khan@example.com"

    @pytest.mark.asyncio
    async def test_education_degrees_populated(self, tmp_path):
        dummy_pdf = tmp_path / "cv.pdf"
        dummy_pdf.write_bytes(b"%PDF dummy")
        mock_resp = _make_mock_response(SAMPLE_LLM_RESPONSE)

        with patch("backend.agents.preprocessor.extract_raw_text", return_value="CV"):
            with patch("backend.agents.preprocessor.client") as mock_client:
                mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)
                profile = await extract_cv(str(dummy_pdf))

        assert len(profile.education.degrees) == 2
        assert profile.education.degrees[0].level == "BSc"
        assert profile.education.degrees[1].level == "PhD"
        assert profile.education.degrees[0].institution == "NUST"

    @pytest.mark.asyncio
    async def test_employment_records_populated(self, tmp_path):
        dummy_pdf = tmp_path / "cv.pdf"
        dummy_pdf.write_bytes(b"%PDF dummy")
        mock_resp = _make_mock_response(SAMPLE_LLM_RESPONSE)

        with patch("backend.agents.preprocessor.extract_raw_text", return_value="CV"):
            with patch("backend.agents.preprocessor.client") as mock_client:
                mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)
                profile = await extract_cv(str(dummy_pdf))

        assert len(profile.employment.records) == 1
        assert profile.employment.records[0].job_title == "Assistant Professor"
        assert profile.employment.records[0].is_current is True

    @pytest.mark.asyncio
    async def test_research_papers_populated(self, tmp_path):
        dummy_pdf = tmp_path / "cv.pdf"
        dummy_pdf.write_bytes(b"%PDF dummy")
        mock_resp = _make_mock_response(SAMPLE_LLM_RESPONSE)

        with patch("backend.agents.preprocessor.extract_raw_text", return_value="CV"):
            with patch("backend.agents.preprocessor.client") as mock_client:
                mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)
                profile = await extract_cv(str(dummy_pdf))

        assert len(profile.research.journal_papers) == 1
        assert profile.research.journal_papers[0].title == "Deep Learning for Medical Imaging"
        assert len(profile.research.conference_papers) == 1

    @pytest.mark.asyncio
    async def test_books_and_patents_populated(self, tmp_path):
        dummy_pdf = tmp_path / "cv.pdf"
        dummy_pdf.write_bytes(b"%PDF dummy")
        mock_resp = _make_mock_response(SAMPLE_LLM_RESPONSE)

        with patch("backend.agents.preprocessor.extract_raw_text", return_value="CV"):
            with patch("backend.agents.preprocessor.client") as mock_client:
                mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)
                profile = await extract_cv(str(dummy_pdf))

        assert len(profile.research.books) == 1
        assert profile.research.books[0].isbn == "978-3-16-148410-0"
        assert len(profile.research.patents) == 1
        assert profile.research.patents[0].patent_number == "US10123456B2"

    @pytest.mark.asyncio
    async def test_supervision_normalised(self, tmp_path):
        dummy_pdf = tmp_path / "cv.pdf"
        dummy_pdf.write_bytes(b"%PDF dummy")
        mock_resp = _make_mock_response(SAMPLE_LLM_RESPONSE)

        with patch("backend.agents.preprocessor.extract_raw_text", return_value="CV"):
            with patch("backend.agents.preprocessor.client") as mock_client:
                mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)
                profile = await extract_cv(str(dummy_pdf))

        assert len(profile.research.supervision) == 2
        assert profile.research.supervision[0].role == "main"
        assert profile.research.supervision[1].role == "co-supervisor"

    @pytest.mark.asyncio
    async def test_missing_info_populated(self, tmp_path):
        dummy_pdf = tmp_path / "cv.pdf"
        dummy_pdf.write_bytes(b"%PDF dummy")
        mock_resp = _make_mock_response(SAMPLE_LLM_RESPONSE)

        with patch("backend.agents.preprocessor.extract_raw_text", return_value="CV"):
            with patch("backend.agents.preprocessor.client") as mock_client:
                mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)
                profile = await extract_cv(str(dummy_pdf))

        assert len(profile.missing_info) == 1
        assert profile.missing_info[0].section == "research"

    @pytest.mark.asyncio
    async def test_candidate_id_is_unique(self, tmp_path):
        dummy_pdf = tmp_path / "cv.pdf"
        dummy_pdf.write_bytes(b"%PDF dummy")
        mock_resp = _make_mock_response(SAMPLE_LLM_RESPONSE)

        with patch("backend.agents.preprocessor.extract_raw_text", return_value="CV"):
            with patch("backend.agents.preprocessor.client") as mock_client:
                mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)
                p1 = await extract_cv(str(dummy_pdf))
                p2 = await extract_cv(str(dummy_pdf))

        assert p1.candidate_id != p2.candidate_id

    @pytest.mark.asyncio
    async def test_missing_fields_default_gracefully(self, tmp_path):
        """CV with minimal data should not crash."""
        dummy_pdf = tmp_path / "cv.pdf"
        dummy_pdf.write_bytes(b"%PDF dummy")
        minimal = {"full_name": "Unknown Person", "education": {}, "research": {}, "employment": {}, "skills": {}}
        mock_resp = _make_mock_response(minimal)

        with patch("backend.agents.preprocessor.extract_raw_text", return_value="CV"):
            with patch("backend.agents.preprocessor.client") as mock_client:
                mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)
                profile = await extract_cv(str(dummy_pdf))

        assert profile.full_name == "Unknown Person"
        assert profile.education.degrees == []
        assert profile.employment.records == []
        assert profile.research.journal_papers == []


# ---------------------------------------------------------------------------
# Tests: extract_raw_text (no mocking needed; exercises real PDF parsing logic)
# ---------------------------------------------------------------------------
class TestExtractRawText:
    def test_returns_string_for_missing_file(self):
        # Should not crash; returns an empty string.
        result = extract_raw_text("/nonexistent/path/cv.pdf")
        assert isinstance(result, str)

    def test_empty_pdf_returns_string(self, tmp_path):
        dummy = tmp_path / "empty.pdf"
        dummy.write_bytes(b"")
        result = extract_raw_text(str(dummy))
        assert isinstance(result, str)