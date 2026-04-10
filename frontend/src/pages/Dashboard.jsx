import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, TrendingUp, FileText, GraduationCap, ArrowRight, SlidersHorizontal, Download } from 'lucide-react'
import { getCandidates, exportCSV, exportXLSX } from '../api/talash'
import useCandidateStore from '../store/candidateStore'
import WeightSliders from '../components/WeightSliders'
import usePageTitle from '../hooks/usePageTitle'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const RANK_COLORS = ['', '#f59e0b', '#94a3b8', '#f97316']

function MiniBar({ value }) {
  const pct = Math.min(100, value || 0)
  const color = pct >= 75 ? 'var(--success)' : pct >= 50 ? 'var(--accent)' : pct >= 25 ? 'var(--warning)' : 'var(--error)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 9999, background: 'var(--border-default)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 9999, background: color, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 12, width: 28, textAlign: 'right', fontWeight: 600, color }}>{value ?? '—'}</span>
    </div>
  )
}

export default function Dashboard() {
  usePageTitle('Dashboard')
  const { candidates, setCandidates, loading, setLoading } = useCandidateStore()
  const [sortKey, setSortKey]           = useState('computed_rank')
  const [filterDegree, setFilterDegree] = useState('')
  const [minQ1, setMinQ1]               = useState(0)
  const [error, setError]               = useState(null)
  const [showWeights, setShowWeights]   = useState(false)

  useEffect(() => {
    setLoading(true)
    getCandidates()
      .then(r => setCandidates(r.data))
      .catch(() => setError('Failed to load candidates'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = candidates.filter(c => {
    if (filterDegree && !(c.education?.degrees || []).some(d =>
      d.level?.toLowerCase().includes(filterDegree.toLowerCase()))) return false
    if (minQ1 && (c.research?.q1_count || 0) < minQ1) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'computed_rank') return (a.computed_rank || 99) - (b.computed_rank || 99)
    if (sortKey === 'name') return (a.full_name || '').localeCompare(b.full_name || '')
    return (b[sortKey] || 0) - (a[sortKey] || 0)
  })

  const avgScore = candidates.length
    ? (candidates.reduce((s, c) => s + Number(c.computed_score || 0), 0) / candidates.length).toFixed(1)
    : '—'

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', borderWidth: 2, borderStyle: 'solid',
        borderColor: 'var(--border-strong)', borderTopColor: 'var(--accent)',
        animation: 'spin 0.75s linear infinite',
      }} />
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading candidates…</p>
    </div>
  )

  const stats = [
    { label: 'Total Candidates', value: candidates.length,
      Icon: Users, color: 'var(--violet)', bg: 'rgba(149,128,255,0.1)', border: 'rgba(149,128,255,0.2)' },
    { label: 'Average Score', value: avgScore,
      Icon: TrendingUp, color: 'var(--success)', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.2)' },
    { label: 'Q1 Papers Total', value: candidates.reduce((s, c) => s + (c.research?.q1_count || 0), 0),
      Icon: FileText, color: 'var(--accent)', bg: 'var(--accent-dim)', border: 'var(--accent-ring)' },
    { label: 'PhD Holders', value: candidates.filter(c => c.education?.degrees?.some(d => d.level === 'PhD')).length,
      Icon: GraduationCap, color: 'var(--rose)', bg: 'rgba(232,122,140,0.1)', border: 'rgba(232,122,140,0.2)' },
  ]

  return (
    <div style={{ padding: '36px 40px' }}>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {stats.map(({ label, value, Icon, color, bg, border }) => (
          <div key={label} className="card" style={{ padding: '20px 22px' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, marginBottom: 14,
              background: bg, border: `1px solid ${border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={16} style={{ color }} />
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color, marginBottom: 4 }}>
              {value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Candidates</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {sorted.length} result{sorted.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Filter by degree…" value={filterDegree}
            onChange={e => setFilterDegree(e.target.value)}
            className="input-dark"
            style={{ width: 144, padding: '7px 12px', fontSize: 13 }} />
          <input
            type="number" placeholder="Min Q1" value={minQ1 || ''} min={0}
            onChange={e => setMinQ1(Number(e.target.value))}
            className="input-dark"
            style={{ width: 84, padding: '7px 12px', fontSize: 13 }} />
          <select
            value={sortKey} onChange={e => setSortKey(e.target.value)}
            className="input-dark"
            style={{ padding: '7px 12px', fontSize: 13, width: 'auto' }}>
            <option value="computed_rank">Sort: Rank</option>
            <option value="name">Sort: Name</option>
            <option value="score_research">Sort: Research</option>
            <option value="score_education">Sort: Education</option>
          </select>
          <button className="btn-ghost" style={{ padding: '7px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => exportCSV().then(r => downloadBlob(r.data, 'talash.csv'))}>
            <Download size={13} /> CSV
          </button>
          <button className="btn-ghost" style={{ padding: '7px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => exportXLSX().then(r => downloadBlob(r.data, 'talash.xlsx'))}>
            <Download size={13} /> Excel
          </button>
          <button
            className="btn-ghost"
            onClick={() => setShowWeights(p => !p)}
            style={{
              padding: '7px 14px', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6,
              ...(showWeights
                ? { background: 'var(--accent-dim)', borderColor: 'var(--accent-ring)', color: 'var(--accent)' }
                : {}),
            }}>
            <SlidersHorizontal size={13} /> Weights
          </button>
        </div>
      </div>

      {/* ── Weights panel ── */}
      {showWeights && (
        <div className="card fade-up" style={{ padding: '24px 28px', marginBottom: 20 }}>
          <WeightSliders />
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, fontSize: 13, color: 'var(--error)',
          background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.18)',
          marginBottom: 16,
        }}>{error}</div>
      )}

      {/* ── Empty state ── */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 16px',
            background: 'var(--accent-dim)', border: '1px solid var(--accent-ring)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users size={22} style={{ color: 'var(--text-muted)' }} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
            No candidates yet
          </p>
          <Link to="/" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
            Upload CVs to get started →
          </Link>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border-subtle)' }}>
                {['#', 'Candidate', 'Score', 'Research', 'Education', 'Q1', 'H-Index', ''].map(h => (
                  <th key={h} style={{
                    padding: '13px 18px', textAlign: 'left',
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: 'var(--text-muted)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.candidate_id}
                  style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700,
                      background: c.computed_rank <= 3 ? `${RANK_COLORS[c.computed_rank]}18` : 'var(--bg-elevated)',
                      color: c.computed_rank <= 3 ? RANK_COLORS[c.computed_rank] : 'var(--text-muted)',
                      border: c.computed_rank <= 3 ? `1px solid ${RANK_COLORS[c.computed_rank]}35` : '1px solid var(--border-default)',
                    }}>{c.computed_rank}</span>
                  </td>

                  <td style={{ padding: '14px 18px' }}>
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {c.full_name || '—'}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.email || 'No email'}
                    </p>
                  </td>

                  <td style={{ padding: '14px 18px', width: 150 }}>
                    <MiniBar value={c.computed_score ?? c.score_total} />
                  </td>

                  <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {c.score_research ?? '—'}
                  </td>
                  <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {c.score_education ?? '—'}
                  </td>

                  <td style={{ padding: '14px 18px' }}>
                    <span className="badge-q1" style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999 }}>
                      {c.research?.q1_count ?? '—'}
                    </span>
                  </td>

                  <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {c.research?.h_index ?? '—'}
                  </td>

                  <td style={{ padding: '14px 18px' }}>
                    <Link to={`/candidate/${c.candidate_id}`} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 12, fontWeight: 600, color: 'var(--accent)',
                      textDecoration: 'none', opacity: 0,
                      transition: 'opacity 0.12s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    className="view-link">
                      View <ArrowRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`tr:hover .view-link { opacity: 1 !important; }`}</style>
    </div>
  )
}