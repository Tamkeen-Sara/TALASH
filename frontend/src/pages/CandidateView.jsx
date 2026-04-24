import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ArrowLeftRight, Download, CheckCircle, AlertTriangle, Info, Plus, Loader2 } from 'lucide-react'
import { getCandidate, addSupervision, downloadReport } from '../api/talash'
import usePageTitle from '../hooks/usePageTitle'
import ScoreRadar from '../components/ScoreRadar'
import TimelineChart from '../components/TimelineChart'
import JsonViewer from '../components/JsonViewer'
import EducationTab from '../components/EducationTab'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

/* ─── Supervision add-record form ─── */
function SupervisionForm({ candidateId, onAdded }) {
  const [form, setForm] = useState({
    student_name: '', degree_level: 'PhD', thesis_title: '',
    role: 'main', year_graduated: new Date().getFullYear(),
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await addSupervision(candidateId, form)
      setMsg('Record added.')
      onAdded()
      setForm(p => ({ ...p, student_name: '', thesis_title: '' }))
    } catch { setMsg('Failed to save.') }
    setSaving(false)
  }

  return (
    <div className="card" style={{ padding: '22px 24px', marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <Plus size={14} style={{ color: 'var(--accent)' }} />
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Add Supervision Record
        </h3>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <input required placeholder="Student name" value={form.student_name}
          onChange={e => set('student_name', e.target.value)}
          className="input-dark" style={{ gridColumn: '1 / -1' }} />
        <input placeholder="Thesis title" value={form.thesis_title}
          onChange={e => set('thesis_title', e.target.value)}
          className="input-dark" style={{ gridColumn: '1 / -1' }} />
        <select value={form.degree_level} onChange={e => set('degree_level', e.target.value)} className="input-dark">
          <option>PhD</option><option>MS</option><option>BSc</option>
        </select>
        <select value={form.role} onChange={e => set('role', e.target.value)} className="input-dark">
          <option value="main">Main Supervisor</option>
          <option value="co-supervisor">Co-Supervisor</option>
        </select>
        <input type="number" placeholder="Year graduated" value={form.year_graduated}
          onChange={e => set('year_graduated', Number(e.target.value))} className="input-dark" />
        <button type="submit" disabled={saving} className="btn-primary"
          style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {saving ? <><Loader2 size={14} className="animate-spin" />Saving…</> : 'Add Record'}
        </button>
        {msg && <p style={{ gridColumn: '1 / -1', fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>{msg}</p>}
      </form>
    </div>
  )
}

const TABS = ['overview', 'education', 'research', 'employment', 'supervision', 'raw data']

const REC = {
  Strong:      { bg: 'rgba(74,222,128,0.1)',   color: 'var(--success)', border: 'rgba(74,222,128,0.22)'   },
  Conditional: { bg: 'rgba(251,191,36,0.1)',   color: 'var(--warning)', border: 'rgba(251,191,36,0.22)'   },
  Weak:        { bg: 'rgba(251,113,133,0.1)',  color: 'var(--error)',   border: 'rgba(251,113,133,0.22)'  },
}

const SCORE_DIMS = [
  { label: 'Research',    key: 'score_research'    },
  { label: 'Education',   key: 'score_education'   },
  { label: 'Employment',  key: 'score_employment'  },
  { label: 'Skills',      key: 'score_skills'      },
  { label: 'Supervision', key: 'score_supervision' },
]

/* ─── Reusable section divider row ─── */
function SectionHeader({ title }) {
  return (
    <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
    </div>
  )
}

/* ─── Publication row ─── */
function PaperRow({ p }) {
  const quartile = p.wos_quartile
  const badgeClass = p.is_predatory_flag ? 'badge-pred'
    : quartile === 'Q1' ? 'badge-q1'
    : quartile === 'Q2' ? 'badge-q2'
    : quartile ? 'badge-q3' : 'badge-unk'
  const badgeLabel = p.is_predatory_flag ? 'Predatory' : quartile || 'Unranked'

  return (
    <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.12s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: 'var(--text-primary)' }}>{p.title}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {p.journal_name || p.conference_name} · {p.year}
          </p>
          {p.authors?.length > 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.authors.join(', ')}
            </p>
          )}
        </div>
        <span className={badgeClass} style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9999, flexShrink: 0 }}>
          {badgeLabel}
        </span>
      </div>
    </div>
  )
}

export default function CandidateView() {
  const { id } = useParams()
  const [candidate, setCandidate] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('overview')
  const [error, setError]         = useState(null)
  usePageTitle(candidate?.full_name || 'Candidate')

  const fetchCandidate = () => {
    setLoading(true)
    getCandidate(id)
      .then(r => setCandidate(r.data))
      .catch(() => setError('Candidate not found'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCandidate() }, [id])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        borderWidth: 2, borderStyle: 'solid',
        borderColor: 'var(--border-strong)', borderTopColor: 'var(--accent)',
        animation: 'spin 0.75s linear infinite',
      }} />
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading candidate…</p>
    </div>
  )

  if (error || !candidate) return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '80px 40px', textAlign: 'center' }}>
      <p style={{ color: 'var(--error)', marginBottom: 16 }}>{error || 'Not found'}</p>
      <Link to="/dashboard" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
        ← Dashboard
      </Link>
    </div>
  )

  const rec = REC[candidate.recommendation] || null

  return (
    <div style={{ padding: '36px 40px', maxWidth: 1100 }}>

      {/* ── Hero header ── */}
      <div className="hero-gradient" style={{ borderRadius: 18, padding: '28px 32px', marginBottom: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Top row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            <div>
              <Link to="/dashboard" style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, color: 'rgba(240,236,224,0.4)', textDecoration: 'none', marginBottom: 10,
                transition: 'color 0.14s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(240,236,224,0.7)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(240,236,224,0.4)'}>
                <ArrowLeft size={12} /> Dashboard
              </Link>
              <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em', color: '#f0ece0' }}>
                {candidate.full_name}
              </h1>
              <p style={{ fontSize: 13, color: 'rgba(240,236,224,0.5)', marginTop: 4 }}>{candidate.email}</p>
              {rec && (
                <span style={{
                  display: 'inline-block', marginTop: 10,
                  padding: '4px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600,
                  background: rec.bg, color: rec.color, border: `1px solid ${rec.border}`,
                }}>
                  {candidate.recommendation} Candidate
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link to={`/compare?ids=${id}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                color: 'rgba(240,236,224,0.85)', textDecoration: 'none',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                transition: 'background 0.14s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.13)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
                <ArrowLeftRight size={13} /> Compare
              </Link>
              <button onClick={() => downloadReport(id).then(r => downloadBlob(r.data, `${candidate.full_name}_report.pdf`))}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  color: '#1a1508', border: 'none', cursor: 'pointer',
                  background: 'rgba(240,236,224,0.92)', transition: 'background 0.14s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0ece0'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(240,236,224,0.92)'}>
                <Download size={13} /> Download PDF
              </button>
            </div>
          </div>

          {/* Score chips row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {SCORE_DIMS.map(({ label, key }) => (
              <div key={key} style={{
                padding: '12px 14px', borderRadius: 12, textAlign: 'center',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#f0ece0', letterSpacing: '-0.02em' }}>
                  {candidate[key] ?? 'N/A'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(240,236,224,0.45)', marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', gap: 4, padding: 4, borderRadius: 14, marginBottom: 24, overflowX: 'auto',
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, minWidth: 'max-content', padding: '8px 16px',
            borderRadius: 10, fontSize: 13, fontWeight: 500,
            textTransform: 'capitalize', cursor: 'pointer', border: 'none',
            transition: 'all 0.14s', whiteSpace: 'nowrap',
            background: tab === t ? 'var(--accent-dim)' : 'transparent',
            color:      tab === t ? 'var(--accent)'     : 'var(--text-muted)',
            boxShadow:  tab === t ? `0 0 0 1px var(--accent-ring)` : 'none',
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* ════ OVERVIEW ════ */}
      {tab === 'overview' && (
        <div className="fade-up" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card" style={{ padding: '22px 24px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 18 }}>
              Score Radar
            </h3>
            <ScoreRadar candidate={candidate} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {candidate.key_strengths?.length > 0 && (
              <div className="card" style={{ padding: '18px 22px', border: '1px solid rgba(74,222,128,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>Key Strengths</h3>
                </div>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {candidate.key_strengths.map((s, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-secondary)', listStyle: 'none' }}>
                      <span style={{ color: 'var(--success)', marginTop: 1, flexShrink: 0 }}>·</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {candidate.key_concerns?.length > 0 && (
              <div className="card" style={{ padding: '18px 22px', border: '1px solid rgba(251,113,133,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <AlertTriangle size={14} style={{ color: 'var(--error)' }} />
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--error)' }}>Key Concerns</h3>
                </div>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {candidate.key_concerns.map((c, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-secondary)', listStyle: 'none' }}>
                      <span style={{ color: 'var(--error)', marginTop: 1, flexShrink: 0 }}>·</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {candidate.missing_info?.length > 0 && (
              <div className="card" style={{ padding: '18px 22px', border: '1px solid rgba(251,191,36,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Info size={14} style={{ color: 'var(--warning)' }} />
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning)' }}>Missing Information</h3>
                </div>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {candidate.missing_info.map((m, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', listStyle: 'none' }}>
                      <span style={{ fontWeight: 600 }}>{m.section}</span>: {m.field}
                      <span style={{
                        marginLeft: 8, fontSize: 11, padding: '2px 7px', borderRadius: 5,
                        background: 'rgba(251,191,36,0.1)', color: 'var(--warning)',
                        border: '1px solid rgba(251,191,36,0.2)',
                      }}>{m.severity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ EDUCATION ════ */}
      {tab === 'education' && <EducationTab candidate={candidate} />}

      {/* ════ RESEARCH ════ */}
      {tab === 'research' && (
        <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              { label: 'H-Index',         value: candidate.research?.h_index,        color: 'var(--violet)' },
              { label: 'Q1 Papers',        value: candidate.research?.q1_count,        color: 'var(--success)' },
              { label: 'Total Citations',  value: candidate.research?.total_citations, color: 'var(--accent)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card" style={{ padding: '20px 22px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', color, marginBottom: 6 }}>
                  {value ?? 'N/A'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Journal papers */}
          {candidate.research?.journal_papers?.length > 0 && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <SectionHeader title={`Journal Papers (${candidate.research.journal_papers.length})`} />
              {candidate.research.journal_papers.map((p, i) => <PaperRow key={i} p={p} />)}
            </div>
          )}

          {/* Conference papers */}
          {candidate.research?.conference_papers?.length > 0 && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <SectionHeader title={`Conference Papers (${candidate.research.conference_papers.length})`} />
              {candidate.research.conference_papers.map((p, i) => (
                <div key={i} style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{p.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {p.conference_name} · {p.year}
                    {p.conference_number && <span style={{ marginLeft: 8 }}>({p.conference_number}th edition)</span>}
                  </p>
                  {p.core_rank && (
                    <span style={{
                      display: 'inline-block', marginTop: 6,
                      padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                      background: 'rgba(56,189,248,0.1)', color: 'var(--sky)', border: '1px solid rgba(56,189,248,0.2)',
                    }}>
                      CORE {p.core_rank}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════ EMPLOYMENT ════ */}
      {tab === 'employment' && (
        <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: '22px 24px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 18 }}>
              Employment Timeline
            </h3>
            <TimelineChart candidate={candidate} />
          </div>

          {candidate.employment?.records?.length > 0 && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <SectionHeader title="Employment Records" />
              {candidate.employment.records.map((r, i) => (
                <div key={i}
                  style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.job_title}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{r.organization}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {r.start_year ?? '?'} to {r.is_current ? 'Present' : (r.end_year ?? '?')}
                      </p>
                      {r.employment_type && (
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>
                          {r.employment_type}
                        </p>
                      )}
                    </div>
                  </div>
                  {r.responsibilities?.slice(0, 3).map((res, j) => (
                    <p key={j} style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5, display: 'flex', gap: 6 }}>
                      <span style={{ flexShrink: 0 }}>·</span>{res}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}

          {candidate.employment?.overlaps?.length > 0 && (
            <div className="card" style={{ padding: '16px 22px', border: '1px solid rgba(251,191,36,0.2)' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)', marginBottom: 8 }}>Overlap Flags</p>
              {candidate.employment.overlaps.map((f, i) => (
                <p key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{JSON.stringify(f)}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════ SUPERVISION ════ */}
      {tab === 'supervision' && (
        <div className="fade-up">
          <div className="card" style={{ overflow: 'hidden' }}>
            <SectionHeader title="Supervision Records" />
            {candidate.research?.supervision?.length > 0 ? (
              candidate.research.supervision.map((s, i) => (
                <div key={i} style={{
                  padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.student_name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                      {s.thesis_title || 'No thesis title'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                      ...(s.degree_level === 'PhD'
                        ? { background: 'rgba(149,128,255,0.1)', color: 'var(--violet)', border: '1px solid rgba(149,128,255,0.2)' }
                        : { background: 'rgba(56,189,248,0.1)', color: 'var(--sky)',    border: '1px solid rgba(56,189,248,0.2)' }),
                    }}>
                      {s.degree_level}
                    </span>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, textTransform: 'capitalize' }}>
                      {s.role} · {s.year_graduated ?? 'Ongoing'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ padding: '32px 22px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                No supervision records yet. Add one below.
              </p>
            )}
          </div>
          <SupervisionForm candidateId={id} onAdded={fetchCandidate} />
        </div>
      )}

      {/* ════ RAW DATA ════ */}
      {tab === 'raw data' && (
        <div className="fade-up">
          <JsonViewer data={candidate} title={`Extracted JSON: ${candidate.full_name}`} />
        </div>
      )}
    </div>
  )
}