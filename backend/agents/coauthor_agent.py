"""
Module 4: Co-author Network Analysis (spec §3.7)

Analyzes collaboration patterns from publication author lists.
No external API required — pure computation from extracted data.

Outputs (all stored on ResearchProfile):
  unique_coauthors              - number of distinct collaborators
  avg_coauthors_per_paper       - mean team size excluding candidate
  top_collaborators             - up to 5 most frequent co-authors
  recurring_collaborator_count  - collaborators appearing in > 1 paper
  recurring_proportion          - fraction of papers containing a recurring collaborator
  collaboration_diversity_score - Shannon entropy of collaborator frequency distribution
                                  0.0 = dominated by one or two recurring collaborators
                                  1.0 = all collaborators appear exactly once (fully diverse)
  student_collaborations        - supervised student names found as co-authors

Name normalization strategy:
  Academic author names appear in wildly inconsistent formats across papers:
  "Smith, John", "J. Smith", "John Smith", "J Smith", "smith j".
  We normalize every name to "lastname_initial" form (lowercase, diacritics
  stripped) before counting.  Two names that produce the same key are treated
  as the same person.  RapidFuzz is used as a secondary deduplication pass
  for near-identical keys (threshold 85) to catch OCR artifacts.
"""
import math
import unicodedata
import re
from collections import Counter, defaultdict
from rapidfuzz import fuzz
from backend.schemas.research import ResearchProfile, SupervisionRecord


# ── Name normalization ────────────────────────────────────────────────────────

def _strip_diacritics(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )


def _normalize(raw: str) -> str:
    """
    Convert an author name to a canonical 'lastname_first3' key.

    Uses up to 3 lowercase characters of the first name token (or as many as
    the token contains) to distinguish co-authors who share a last name and
    first initial — the main source of false-identity collisions:

      "Hassan Khan"  → "khan_has"   ← 3 chars, distinguishable
      "Hammad Khan"  → "khan_ham"   ← 3 chars, distinguishable
      "H. Khan"      → "khan_h"     ← abbreviated: only 1 char available
      "H Khan"       → "khan_h"     ← abbreviated: only 1 char available
      "Smith, John"  → "smith_joh"
      "J. Smith"     → "smith_j"
      "Müller, A."   → "muller_a"

    Abbreviated forms (single-char initials) are resolved during the
    secondary deduplication pass — see _deduplicate_counter.
    """
    s = _strip_diacritics(raw).lower().strip()
    s = re.sub(r"[^\w\s,]", "", s)
    s = re.sub(r"\s+", " ", s).strip()

    if "," in s:
        parts = s.split(",", 1)
        lastname = parts[0].strip()
        firstname_tokens = parts[1].strip().split()
    else:
        tokens = s.split()
        if not tokens:
            return s
        if len(tokens) == 1:
            return re.sub(r"\W", "", tokens[0])
        lastname = tokens[-1]
        firstname_tokens = tokens[:-1]

    lastname_clean = re.sub(r"\W", "", lastname)
    initial = ""
    for tok in firstname_tokens:
        clean = re.sub(r"\W", "", tok)
        if clean:
            # Take up to 3 chars — abbreviated tokens ("j", "h") give only 1
            initial = clean[:3]
            break

    return f"{lastname_clean}_{initial}" if initial else lastname_clean


def _is_candidate(raw_name: str, candidate_norm_key: str) -> bool:
    """
    Return True if raw_name refers to the candidate themselves.

    Two-check strategy handles all name format combinations after switching
    to 3-char normalization:

    Exact match  (same key):
      "Hassan Khan" → "khan_has" == "khan_has"  → remove ✓
      "Khan, Hassan" → "khan_has" == "khan_has" → remove ✓

    Prefix match (abbreviated form appears in a paper):
      "H. Khan" → "khan_h"; candidate key = "khan_has"
      Last parts equal ("khan"=="khan"), "h" is length-1 AND a prefix of "has"
      → remove ✓  (H. Khan is the candidate's abbreviated form)

      "Hammad Khan" → "khan_ham"; candidate key = "khan_has"
      Last parts equal, but neither is a prefix of the other at length 1
      → keep ✓  (different person)

      "Hamid Khan" → "khan_ham"; candidate key = "khan_has"
      "ham" vs "has" — neither is length-1 prefix match → keep ✓

    The prefix check is gated on len==1 (true abbreviated forms only), so
    full 3-char tokens are never soft-matched against each other.
    """
    norm = _normalize(raw_name)
    if norm == candidate_norm_key:
        return True
    if "_" in norm and "_" in candidate_norm_key:
        last1, init1 = norm.rsplit("_", 1)
        last2, init2 = candidate_norm_key.rsplit("_", 1)
        if last1 == last2:
            # Only treat as abbreviated form when one side is a bare initial
            if len(init1) == 1 and init2.startswith(init1):
                return True
            if len(init2) == 1 and init1.startswith(init2):
                return True
    return False


# ── Core computation ──────────────────────────────────────────────────────────

def _collect_coauthors(
    profile: ResearchProfile,
    candidate_norm_key: str,
) -> tuple[list[list[str]], Counter]:
    """
    Build a list of co-author key sets per paper and a global frequency Counter.
    candidate_norm_key is _normalize(candidate_name), precomputed by the caller.

    Returns:
      per_paper  - list of lists, one inner list per paper, each containing
                   normalized co-author keys for that paper
      counter    - total frequency of each normalized key across all papers
    """
    all_papers = list(profile.journal_papers) + list(profile.conference_papers)
    per_paper: list[list[str]] = []
    counter: Counter = Counter()

    for paper in all_papers:
        paper_keys: list[str] = []
        for raw in (paper.authors or []):
            if not raw or not raw.strip():
                continue
            if _is_candidate(raw, candidate_norm_key):
                continue
            key = _normalize(raw)
            if not key or key == "_":
                continue
            paper_keys.append(key)
            counter[key] += 1
        per_paper.append(paper_keys)

    return per_paper, counter


def _deduplicate_counter(counter: Counter) -> tuple[Counter, dict[str, list[str]]]:
    """
    Secondary deduplication: merge keys that represent the same person due to
    OCR noise or abbreviated name forms in citation lists.

    Critical guard — only attempt a merge when at least one key has a
    single-character initial part (i.e. an abbreviated form like "khan_h"):

      "khan_h"   + "khan_has" → one side is len-1 → check ratio → merge ✓
      "khan_has" + "khan_ham" → both len-3        → skip        → kept separate ✓
      "smith_j"  + "smith_jo" → one side is len-1 → check ratio → merge ✓
      "smith_jo" + "smith_ja" → both len-2        → skip        → kept separate ✓

    Without this guard, 3-char disambiguation would be undone by the fuzzy
    pass (fuzz.ratio("khan_has","khan_ham") = 93, which exceeds the threshold).
    """
    keys = list(counter.keys())
    merged: dict[str, str] = {}

    for i, k in enumerate(keys):
        if k in merged:
            continue
        k_parts   = k.rsplit("_", 1)
        k_init_len = len(k_parts[1]) if len(k_parts) == 2 else 0

        for j in range(i + 1, len(keys)):
            other = keys[j]
            if other in merged:
                continue
            o_parts   = other.rsplit("_", 1)
            o_init_len = len(o_parts[1]) if len(o_parts) == 2 else 0

            # Both multi-char → treat as distinct people; do not merge
            if k_init_len > 1 and o_init_len > 1:
                continue

            if fuzz.ratio(k, other) >= 85:
                winner = k if counter[k] >= counter[other] else other
                loser  = other if winner == k else k
                merged[loser] = winner

    canonical: Counter = Counter()
    absorbed: dict[str, list[str]] = defaultdict(list)
    for key in keys:
        canon = merged.get(key, key)
        canonical[canon] += counter[key]
        if canon != key:
            absorbed[canon].append(key)

    return canonical, absorbed


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


def _collaboration_diversity(counter: Counter) -> float:
    """
    Shannon entropy of the collaborator frequency distribution, normalized
    to [0, 1] by dividing by log2(number of unique collaborators).

    Interpretation for evaluators (must be reflected in UI labels):
      High (→1.0): collaborator frequency is spread evenly — the researcher
                   works with many different people, rarely repeating.
                   This can indicate broad reach OR absence of a stable group.
      Low  (→0.0): a few collaborators appear in the majority of papers —
                   indicates a stable, recurring research group, which is
                   typical of productive labs with long-term partnerships.
    Neither extreme is inherently better; context determines interpretation.
    The UI should display this alongside recurring_collaborator_count so
    evaluators can read both signals together.
    """
    if not counter:
        return 0.0
    k = len(counter)
    if k <= 1:
        return 0.0
    raw = _entropy(list(counter.values()))
    return round(raw / math.log2(k), 3)


def _find_student_collaborations(
    counter: Counter,
    supervision: list[SupervisionRecord],
) -> list[str]:
    """
    Check whether any supervised student appears as a co-author.
    Uses normalized name matching at threshold 80.
    Returns the student names (original form) that were found.
    """
    found = []
    all_keys = set(counter.keys())
    for rec in supervision:
        if not rec.student_name or rec.student_name.strip() in ("", "Unknown"):
            continue
        student_key = _normalize(rec.student_name)
        # Direct match
        if student_key in all_keys:
            found.append(rec.student_name)
            continue
        # Fuzzy fallback
        for key in all_keys:
            if fuzz.ratio(student_key, key) >= 80:
                found.append(rec.student_name)
                break
    return found


def _pick_display_name(original_authors: list[str]) -> str:
    """
    Choose the best display name for a collaborator from all raw author strings
    that map to the same canonical key.  Prefers the longest string because
    "John A. Smith" is more informative than "J. Smith" or "Smith J".
    Returns "Unknown" when no raw strings are available.
    """
    if not original_authors:
        return "Unknown"
    return max(original_authors, key=len)


# ── Main entry point ──────────────────────────────────────────────────────────

async def run(profile: ResearchProfile, candidate_name: str) -> ResearchProfile:
    """
    Compute all co-author metrics and write them back to profile.
    Non-fatal: on any failure the profile is returned unchanged.
    """
    all_papers = list(profile.journal_papers) + list(profile.conference_papers)
    if not all_papers:
        return profile

    # Precompute once so every _is_candidate call uses the same key
    candidate_norm_key = _normalize(candidate_name)

    try:
        per_paper, raw_counter = _collect_coauthors(profile, candidate_norm_key)
    except Exception as e:
        print(f"[coauthor_agent] Co-author collection failed: {e}")
        return profile

    if not raw_counter:
        return profile

    # Secondary deduplication (merges OCR noise / formatting variants)
    try:
        canonical_counter, absorbed = _deduplicate_counter(raw_counter)
    except Exception:
        canonical_counter = raw_counter
        absorbed = {}

    # Re-map per_paper using canonical keys
    canonical_map: dict[str, str] = {}
    for canon, aliases in absorbed.items():
        for alias in aliases:
            canonical_map[alias] = canon
    per_paper_canonical = [
        [canonical_map.get(k, k) for k in paper_keys]
        for paper_keys in per_paper
    ]

    # ── Build original-name lookup for display purposes ───────────────────────
    # Collect all raw author strings from all papers for display mapping
    all_raw_authors: dict[str, list[str]] = defaultdict(list)
    for paper in all_papers:
        for raw in (paper.authors or []):
            if not raw or not raw.strip():
                continue
            if _is_candidate(raw, candidate_norm_key):
                continue
            norm = _normalize(raw)
            key  = canonical_map.get(norm, norm)
            all_raw_authors[key].append(raw)

    # ── Metrics ───────────────────────────────────────────────────────────────
    unique_coauthors  = len(canonical_counter)
    total_papers      = len(per_paper_canonical)   # ALL papers incl. solo-authored
    total_coauthor_instances = sum(len(p) for p in per_paper_canonical)

    # Fix: use total_papers (not papers-with-co-authors) as the denominator so
    # avg_coauthors_per_paper and recurring_proportion share the same base.
    # Previously avg used only papers that had at least one co-author, inflating
    # the average for researchers with several solo-authored papers.
    avg_coauthors = round(total_coauthor_instances / total_papers, 2) if total_papers else 0.0

    # Recurring = appears in > 1 paper
    recurring_keys  = {k for k, v in canonical_counter.items() if v > 1}
    recurring_count = len(recurring_keys)

    # Proportion of papers that contain at least one recurring collaborator
    papers_with_recurring = sum(
        1 for paper_keys in per_paper_canonical
        if any(k in recurring_keys for k in paper_keys)
    )
    recurring_proportion = round(papers_with_recurring / total_papers, 3) if total_papers else 0.0

    diversity = _collaboration_diversity(canonical_counter)

    # Top 5 collaborators — use corrected _pick_display_name (no dead parameter)
    top_5 = canonical_counter.most_common(5)
    top_collaborators = [
        {
            "name": _pick_display_name(all_raw_authors.get(key, [])),
            "count": count,
        }
        for key, count in top_5
    ]

    # Student collaborations
    student_collabs = _find_student_collaborations(canonical_counter, profile.supervision)

    # ── Write back ────────────────────────────────────────────────────────────
    profile.unique_coauthors               = unique_coauthors
    profile.avg_coauthors_per_paper        = avg_coauthors
    profile.top_collaborators              = top_collaborators
    profile.recurring_collaborator_count   = recurring_count
    profile.recurring_proportion           = recurring_proportion
    profile.collaboration_diversity_score  = diversity
    profile.student_collaborations         = student_collabs

    print(
        f"[coauthor_agent] {unique_coauthors} unique co-authors | "
        f"avg {avg_coauthors:.1f}/paper | recurring: {recurring_count} | "
        f"diversity: {diversity:.3f}"
    )
    return profile