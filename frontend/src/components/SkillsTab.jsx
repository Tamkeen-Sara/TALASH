function EvidenceBadge({ level }) {
  const map = {
    Strong:      { bg: 'rgba(74,222,128,0.12)',  color: 'var(--success)', border: 'rgba(74,222,128,0.28)'  },
    Partial:     { bg: 'rgba(232,160,74,0.12)',  color: 'var(--accent)',  border: 'rgba(232,160,74,0.28)'  },
    Weak:        { bg: 'rgba(148,163,184,0.10)', color: 'var(--text-muted)', border: 'rgba(148,163,184,0.22)' },
    Unsupported: { bg: 'rgba(251,113,133,0.10)', color: 'var(--error)',   border: 'rgba(251,113,133,0.22)' },
  }
  const s = map[level] || map.Weak
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      flexShrink: 0,
    }}>{level || 'Unclassified'}</span>
  )
}

function ScoreBreakdown({ breakdown, score }) {
  if (!breakdown || !Object.keys(breakdown).length) return null
  const items = [
    { key: 'strong_count',      label: 'Strong',       color: 'var(--success)', max: breakdown.total_skills || 1 },
    { key: 'partial_count',     label: 'Partial',      color: 'var(--accent)',  max: breakdown.total_skills || 1 },
    { key: 'weak_count',        label: 'Weak',         color: 'var(--text-muted)', max: breakdown.total_skills || 1 },
    { key: 'unsupported_count', label: 'Unsupported',  color: 'var(--error)',   max: breakdown.total_skills || 1 },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(({ key, label, color, max }) => {
        const val = breakdown[key] ?? 0
        const pct = Math.min(100, (val / max) * 100)
        return (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
              <span style={{ color: 'var(--text-muted)' }}>{val} skill{val !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ height: 5, background: 'var(--bg-elevated)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 9999, transition: 'width 0.3s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SkillsTab({ candidate }) {
  const skills = candidate?.skills
  if (!skills || !skills.claimed_skills?.length) {
    return (
      <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
        No skills data extracted from this CV.
      </p>
    )
  }

  const analyzed = skills.analyzed_skills || []
  const hasAnalysis = analyzed.length > 0
  const score = skills.skills_score ?? candidate.score_skills

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Skills grid */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Claimed Skills ({skills.claimed_skills.length})
          </h3>
          {hasAnalysis && (
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-muted)' }}>
              {['Strong', 'Partial', 'Weak', 'Unsupported'].map(level => {
                const count = analyzed.filter(s => s.evidence_level === level).length
                return count > 0 ? (
                  <span key={level}><EvidenceBadge level={level} /> {count}</span>
                ) : null
              })}
            </div>
          )}
        </div>

        {hasAnalysis ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {analyzed.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
                padding: '12px 20px',
                borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
                    {s.skill_name}
                  </p>
                  {s.evidence_source && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                      {s.evidence_source}
                    </p>
                  )}
                </div>
                <EvidenceBadge level={s.evidence_level} />
              </div>
            ))}
          </div>
        ) : (
          /* Not yet analyzed — show plain list */
          <div style={{ padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {skills.claimed_skills.map((s, i) => (
              <span key={i} style={{
                padding: '4px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 500,
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}>{s}</span>
            ))}
          </div>
        )}
      </div>

      {/* JD alignment */}
      {skills.jd_alignment_score != null && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Job Description Alignment
            </h3>
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400,
              color: skills.jd_alignment_score >= 70 ? 'var(--success)' : skills.jd_alignment_score >= 45 ? 'var(--accent)' : 'var(--error)',
              letterSpacing: '-0.02em',
            }}>
              {Math.round(skills.jd_alignment_score)}%
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 9999, transition: 'width 0.4s',
              width: `${skills.jd_alignment_score}%`,
              background: skills.jd_alignment_score >= 70 ? 'var(--success)' : skills.jd_alignment_score >= 45 ? 'var(--accent)' : 'var(--error)',
            }} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            {skills.jd_alignment_score >= 70 ? 'Strong alignment with the provided job description.'
              : skills.jd_alignment_score >= 45 ? 'Partial alignment — some key requirements covered.'
              : 'Weak alignment — candidate skill set diverges from role requirements.'}
          </p>
        </div>
      )}

      {/* Score breakdown */}
      {hasAnalysis && skills.score_breakdown && Object.keys(skills.score_breakdown).length > 0 && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Skills Score Breakdown
            </h3>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--accent)', letterSpacing: '-0.03em' }}>
              {score ?? 0}
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>/100</span>
            </span>
          </div>
          <ScoreBreakdown breakdown={skills.score_breakdown} score={score} />
        </div>
      )}
    </div>
  )
}