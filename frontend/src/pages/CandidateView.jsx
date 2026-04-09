import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getCandidate, addSupervision, downloadReport } from '../api/talash'
import ScoreRadar from '../components/ScoreRadar'
import TimelineChart from '../components/TimelineChart'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function SupervisionForm({ candidateId, onAdded }) {
  const [form, setForm] = useState({
    student_name: '',
    degree_level: 'PhD',
    thesis_title: '',
    role: 'main',
    year: new Date().getFullYear(),
    status: 'completed',
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await addSupervision(candidateId, form)
      setMsg('Supervision record added successfully.')
      onAdded()
      setForm((prev) => ({ ...prev, student_name: '', thesis_title: '' }))
    } catch {
      setMsg('Failed to add supervision record.')
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-xl shadow p-5 mt-6">
      <h3 className="font-semibold text-[#1a3557] mb-4">Add Supervision Record</h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 text-sm">
        <input
          required
          placeholder="Student name"
          value={form.student_name}
          onChange={(e) => setForm({ ...form, student_name: e.target.value })}
          className="col-span-2 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          placeholder="Thesis title"
          value={form.thesis_title}
          onChange={(e) => setForm({ ...form, thesis_title: e.target.value })}
          className="col-span-2 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={form.degree_level}
          onChange={(e) => setForm({ ...form, degree_level: e.target.value })}
          className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option>PhD</option>
          <option>MS</option>
          <option>BSc</option>
        </select>
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="main">Main Supervisor</option>
          <option value="co">Co-Supervisor</option>
        </select>
        <input
          type="number"
          placeholder="Year"
          value={form.year}
          onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
          className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="completed">Completed</option>
          <option value="ongoing">Ongoing</option>
        </select>
        <button
          type="submit"
          disabled={saving}
          className="col-span-2 px-4 py-2 bg-[#1a3557] text-white rounded-lg font-medium hover:bg-[#12273f] disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving...' : 'Add Record'}
        </button>
        {msg && <p className="col-span-2 text-xs text-slate-600">{msg}</p>}
      </form>
    </div>
  )
}

export default function CandidateView() {
  const { id } = useParams()
  const [candidate, setCandidate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [error, setError] = useState(null)

  const fetchCandidate = () => {
    setLoading(true)
    getCandidate(id)
      .then((res) => setCandidate(res.data))
      .catch(() => setError('Candidate not found'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCandidate() }, [id])

  const handleDownloadReport = () => {
    downloadReport(id).then((res) =>
      downloadBlob(res.data, `${candidate?.full_name || 'candidate'}_report.pdf`)
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-500">
        Loading candidate...
      </div>
    )
  }
  if (error || !candidate) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-red-600">{error}</p>
        <Link to="/dashboard" className="text-blue-600 hover:underline text-sm mt-2 block">
          Back to Dashboard
        </Link>
      </div>
    )
  }

  const tabs = ['overview', 'research', 'education', 'employment', 'supervision']

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <Link to="/dashboard" className="text-blue-600 hover:underline text-sm">
            &larr; Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-[#1a3557] mt-1">
            {candidate.full_name}
          </h1>
          <p className="text-slate-500 text-sm">{candidate.email}</p>
          {candidate.recommendation && (
            <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#e8f0fe] text-[#1a3557]">
              {candidate.recommendation}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            to={`/compare?ids=${id}`}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Compare
          </Link>
          <button
            onClick={handleDownloadReport}
            className="px-4 py-2 bg-[#1a3557] text-white rounded-lg text-sm hover:bg-[#12273f] transition-colors"
          >
            Download PDF
          </button>
        </div>
      </div>

      {/* Score summary */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Research', value: candidate.score_research },
          { label: 'Education', value: candidate.score_education },
          { label: 'Employment', value: candidate.score_employment },
          { label: 'Skills', value: candidate.score_skills },
          { label: 'Supervision', value: candidate.score_supervision },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-[#1a3557]">
              {value != null ? value : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-[#1a3557] text-[#1a3557]'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-semibold text-[#1a3557] mb-4">Score Radar</h3>
            <ScoreRadar candidate={candidate} />
          </div>
          <div className="space-y-4">
            {candidate.key_strengths?.length > 0 && (
              <div className="bg-white rounded-xl shadow p-5">
                <h3 className="font-semibold text-emerald-700 mb-2">Key Strengths</h3>
                <ul className="space-y-1 text-sm text-slate-700">
                  {candidate.key_strengths.map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              </div>
            )}
            {candidate.key_concerns?.length > 0 && (
              <div className="bg-white rounded-xl shadow p-5">
                <h3 className="font-semibold text-red-600 mb-2">Key Concerns</h3>
                <ul className="space-y-1 text-sm text-slate-700">
                  {candidate.key_concerns.map((c, i) => (
                    <li key={i}>• {c}</li>
                  ))}
                </ul>
              </div>
            )}
            {candidate.missing_info?.length > 0 && (
              <div className="bg-white rounded-xl shadow p-5">
                <h3 className="font-semibold text-amber-600 mb-2">Missing Information</h3>
                <ul className="space-y-1 text-sm text-slate-700">
                  {candidate.missing_info.map((m, i) => (
                    <li key={i}>
                      <span className="font-medium">{m.section}</span>:{' '}
                      {m.field}{' '}
                      <span className="text-xs text-slate-400">({m.severity})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'research' && (
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex gap-6 mb-5">
            <div className="text-center">
              <div className="text-3xl font-bold text-[#1a3557]">
                {candidate.research?.h_index ?? '—'}
              </div>
              <div className="text-xs text-slate-500">H-Index</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-[#1a3557]">
                {candidate.research?.q1_count ?? '—'}
              </div>
              <div className="text-xs text-slate-500">Q1 Papers</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-[#1a3557]">
                {candidate.research?.total_citations ?? '—'}
              </div>
              <div className="text-xs text-slate-500">Total Citations</div>
            </div>
          </div>
          {candidate.research?.journal_papers?.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 font-medium">Title</th>
                  <th className="py-2 font-medium">Journal</th>
                  <th className="py-2 font-medium">Year</th>
                  <th className="py-2 font-medium">Quartile</th>
                </tr>
              </thead>
              <tbody>
                {candidate.research.journal_papers.map((p, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 text-slate-800">{p.title}</td>
                    <td className="py-2 text-slate-600">{p.journal_name}</td>
                    <td className="py-2 text-slate-600">{p.year}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          p.wos_quartile === 'Q1'
                            ? 'bg-emerald-100 text-emerald-700'
                            : p.wos_quartile === 'Q2'
                            ? 'bg-yellow-100 text-yellow-700'
                            : p.is_predatory_flag
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {p.is_predatory_flag ? 'Predatory' : p.wos_quartile || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'education' && (
        <div className="bg-white rounded-xl shadow p-5">
          {candidate.education?.degrees?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 font-medium">Degree</th>
                  <th className="py-2 font-medium">Institution</th>
                  <th className="py-2 font-medium">Year</th>
                  <th className="py-2 font-medium">CGPA</th>
                  <th className="py-2 font-medium">QS Rank</th>
                </tr>
              </thead>
              <tbody>
                {candidate.education.degrees.map((d, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{d.level} — {d.field}</td>
                    <td className="py-2 text-slate-600">{d.institution}</td>
                    <td className="py-2 text-slate-600">{d.end_year}</td>
                    <td className="py-2 text-slate-600">{d.cgpa_normalized ?? d.cgpa ?? '—'}</td>
                    <td className="py-2 text-slate-600">{d.qs_rank ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-slate-500 text-sm">No education records.</p>
          )}
        </div>
      )}

      {tab === 'employment' && (
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="font-semibold text-[#1a3557] mb-4">Employment Timeline</h3>
          <TimelineChart candidate={candidate} />
          {candidate.employment?.overlap_flags?.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-semibold text-amber-700 mb-1">Overlap Flags</p>
              {candidate.employment.overlap_flags.map((f, i) => (
                <p key={i} className="text-xs text-amber-600">{f}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'supervision' && (
        <div>
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-semibold text-[#1a3557] mb-4">Supervision Records</h3>
            {candidate.research?.supervision?.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 font-medium">Student</th>
                    <th className="py-2 font-medium">Degree</th>
                    <th className="py-2 font-medium">Role</th>
                    <th className="py-2 font-medium">Year</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {candidate.research.supervision.map((s, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 font-medium">{s.student_name}</td>
                      <td className="py-2 text-slate-600">{s.degree_level}</td>
                      <td className="py-2 text-slate-600 capitalize">{s.role}</td>
                      <td className="py-2 text-slate-600">{s.year}</td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            s.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-slate-500 text-sm italic">
                No supervision records. Add one below.
              </p>
            )}
          </div>
          <SupervisionForm candidateId={id} onAdded={fetchCandidate} />
        </div>
      )}
    </div>
  )
}
