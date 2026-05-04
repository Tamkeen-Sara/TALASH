import { useState } from 'react'
import { getMissingInfoEmail } from '../api/talash'
import { Mail, Loader2, AlertTriangle, CheckCircle, Info } from 'lucide-react'

function QualityBadge({ paper }) {
  if (paper.is_predatory_flag) {
    return (
      <span style={{
        padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700,
        background: 'rgba(251,113,133,0.15)', color: 'var(--error)',
        border: '1px solid rgba(251,113,133,0.3)',
      }}>Predatory</span>
    )
  }
  const q = paper.wos_quartile
  const map = {
    Q1: ['rgba(74,222,128,0.12)',  'var(--success)', 'rgba(74,222,128,0.3)'],
    Q2: ['rgba(251,191,36,0.12)',  'var(--warning)', 'rgba(251,191,36,0.3)'],
    Q3: ['rgba(148,163,184,0.12)', 'var(--text-muted)', 'rgba(148,163,184,0.2)'],
    Q4: ['rgba(148,163,184,0.08)', 'var(--text-muted)', 'rgba(148,163,184,0.15)'],
  }
  const [bg, color, border] = map[q] || ['var(--bg-elevated)', 'var(--text-muted)', 'var(--border-subtle)']
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700,
      background: bg, color, border: `1px solid ${border}`,
    }}>{q || 'Unverified'}</span>
  )
}

function CoreBadge({ rank, paper }) {
  if (rank) {
    const map = {
      'A*': ['rgba(168,85,247,0.12)',  '#a855f7',        'rgba(168,85,247,0.3)'],
      'A':  ['rgba(56,189,248,0.12)',  'var(--sky)',      'rgba(56,189,248,0.3)'],
      'B':  ['rgba(251,191,36,0.12)',  'var(--warning)',  'rgba(251,191,36,0.3)'],
      'C':  ['var(--bg-elevated)',     'var(--text-muted)', 'var(--border-subtle)'],
    }
    const [bg, color, border] = map[rank] || ['var(--bg-elevated)', 'var(--text-muted)', 'var(--border-subtle)']
    return (
      <span style={{
        padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700,
        whiteSpace: 'nowrap', display: 'inline-block',
        background: bg, color, border: `1px solid ${border}`,
      }}>CORE {rank}</span>
    )
  }

  // No CORE rank — show OpenAlex venue quality tier if available
  const tier = paper?.venue_quality_tier
  if (tier) {
    const tierMap = {
      'Elite':      ['rgba(168,85,247,0.1)', '#a855f7',        'rgba(168,85,247,0.25)'],
      'Excellent':  ['rgba(56,189,248,0.1)', 'var(--sky)',      'rgba(56,189,248,0.25)'],
      'Good':       ['rgba(74,222,128,0.1)', 'var(--success)',  'rgba(74,222,128,0.25)'],
      'Recognized': ['rgba(251,191,36,0.1)', 'var(--warning)',  'rgba(251,191,36,0.25)'],
      'Known':      ['var(--bg-elevated)',   'var(--text-muted)', 'var(--border-subtle)'],
      'Marginal':   ['var(--bg-elevated)',   'var(--text-muted)', 'var(--border-subtle)'],
    }
    const [bg, color, border] = tierMap[tier] || ['var(--bg-elevated)', 'var(--text-muted)', 'var(--border-subtle)']
    const hLabel = paper.venue_h_index ? ` · h${paper.venue_h_index}` : ''
    return (
      <span title="Source: OpenAlex venue metrics — not a CORE/Scimago ranking" style={{
        padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700,
        whiteSpace: 'nowrap', display: 'inline-block',
        background: bg, color, border: `1px solid ${border}`,
      }}>{tier}{hLabel}</span>
    )
  }

  return <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Unranked</span>
}

function ScoreBreakdown({ breakdown }) {
  if (!breakdown || !Object.keys(breakdown).length) return null
  const items = [
    { key: 'q1_score',         label: 'Q1 Papers (top 25%)',         max: 40, color: 'var(--success)' },
    { key: 'q2_score',         label: 'Q2 Papers (25–50%)',          max: 15, color: 'var(--warning)' },
    { key: 'q3_score',         label: 'Q3 Papers (Scopus/WoS indexed)', max: 6, color: 'var(--sky)'  },
    { key: 'conference_score', label: 'Conferences (CORE/Scimago)',  max: 18, color: 'var(--violet)'  },
    { key: 'h_index_score',    label: 'H-Index',                     max: 15, color: 'var(--teal)'    },
    { key: 'book_score',       label: 'Verified Books',              max:  6, color: '#f97316'         },
    { key: 'patent_score',     label: 'Verified Patents',            max:  6, color: '#e879f9'         },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(({ key, label, max, color }) => {
        const val = breakdown[key] ?? 0
        const pct = Math.min(100, (val / max) * 100)
        return (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
              <span style={{ color: 'var(--text-muted)' }}>{val} / {max}</span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 9999, transition: 'width 0.3s' }} />
            </div>
          </div>
        )
      })}
      {breakdown.predatory_penalty > 0 && (
        <div style={{ fontSize: 12, color: 'var(--error)', marginTop: 4 }}>
          Predatory penalty: -{breakdown.predatory_penalty} pts
        </div>
      )}
    </div>
  )
}

function MissingInfoPanel({ candidate }) {
  const [email, setEmail]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)
  if (!candidate.missing_info?.length) return null

  const fetchEmail = async () => {
    setLoading(true)
    try {
      const r = await getMissingInfoEmail(candidate.candidate_id)
      setEmail(r.data.email)
      setOpen(true)
    } catch { setEmail('Could not generate email.') }
    setLoading(false)
  }

  const sev = { critical: 'var(--error)', important: 'var(--warning)', optional: 'var(--text-muted)' }
  const sevBg = { critical: 'rgba(251,113,133,0.07)', important: 'rgba(251,191,36,0.07)', optional: 'var(--bg-elevated)' }

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Missing Information
          </h3>
        </div>
        <button
          onClick={email ? () => setOpen(p => !p) : fetchEmail}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: 'var(--accent-dim)', color: 'var(--accent)',
            border: '1px solid var(--accent-ring)', cursor: 'pointer',
          }}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
          {loading ? 'Generating...' : email ? (open ? 'Hide Email' : 'Show Email') : 'Draft Email'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: open ? 16 : 0 }}>
        {candidate.missing_info.map((m, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 8,
            background: sevBg[m.severity] || 'var(--bg-elevated)',
            border: `1px solid ${sev[m.severity] || 'var(--border-subtle)'}22`,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              color: sev[m.severity] || 'var(--text-muted)', minWidth: 60,
            }}>{m.severity}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong>{m.section}</strong>: {m.field}
            </span>
          </div>
        ))}
      </div>

      {open && email && (
        <div style={{
          padding: '14px 16px', borderRadius: 10, fontSize: 13,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'var(--text-secondary)',
          fontFamily: 'inherit',
        }}>
          {email}
        </div>
      )}
    </div>
  )
}

export default function ResearchTab({ candidate }) {
  const research = candidate?.research
  if (!research) return <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13 }}>No research data.</p>

  const stats = [
    { label: 'H-Index',      value: research.h_index        ?? 0 },
    { label: 'Total Citations', value: research.total_citations ?? 0 },
    { label: 'Q1 Papers',    value: research.q1_count        ?? 0 },
    { label: 'Q2 Papers',    value: research.q2_count        ?? 0 },
    { label: 'A*/A Conf',    value: (research.astar_conf_count ?? 0) + (research.a_conf_count ?? 0) },
    { label: 'Predatory',    value: research.predatory_count  ?? 0, warn: true },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <MissingInfoPanel candidate={candidate} />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {stats.map(({ label, value, warn }) => (
          <div key={label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{
              fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em',
              color: warn && value > 0 ? 'var(--error)' : 'var(--accent)',
            }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Journal papers */}
      {research.journal_papers?.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Journal Papers ({research.journal_papers.length})
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['TITLE', 'JOURNAL', 'YEAR', 'QUALITY', 'CITATIONS', 'SOURCE'].map(h => (
                    <th key={h} style={{
                      padding: '9px 16px', textAlign: 'left', fontSize: 10,
                      fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {research.journal_papers.map((p, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)', width: '35%' }}>
                      <div style={{ fontWeight: 500, lineHeight: 1.45, wordBreak: 'break-word' }}>
                        {p.title}
                      </div>
                      {p.candidate_position && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          Author #{p.candidate_position}{p.is_corresponding ? ' (Corresponding)' : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', width: '28%' }}>
                      <div style={{ lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {p.resolved_journal_name || p.journal_name || 'Unknown'}
                      </div>
                      {p.resolved_journal_name && p.journal_name &&
                       p.resolved_journal_name.toLowerCase() !== p.journal_name.toLowerCase() && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                          CV: {p.journal_name}
                        </div>
                      )}
                      {p.impact_factor && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>IF {p.impact_factor}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{p.year ?? 'N/A'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                        <QualityBadge paper={p} />
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {p.is_wos_indexed && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 9999, fontSize: 9, fontWeight: 600,
                              background: 'rgba(56,189,248,0.10)', color: 'var(--sky)',
                              border: '1px solid rgba(56,189,248,0.22)', whiteSpace: 'nowrap',
                            }}>WoS</span>
                          )}
                          {p.is_scopus_indexed && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 9999, fontSize: 9, fontWeight: 600,
                              background: 'rgba(168,85,247,0.10)', color: 'var(--violet)',
                              border: '1px solid rgba(168,85,247,0.22)', whiteSpace: 'nowrap',
                            }}>Scopus</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{p.citation_count ?? 'N/A'}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 10 }}>{p.verification_source || 'unverified'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conference papers */}
      {research.conference_papers?.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Conference Papers ({research.conference_papers.length})
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['TITLE', 'CONFERENCE', 'YEAR', 'CORE RANK', 'EDITION', 'SOURCE'].map(h => (
                    <th key={h} style={{
                      padding: '9px 16px', textAlign: 'left', fontSize: 10,
                      fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {research.conference_papers.map((p, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)', width: '35%' }}>
                      <div style={{ fontWeight: 500, lineHeight: 1.45, wordBreak: 'break-word' }}>
                        {p.title}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', width: '30%' }}>
                      <div style={{ lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {p.resolved_conference_name || p.conference_name}
                      </div>
                      {p.resolved_conference_name && p.conference_name &&
                       p.resolved_conference_name.toLowerCase() !== p.conference_name.toLowerCase() && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                          CV: {p.conference_name}
                        </div>
                      )}
                      {p.conference_publisher && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {p.conference_publisher}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{p.year ?? 'N/A'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        {/* CORE rank — primary; OpenAlex venue tier — fallback */}
                        <CoreBadge rank={p.core_rank} paper={p} />
                        {/* Scimago proceedings quartile — secondary signal */}
                        {p.scimago_quartile && (() => {
                          const qMap = {
                            Q1: ['rgba(74,222,128,0.12)',  'var(--success)', 'rgba(74,222,128,0.3)'],
                            Q2: ['rgba(251,191,36,0.12)',  'var(--warning)', 'rgba(251,191,36,0.3)'],
                            Q3: ['var(--bg-elevated)',      'var(--text-muted)', 'var(--border-subtle)'],
                            Q4: ['var(--bg-elevated)',      'var(--text-muted)', 'var(--border-subtle)'],
                          }
                          const [bg, color, border] = qMap[p.scimago_quartile] || qMap.Q4
                          return (
                            <span style={{
                              padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700,
                              whiteSpace: 'nowrap', display: 'inline-block',
                              background: bg, color, border: `1px solid ${border}`,
                            }}>SJR {p.scimago_quartile}</span>
                          )
                        })()}
                        {/* Scopus indexed — tertiary signal */}
                        {!p.core_rank && !p.scimago_quartile && p.is_scopus_indexed && (
                          <span style={{
                            padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 600,
                            whiteSpace: 'nowrap', display: 'inline-block',
                            background: 'rgba(56,189,248,0.10)', color: 'var(--sky)',
                            border: '1px solid rgba(56,189,248,0.25)',
                          }}>Scopus</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 11 }}>
                      {p.conference_number ? `${p.conference_number}th edition` : 'N/A'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 10 }}>{p.verification_source || 'unverified'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Score breakdown */}
      {research.score_breakdown && Object.keys(research.score_breakdown).length > 0 && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Research Score Breakdown
            </h3>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--accent)', letterSpacing: '-0.03em' }}>
              {candidate.score_research ?? research.research_score ?? 0}
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>/100</span>
            </span>
          </div>
          <ScoreBreakdown breakdown={research.score_breakdown} />
        </div>
      )}

      {!research.journal_papers?.length && !research.conference_papers?.length && (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13, textAlign: 'center', padding: 40 }}>
          No publications found in this CV.
        </p>
      )}
    </div>
  )
}