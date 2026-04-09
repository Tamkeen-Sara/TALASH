import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { getCandidates, getCandidate } from '../api/talash'
import ScoreRadar from '../components/ScoreRadar'

const DIMENSIONS = [
  { key: 'score_research', label: 'Research' },
  { key: 'score_education', label: 'Education' },
  { key: 'score_employment', label: 'Employment' },
  { key: 'score_skills', label: 'Skills' },
  { key: 'score_supervision', label: 'Supervision' },
  { key: 'score_total', label: 'Total' },
]

export default function Compare() {
  const [searchParams] = useSearchParams()
  const [allCandidates, setAllCandidates] = useState([])
  const [selected, setSelected] = useState([])
  const [details, setDetails] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getCandidates().then((res) => setAllCandidates(res.data))
    const ids = searchParams.get('ids')?.split(',').filter(Boolean) || []
    if (ids.length) setSelected(ids.slice(0, 4))
  }, [])

  useEffect(() => {
    if (!selected.length) { setDetails([]); return }
    setLoading(true)
    Promise.all(selected.map((id) => getCandidate(id).then((r) => r.data)))
      .then(setDetails)
      .finally(() => setLoading(false))
  }, [selected])

  const toggleCandidate = (id) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 4
        ? [...prev, id]
        : prev
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/dashboard" className="text-blue-600 hover:underline text-sm">
          &larr; Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-[#1a3557]">Compare Candidates</h1>
      </div>

      {/* Candidate selector */}
      <div className="bg-white rounded-xl shadow p-5 mb-6">
        <p className="text-sm font-medium text-slate-600 mb-3">
          Select up to 4 candidates to compare:
        </p>
        <div className="flex flex-wrap gap-2">
          {allCandidates.map((c) => (
            <button
              key={c.candidate_id}
              onClick={() => toggleCandidate(c.candidate_id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selected.includes(c.candidate_id)
                  ? 'bg-[#1a3557] text-white border-[#1a3557]'
                  : 'border-slate-300 text-slate-600 hover:border-blue-400'
              }`}
            >
              {c.full_name || c.candidate_id}
            </button>
          ))}
          {allCandidates.length === 0 && (
            <p className="text-slate-400 text-sm">
              No candidates yet.{' '}
              <Link to="/" className="text-blue-600 hover:underline">
                Upload CVs first.
              </Link>
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      )}

      {!loading && details.length > 0 && (
        <>
          {/* Radar charts */}
          <div className={`grid gap-4 mb-6 ${details.length > 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {details.map((c) => (
              <div key={c.candidate_id} className="bg-white rounded-xl shadow p-5">
                <Link
                  to={`/candidate/${c.candidate_id}`}
                  className="font-semibold text-[#1a3557] hover:underline block mb-1"
                >
                  {c.full_name}
                </Link>
                <p className="text-xs text-slate-400 mb-3">{c.email}</p>
                <ScoreRadar candidate={c} />
              </div>
            ))}
          </div>

          {/* Score comparison table */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#1a3557] text-white">
                <tr>
                  <th className="px-4 py-3 text-left">Dimension</th>
                  {details.map((c) => (
                    <th key={c.candidate_id} className="px-4 py-3 text-right">
                      {c.full_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIMENSIONS.map(({ key, label }) => {
                  const values = details.map((c) => c[key] ?? 0)
                  const max = Math.max(...values)
                  return (
                    <tr key={key} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-700">{label}</td>
                      {details.map((c) => {
                        const val = c[key] ?? '—'
                        const isMax = val === max && max > 0
                        return (
                          <td
                            key={c.candidate_id}
                            className={`px-4 py-2 text-right font-semibold ${
                              isMax ? 'text-emerald-600' : 'text-slate-600'
                            }`}
                          >
                            {val}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && selected.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          Select at least one candidate above to start comparing.
        </div>
      )}
    </div>
  )
}
