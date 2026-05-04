import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, Loader2, Sparkles } from 'lucide-react'
import { getCandidates, getCandidate, getCompareNarrative } from '../api/talash'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import usePageTitle from '../hooks/usePageTitle'
import useCandidateStore from '../store/candidateStore'

const DIMS = [
  { key: 'score_research',    label: 'Research'    },
  { key: 'score_education',   label: 'Education'   },
  { key: 'score_employment',  label: 'Employment'  },
  { key: 'score_skills',      label: 'Skills'      },
  { key: 'score_supervision', label: 'Supervision' },
]

const TABLE_DIMS = [...DIMS, { key: 'computed_score', label: 'Total' }]

const COLORS = [
  { stroke: '#e8a04a', bg: 'rgba(232,160,74,0.10)',  border: 'rgba(232,160,74,0.22)'  },
  { stroke: '#9580ff', bg: 'rgba(149,128,255,0.10)', border: 'rgba(149,128,255,0.22)' },
  { stroke: '#5fd4c0', bg: 'rgba(95,212,192,0.10)',  border: 'rgba(95,212,192,0.22)'  },
  { stroke: '#f0879a', bg: 'rgba(240,135,154,0.10)', border: 'rgba(240,135,154,0.22)' },
]

function calcComputedScore(c, storeCandidates, weights) {
  const stored = storeCandidates.find(s => s.candidate_id === c.candidate_id)
  if (stored?.computed_score != null) return Number(stored.computed_score)
  const wTotal = (weights.research + weights.education + weights.employment + weights.skills + weights.supervision) || 100
  return (
    ((c.score_research    || 0) * weights.research +
     (c.score_education   || 0) * weights.education +
     (c.score_employment  || 0) * weights.employment +
     (c.score_skills      || 0) * weights.skills +
     (c.score_supervision || 0) * weights.supervision) / wTotal
  )
}

export default function Compare() {
  usePageTitle('Compare')
  const [searchParams] = useSearchParams()
  const [allCandidates, setAllCandidates] = useState([])
  const [selected, setSelected]           = useState([])
  const [details, setDetails]             = useState([])
  const [loading, setLoading]             = useState(false)
  const [narrative, setNarrative]         = useState('')
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const { candidates: storeCandidates, weights } = useCandidateStore()

  useEffect(() => {
    getCandidates().then(r => setAllCandidates(r.data))
    const ids = searchParams.get('ids')?.split(',').filter(Boolean) || []
    if (ids.length) setSelected(ids.slice(0, 4))
  }, [])

  useEffect(() => {
    if (!selected.length) { setDetails([]); return }
    setLoading(true)
    Promise.all(selected.map(id => getCandidate(id).then(r => r.data)))
      .then(setDetails).finally(() => setLoading(false))
  }, [selected])

  // Enrich each detail with computed_score from the store (respects weight sliders)
  // Falls back to computing it from current weights if not in store yet
  const enrichedDetails = useMemo(() =>
    details.map(c => ({ ...c, computed_score: calcComputedScore(c, storeCandidates, weights) })),
    [details, storeCandidates, weights]
  )

  const toggle = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id)
        : prev.length < 4 ? [...prev, id] : prev
    )
    setNarrative('')
  }

  const fetchNarrative = async () => {
    if (selected.length < 2) return
    setNarrativeLoading(true)
    try {
      const r = await getCompareNarrative(selected)
      setNarrative(r.data.narrative)
    } catch { setNarrative('Could not generate analysis. Please try again.') }
    setNarrativeLoading(false)
  }

  const radarData = DIMS.map(({ key, label }) => {
    const entry = { dimension: label }
    enrichedDetails.forEach((c, i) => { entry[`s${i}`] = Number(c[key] || 0) })
    return entry
  })

  // Grouped bar chart: each dimension is a bar group, one bar per candidate
  const scoreBarsData = DIMS.map(({ key, label }) => {
    const entry = { dimension: label.slice(0, 3) }  // abbreviated for space
    enrichedDetails.forEach((c, i) => { entry[`s${i}`] = Number(c[key] || 0) })
    return entry
  })

  // Research metrics chart: Q1, Q2, h-index, citations (scaled /10)
  const researchMetrics = [
    { metric: 'Q1 Papers',    ...Object.fromEntries(enrichedDetails.map((c, i) => [`s${i}`, c.research?.q1_count || 0])) },
    { metric: 'Q2 Papers',    ...Object.fromEntries(enrichedDetails.map((c, i) => [`s${i}`, c.research?.q2_count || 0])) },
    { metric: 'H-Index',      ...Object.fromEntries(enrichedDetails.map((c, i) => [`s${i}`, c.research?.h_index || 0])) },
    { metric: 'A*/A Conf.',   ...Object.fromEntries(enrichedDetails.map((c, i) => [`s${i}`, (c.research?.astar_conf_count || 0) + (c.research?.a_conf_count || 0)])) },
    { metric: 'Citations',    ...Object.fromEntries(enrichedDetails.map((c, i) => [`s${i}`, c.research?.total_citations || 0])) },
  ]

  // Topics & network comparison data
  const topicNetworkMetrics = [
    {
      metric: 'Topic Diversity',
      ...Object.fromEntries(enrichedDetails.map((c, i) => [
        `s${i}`, Math.round((c.research?.topic_diversity_score || 0) * 100),
      ])),
    },
    {
      metric: 'Collab. Diversity',
      ...Object.fromEntries(enrichedDetails.map((c, i) => [
        `s${i}`, Math.round((c.research?.collaboration_diversity_score || 0) * 100),
      ])),
    },
    {
      metric: 'Recurring Collabs',
      ...Object.fromEntries(enrichedDetails.map((c, i) => [
        `s${i}`, Math.round((c.research?.recurring_proportion || 0) * 100),
      ])),
    },
  ]

  const hasTopicData = enrichedDetails.some(
    c => c.research?.topic_diversity_score != null || c.research?.unique_coauthors > 0
  )

  // Publication breakdown: stacked bars per candidate showing tier distribution
  const pubBreakdown = enrichedDetails.map((c, i) => {
    const journals = c.research?.journal_papers || []
    const confs    = c.research?.conference_papers || []
    return {
      name:       c.full_name?.split(' ')[0] || `C${i + 1}`,
      'Q1':       journals.filter(p => p.wos_quartile === 'Q1' && !p.is_predatory_flag).length,
      'Q2':       journals.filter(p => p.wos_quartile === 'Q2' && !p.is_predatory_flag).length,
      'Q3':       journals.filter(p => p.wos_quartile === 'Q3' && !p.is_predatory_flag).length,
      'A*/A Conf': confs.filter(p => ['A*', 'A'].includes(p.core_rank)).length,
      'B/C Conf':  confs.filter(p => ['B', 'C'].includes(p.core_rank)).length,
      'Predatory': journals.filter(p => p.is_predatory_flag).length,
    }
  })

  const winner = enrichedDetails.length >= 2
    ? enrichedDetails.reduce((best, c) =>
        Number(c.computed_score || 0) > Number(best.computed_score || 0) ? c : best
      , enrichedDetails[0])
    : null

  return (
    <div style={{ padding: '36px 40px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Editorial header ── */}
      <div style={{ marginBottom: 32 }}>
        <Link to="/dashboard" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 14,
          transition: 'color 0.14s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
          <ArrowLeft size={11} /> Dashboard · Compare
        </Link>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 38,
          letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0, lineHeight: 1.1,
        }}>
          A study in{' '}
          <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>contrasts.</em>
        </h1>
        <p style={{
          fontSize: 13, color: 'var(--text-secondary)', marginTop: 8,
          fontFamily: 'var(--font-display)', fontStyle: 'italic',
        }}>
          {selected.length > 0
            ? `Comparing ${selected.length} candidate${selected.length !== 1 ? 's' : ''} across five dimensions.`
            : 'Select candidates below to begin.'}
        </p>
      </div>

      {/* ── Candidate selector ── */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
        <p style={{
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.14em', color: 'var(--text-muted)', marginBottom: 14,
        }}>Select up to 4 candidates</p>
        {allCandidates.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No candidates.{' '}
            <Link to="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Upload CVs first.
            </Link>
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {allCandidates.map((c) => {
              const idx    = selected.indexOf(c.candidate_id)
              const active = idx !== -1
              const col    = active ? COLORS[idx] : null
              return (
                <button key={c.candidate_id} onClick={() => toggle(c.candidate_id)} style={{
                  padding: '6px 14px', borderRadius: 9999, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.14s', border: 'none',
                  background: active ? col.bg  : 'var(--bg-elevated)',
                  color:      active ? col.stroke : 'var(--text-muted)',
                  boxShadow:  active ? `0 0 0 1px ${col.border}` : `0 0 0 1px var(--border-default)`,
                }}>
                  {active && <span style={{ marginRight: 6, fontWeight: 700 }}>{idx + 1}.</span>}
                  {c.full_name || c.candidate_id}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', borderWidth: 2, borderStyle: 'solid',
            borderColor: 'var(--border-strong)', borderTopColor: 'var(--accent)',
            animation: 'spin 0.75s linear infinite',
          }} />
        </div>
      )}

      {/* ── Comparison content ── */}
      {!loading && enrichedDetails.length > 0 && (
        <div className="fade-up">

          {/* ── Combined radar + legend ── */}
          <div className="card" style={{ padding: '24px 28px', marginBottom: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 20 }}>
              {enrichedDetails.map((c, i) => (
                <div key={c.candidate_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', background: COLORS[i].stroke, flexShrink: 0,
                  }} />
                  <Link to={`/candidate/${c.candidate_id}`} style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                    textDecoration: 'none', transition: 'color 0.14s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = COLORS[i].stroke}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-primary)'}>
                    {c.full_name}
                  </Link>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    · {Number(c.computed_score || 0).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="var(--border-default)" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fontSize: 12, fill: 'var(--text-muted)', fontWeight: 500 }}
                />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                {enrichedDetails.map((c, i) => (
                  <Radar
                    key={c.candidate_id}
                    name={c.full_name}
                    dataKey={`s${i}`}
                    stroke={COLORS[i].stroke}
                    fill={COLORS[i].stroke}
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                ))}
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 10,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Score comparison bar chart ── */}
          <div className="card" style={{ padding: '24px 28px', marginBottom: 18 }}>
            <p style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.14em', color: 'var(--text-muted)', marginBottom: 18,
            }}>Score breakdown — by dimension</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={scoreBarsData} barGap={4} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="dimension" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, fontSize: 12 }}
                  cursor={{ fill: 'var(--bg-elevated)' }}
                />
                {enrichedDetails.map((c, i) => (
                  <Bar key={c.candidate_id} dataKey={`s${i}`} name={c.full_name?.split(' ')[0]} fill={COLORS[i].stroke} radius={[3, 3, 0, 0]} maxBarSize={32} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Research metrics + Publication breakdown side by side ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>

            {/* Research metrics */}
            <div className="card" style={{ padding: '24px 28px' }}>
              <p style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.14em', color: 'var(--text-muted)', marginBottom: 18,
              }}>Research metrics</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={researchMetrics} layout="vertical" barGap={3} barCategoryGap="28%">
                  <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="metric" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={68} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, fontSize: 12 }}
                    cursor={{ fill: 'var(--bg-elevated)' }}
                  />
                  {enrichedDetails.map((c, i) => (
                    <Bar key={c.candidate_id} dataKey={`s${i}`} name={c.full_name?.split(' ')[0]} fill={COLORS[i].stroke} radius={[0, 3, 3, 0]} maxBarSize={14} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Publication quality breakdown */}
            <div className="card" style={{ padding: '24px 28px' }}>
              <p style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.14em', color: 'var(--text-muted)', marginBottom: 18,
              }}>Publication quality breakdown</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={pubBreakdown} barGap={2} barCategoryGap="35%">
                  <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={22} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, fontSize: 12 }}
                    cursor={{ fill: 'var(--bg-elevated)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: 'var(--text-muted)', paddingTop: 8 }} />
                  <Bar dataKey="Q1"       stackId="a" fill="#4ade80" radius={[0,0,0,0]} maxBarSize={36} />
                  <Bar dataKey="Q2"       stackId="a" fill="#e8a04a" maxBarSize={36} />
                  <Bar dataKey="Q3"       stackId="a" fill="#94a3b8" maxBarSize={36} />
                  <Bar dataKey="A*/A Conf" stackId="a" fill="#9580ff" maxBarSize={36} />
                  <Bar dataKey="B/C Conf" stackId="a" fill="#c4b5fd" maxBarSize={36} />
                  <Bar dataKey="Predatory" stackId="a" fill="#f87171" radius={[3,3,0,0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>


          {/* ── Topics & network comparison ── */}
          {hasTopicData && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>

              {/* Diversity scores chart */}
              <div className="card" style={{ padding: '24px 28px' }}>
                <p style={{
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.14em', color: 'var(--text-muted)', marginBottom: 18,
                }}>Research diversity scores (0 – 100%)</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={topicNetworkMetrics} layout="vertical" barGap={3} barCategoryGap="28%">
                    <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="metric" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={100} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, fontSize: 12 }}
                      formatter={(v, name) => [v + '%', name]}
                      cursor={{ fill: 'var(--bg-elevated)' }}
                    />
                    {enrichedDetails.map((c, i) => (
                      <Bar key={c.candidate_id} dataKey={`s${i}`} name={c.full_name?.split(' ')[0]} fill={COLORS[i].stroke} radius={[0, 3, 3, 0]} maxBarSize={14} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Network stats table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}>
                  <p style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
                    textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0,
                  }}>Co-author network stats</p>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Metric</th>
                      {enrichedDetails.map((c, i) => (
                        <th key={i} style={{ padding: '9px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: COLORS[i].stroke, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {c.full_name?.split(' ')[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Dominant Topic',     fn: c => c.research?.dominant_topic
                          ? (c.research.dominant_topic.length > 18 ? c.research.dominant_topic.slice(0, 17) + '…' : c.research.dominant_topic)
                          : '—', isText: true },
                      { label: 'Active Domains',     fn: c => c.research?.topic_clusters?.length ?? '—' },
                      { label: 'Unique Co-authors',  fn: c => c.research?.unique_coauthors ?? '—' },
                      { label: 'Avg / Paper',        fn: c => c.research?.avg_coauthors_per_paper != null
                          ? c.research.avg_coauthors_per_paper.toFixed(1) : '—' },
                      { label: 'Recurring Collabs',  fn: c => c.research?.recurring_collaborator_count ?? '—' },
                    ].map(({ label, fn, isText }, rowIdx) => {
                      const vals = enrichedDetails.map(c => fn(c))
                      const numVals = vals.map(v => parseFloat(v)).filter(v => !isNaN(v))
                      const maxNum = numVals.length ? Math.max(...numVals) : null
                      return (
                        <tr key={rowIdx}
                          style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.12s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</td>
                          {vals.map((val, i) => {
                            const numVal = parseFloat(val)
                            const isMax = !isText && maxNum !== null && numVal === maxNum && maxNum > 0
                            return (
                              <td key={i} style={{
                                padding: '10px 16px',
                                textAlign: isText ? 'left' : 'right',
                                fontWeight: isMax ? 700 : 400,
                                color: isMax ? COLORS[i].stroke : 'var(--text-muted)',
                                background: isMax ? COLORS[i].bg : 'transparent',
                                fontSize: isText ? 10 : 12,
                                whiteSpace: isText ? 'normal' : 'nowrap',
                                wordBreak: isText ? 'break-word' : 'normal',
                              }}>
                                {val}
                                {isMax && <span style={{ marginLeft: 4, fontSize: 8, opacity: 0.7 }}>▲</span>}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* ── Recommendation card ── */}
          {winner && (
            <div style={{
              padding: '18px 22px', borderRadius: 12, marginBottom: 18,
              background: 'var(--bg-card)',
              borderTop: '1px solid var(--border-subtle)',
              borderRight: '1px solid var(--border-subtle)',
              borderBottom: '1px solid var(--border-subtle)',
              borderLeft: '3px solid var(--accent)',
            }}>
              <p style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--text-muted)', marginBottom: 8,
              }}>By the numbers</p>
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 20,
                color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em',
              }}>
                {winner.full_name} leads with a composite score of{' '}
                <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                  {Number(winner.computed_score || 0).toFixed(1)}
                </span>.
              </p>
              {winner.summary?.justification && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                  {winner.summary.justification.slice(0, 140)}
                  {winner.summary.justification.length > 140 ? '…' : ''}
                </p>
              )}
            </div>
          )}


          {/* ── AI Comparative Analysis ── */}
          {enrichedDetails.length >= 2 && (
            <div style={{ marginBottom: 18 }}>
              {!narrative && !narrativeLoading && (
                <button onClick={fetchNarrative} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, border: 'none',
                  background: 'var(--accent-dim)', color: 'var(--accent)',
                  boxShadow: '0 0 0 1px var(--accent-ring)', transition: 'all 0.14s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--accent-dim)'}>
                  <Sparkles size={14} />
                  Generate AI Comparative Analysis
                </button>
              )}
              {narrativeLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
                  Generating analysis with Groq...
                </div>
              )}
              {narrative && (
                <div style={{
                  padding: '20px 24px', borderRadius: 12,
                  background: 'var(--bg-card)',
                  borderTop: '1px solid var(--border-subtle)',
                  borderRight: '1px solid var(--border-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                  borderLeft: '3px solid var(--accent)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <p style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
                      textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0,
                    }}>AI Comparative Analysis</p>
                    <button onClick={() => { setNarrative(''); }}
                      style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Regenerate
                    </button>
                  </div>
                  <p style={{
                    fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 15,
                    color: 'var(--text-primary)', lineHeight: 1.7, margin: 0,
                    letterSpacing: '-0.01em',
                  }}>{narrative}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Decision matrix ── */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{
              padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-base)',
            }}>
              <p style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--text-muted)', margin: 0,
              }}>Score matrix</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{
                    padding: '12px 20px', textAlign: 'left', fontSize: 11,
                    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                  }}>Dimension</th>
                  {enrichedDetails.map((c, i) => (
                    <th key={c.candidate_id} style={{
                      padding: '12px 20px', textAlign: 'right',
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.06em', color: COLORS[i].stroke,
                    }}>
                      {c.full_name?.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
                            <tbody>
                {/* Score dimension rows */}
                {DIMS.map(({ key, label }) => {
                  const vals = enrichedDetails.map(c => Number(c[key] || 0))
                  const max  = Math.max(...vals)
                  return (
                    <tr key={key}
                      style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '13px 20px', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 13 }}>
                        {label}
                      </td>
                      {enrichedDetails.map((c, i) => {
                        const val   = Number(c[key] || 0)
                        const isMax = val === max && max > 0
                        return (
                          <td key={c.candidate_id} style={{
                            padding: '13px 20px', textAlign: 'right',
                            fontWeight: isMax ? 700 : 400, fontSize: 13,
                            color: isMax ? COLORS[i].stroke : 'var(--text-muted)',
                            background: isMax ? COLORS[i].bg : 'transparent',
                          }}>
                            {val > 0 ? val.toFixed(0) : 'N/A'}
                            {isMax && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>&#9650;</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}

                {/* Topics & Network rows */}
                {hasTopicData && (
                  <>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <td colSpan={1 + enrichedDetails.length} style={{
                        padding: '7px 20px', fontSize: 10, fontWeight: 600,
                        letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)',
                      }}>Topics &amp; Network</td>
                    </tr>
                    {[
                      {
                        label: 'Dominant Topic',
                        fn: c => c.research?.dominant_topic
                          ? (c.research.dominant_topic.length > 20 ? c.research.dominant_topic.slice(0, 19) + '…' : c.research.dominant_topic)
                          : null,
                        isText: true,
                      },
                      {
                        label: 'Topic Diversity',
                        fn: c => c.research?.topic_diversity_score != null
                          ? Math.round(c.research.topic_diversity_score * 100) : null,
                        suffix: '%',
                      },
                      {
                        label: 'Collab. Diversity',
                        fn: c => c.research?.collaboration_diversity_score != null
                          ? Math.round(c.research.collaboration_diversity_score * 100) : null,
                        suffix: '%',
                      },
                      {
                        label: 'Unique Co-authors',
                        fn: c => c.research?.unique_coauthors ?? null,
                      },
                    ].map(({ label, fn, isText, suffix }) => {
                      const vals   = enrichedDetails.map(c => fn(c))
                      const nums   = vals.map(v => (typeof v === 'number' ? v : NaN))
                      const maxNum = Math.max(...nums.filter(v => !isNaN(v)))
                      return (
                        <tr key={label}
                          style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.12s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '12px 20px', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 13 }}>
                            {label}
                          </td>
                          {vals.map((val, i) => {
                            const isMax = !isText && typeof val === 'number' && val === maxNum && maxNum > 0
                            const display = val === null ? 'N/A' : isText ? val : val + (suffix || '')
                            return (
                              <td key={i} style={{
                                padding: '12px 20px',
                                textAlign: isText ? 'left' : 'right',
                                fontWeight: isMax ? 700 : 400,
                                fontSize: isText ? 11 : 13,
                                color: isMax ? COLORS[i].stroke : 'var(--text-muted)',
                                background: isMax ? COLORS[i].bg : 'transparent',
                                whiteSpace: isText ? 'normal' : 'nowrap',
                                wordBreak: isText ? 'break-word' : 'normal',
                              }}>
                                {display}
                                {isMax && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>&#9650;</span>}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </>
                )}

                {/* Total row */}
                {(() => {
                  const vals = enrichedDetails.map(c => Number(c.computed_score || 0))
                  const max  = Math.max(...vals)
                  return (
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: 'none' }}>
                      <td style={{ padding: '13px 20px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontSize: 14 }}>
                        Total
                      </td>
                      {enrichedDetails.map((c, i) => {
                        const val   = Number(c.computed_score || 0)
                        const isMax = val === max && max > 0
                        return (
                          <td key={c.candidate_id} style={{
                            padding: '13px 20px', textAlign: 'right',
                            fontWeight: isMax ? 700 : 400,
                            fontFamily: 'var(--font-display)', fontSize: 15,
                            color: isMax ? COLORS[i].stroke : 'var(--text-muted)',
                          }}>
                            {val > 0 ? val.toFixed(1) : 'N/A'}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && enrichedDetails.length === 0 && selected.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 18px',
            background: 'var(--accent-dim)', border: '1px solid var(--accent-ring)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users size={22} style={{ color: 'var(--accent)' }} />
          </div>
          <p style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 18,
            color: 'var(--text-secondary)', marginBottom: 6,
          }}>No candidates selected</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Pick candidates above to compare them side by side.
          </p>
        </div>
      )}
    </div>
  )
}