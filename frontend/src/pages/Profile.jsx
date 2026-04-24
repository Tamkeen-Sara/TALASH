import { useEffect } from 'react'
import { useAuth } from '../context/useAuth'
import useCandidateStore from '../store/candidateStore'
import WeightSliders from '../components/WeightSliders'
import usePageTitle from '../hooks/usePageTitle'
import { getCandidates } from '../api/talash'
import { Users, TrendingUp, FileText, GraduationCap, Cpu, Layers, Database, Server, Globe } from 'lucide-react'

const SYS_INFO = [
  { label: 'LLM Provider',    value: 'Groq / Llama 3.3 70B',       Icon: Cpu,      color: 'var(--success)' },
  { label: 'Extraction',      value: 'llama-3.3-70b-versatile',     Icon: Layers,   color: 'var(--violet)' },
  { label: 'University DB',   value: '170+ ranked institutions',    Icon: Database, color: 'var(--sky)' },
  { label: 'Backend',         value: 'FastAPI + Python',            Icon: Server,   color: 'var(--rose)' },
  { label: 'Frontend',        value: 'React 18 + Vite',             Icon: Globe,    color: 'var(--teal)' },
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
    { label: 'Candidates Processed', value: candidates.length, Icon: Users,          color: 'var(--violet)',  bg: 'rgba(149,128,255,0.1)', border: 'rgba(149,128,255,0.2)' },
    { label: 'Average Score',         value: avgScore,           Icon: TrendingUp,    color: 'var(--success)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)'  },
    { label: 'Q1 Papers Total',       value: totalQ1,            Icon: FileText,      color: 'var(--accent)',  bg: 'var(--accent-dim)',      border: 'var(--accent-ring)'    },
    { label: 'PhD Holders',           value: totalPhD,           Icon: GraduationCap, color: 'var(--rose)',    bg: 'rgba(232,122,140,0.1)', border: 'rgba(232,122,140,0.2)' },
  ]

  return (
    <div style={{ maxWidth: 820, padding: '40px 40px', margin: '0 auto' }}>

      {/* ── Profile hero ──
           Two separate elements so no shared overflow/clip context.
           Banner is standalone. Body card sits below with its own border-radius.
           Avatar uses position:absolute relative to the wrapper. ── */}
      <div style={{ position: 'relative', marginBottom: 24 }}>

        {/* Banner is self-contained and clips its own orbs */}
        <div style={{
          height: 108,
          borderRadius: 16,
          overflow: 'hidden',
          position: 'relative',
          background: 'linear-gradient(135deg, #100c20 0%, #1e1040 55%, #0d1a2e 100%)',
        }}>
          <div style={{
            position: 'absolute', top: '-50%', left: '-8%',
            width: 260, height: 260, borderRadius: '50%', pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(240,160,48,0.16), transparent 65%)',
          }} />
          <div style={{
            position: 'absolute', bottom: '-60%', right: '8%',
            width: 220, height: 220, borderRadius: '50%', pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(149,128,255,0.14), transparent 65%)',
          }} />
        </div>

        {/* Avatar is absolute and bridges the banner and body */}
        <div style={{
          position: 'absolute',
          top: 108 - 36,   /* banner height minus half avatar height */
          left: 28,
          zIndex: 2,
        }}>
          {user?.picture
            ? <img src={user.picture} alt={user.name} style={{
                width: 72, height: 72, borderRadius: 16, objectFit: 'cover', display: 'block',
                border: '3px solid var(--bg-card)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              }} />
            : <div style={{
                width: 72, height: 72, borderRadius: 16,
                background: 'linear-gradient(135deg, #e8930a, #f5b030)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 24, fontWeight: 700,
                border: '3px solid var(--bg-card)',
                boxShadow: '0 4px 16px rgba(232,147,10,0.3)',
              }}>
                {user?.initials || user?.name?.[0] || '?'}
              </div>
          }
        </div>

        {/* Body card sits below banner without overflow hidden */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '0 0 16px 16px',
          padding: '44px 28px 24px',   /* top padding = 36 overlap + 8 breathing room */
          marginTop: -2,               /* tiny overlap to merge border visually with banner */
        }}>
          {/* Name / role */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
            {/* Spacer so text clears the avatar */}
            <div style={{ width: 72 + 16, flexShrink: 0 }} />
            <div>
              <h1 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginTop: 6 }}>
                {user?.name}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
                {user?.role} · TALASH System
              </p>
            </div>
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              padding: '4px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 500,
              background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-ring)',
            }}>
              {user?.email}
            </span>
            <span style={{
              padding: '4px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 500,
              background: 'rgba(74,222,128,0.1)', color: 'var(--success)', border: '1px solid rgba(74,222,128,0.2)',
            }}>
              Active Session
            </span>
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {stats.map(({ label, value, Icon, color, bg, border }) => (
          <div key={label} className="card" style={{ padding: '18px 20px' }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, marginBottom: 14,
              background: bg, border: `1px solid ${border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={15} style={{ color }} />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color, marginBottom: 4 }}>
              {value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Settings grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Scoring weights */}
        <div className="card" style={{ padding: '24px 26px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 22 }}>
            Scoring Weights
          </h3>
          <WeightSliders />
        </div>

        {/* System info */}
        <div className="card" style={{ padding: '24px 26px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 22 }}>
            System Info
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {SYS_INFO.map(({ label, value, Icon, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color }}>{value}</span>
              </div>
            ))}
            <div style={{
              paddingTop: 16, marginTop: 4,
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Build</span>
              <span style={{
                fontSize: 11, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 6,
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}>v1.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}