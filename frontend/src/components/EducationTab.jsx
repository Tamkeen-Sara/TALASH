function QsRankBadge({ rank, recognized, qualityTier, qualityBand }) {
  // QS rank takes priority if available
  if (rank) {
    const [bg, color, border] =
      rank <= 100  ? ['rgba(74,222,128,0.1)',  'var(--success)', 'rgba(74,222,128,0.25)'] :
      rank <= 500  ? ['rgba(56,189,248,0.1)',  'var(--sky)',     'rgba(56,189,248,0.25)'] :
      rank <= 1000 ? ['var(--accent-dim)',      'var(--accent)',  'var(--accent-ring)']    :
                     ['var(--bg-elevated)',     'var(--text-muted)', 'var(--border-subtle)']
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
        fontSize: 11, fontWeight: 600, background: bg, color, border: `1px solid ${border}`,
      }} title={qualityBand || ''}>
        QS #{rank}
      </span>
    )
  }
  // OpenAlex quality tier (no QS rank but have research metrics)
  if (qualityTier) {
    const map = {
      Elite:      ['rgba(74,222,128,0.12)',  'var(--success)', 'rgba(74,222,128,0.28)'],
      Excellent:  ['rgba(56,189,248,0.12)',  'var(--sky)',     'rgba(56,189,248,0.28)'],
      Strong:     ['var(--accent-dim)',       'var(--accent)',  'var(--accent-ring)'   ],
      Good:       ['rgba(232,160,74,0.10)',   'var(--accent)',  'var(--accent-ring)'   ],
      Recognized: ['rgba(232,160,74,0.08)',   'var(--accent)',  'rgba(232,160,74,0.20)'],
      Known:      ['var(--bg-elevated)',      'var(--text-muted)', 'var(--border-subtle)'],
    }
    const [bg, color, border] = map[qualityTier] || map.Known
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
        fontSize: 11, fontWeight: 600, background: bg, color, border: `1px solid ${border}`,
      }} title={qualityBand || qualityTier}>
        {qualityBand || qualityTier}
      </span>
    )
  }
  if (recognized) {
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
        fontSize: 11, fontWeight: 600,
        background: 'rgba(232,160,74,0.1)', color: 'var(--accent)',
        border: '1px solid var(--accent-ring)',
      }}>
        Recognized
      </span>
    )
  }
  return <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Unverified</span>
}

function CgpaBar({ cgpa, scale = 4 }) {
  if (!cgpa) return <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>N/A</span>
  const pct = Math.min(100, (cgpa / scale) * 100)
  const color = pct >= 87.5 ? 'var(--success)' : pct >= 75 ? 'var(--sky)' : pct >= 62.5 ? 'var(--accent)' : 'var(--error)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 9999 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {cgpa}/{scale}
      </span>
    </div>
  )
}

function GapTimeline({ gaps }) {
  if (!gaps?.length) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--success)' }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', background: 'rgba(74,222,128,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
      }}>✓</span>
      No education gaps detected
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {gaps.map((g, i) => {
        const justified = g.justified
        const hasRoles = g.justifying_roles?.length > 0
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
            borderRadius: 12, fontSize: 13,
            background: justified ? 'rgba(74,222,128,0.07)' : 'rgba(251,113,133,0.07)',
            border: `1px solid ${justified ? 'rgba(74,222,128,0.18)' : 'rgba(251,113,133,0.18)'}`,
          }}>
            <span style={{
              marginTop: 1, flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              background: justified ? 'var(--success)' : 'var(--error)', color: '#fff',
            }}>
              {justified ? '✓' : '!'}
            </span>
            <div>
              <p style={{ fontWeight: 600, color: justified ? 'var(--success)' : 'var(--error)', margin: 0 }}>
                {g.from_year} to {g.to_year}
                <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-muted)' }}>
                  ({g.duration_years} year{g.duration_years !== 1 ? 's' : ''})
                </span>
              </p>
              <p style={{ fontSize: 12, marginTop: 3, marginBottom: 0,
                color: justified ? 'var(--success)' : 'var(--error)',
                opacity: 0.85,
              }}>
                {justified
                  ? hasRoles
                    ? `Justified, working as: ${g.justifying_roles.join(', ')}`
                    : 'Justified: enrolled in education program'
                  : 'Unjustified gap: no activity during this period'}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ScoreBreakdown({ breakdown }) {
  if (!breakdown || !Object.keys(breakdown).length) return null
  const items = [
    { key: 'academic_performance',  label: 'Academic Performance',  max: 40, color: 'var(--sky)'     },
    { key: 'highest_qualification', label: 'Highest Qualification', max: 25, color: 'var(--violet)'  },
    { key: 'institutional_quality', label: 'Institutional Quality', max: 20, color: '#a855f7'        },
    { key: 'gap_score',             label: 'Gap Score',             max: 15, color: 'var(--success)'  },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {items.map(({ key, label, max, color }) => {
        const val = breakdown[key] ?? 0
        const pct = Math.min(100, (val / max) * 100)
        return (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
              <span style={{ color: 'var(--text-muted)' }}>{val} / {max}</span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 9999, transition: 'width 0.3s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function EducationTab({ candidate }) {
  const edu = candidate?.education
  if (!edu) return <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13 }}>No education data.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Degrees table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Degrees</h3>
        </div>
        {edu.degrees?.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['DEGREE', 'INSTITUTION', 'PERIOD', 'CGPA', 'QS RANK', 'ACAD. REP', 'CITATIONS/FAC'].map(h => (
                    <th key={h} style={{
                      padding: '10px 20px', textAlign: 'left', fontSize: 10,
                      fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {edu.degrees.map((d, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: 9999,
                        fontSize: 11, fontWeight: 700, marginRight: 8,
                        background: /phd|doctor/i.test(d.level) ? 'rgba(168,85,247,0.12)' :
                          /master|m\.sc|msc|mphil|mba|ms\b/i.test(d.level) ? 'rgba(56,189,248,0.12)' : 'var(--bg-elevated)',
                        color: /phd|doctor/i.test(d.level) ? '#a855f7' :
                          /master|m\.sc|msc|mphil|mba|ms\b/i.test(d.level) ? 'var(--sky)' : 'var(--text-muted)',
                      }}>{d.level}</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {d.specialization || d.degree_title}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>{d.institution}</td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {d.start_year ?? '?'} to {d.is_ongoing ? 'Present' : (d.end_year ?? '?')}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <CgpaBar
                        cgpa={d.cgpa_normalized ?? d.cgpa}
                        scale={d.cgpa_normalized ? 4 : (d.cgpa_scale ?? 4)}
                      />
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <QsRankBadge
                        rank={d.qs_rank || d.the_rank}
                        recognized={d.hec_recognized}
                        qualityTier={d.quality_tier}
                        qualityBand={d.quality_band}
                      />
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {d.qs_academic_reputation != null ? d.qs_academic_reputation : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>N/A</span>}
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {d.qs_citations_per_faculty != null ? d.qs_citations_per_faculty : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>N/A</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ padding: '20px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13 }}>
            No degree records found.
          </p>
        )}
      </div>

      {/* SSE / HSE */}
      {(edu.sse || edu.hse) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[edu.sse && { label: 'Secondary (SSE/Matric)', rec: edu.sse },
            edu.hse && { label: 'Higher Secondary (HSE/FSc)', rec: edu.hse }]
            .filter(Boolean).map(({ label, rec }) => (
            <div key={label} className="card" style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
                {label}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 26, fontWeight: 400, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  {rec.percentage ?? '--'}%
                </span>
                {rec.grade && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Grade {rec.grade}</span>}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {rec.board ?? 'Board unknown'} · {rec.year ?? 'Unknown'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Gap analysis */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>Gap Analysis</h3>
        <GapTimeline gaps={edu.education_gaps} />
      </div>

      {/* Score breakdown */}
      {edu.score_breakdown && Object.keys(edu.score_breakdown).length > 0 && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Education Score Breakdown
            </h3>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--accent)', letterSpacing: '-0.03em' }}>
              {edu.education_score ?? 0}
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>/100</span>
            </span>
          </div>
          <ScoreBreakdown breakdown={edu.score_breakdown} />
        </div>
      )}
    </div>
  )
}
