import { useEffect } from 'react'
import { useAuth } from '../context/useAuth'
import useCandidateStore from '../store/candidateStore'
import WeightSliders from '../components/WeightSliders'
import usePageTitle from '../hooks/usePageTitle'
import { getCandidates } from '../api/talash'

const SYS_INFO = [
  { label: 'LLM provider',    value: 'Groq · Llama 3.3 70B'         },
  { label: 'University DB',   value: '170+ ranked institutions'       },
  { label: 'Backend',         value: 'FastAPI · Python 3.12'          },
  { label: 'Frontend',        value: 'React 18 · Vite'               },
  { label: 'Build',           value: 'v1.0.0'                        },
]

export default function Profile() {
  usePageTitle('Profile')
  const { user } = useAuth()
  const { candidates, setCandidates } = useCandidateStore()

  useEffect(() => {
    if (candidates.length === 0) {
      getCandidates().then(r => setCandidates(r.data)).catch(() => {})
    }
  }, [])

  const avgScore = candidates.length
    ? (candidates.reduce((s, c) => s + Number(c.computed_score || 0), 0) / candidates.length).toFixed(1)
    : 'N/A'
  const totalQ1  = candidates.reduce((s, c) => s + (c.research?.q1_count || 0), 0)
  const totalPhD = candidates.filter(c => c.education?.degrees?.some(d => d.level === 'PhD')).length

  const stats = [
    { label: 'Candidates processed', value: candidates.length,  color: 'var(--text-primary)' },
    { label: 'Average score',        value: avgScore,            color: 'var(--accent)'       },
    { label: 'Q1 papers total',      value: totalQ1,             color: 'var(--text-primary)' },
    { label: 'PhD holders',          value: totalPhD,            color: 'var(--text-primary)' },
  ]

  const initials = user?.initials || user?.name?.[0] || '?'

  return (
    <div style={{ maxWidth: 820, padding: '36px 40px', margin: '0 auto' }}>

      {/* ── Profile banner ── flat, dignified, single warm glow ── */}
      <div style={{ position: 'relative', marginBottom: 60 }}>
        <div style={{
          height: 110, borderRadius: 14, position: 'relative', overflow: 'hidden',
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        }}>
          {/* Single warm radial glow */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at 80% 20%, var(--accent-glow), transparent 60%)',
          }} />
          {/* Company tag */}
          <div style={{
            position: 'absolute', top: 16, right: 20,
            fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>TALASH · Talent Team</div>
        </div>

        {/* Avatar bridging banner and body */}
        <div style={{ position: 'absolute', top: 70, left: 28, zIndex: 2 }}>
          {user?.picture
            ? <img src={user.picture} alt={user.name} style={{
                width: 76, height: 76, borderRadius: 14, objectFit: 'cover', display: 'block',
                border: '4px solid var(--bg-base)',
              }} />
            : <div style={{
                width: 76, height: 76, borderRadius: 14,
                background: 'linear-gradient(135deg, var(--accent), var(--accent-light))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)', color: '#1d1408', fontSize: 28, fontWeight: 500,
                border: '4px solid var(--bg-base)',
              }}>{initials}</div>
          }
        </div>

        {/* Name + role */}
        <div style={{ position: 'absolute', top: 124, left: 120 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 22,
            color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em',
          }}>{user?.name}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
            {user?.role} · {user?.email}
          </p>
        </div>
      </div>

      {/* ── Stat strip — hairline-divided, number-led ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        border: '1px solid var(--border-subtle)', borderRadius: 14,
        background: 'var(--bg-card)', marginBottom: 22, overflow: 'hidden',
      }}>
        {stats.map(({ label, value, color }, i, a) => (
          <div key={label} style={{
            padding: '20px 22px',
            borderRight: i < a.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 400,
              color, letterSpacing: '-0.02em', lineHeight: 1,
            }}>{value}</div>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)', marginTop: 8,
              fontStyle: 'italic', fontFamily: 'var(--font-display)',
            }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Two-column: weights + system ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Scoring weights */}
        <div className="card" style={{ padding: '22px 24px' }}>
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: 18,
          }}>Scoring weights</p>
          <WeightSliders />
        </div>

        {/* System info */}
        <div className="card" style={{ padding: '22px 24px' }}>
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: 18,
          }}>System</p>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {SYS_INFO.map(({ label, value }, i, a) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '11px 0',
                borderBottom: i < a.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{
                  fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
                  color: 'var(--text-primary)',
                }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}