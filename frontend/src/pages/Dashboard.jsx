import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCandidates, exportCSV, exportXLSX } from '../api/talash'
import useCandidateStore from '../store/candidateStore'
import WeightSliders from '../components/WeightSliders'

const RANK_COLORS = {
  1: 'bg-yellow-400 text-yellow-900',
  2: 'bg-slate-300 text-slate-800',
  3: 'bg-orange-300 text-orange-900',
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Dashboard() {
  const { candidates, setCandidates, loading, setLoading } = useCandidateStore()
  const [sortKey, setSortKey] = useState('computed_rank')
  const [filterDegree, setFilterDegree] = useState('')
  const [minQ1, setMinQ1] = useState(0)
  const [minH, setMinH] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    getCandidates()
      .then((res) => setCandidates(res.data))
      .catch(() => setError('Failed to load candidates'))
      .finally(() => setLoading(false))
  }, [])

  const handleExportCSV = () =>
    exportCSV().then((res) => downloadBlob(res.data, 'talash_candidates.csv'))

  const handleExportXLSX = () =>
    exportXLSX().then((res) => downloadBlob(res.data, 'talash_candidates.xlsx'))

  const filtered = candidates.filter((c) => {
    if (filterDegree && !(c.education?.degrees || []).some((d) =>
      d.level?.toLowerCase().includes(filterDegree.toLowerCase())
    )) return false
    if (minQ1 && (c.research?.q1_count || 0) < minQ1) return false
    if (minH && (c.research?.h_index || 0) < minH) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'computed_rank') return a.computed_rank - b.computed_rank
    if (sortKey === 'name') return (a.full_name || '').localeCompare(b.full_name || '')
    return (b[sortKey] || 0) - (a[sortKey] || 0)
  })

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-500">
        Loading candidates...
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-red-600">{error}</div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex gap-8 items-start">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold text-[#1a3557]">Candidate Dashboard</h1>
              <p className="text-slate-500 text-sm mt-1">
                {sorted.length} candidate{sorted.length !== 1 ? 's' : ''} found
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={handleExportXLSX}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Export Excel
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <input
              type="text"
              placeholder="Filter by degree (e.g. PhD)"
              value={filterDegree}
              onChange={(e) => setFilterDegree(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              placeholder="Min Q1 papers"
              value={minQ1 || ''}
              min={0}
              onChange={(e) => setMinQ1(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              placeholder="Min h-index"
              value={minH || ''}
              min={0}
              onChange={(e) => setMinH(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="computed_rank">Sort: Rank</option>
              <option value="name">Sort: Name</option>
              <option value="score_research">Sort: Research</option>
              <option value="score_education">Sort: Education</option>
              <option value="score_employment">Sort: Employment</option>
            </select>
          </div>

          {/* Candidate table */}
          {sorted.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <p className="text-5xl mb-4">🎓</p>
              <p>No candidates yet. Upload some CVs to get started.</p>
              <Link to="/" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
                Go to Upload
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#1a3557] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left">Rank</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Research</th>
                    <th className="px-4 py-3 text-right">Education</th>
                    <th className="px-4 py-3 text-right">Employment</th>
                    <th className="px-4 py-3 text-right">Q1</th>
                    <th className="px-4 py-3 text-right">H-Index</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => (
                    <tr
                      key={c.candidate_id}
                      className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                            RANK_COLORS[c.computed_rank] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {c.computed_rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {c.full_name || '—'}
                        <div className="text-xs text-slate-400">{c.email}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#1a3557]">
                        {c.computed_score ?? c.score_total ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">{c.score_research ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{c.score_education ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{c.score_employment ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{c.research?.q1_count ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{c.research?.h_index ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          to={`/candidate/${c.candidate_id}`}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Weight sliders sidebar */}
        <div className="hidden lg:block pt-16">
          <WeightSliders />
        </div>
      </div>
    </div>
  )
}
