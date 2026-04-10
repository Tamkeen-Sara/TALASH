# TALASH - LLM/NLP Pipeline Design

**Version:** 1.0 (Milestone 1)

---

## 1. LLM Provider Selection

**Provider:** Groq API  
**Model:** `llama-3.3-70b-versatile`  
**Rationale:**
- Free tier with generous rate limits (suitable for demo)
- ~2s inference latency (Groq's hardware acceleration)
- 70B parameter model - sufficient for accurate structured extraction
- JSON mode (`response_format={"type": "json_object"}`) eliminates parsing ambiguity

**Fallback plan:** If Groq is unavailable, switch `extraction_model` in `config.py` to `mixtral-8x7b-32768` (also available on Groq) or `claude-haiku-3-5` (Anthropic) by changing the API client in `preprocessor.py`.

---

## 2. Extraction Pipeline (Module 0)

### 2.1 Three-Tier PDF Text Extraction

```
PDF File
    │
    ├─- pdfplumber.extract_text()
    │       Best for: native PDFs with text layers, tables
    │       Output: plain text per page joined with \n
    │
    ├─- PyMuPDF (fitz) page.get_text()
    │       Best for: complex column layouts, embedded fonts
    │       Selection: whichever gives more characters
    │
    └─- pytesseract (OCR)
            Trigger: if best text < 200 characters
            DPI: 300 (pdf2image conversion)
            Best for: scanned/photographed CVs
```

### 2.2 Prompt Engineering

The extraction prompt uses a **schema-first approach**: the LLM is shown the exact JSON schema it must produce, with typed fields and null semantics explicitly defined. This eliminates hallucination of field names and forces the model to use `null` rather than inventing data.

Key prompt principles applied:
1. **Negative constraint first** - "NEVER invent information" stated before positive rules
2. **Scale-aware extraction** - CGPA must include both value and scale (3.8/4.0 not just 3.8)
3. **Completeness mandate** - "extract EVERY paper listed. Do NOT skip or summarize"
4. **Author position tracking** - candidate_position in author list (1st, 2nd, etc.) for authorship quality
5. **Missing info flagging** - model explicitly identifies what's absent, with severity levels

The system prompt is ~1200 tokens. CV text averages 800-2000 tokens. Total context ≈ 2000-3200 tokens - well within Llama 3.3's 128K context window.

### 2.3 Temperature Setting

`temperature=0.1` - near-deterministic output. Extraction is a retrieval task, not a creative one. Low temperature minimizes hallucination while allowing the model to handle formatting variability.

### 2.4 JSON Parsing Robustness

```python
raw_json = response.choices[0].message.content.strip()
# Strip markdown code fences if model adds them
if raw_json.startswith("```"):
    raw_json = raw_json.split("```")[1]
    if raw_json.startswith("json"):
        raw_json = raw_json[4:]
data = json.loads(raw_json)
```

Pydantic field validators handle remaining edge cases (None → empty list, None → False for booleans).

---

## 3. Education Agent LLM Usage

The education agent uses **rule-based logic** (no LLM calls) for:
- CGPA normalisation (lookup table: HEC percentage bands → 4.0 scale)
- Gap detection (IntervalTree over degree date ranges)
- University tier assignment (SQLite cache + RapidFuzz string matching)

This avoids unnecessary LLM latency for deterministic computations.

---

## 4. Email Drafter LLM Usage (Milestone 2)

```python
# email_drafter.py
response = await client.chat.completions.create(
    model=settings.reasoning_model,  # llama-3.3-70b-versatile
    messages=[
        {"role": "system", "content": EMAIL_SYSTEM_PROMPT},
        {"role": "user", "content": f"Candidate: {candidate.full_name}\nMissing: {missing_fields}"}
    ],
    temperature=0.7,  # Higher for natural language generation
)
```

Each email is:
- Addressed by name
- Lists specific missing fields (not generic)
- Asks for evidence (not just confirmation)
- Signed as the hiring committee

---

## 5. Interview Question Generator (Milestone 3)

```
Input: CandidateProfile (full)
Prompt: structured template requesting:
  - 3 questions probing stated strengths (with citation from CV)
  - 3 questions probing identified gaps or anomalies
  - 2 questions about future research direction
  - Each question includes: rationale, expected answer indicators

Output: JSON list of {question, type, rationale, cv_reference}
```

Temperature: 0.6 - allows creative phrasing while staying grounded in CV facts.

---

## 6. Research Trajectory Prediction (Milestone 3)

Uses BERTopic embeddings of publication titles grouped by year, then passes topic evolution summary to the LLM:

```
Input:  [{year: 2018, topics: ["deep learning", "image segmentation"]},
          {year: 2021, topics: ["transformers", "NLP", "medical imaging"]},
          {year: 2023, topics: ["multimodal LLMs", "clinical AI"]}]

Prompt: "Based on this publication topic trajectory, write a 2-paragraph 
         analysis of the candidate's likely future research direction and 
         its alignment with emerging trends in AI."

Output: 300-word narrative paragraph
```

---

## 7. Skill Alignment NLP (Milestone 3)

Module 4 uses **sentence-transformers** (not Groq) for skill matching:

```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("all-MiniLM-L6-v2")  # 80MB, runs locally

skill_embeddings = model.encode(candidate.skills.claimed_skills)
jd_embeddings    = model.encode(jd_requirements)
similarities     = cosine_similarity(skill_embeddings, jd_embeddings)

# Classification thresholds (from config.py):
# Strong:   similarity >= 0.65 (verified in employment)
# Partial:  similarity >= 0.60 (mentioned in publications)
# Weak:     similarity >= 0.50
# Unsupported: below 0.50
```

Running locally avoids API costs and latency for embedding-only tasks.

---

## 8. Topic Modeling (Milestone 3)

```python
from bertopic import BERTopic

topic_model = BERTopic(language="english", min_topic_size=3)
topics, probs = topic_model.fit_transform(publication_titles)

# Output per candidate:
# - dominant_topic: str
# - topic_distribution: {topic: probability}
# - diversity_score: normalized entropy(probs)  # 0=focused, 1=diverse
# - trend_by_year: {year: [top_topics]}
```

BERTopic internally uses sentence-transformers for embeddings, making it compatible with the skill alignment pipeline.


