/**
 * Employment / Education Gantt-style timeline.
 * Expects candidate.employment.records[] each with start_year, end_year, title, institution.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts'

const COLORS = ['#1a3557', '#2563eb', '#60a5fa', '#93c5fd', '#bfdbfe']

export default function TimelineChart({ candidate }) {
  if (!candidate?.employment?.records?.length) {
    return (
      <p className="text-slate-500 text-sm italic">No employment records available.</p>
    )
  }

  const records = candidate.employment.records
  const minYear = Math.min(...records.map((r) => r.start_year || 2000))

  const data = records.map((r, i) => ({
    name: `${r.job_title || 'Role'} @ ${r.organization || ''}`,
    start: (r.start_year || minYear) - minYear,
    duration: (r.end_year || new Date().getFullYear()) - (r.start_year || minYear),
    color: COLORS[i % COLORS.length],
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 44)}>
      <BarChart layout="vertical" data={data} margin={{ left: 20, right: 20 }}>
        <XAxis
          type="number"
          tickFormatter={(v) => `${v + minYear}`}
          domain={[0, 'dataMax + 1']}
        />
        <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v, name, props) => [
            `${props.payload.start + minYear} – ${
              props.payload.start + props.payload.duration + minYear
            }`,
            'Period',
          ]}
        />
        <Bar dataKey="duration" stackId="a">
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
