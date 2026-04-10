import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const DIMENSIONS = [
  { key: 'score_research',    label: 'Research'    },
  { key: 'score_education',   label: 'Education'   },
  { key: 'score_employment',  label: 'Employment'  },
  { key: 'score_skills',      label: 'Skills'      },
  { key: 'score_supervision', label: 'Supervision' },
]

// Default amber accent — matches the Scholar's Warmth theme.
// Compare page passes a per-candidate color override via the color prop.
const DEFAULT_COLOR = '#f0a030'

export default function ScoreRadar({ candidate, color = DEFAULT_COLOR }) {
  if (!candidate) return null

  const data = DIMENSIONS.map(({ key, label }) => ({
    dimension: label,
    score: candidate[key] ?? 0,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <PolarGrid stroke="var(--border-default)" />
        <PolarAngleAxis
          dataKey="dimension"
          tick={{ fontSize: 12, fill: 'var(--text-muted)', fontWeight: 500 }}
        />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          name={candidate.full_name}
          dataKey="score"
          stroke={color}
          fill={color}
          fillOpacity={0.18}
          strokeWidth={2}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
            fontSize: 12,
            color: 'var(--text-primary)',
          }}
          formatter={(v) => [`${v}`, 'Score']}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}