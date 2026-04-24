// Employment Gantt-style timeline.
// Each record needs start_year and end_year (or is_current=true).
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts'

// Warm theme palette — matches Scholar's Warmth CSS vars.
const COLORS = ['#f0a030', '#9580ff', '#38c9b8', '#e87a8c', '#4ade80']

export default function TimelineChart({ candidate }) {
  if (!candidate?.employment?.records?.length) {
    return (
      <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        No employment records available.
      </p>
    )
  }

  const records = candidate.employment.records
  const minYear = Math.min(...records.map(r => r.start_year || 2000))

  const data = records.map((r, i) => ({
    name: `${r.job_title || 'Role'} @ ${r.organization || ''}`,
    start: (r.start_year || minYear) - minYear,
    duration: Math.max(1, (r.is_current ? new Date().getFullYear() : (r.end_year || new Date().getFullYear())) - (r.start_year || minYear)),
    color: COLORS[i % COLORS.length],
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 48)}>
      <BarChart layout="vertical" data={data} margin={{ left: 16, right: 24, top: 4, bottom: 4 }}>
        <XAxis
          type="number"
          tickFormatter={v => `${v + minYear}`}
          domain={[0, 'dataMax + 1']}
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={230}
          tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
            fontSize: 12,
            color: 'var(--text-primary)',
          }}
          formatter={(v, name, props) => [
            `${props.payload.start + minYear} to ${props.payload.start + props.payload.duration + minYear}`,
            'Period',
          ]}
        />
        <Bar dataKey="duration" stackId="a" radius={[4, 4, 4, 4]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}