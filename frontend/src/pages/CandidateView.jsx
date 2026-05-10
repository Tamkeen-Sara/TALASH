import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowLeftRight, Download, Trash2, Plus, Loader2, CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { getCandidate, addSupervision, downloadReport, deleteCandidate } from '../api/talash'
import usePageTitle from '../hooks/usePageTitle'
import ScoreRadar from '../components/ScoreRadar'
import TimelineChart from '../components/TimelineChart'
import JsonViewer from '../components/JsonViewer'
import EducationTab from '../components/EducationTab'
import ResearchTab from '../components/ResearchTab'
import EmploymentTab from '../components/EmploymentTab'
import SkillsTab from '../components/SkillsTab'
import TopicTab from '../components/TopicTab'
import CoauthorTab from '../components/CoauthorTab'
import ConfirmDialog from '../components/ConfirmDialog'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

/* â”€â”€â”€ Supervision add-record form â”€â”€â”€ */
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
    } catch (err) {
      const detail = err?.response?.data?.detail
      setMsg(typeof detail === 'string' ? detail : 'Failed to save.')
    }
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
          <option value="PhD">PhD</option>
          <option value="MS">MS</option>
        </select>
        <select value={form.role} onChange={e => set('role', e.target.value)} className="input-dark">
          <option value="main">Main Supervisor</option>
          <option value="co-supervisor">Co-Supervisor</option>
        </select>
        <input type="number" placeholder="Year graduated" value={form.year_graduated}
          onChange={e => set('year_graduated', Number(e.target.value))} className="input-dark" />
        <button type="submit" disabled={saving} className="btn-primary"
          style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {saving ? <><Loader2 size={14} className="animate-spin" />Savingâ€¦</> : 'Add Record'}
        </button>
        {msg && <p style={{ gridColumn: '1 / -1', fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>{msg}</p>}
      </form>
    </div>
  )
}

const TABS = ['overview', 'education', 'research', 'topics & network', 'employment', 'skills', 'supervision', 'interview', 'raw data']

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

/* â”€â”€â”€ Reusable section divider row â”€â”€â”€ */
function SectionHeader({ title }) {
  return (
    <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
    </div>
  )
}

/* â”€â”€â”€ Publication row â”€â”€â”€ */
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
  const navigate = useNavigate()
  const [candidate, setCandidate]     = useState(null)
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState('overview')
  const [error, setError]             = useState(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  usePageTitle(candidate?.full_name || 'Candidate')

  const handleDelete = async () => {
    await deleteCandidate(id)
    navigate('/dashboard')
  }

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
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading candidateâ€¦</p>
    </div>
  )

  if (error || !candidate) return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '80px 40px', textAlign: 'center' }}>
      <p style={{ color: 'var(--error)', marginBottom: 16 }}>{error || 'Not found'}</p>
      <Link to="/dashboard" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
        â† Dashboard
      </Link>
    </div>
  )

  const rec = REC[candidate.recommendation] || null

  return (
    <div style={{ padding: '36px 40px', maxWidth: 1100 }}>

      {/* â”€â”€ Hero â”€â”€ editorial, calm, human â”€â”€ */}
      <div style={{
        marginBottom: 24, paddingBottom: 24,
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Link to="/dashboard" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.14s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            <ArrowLeft size={11} /> Dashboard
          </Link>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/compare?ids=${id}`} className="btn-ghost" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', fontSize: 12, textDecoration: 'none',
              border: '1px solid var(--border-default)', borderRadius: 8,
              color: 'var(--text-secondary)',
            }}>
              <ArrowLeftRight size={12} /> Compare
            </Link>
            <button onClick={() => downloadReport(id).then(r => downloadBlob(r.data, `${candidate.full_name}_report.pdf`))}
              className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 12 }}>
              <Download size={12} /> PDF
            </button>
            <button onClick={() => setShowDeleteDialog(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              color: 'var(--error)', border: '1px solid rgba(238,116,128,0.22)',
              cursor: 'pointer', background: 'rgba(238,116,128,0.06)', transition: 'all 0.14s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(238,116,128,0.14)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(238,116,128,0.06)'}>
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>

        {/* Candidate identity */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flex: 1 }}>
            {/* Avatar */}
            <div style={{
              width: 68, height: 68, borderRadius: 14, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--accent), var(--accent-light))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: '#1d1408',
            }}>
              {candidate.full_name?.split(' ').map(n => n[0]).slice(0, 2).join('')}
            </div>
            <div>
              {rec && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
                    background: rec.bg, color: rec.color, border: `1px solid ${rec.border}`,
                  }}>â˜… {candidate.recommendation} candidate</span>
                </div>
              )}
              <h1 style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 34,
                color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1,
              }}>{candidate.full_name}</h1>
              <p style={{
                fontSize: 13, color: 'var(--text-secondary)', marginTop: 8,
                fontFamily: 'var(--font-display)', fontStyle: 'italic',
              }}>
                {candidate.email || candidate.enriched_email || 'No email on file'}
                {candidate.enriched_email && !candidate.email && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-muted)', fontStyle: 'normal' }}>
                    via ORCID
                  </span>
                )}
                {candidate.cv_filename && (
                  <span style={{ marginLeft: 12, fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
                    color: 'var(--text-muted)', fontStyle: 'normal' }}>{candidate.cv_filename}</span>
                )}
              </p>

              {/* Academic profile links */}
              {(candidate.orcid_profile_url || candidate.openalex_profile_url || candidate.semantic_scholar_id) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {candidate.orcid_profile_url && (
                    <a href={candidate.orcid_profile_url} target="_blank" rel="noopener noreferrer" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      textDecoration: 'none', fontStyle: 'normal',
                      background: 'rgba(166,220,66,0.1)', color: '#a6dc42',
                      border: '1px solid rgba(166,220,66,0.25)',
                      transition: 'background 0.14s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(166,220,66,0.18)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(166,220,66,0.1)'}>
                      ORCID {candidate.orcid_id}
                    </a>
                  )}
                  {candidate.openalex_profile_url && (
                    <a href={candidate.openalex_profile_url} target="_blank" rel="noopener noreferrer" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      textDecoration: 'none', fontStyle: 'normal',
                      background: 'rgba(56,189,248,0.1)', color: 'var(--sky)',
                      border: '1px solid rgba(56,189,248,0.25)',
                      transition: 'background 0.14s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,189,248,0.18)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(56,189,248,0.1)'}>
                      OpenAlex
                      {candidate.enriched_h_index != null && (
                        <span style={{ opacity: 0.7 }}>· h{candidate.enriched_h_index}</span>
                      )}
                    </a>
                  )}
                  {candidate.semantic_scholar_id && (
                    <a href={`https://www.semanticscholar.org/author/${candidate.semantic_scholar_id}`}
                      target="_blank" rel="noopener noreferrer" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      textDecoration: 'none', fontStyle: 'normal',
                      background: 'rgba(149,128,255,0.1)', color: 'var(--violet)',
                      border: '1px solid rgba(149,128,255,0.25)',
                      transition: 'background 0.14s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(149,128,255,0.18)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(149,128,255,0.1)'}>
                      Semantic Scholar
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Composite score donut-style display */}
          {(candidate.score_total || candidate.computed_score) && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 400,
                color: 'var(--accent)', lineHeight: 1, letterSpacing: '-0.03em',
              }}>{candidate.score_total ?? candidate.computed_score}</div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--text-muted)', marginTop: 4 }}>composite</div>
            </div>
          )}
        </div>
      </div>

      {/* Score chips row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 1, background: 'var(--border-subtle)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12, overflow: 'hidden', marginBottom: 24,
      }}>
        {SCORE_DIMS.map(({ label, key }) => (
          <div key={key} style={{ padding: '14px 12px', textAlign: 'center', background: 'var(--bg-card)' }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400,
              color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              {candidate[key] ?? 'N/A'}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)', marginTop: 5,
            }}>{label}</div>
          </div>
        ))}
      </div>

      {/* â”€â”€ Tab bar â”€â”€ */}
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

      {/* â•â•â•â• OVERVIEW â•â•â•â• */}
      {tab === 'overview' && (
        <div className="fade-up" style={{ display: 'grid', gridTemplateColumns: '0.92fr 1.08fr', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card" style={{ padding: '22px 24px' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 18 }}>
                Score Radar
              </h3>
              <ScoreRadar candidate={candidate} />
            </div>

            {/* Research Trajectory - moved below radar on left */}
            {candidate.research_trajectory && (
              <div className="card" style={{ padding: '18px 22px', border: '1px solid rgba(149,128,255,0.18)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--violet)', marginBottom: 10 }}>
                  Research Trajectory
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {candidate.research_trajectory}
                </p>
              </div>
            )}
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
            {candidate.score_justification && (
              <div className="card" style={{ padding: '18px 22px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                  Overall Assessment
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                  {candidate.score_justification}
                </p>
              </div>
            )}
            {/* CV Quality Score */}
            {candidate.cv_quality_score != null && (
              <div className="card" style={{ padding: '18px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    CV Quality Score
                  </h3>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400,
                    color: candidate.cv_quality_score >= 75 ? 'var(--success)' : candidate.cv_quality_score >= 50 ? 'var(--warning)' : 'var(--error)',
                  }}>{candidate.cv_quality_score}</span>
                </div>
                <div style={{ height: 5, background: 'var(--bg-elevated)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${candidate.cv_quality_score}%`, borderRadius: 9999, transition: 'width 0.4s',
                    background: candidate.cv_quality_score >= 75 ? 'var(--success)' : candidate.cv_quality_score >= 50 ? 'var(--warning)' : 'var(--error)',
                  }} />
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Completeness · Verifiability · Integrity
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* â•â•â•â• EDUCATION â•â•â•â• */}
      {tab === 'education' && <EducationTab candidate={candidate} />}

      {/* â•â•â•â• RESEARCH â•â•â•â• */}
      {tab === 'research' && (
        <div className="fade-up">
          <ResearchTab candidate={candidate} />
        </div>
      )}

      {/* â•â•â•â• EMPLOYMENT â•â•â•â• */}

      {/* TOPICS & NETWORK */}
      {tab === 'topics & network' && (
        <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <TopicTab candidate={candidate} />
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 28 }}>
            <CoauthorTab candidate={candidate} />
          </div>
        </div>
      )}

      {tab === 'employment' && (
        <div className="fade-up">
          <EmploymentTab candidate={candidate} />
        </div>
      )}

      {/* â•â•â•â• SUPERVISION â•â•â•â• */}
      {tab === 'skills' && (
        <div className="fade-up">
          <SkillsTab candidate={candidate} />
        </div>
      )}

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


      {/* INTERVIEW QUESTIONS */}
      {tab === 'interview' && (
        <div className="fade-up">
          {candidate.interview_questions?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {['strength', 'gap', 'future'].map(cat => {
                const catQ = candidate.interview_questions.filter(q => q.category === cat)
                if (!catQ.length) return null
                const meta = {
                  strength: { label: 'Strengths', color: 'var(--success)', border: 'rgba(74,222,128,0.2)' },
                  gap:      { label: 'Gaps & Concerns', color: 'var(--error)', border: 'rgba(251,113,133,0.2)' },
                  future:   { label: 'Future Direction', color: 'var(--violet)', border: 'rgba(149,128,255,0.2)' },
                }[cat]
                return (
                  <div key={cat} className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${meta.border}` }}>
                    <div style={{ padding: '12px 22px', borderBottom: `1px solid ${meta.border}` }}>
                      <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: meta.color, margin: 0 }}>
                        {meta.label}
                      </h3>
                    </div>
                    {catQ.map((q, i) => (
                      <div key={i} style={{ padding: '16px 22px', borderBottom: i < catQ.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 6 }}>
                          {i + 1}. {q.question}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
                          {q.rationale}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
              Interview questions were not generated for this candidate.
            </p>
          )}
        </div>
      )}

      {/* â•â•â•â• RAW DATA â•â•â•â• */}
      {tab === 'raw data' && (
        <div className="fade-up">
          <JsonViewer data={candidate} title={`Extracted JSON: ${candidate.full_name}`} />
        </div>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete candidate?"
        message={`This will permanently remove ${candidate?.full_name} and all their data. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  )
}



