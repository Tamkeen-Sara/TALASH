import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, Treemap,
} from 'recharts'

/* ── Colour palette for dynamically-discovered themes ── */
const DOMAIN_COLORS = [
  '#f59e0b', '#38bdf8', '#818cf8', '#4ade80', '#f87171',
  '#fb923c', '#a78bfa', '#34d399', '#f472b6', '#facc15',
  '#22d3ee', '#c084fc', '#6ee7b7', '#93c5fd', '#94a3b8',
]

/* Hash the theme name to a stable index so the same theme always gets the
   same colour across renders, regardless of discovery order. */
function getDomainColor(domain) {
  let h = 0
  for (let i = 0; i < (domain || '').length; i++) {
    h = Math.imul(31, h) + (domain || '').charCodeAt(i) | 0
  }
  return DOMAIN_COLORS[Math.abs(h) % DOMAIN_COLORS.length]
}

/* ── Interpretation helpers ── */
function diversityLabel(score) {
  if (score >= 0.75) return { text: 'Highly Diverse',              color: 'var(--success)' }
  if (score >= 0.5)  return { text: 'Moderately Diverse',          color: 'var(--sky)'     }
  if (score >= 0.25) return { text: 'Somewhat Focused',            color: 'var(--warning)' }
  return               { text: 'Highly Focused — Specialist',      color: 'var(--violet)'  }
}

/* ── Shared sub-components ── */
function EmptyState({ text }) {
  return (
    <p style={{
      color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13,
      padding: '40px 0', textAlign: 'center',
    }}>{text}</p>
  )
}

function MetricCard({ label, value, sub, subColor, valueStyle }) {
  return (
    <div style={{ padding: '18px 20px', background: 'var(--bg-card)', textAlign: 'center' }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400,
        color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.02em',
        ...valueStyle,
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

/* ── Treemap custom content ── */
function TreemapBlock({ x, y, width, height, name, value, totalPapers }) {
  const color = getDomainColor(name)
  const charBudget = Math.max(4, Math.floor(width / 6.5))
  const label = (name || '').length > charBudget
    ? name.slice(0, charBudget - 1) + '…'
    : name
  const pct = totalPapers > 0 ? Math.round((value / totalPapers) * 100) : 0
  const showText = width > 52 && height > 22
  const showPct  = width > 60 && height > 46

  return (
    <g>
      <rect x={x} y={y} width={width} height={height}
        fill={color} stroke="var(--bg-card)" strokeWidth={2} rx={3} opacity={0.82} />
      {showText && (
        <text
          x={x + width / 2} y={y + height / 2 - (showPct ? 7 : 0)}
          textAnchor="middle" dominantBaseline="middle"
          style={{
            fontSize: Math.min(11, Math.floor(width / 7)),
            fill: '#111', fontWeight: 600, pointerEvents: 'none',
          }}>{label}</text>
      )}
      {showPct && (
        <text
          x={x + width / 2} y={y + height / 2 + 9}
          textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 9, fill: '#111', opacity: 0.6, pointerEvents: 'none' }}>
          {pct}%
        </text>
      )}
    </g>
  )
}

/* ── Tooltips ── */
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]?.payload
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-default)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: 11 }}>{label}</p>
      {entry && (
        <>
          <p style={{ color: getDomainColor(entry.dominant_domain), fontWeight: 600 }}>
            {entry.dominant_domain}
          </p>
          <p style={{ color: 'var(--text-muted)', marginTop: 2 }}>
            {payload[0]?.value} paper{payload[0]?.value !== 1 ? 's' : ''}
          </p>
        </>
      )}
    </div>
  )
}

/* ── Domain breakdown row ── */
function DomainRow({ cluster, maxCount }) {
  const pct = maxCount > 0 ? (cluster.count / maxCount) * 100 : 0
  const color = getDomainColor(cluster.domain)
  return (
    <div
      style={{ padding: '11px 22px', borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.12s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
            {cluster.domain}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cluster.percentage}%</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 60, textAlign: 'right' }}>
            {cluster.count} paper{cluster.count !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: 9999, transition: 'width 0.4s', opacity: 0.75,
        }} />
      </div>
    </div>
  )
}

/* ── Main component ── */
export default function TopicTab({ candidate }) {
  const r = candidate?.research
  if (!r) return <EmptyState text="No research data available." />

  const clusters = r.topic_clusters || []
  const trend    = r.topic_trend    || []
  const diversity = r.topic_diversity_score ?? null
  const totalPapers = clusters.reduce((s, c) => s + c.count, 0)

  if (!clusters.length) {
    return <EmptyState text="Topic classification not yet available for this candidate." />
  }

  const divInfo = diversity !== null ? diversityLabel(diversity) : { text: '—', color: 'var(--text-muted)' }

  const treemapData = clusters.map(c => ({ name: c.domain, value: c.count }))

  const uniqueTrendDomains = [...new Set(trend.map(t => t.dominant_domain))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Stats strip ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 1, background: 'var(--border-subtle)',
        border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden',
      }}>
        <MetricCard
          label="Dominant Topic"
          value={r.dominant_topic || '—'}
          sub={`${clusters[0]?.count || 0} papers`}
          valueStyle={{ fontSize: 16, lineHeight: 1.35, whiteSpace: 'normal', wordBreak: 'break-word' }}
        />
        <MetricCard
          label="Research Diversity"
          value={diversity !== null ? diversity.toFixed(3) : '—'}
          sub={divInfo.text}
          subColor={divInfo.color}
        />
        <MetricCard
          label="Active Domains"
          value={clusters.length}
          sub={`across ${totalPapers} paper${totalPapers !== 1 ? 's' : ''}`}
        />
      </div>

      {/* ── Topic treemap ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Topic Distribution
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            tile area ∝ paper count
          </span>
        </div>
        <div style={{ padding: '16px 22px 20px' }}>
          <ResponsiveContainer width="100%" height={240}>
            <Treemap
              data={treemapData}
              dataKey="value"
              isAnimationActive={false}
              content={(props) => <TreemapBlock {...props} totalPapers={totalPapers} />}
            />
          </ResponsiveContainer>
          {/* Colour legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 14 }}>
            {clusters.map(c => (
              <div key={c.domain} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: getDomainColor(c.domain), flexShrink: 0 }} />
                {c.domain} ({c.count})
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Domain breakdown rows ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Domain Breakdown
          </h3>
        </div>
        {clusters.map((c, i) => (
          <DomainRow key={i} cluster={c} maxCount={clusters[0].count} />
        ))}
      </div>

      {/* ── Temporal trend (conditional) ── */}
      {trend.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Research Trend Over Time
            </h3>
          </div>
          <div style={{ padding: '16px 22px 20px' }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trend} margin={{ top: 5, right: 20, left: -10, bottom: 36 }}>
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  axisLine={false} tickLine={false}
                  angle={-30} textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  axisLine={false} tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<TrendTooltip />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {trend.map((entry, i) => (
                    <Cell key={i} fill={getDomainColor(entry.dominant_domain)} opacity={0.82} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Trend legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 2 }}>
              {uniqueTrendDomains.map(domain => (
                <div key={domain} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: getDomainColor(domain), flexShrink: 0 }} />
                  {domain}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}