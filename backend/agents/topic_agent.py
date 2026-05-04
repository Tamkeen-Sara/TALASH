"""
Module 3: Topic Variability Analysis (spec §3.6)

Groups a candidate's publications into research themes, then quantifies how
focused or diverse their research portfolio is.

Design rationale — LLM-driven dynamic theme discovery:
  BERTopic requires ~50 documents for stable clusters; CVs have 5-30 papers.
  A fixed taxonomy forces every researcher into predetermined buckets and is
  domain-specific (useless for economists, biologists, lawyers, etc.).

  Instead, a single LLM call examines the actual titles and venues, discovers
  the themes latent in *this* researcher's body of work, and classifies each
  paper — all in one pass.  The result is:
    - Fully domain-agnostic (works for any field)
    - Descriptive rather than taxonomic ("Federated Learning for IoT Privacy"
      instead of the generic "Machine Learning")
    - Deterministic at temperature=0

Diversity metric — normalized Shannon entropy:
  H = -Σ p_i * log2(p_i)          (raw entropy over theme distribution)
  diversity = H / log2(k)          (normalized by maximum possible entropy)
  where k = number of distinct themes present in the candidate's profile.
  0.0 = all papers in one theme (perfectly focused specialist)
  1.0 = papers spread equally across all themes (perfectly diverse)
"""
import json
import math
from collections import defaultdict
from backend.schemas.research import ResearchProfile
from backend.utils.groq_client import groq_chat
from backend.config import settings


# ── Shannon entropy helpers ───────────────────────────────────────────────────

def _entropy(counts: list[int]) -> float:
    total = sum(counts)
    if total == 0:
        return 0.0
    h = 0.0
    for c in counts:
        if c > 0:
            p = c / total
            h -= p * math.log2(p)
    return h


def _diversity_score(counts: list[int]) -> float:
    """Normalized Shannon entropy in [0, 1]."""
    k = sum(1 for c in counts if c > 0)
    if k <= 1:
        return 0.0
    return round(_entropy(counts) / math.log2(k), 3)


# ── LLM classification ────────────────────────────────────────────────────────

def _build_paper_list(profile: ResearchProfile) -> list[dict]:
    """Collect every paper (journal + conference) with title, venue, and year."""
    papers = []
    for p in profile.journal_papers:
        if p.title and p.title.strip():
            papers.append({
                "idx": len(papers),
                "title": p.title.strip(),
                "venue": p.resolved_journal_name or p.journal_name or "",
                "year": p.year,
            })
    for p in profile.conference_papers:
        if p.title and p.title.strip():
            papers.append({
                "idx": len(papers),
                "title": p.title.strip(),
                "venue": p.resolved_conference_name or p.conference_name or "",
                "year": p.year,
            })
    return papers


async def _classify_papers(papers: list[dict]) -> tuple[list[str], list[str]]:
    """
    Discover research themes from this researcher's body of work, then classify
    each paper into one of the discovered themes — in a single LLM call.

    Returns (themes_per_paper, themes_list):
      themes_per_paper — one theme string per input paper, in input order
      themes_list      — the unique themes the LLM discovered

    Why dynamic themes instead of a fixed taxonomy:
      A fixed taxonomy (e.g. 15 CS domains) is domain-specific and forces every
      researcher into pre-made buckets regardless of their actual work.
      An economist, a biologist, or a legal scholar would all be misclassified.
      Letting the LLM discover themes from the actual titles produces specific,
      meaningful labels ("Federated Learning for Drone Networks") and works
      for any academic discipline.
    """
    if not papers:
        return [], []

    paper_block = "\n".join(
        f"  {p['idx'] + 1}. \"{p['title']}\""
        + (f" ({p['venue']})" if p["venue"] else "")
        for p in papers
    )

    prompt = f"""You are analyzing a researcher's full publication list to characterize their research portfolio.

Papers ({len(papers)} total):
{paper_block}

Task — two steps:
1. Identify between 3 and 8 distinct research themes present across these papers.
   - Name each theme specifically based on the actual content
     (e.g. "Federated Learning for IoT Privacy", "Urban Traffic Optimization with RL")
     rather than broad labels like "Machine Learning" or "Deep Learning".
   - If the researcher is highly focused, 3 themes suffice.
     If genuinely broad, use up to 8.
   - Use "Other" as a theme only if some papers truly fit no identified theme.

2. Assign each paper to exactly one theme — the one that best reflects
   its primary contribution. Use the same theme names from Step 1 exactly.

Return ONLY this JSON object, no explanation:
{{"themes": ["Theme 1", "Theme 2", ...], "classifications": [{{"idx": 1, "theme": "Theme 1"}}, ...]}}"""

    response = await groq_chat(
        model=settings.reasoning_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        max_tokens=3000,
        response_format={"type": "json_object"},
    )

    raw    = response.choices[0].message.content.strip()
    parsed = json.loads(raw)

    themes = parsed.get("themes", [])
    if not isinstance(themes, list) or not themes:
        # Fallback: grab first list of strings from response
        for v in parsed.values():
            if isinstance(v, list) and all(isinstance(x, str) for x in v):
                themes = v
                break
        else:
            themes = ["Research"]

    items = parsed.get("classifications", [])
    if not isinstance(items, list):
        for v in parsed.values():
            if isinstance(v, list) and all(isinstance(x, dict) for x in v):
                items = v
                break
        else:
            items = []

    theme_set = set(themes)
    result = ["Other"] * len(papers)
    for item in items:
        try:
            i     = int(item["idx"]) - 1
            theme = item.get("theme", "Other")
            if theme not in theme_set:
                theme = "Other"
            if 0 <= i < len(result):
                result[i] = theme
        except (KeyError, ValueError, TypeError):
            continue

    return result, themes


# ── Temporal trend ────────────────────────────────────────────────────────────

def _compute_trend(papers: list[dict], domains: list[str]) -> list[dict]:
    """
    Group papers into time windows anchored at the researcher's first publication
    year and return the dominant domain per window.

    Fix: previously used calendar-aligned buckets ((year // window) * window)
    which created partial first and last windows — a researcher publishing
    2017-2024 got buckets "2016-2019" and "2020-2023", making 2017-2019 appear
    as low-activity because the 2016 slot was empty.  Now we anchor at min_year
    so every bucket boundary is relative to the researcher's career start:
      min_year=2017, window=4 → buckets "2017-2020", "2021-2024"  (full windows)

    Window size: 4 years when career span >= 8 years, else 3 years.
    Returns [] when span < 3 years (too narrow for a meaningful trend).
    """
    year_domain: list[tuple[int, str]] = [
        (p["year"], d)
        for p, d in zip(papers, domains)
        if isinstance(p.get("year"), int) and 1970 <= p["year"] <= 2030
    ]

    if not year_domain:
        return []

    min_year = min(y for y, _ in year_domain)
    max_year = max(y for y, _ in year_domain)
    span = max_year - min_year

    if span < 3:
        return []

    window = 4 if span >= 8 else 3

    buckets: dict[str, dict] = {}
    for year, domain in year_domain:
        # Anchor relative to min_year so first bucket always starts at min_year
        offset = (year - min_year) // window
        start  = min_year + offset * window
        label  = f"{start}-{start + window - 1}"
        if label not in buckets:
            buckets[label] = defaultdict(int)
        buckets[label][domain] += 1

    trend = []
    for period in sorted(buckets.keys()):
        domain_counts = buckets[period]
        total    = sum(domain_counts.values())
        dominant = max(domain_counts, key=domain_counts.get)
        trend.append({"period": period, "dominant_domain": dominant, "count": total})

    return trend


# ── Main entry point ──────────────────────────────────────────────────────────

async def run(profile: ResearchProfile) -> ResearchProfile:
    """
    Classify all papers into research domains, compute diversity score and
    temporal trend.  Non-fatal: on any failure the profile is returned as-is.
    """
    papers = _build_paper_list(profile)
    if not papers:
        return profile

    try:
        domains, themes = await _classify_papers(papers)
    except Exception as e:
        print(f"[topic_agent] LLM classification failed: {e}")
        return profile

    # ── Aggregate domain → paper titles ──────────────────────────────────────
    domain_papers: dict[str, list[str]] = defaultdict(list)
    for p, d in zip(papers, domains):
        domain_papers[d].append(p["title"])

    total = len(papers)
    counts = [len(v) for v in domain_papers.values()]

    # ── Clusters (sorted by count descending) ─────────────────────────────────
    clusters = sorted(
        [
            {
                "domain": domain,
                "count": len(titles),
                "percentage": round(len(titles) / total * 100, 1),
                "papers": titles,
            }
            for domain, titles in domain_papers.items()
        ],
        key=lambda x: x["count"],
        reverse=True,
    )

    profile.topic_clusters        = clusters
    profile.topic_distribution    = {c["domain"]: c["count"] for c in clusters}
    profile.dominant_topic        = clusters[0]["domain"] if clusters else None
    profile.topic_diversity_score = _diversity_score(counts)
    profile.topic_trend           = _compute_trend(papers, domains)

    print(
        f"[topic_agent] {total} papers → {sum(1 for c in counts if c > 0)} domains | "
        f"dominant: {profile.dominant_topic!r} | diversity: {profile.topic_diversity_score:.3f}"
    )
    return profile