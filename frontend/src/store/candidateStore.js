import { create } from 'zustand'

const DEFAULT_WEIGHTS = {
  research: 35,
  education: 20,
  employment: 20,
  skills: 15,
  supervision: 10,
}

function recomputeRanking(candidates, weights) {
  const total =
    weights.research +
    weights.education +
    weights.employment +
    weights.skills +
    weights.supervision

  const ranked = candidates
    .map((c) => ({
      ...c,
      computed_score: (
        ((c.score_research || 0) * weights.research +
          (c.score_education || 0) * weights.education +
          (c.score_employment || 0) * weights.employment +
          (c.score_skills || 0) * weights.skills +
          (c.score_supervision || 0) * weights.supervision) /
        total
      ).toFixed(2),
    }))
    .sort((a, b) => b.computed_score - a.computed_score)
    .map((c, i) => ({ ...c, computed_rank: i + 1 }))

  return ranked
}

const useCandidateStore = create((set, get) => ({
  candidates: [],
  weights: DEFAULT_WEIGHTS,
  loading: false,
  error: null,

  setCandidates: (candidates) =>
    set({ candidates: recomputeRanking(candidates, get().weights) }),

  setWeights: (weights) =>
    set({
      weights,
      candidates: recomputeRanking(get().candidates, weights),
    }),

  resetWeights: () =>
    set({
      weights: DEFAULT_WEIGHTS,
      candidates: recomputeRanking(get().candidates, DEFAULT_WEIGHTS),
    }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}))

export default useCandidateStore
