import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
} from 'recharts'

/* ── Interpretation helpers ── */
function collabDiversityLabel(score) {
  if (score === null || score === undefined) {
    return { text: '—', color: 'var(--text-muted)', interpretation: '' }
  }
  if (score >= 0.75) return {
    text: 'Broadly Connected',
    color: 'var(--success)',
    interpretation: 'Works with many different collaborators rarely repeated — broad field reach.',
  }
  if (score >= 0.5) return {
    text: 'Moderately Diverse',
    color: 'var(--sky)',
    interpretation: 'Balanced mix of recurring partners and new collaborators.',
  }
  if (score >= 0.25) return {
    text: 'Stable Research Group',
    color: 'var(--warning)',
    interpretation: 'A recurring core group dominates — typical of productive, long-running labs.',
  }
  return {
    text: 'Tight-Knit Group',
    color: 'var(--violet)',
    interpretation: 'Almost all publications concentrate within a small, stable research group.',
  }
}

/* ── Shared atoms ── */
function EmptyState({ text }) {
  return (
    <p style={{
      color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13,
      padding: '40px 0', textAlign: 'center',
    }}>{text}</p>
  )
}

function MetricCard({ label, value, sub, subColor }) {
  return (
    <div style={{ padding: '18px 16px', background: 'var(--bg-card)', textAlign: 'center' }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400,
        color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.02em',
      }}>{value}</div>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: 5,
      }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 11, color: subColor || 'var(--text-muted)', marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

/* ── Co-author network SVG ── */
function NetworkGraph({ topCollaborators, candidateName }) {
  if (!topCollaborators?.length) return null

  const W = 400, H = 300
  const cx = W / 2, cy = H / 2
  const orbitR = 105
  const maxCount = Math.max(...topCollaborators.map(c => c.count), 1)
  const nodeR    = (n) => 6 + (n / maxCount) * 13
  const lineW    = (n) => 1 + (n / maxCount) * 2.5

  const initials = (candidateName || '?')
    .split(' ').map(n => n[0]).slice(0, 2).join('')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Orbit guide ring */}
      <circle cx={cx} cy={cy} r={orbitR}
        fill="none" stroke="var(--border-subtle)"
        strokeWidth={1} strokeDasharray="4 3" opacity={0.55} />

      {topCollaborators.map((c, i) => {
        const angle = (i / topCollaborators.length) * 2 * Math.PI - Math.PI / 2
        const nx = cx + Math.cos(angle) * orbitR
        const ny = cy + Math.sin(angle) * orbitR
        const r  = nodeR(c.count)

        // Push label beyond the node
        const labelPush = orbitR + r + 20
        const lx = cx + Math.cos(angle) * labelPush
        const ly = cy + Math.sin(angle) * labelPush

        // Text anchor: right side → start, left side → end, top/bottom → middle
        const anchor = nx > cx + 10 ? 'start' : nx < cx - 10 ? 'end' : 'middle'

        // Last name as short label
        const parts = (c.name || '').split(' ')
        const shortLabel = parts.length >= 2 ? parts[parts.length - 1] : (c.name || '').slice(0, 10)

        return (
          <g key={i}>
            {/* Edge (spoke) */}
            <line
              x1={cx} y1={cy} x2={nx} y2={ny}
              stroke="var(--accent)" strokeWidth={lineW(c.count)} opacity={0.2}
            />
            {/* Satellite node */}
            <circle cx={nx} cy={ny} r={r}
              fill="rgba(232,160,74,0.13)"
              stroke="var(--accent)" strokeWidth={1.5}
            />
            {/* Count inside node (only if node is large enough) */}
            {r >= 10 && (
              <text x={nx} y={ny} textAnchor="middle" dominantBaseline="middle"
                style={{ fontSize: 9, fill: 'var(--accent)', fontWeight: 700, pointerEvents: 'none' }}>
                {c.count}
              </text>
            )}
            {/* Name label */}
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle"
              style={{ fontSize: 10, fill: 'var(--text-secondary)', pointerEvents: 'none', fontFamily: 'inherit' }}>
              {shortLabel}
            </text>
          </g>
        )
      })}

      {/* Centre node: candidate */}
      <circle cx={cx} cy={cy} r={24} fill="var(--accent)" opacity={0.92} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 12, fill: '#1d1408', fontWeight: 700, pointerEvents: 'none' }}>
        {initials}
      </text>
    </svg>
  )
}

/* ── Bar chart tooltip ── */
function CollabTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-default)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 3 }}>
        {p.payload.name}
      </p>
      <p style={{ color: 'var(--accent)', fontWeight: 700 }}>
        {p.value} co-authored paper{p.value !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

/* ── Main component ── */
export default function CoauthorTab({ candidate }) {
  const r = candidate?.research
  if (!r) return <EmptyState text="No research data available." />

  const topCollabs    = r.top_collaborators    || []
  const studentCollabs = r.student_collaborations || []
  const hasData = r.unique_coauthors > 0 || topCollabs.length > 0

  if (!hasData) {
    return <EmptyState text="Co-author analysis not yet available for this candidate." />
  }

  const divInfo = collabDiversityLabel(r.collaboration_diversity_score)
  const recurringPct = ((r.recurring_proportion || 0) * 100).toFixed(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Metrics strip ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1, background: 'var(--border-subtle)',
        border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden',
      }}>
        <MetricCard label="Unique Co-authors"        value={r.unique_coauthors} />
        <MetricCard label="Avg / Paper"              value={(r.avg_coauthors_per_paper ?? 0).toFixed(1)} />
        <MetricCard
          label="Recurring Collaborators"
          value={r.recurring_collaborator_count}
          sub={`${recurringPct}% of papers`}
        />
        <MetricCard
          label="Diversity Score"
          value={(r.collaboration_diversity_score ?? 0).toFixed(3)}
          sub={divInfo.text}
          subColor={divInfo.color}
        />
      </div>

      {/* ── Network SVG + Top-5 bar chart ── */}
      {topCollabs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Network visualization */}
          <div className="card" style={{ padding: '22px 24px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
              Co-author Network
            </h3>
            <NetworkGraph topCollaborators={topCollabs} candidateName={candidate.full_name} />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 10 }}>
              node size ∝ paper count · showing top {topCollabs.length} collaborator{topCollabs.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Horizontal bar chart */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Top Collaborators
              </h3>
            </div>
            <div style={{ padding: '16px 22px 20px' }}>
              <ResponsiveContainer width="100%" height={Math.max(160, topCollabs.length * 46)}>
                <BarChart
                  layout="vertical"
                  data={topCollabs}
                  margin={{ top: 4, right: 30, left: 0, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    axisLine={false} tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                    width={132}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip content={<CollabTooltip />} />
                  <Bar
                    dataKey="count"
                    fill="var(--accent)"
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                    opacity={0.82}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      {/* ── Collaboration analysis panel ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Collaboration Analysis
          </h3>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Diversity bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                Collaboration Diversity
              </span>
              <span style={{ color: divInfo.color, fontWeight: 600 }}>{divInfo.text}</span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(r.collaboration_diversity_score ?? 0) * 100}%`,
                background: divInfo.color,
                borderRadius: 9999, transition: 'width 0.4s',
              }} />
            </div>
            {divInfo.interpretation && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                {divInfo.interpretation}
              </p>
            )}
          </div>

          {/* Recurring proportion bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                Papers with Recurring Collaborators
              </span>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                {recurringPct}%
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${r.recurring_proportion * 100}%`,
                background: 'var(--teal)',
                borderRadius: 9999, transition: 'width 0.4s',
              }} />
            </div>
          </div>

        </div>
      </div>

      {/* ── Student co-publications (conditional) ── */}
      {studentCollabs.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Student Co-publications
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              supervised students who appear as co-authors
            </span>
          </div>
          <div style={{ padding: '16px 22px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {studentCollabs.map((name, i) => (
              <span key={i} style={{
                padding: '4px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 500,
                background: 'rgba(74,222,128,0.1)', color: 'var(--success)',
                border: '1px solid rgba(74,222,128,0.22)',
              }}>{name}</span>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}