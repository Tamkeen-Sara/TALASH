import useCandidateStore from '../store/candidateStore'

const DIMENSIONS = [
  { key: 'research',   label: 'Research',   color: 'var(--violet)' },
  { key: 'education',  label: 'Education',  color: 'var(--accent)' },
  { key: 'employment', label: 'Employment', color: 'var(--teal)'   },
  { key: 'skills',     label: 'Skills',     color: 'var(--success)'},
  { key: 'supervision',label: 'Supervision',color: 'var(--rose)'   },
]

export default function WeightSliders() {
  const { weights, setWeights, resetWeights } = useCandidateStore()
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  const valid = Math.abs(total - 100) <= 1

  const handleChange = (key, value) => setWeights({ ...weights, [key]: Number(value) })

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
          Weights
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: valid ? 'var(--success)' : 'var(--error)', letterSpacing: '-0.02em' }}>
            {total}%
          </span>
          <button onClick={resetWeights} style={{
            fontSize: 12, color: 'var(--text-muted)', background: 'none',
            border: 'none', cursor: 'pointer', transition: 'color 0.14s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            Reset
          </button>
        </div>
      </div>

      {/* Sliders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {DIMENSIONS.map(({ key, label, color }) => (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, color, letterSpacing: '-0.01em' }}>{weights[key]}%</span>
            </div>
            <div style={{ position: 'relative' }}>
              {/* Visual track */}
              <div style={{
                height: 5, borderRadius: 9999, overflow: 'hidden',
                background: 'var(--border-default)',
              }}>
                <div style={{
                  height: '100%', borderRadius: 9999,
                  width: `${weights[key]}%`,
                  background: color,
                  transition: 'width 0.2s ease',
                }} />
              </div>
              {/* Invisible range input on top */}
              <input
                type="range" min={0} max={100} value={weights[key]}
                onChange={e => handleChange(key, e.target.value)}
                style={{
                  position: 'absolute', top: '50%', left: 0,
                  width: '100%', height: 20, transform: 'translateY(-50%)',
                  opacity: 0, cursor: 'pointer',
                }} />
            </div>
          </div>
        ))}
      </div>

      {!valid && (
        <p style={{ fontSize: 12, color: 'var(--error)', textAlign: 'center', marginTop: 14 }}>
          Weights must sum to 100%
        </p>
      )}
    </div>
  )
}