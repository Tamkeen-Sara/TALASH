/**
 * Furqan's Week 3 contribution:
 * Education tab — degrees table, QS rank badges, CGPA display,
 * gap timeline with justified/unjustified flags, score breakdown.
 */

function QsRankBadge({ rank }) {
  if (!rank) return <span className="text-xs text-slate-400 italic">Unranked</span>
  const color =
    rank <= 100  ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' :
    rank <= 500  ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' :
    rank <= 1000 ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' :
                   'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      QS #{rank}
    </span>
  )
}

function CgpaBar({ cgpa, scale = 4 }) {
  if (!cgpa) return <span className="text-slate-400 text-xs italic">N/A</span>
  const pct = Math.min(100, (cgpa / scale) * 100)
  const color = pct >= 87.5 ? 'bg-emerald-500' : pct >= 75 ? 'bg-blue-500' : pct >= 62.5 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
        {cgpa}/{scale}
      </span>
    </div>
  )
}

function GapTimeline({ gaps }) {
  if (!gaps?.length) return (
    <div className="flex items-center gap-2 text-emerald-600 text-sm">
      <span className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center text-xs">✓</span>
      No education gaps detected
    </div>
  )

  return (
    <div className="space-y-2">
      {gaps.map((g, i) => (
        <div key={i} className={`flex items-start gap-3 p-3 rounded-xl text-sm border
          ${g.justified
            ? 'bg-emerald-50 border-emerald-100'
            : 'bg-red-50 border-red-100'}`}>
          <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
            ${g.justified ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
            {g.justified ? '✓' : '!'}
          </span>
          <div>
            <p className={`font-semibold ${g.justified ? 'text-emerald-800' : 'text-red-800'}`}>
              {g.from_year} – {g.to_year}
              <span className="font-normal ml-2">({g.duration_years} year{g.duration_years !== 1 ? 's' : ''})</span>
            </p>
            {g.justified ? (
              <p className="text-emerald-700 text-xs mt-0.5">
                Justified — working as: {g.justifying_roles.join(', ')}
              </p>
            ) : (
              <p className="text-red-700 text-xs mt-0.5">Unjustified gap — no employment during this period</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScoreBreakdown({ breakdown }) {
  if (!breakdown || !Object.keys(breakdown).length) return null
  const items = [
    { key: 'academic_performance', label: 'Academic Performance', max: 40, color: 'bg-blue-500' },
    { key: 'highest_qualification', label: 'Highest Qualification', max: 25, color: 'bg-indigo-500' },
    { key: 'institutional_quality', label: 'Institutional Quality', max: 20, color: 'bg-purple-500' },
    { key: 'gap_score', label: 'Gap Score', max: 15, color: 'bg-emerald-500' },
  ]
  return (
    <div className="space-y-3">
      {items.map(({ key, label, max, color }) => {
        const val = breakdown[key] ?? 0
        const pct = Math.min(100, (val / max) * 100)
        return (
          <div key={key}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600 font-medium">{label}</span>
              <span className="text-slate-500">{val} / {max}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function EducationTab({ candidate }) {
  const edu = candidate?.education
  if (!edu) return <p className="text-slate-400 italic text-sm">No education data.</p>

  return (
    <div className="space-y-6">
      {/* Degrees table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Degrees</h3>
        </div>
        {edu.degrees?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <th className="px-5 py-3 text-left font-semibold">Degree</th>
                  <th className="px-5 py-3 text-left font-semibold">Institution</th>
                  <th className="px-5 py-3 text-left font-semibold">Period</th>
                  <th className="px-5 py-3 text-left font-semibold">CGPA</th>
                  <th className="px-5 py-3 text-left font-semibold">QS Rank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {edu.degrees.map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-5 py-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold mr-2
                        ${d.level === 'PhD' ? 'bg-purple-100 text-purple-700' :
                          d.level?.startsWith('M') ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'}`}>
                        {d.level}
                      </span>
                      <span className="text-slate-700 font-medium">{d.specialization || d.degree_title}</span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{d.institution}</td>
                    <td className="px-5 py-4 text-slate-500 text-xs whitespace-nowrap">
                      {d.start_year ?? '?'} – {d.is_ongoing ? 'Present' : (d.end_year ?? '?')}
                    </td>
                    <td className="px-5 py-4">
                      <CgpaBar
                        cgpa={d.cgpa_normalized ?? d.cgpa}
                        scale={d.cgpa_normalized ? 4 : (d.cgpa_scale ?? 4)}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <QsRankBadge rank={d.qs_rank || d.the_rank} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-6 text-slate-400 italic text-sm">No degree records found.</p>
        )}
      </div>

      {/* SSE / HSE if present */}
      {(edu.sse || edu.hse) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[edu.sse && { label: 'Secondary (SSE/Matric)', rec: edu.sse },
            edu.hse && { label: 'Higher Secondary (HSE/FSc)', rec: edu.hse }]
            .filter(Boolean).map(({ label, rec }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-slate-800">{rec.percentage ?? '—'}%</span>
                {rec.grade && <span className="text-sm text-slate-500">Grade {rec.grade}</span>}
              </div>
              <p className="text-xs text-slate-400 mt-1">{rec.board ?? 'Board unknown'} · {rec.year ?? '—'}</p>
            </div>
          ))}
        </div>
      )}

      {/* Gap analysis */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">Gap Analysis</h3>
        <GapTimeline gaps={edu.education_gaps} />
      </div>

      {/* Score breakdown */}
      {edu.score_breakdown && Object.keys(edu.score_breakdown).length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800">Education Score Breakdown</h3>
            <span className="text-2xl font-bold text-blue-600">{edu.education_score ?? '—'}<span className="text-sm text-slate-400 font-normal">/100</span></span>
          </div>
          <ScoreBreakdown breakdown={edu.score_breakdown} />
        </div>
      )}
    </div>
  )
}