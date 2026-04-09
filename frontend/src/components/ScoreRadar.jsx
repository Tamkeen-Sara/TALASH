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
  { key: 'score_research', label: 'Research' },
  { key: 'score_education', label: 'Education' },
  { key: 'score_employment', label: 'Employment' },
  { key: 'score_skills', label: 'Skills' },
  { key: 'score_supervision', label: 'Supervision' },
]

export default function ScoreRadar({ candidate }) {
  if (!candidate) return null

  const data = DIMENSIONS.map(({ key, label }) => ({
    dimension: label,
    score: candidate[key] ?? 0,
  }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 13 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} />
        <Radar
          name={candidate.full_name}
          dataKey="score"
          stroke="#1a3557"
          fill="#2563eb"
          fillOpacity={0.35}
        />
        <Tooltip formatter={(v) => [`${v}`, 'Score']} />
      </RadarChart>
    </ResponsiveContainer>
  )
}
