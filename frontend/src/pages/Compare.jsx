import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, Users } from 'lucide-react'
import { getCandidates, getCandidate } from '../api/talash'
import ScoreRadar from '../components/ScoreRadar'
import usePageTitle from '../hooks/usePageTitle'

const DIMS = [
  { key: 'score_research',    label: 'Research'    },
  { key: 'score_education',   label: 'Education'   },
  { key: 'score_employment',  label: 'Employment'  },
  { key: 'score_skills',      label: 'Skills'      },
  { key: 'score_supervision', label: 'Supervision' },
  { key: 'score_total',       label: 'Total'       },
]

// Four distinct warm-dark candidate accent colours
const COLORS = [
  { stroke: '#f0a030', bg: 'rgba(240,160,48,0.12)',  border: 'rgba(240,160,48,0.25)'  }, // amber
  { stroke: '#9580ff', bg: 'rgba(149,128,255,0.12)', border: 'rgba(149,128,255,0.25)' }, // violet
  { stroke: '#38c9b8', bg: 'rgba(56,201,184,0.12)',  border: 'rgba(56,201,184,0.25)'  }, // teal
  { stroke: '#e87a8c', bg: 'rgba(232,122,140,0.12)', border: 'rgba(232,122,140,0.25)' }, // rose
]

export default function Compare() {
  usePageTitle('Compare Candidates')
  const [searchParams] = useSearchParams()
  const [allCandidates, setAllCandidates] = useState([])
  const [selected, setSelected]           = useState([])
  const [details, setDetails]             = useState([])
  const [loading, setLoading]             = useState(false)

  useEffect(() => {
    getCandidates().then(r => setAllCandidates(r.data))
    const ids = searchParams.get('ids')?.split(',').filter(Boolean) || []
    if (ids.length) setSelected(ids.slice(0, 4))
  }, [])

  useEffect(() => {
    if (!selected.length) { setDetails([]); return }
    setLoading(true)
    Promise.all(selected.map(id => getCandidate(id).then(r => r.data)))
      .then(setDetails).finally(() => setLoading(false))
  }, [selected])

  const toggle = (id) => setSelected(prev =>
    prev.includes(id) ? prev.filter(x => x !== id)
      : prev.length < 4 ? [...prev, id] : prev
  )

  return (
    <div style={{ padding: '36px 40px', maxWidth: 1200 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <Link to="/dashboard" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none',
          transition: 'color 0.14s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
          <ArrowLeft size={13} /> Dashboard
        </Link>
        <div style={{ width: 1, height: 16, background: 'var(--border-default)' }} />
        <h1 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Compare Candidates
        </h1>
      </div>

      {/* ── Candidate selector ── */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
        <p style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 14,
        }}>
          Select up to 4 candidates
        </p>

        {allCandidates.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No candidates.{' '}
            <Link to="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Upload CVs first.
            </Link>
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {allCandidates.map((c) => {
              const idx    = selected.indexOf(c.candidate_id)
              const active = idx !== -1
              const col    = active ? COLORS[idx] : null
              return (
                <button key={c.candidate_id} onClick={() => toggle(c.candidate_id)} style={{
                  padding: '6px 14px', borderRadius: 9999, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.14s', border: 'none', outline: 'none',
                  background: active ? col.bg  : 'var(--bg-elevated)',
                  color:      active ? col.stroke : 'var(--text-muted)',
                  boxShadow:  active ? `0 0 0 1px ${col.border}` : `0 0 0 1px var(--border-default)`,
                }}>
                  {active && <span style={{ marginRight: 6, fontWeight: 700 }}>{idx + 1}.</span>}
                  {c.full_name || c.candidate_id}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', borderWidth: 2, borderStyle: 'solid',
            borderColor: 'var(--border-strong)', borderTopColor: 'var(--accent)',
            animation: 'spin 0.75s linear infinite',
          }} />
        </div>
      )}

      {/* ── Comparison view ── */}
      {!loading && details.length > 0 && (
        <div className="fade-up">

          {/* Radar charts */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: details.length > 2 ? 'repeat(2, 1fr)' : `repeat(${details.length}, 1fr)`,
            gap: 16, marginBottom: 24,
          }}>
            {details.map((c, i) => {
              const col = COLORS[i]
              return (
                <div key={c.candidate_id} className="card" style={{ padding: '22px 24px' }}>

                  {/* Candidate label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: col.stroke,
                      boxShadow: `0 0 8px ${col.stroke}88`,
                    }} />
                    <Link to={`/candidate/${c.candidate_id}`} style={{
                      fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                      textDecoration: 'none', transition: 'color 0.14s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = col.stroke}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-primary)'}>
                      {c.full_name}
                    </Link>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 20, marginBottom: 18 }}>
                    {c.email}
                  </p>

                  <ScoreRadar candidate={c} color={col.stroke} />
                </div>
              )
            })}
          </div>

          {/* Score table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{
                    padding: '13px 20px', textAlign: 'left',
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: 'var(--text-muted)',
                  }}>
                    Dimension
                  </th>
                  {details.map((c, i) => (
                    <th key={c.candidate_id} style={{
                      padding: '13px 20px', textAlign: 'right',
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.06em', color: COLORS[i].stroke,
                    }}>
                      {c.full_name?.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIMS.map(({ key, label }) => {
                  const vals = details.map(c => Number(c[key] || 0))
                  const max  = Math.max(...vals)
                  return (
                    <tr key={key}
                      style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '13px 20px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {label}
                      </td>
                      {details.map((c, i) => {
                        const val   = c[key] ?? 'N/A'
                        const isMax = typeof val === 'number' && val === max && max > 0
                        return (
                          <td key={c.candidate_id} style={{
                            padding: '13px 20px', textAlign: 'right', fontWeight: 700,
                            color: isMax ? COLORS[i].stroke : 'var(--text-muted)',
                          }}>
                            {val}
                            {isMax && (
                              <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.8 }}>▲</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && selected.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 18px',
            background: 'var(--accent-dim)', border: '1px solid var(--accent-ring)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users size={22} style={{ color: 'var(--text-muted)' }} />
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 6 }}>
            No candidates selected
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Pick candidates above to compare them side by side.
          </p>
        </div>
      )}
    </div>
  )
}