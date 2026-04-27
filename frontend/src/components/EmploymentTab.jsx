import TimelineChart from './TimelineChart'

function OverlapCard({ overlap }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10, fontSize: 12,
      background: overlap.flagged ? 'rgba(251,113,133,0.07)' : 'rgba(74,222,128,0.07)',
      border: `1px solid ${overlap.flagged ? 'rgba(251,113,133,0.2)' : 'rgba(74,222,128,0.2)'}`,
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <span style={{
        marginTop: 1, width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color: '#fff',
        background: overlap.flagged ? 'var(--error)' : 'var(--success)',
      }}>{overlap.flagged ? '!' : 'ok'}</span>
      <div>
        <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontSize: 12 }}>
          {overlap.job_a} at {overlap.org_a}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', margin: '0 6px' }}>overlaps with</span>
          {overlap.job_b} at {overlap.org_b}
        </p>
        <p style={{
          fontSize: 11, marginTop: 3, marginBottom: 0,
          color: overlap.flagged ? 'var(--error)' : 'var(--success)', opacity: 0.9,
        }}>
          {overlap.reason} ({overlap.overlap_years} year{overlap.overlap_years !== 1 ? 's' : ''})
        </p>
      </div>
    </div>
  )
}

function ScoreBreakdown({ breakdown }) {
  if (!breakdown || !Object.keys(breakdown).length) return null
  const items = [
    { key: 'progression_score', label: 'Career Progression', max: 60, color: 'var(--accent)'  },
    { key: 'experience_score',  label: 'Experience Years',   max: 20, color: 'var(--sky)'     },
    { key: 'academic_bonus',    label: 'Academic Bonus',     max: 10, color: 'var(--success)'  },
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
      {breakdown.overlap_penalty > 0 && (
        <div style={{ fontSize: 12, color: 'var(--error)', marginTop: 2 }}>
          Overlap penalty: -{breakdown.overlap_penalty} pts ({breakdown.flagged_overlaps} flagged)
        </div>
      )}
    </div>
  )
}

export default function EmploymentTab({ candidate }) {
  const emp = candidate?.employment
  if (!emp) return <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13 }}>No employment data.</p>
  if (!emp.records?.length) return (
    <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13, textAlign: 'center', padding: 40 }}>
      No employment records found in this CV.
    </p>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Timeline chart */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
          Career Timeline
        </h3>
        <TimelineChart candidate={candidate} />
      </div>

      {/* Employment records */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Employment Records ({emp.records.length})
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {emp.records.map((r, i) => (
            <div key={i} style={{
              padding: '14px 20px', borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.job_title}</span>
                  {r.employment_type && !['null','none',''].includes(r.employment_type.toLowerCase()) && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 9999, fontWeight: 500,
                      background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)', textTransform: 'capitalize',
                    }}>{r.employment_type}</span>
                  )}
                  {r.seniority_score && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 9999, fontWeight: 600,
                      background: 'var(--accent-dim)', color: 'var(--accent)',
                      border: '1px solid var(--accent-ring)',
                    }}>Level {r.seniority_score}/10</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{r.organization}</div>
                {r.responsibilities?.length > 0 && (
                  <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    {r.responsibilities.slice(0, 3).map((res, j) => <li key={j}>{res}</li>)}
                    {r.responsibilities.length > 3 && <li style={{ listStyle: 'none', marginLeft: -16 }}>+{r.responsibilities.length - 3} more</li>}
                  </ul>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {r.start_year ?? '?'} to {r.is_current ? 'Present' : (r.end_year ?? '?')}
                </div>
                {r.start_year && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {(r.is_current ? new Date().getFullYear() : (r.end_year ?? r.start_year)) - r.start_year} yr{((r.is_current ? new Date().getFullYear() : (r.end_year ?? r.start_year)) - r.start_year) !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Employment gaps between jobs */}
      {emp.gaps?.length > 0 && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>
            Employment Gaps
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {emp.gaps.map((g, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                borderRadius: 12, fontSize: 13,
                background: 'rgba(251,113,133,0.07)', border: '1px solid rgba(251,113,133,0.18)',
              }}>
                <span style={{
                  marginTop: 1, flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, background: 'var(--error)', color: '#fff',
                }}>!</span>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--error)', margin: 0 }}>
                    {g.from_year} to {g.to_year}
                    <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-muted)' }}>
                      ({g.duration_years} year{g.duration_years !== 1 ? 's' : ''})
                    </span>
                  </p>
                  <p style={{ fontSize: 12, marginTop: 3, marginBottom: 0, color: 'var(--text-muted)' }}>
                    After: {g.after_role} — Before: {g.before_role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overlap analysis */}
      {emp.overlaps?.length > 0 && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>
            Overlap Analysis
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {emp.overlaps.map((o, i) => <OverlapCard key={i} overlap={o} />)}
          </div>
        </div>
      )}

      {/* Score breakdown */}
      {emp.score_breakdown && Object.keys(emp.score_breakdown).length > 0 && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Employment Score Breakdown
            </h3>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--accent)', letterSpacing: '-0.03em' }}>
              {candidate.score_employment ?? emp.employment_score ?? 0}
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>/100</span>
            </span>
          </div>
          <ScoreBreakdown breakdown={emp.score_breakdown} />
        </div>
      )}
    </div>
  )
}