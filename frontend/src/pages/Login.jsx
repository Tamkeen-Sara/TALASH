import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import useTheme from '../hooks/useTheme'

/* ── Google SVG Logo ── */
function GoogleLogo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

/* ── Simulated Google Account Picker ── */
const GOOGLE_ACCOUNTS = [
  { name: 'Admin User',   email: 'admin@talash.ai',   initials: 'AU', color: '#4285F4' },
  { name: 'Tamkeen Sara', email: 'tamkeen@talash.ai', initials: 'TS', color: '#34A853' },
  { name: 'Furqan Raza',  email: 'furqan@talash.ai',  initials: 'FR', color: '#7c5cff' },
]

function GooglePicker({ onSelect, onClose }) {
  return (
    <div className="google-modal-backdrop" onClick={onClose}>
      <div className="google-modal" onClick={e => e.stopPropagation()}>
        <div style={{ padding: '24px 24px 0', textAlign: 'center' }}>
          <GoogleLogo size={24} />
          <h2 style={{ marginTop: 12, fontSize: 20, fontWeight: 500, color: '#202124', fontFamily: "'Google Sans', sans-serif" }}>
            Sign in to TALASH
          </h2>
          <p style={{ marginTop: 6, fontSize: 14, color: '#5f6368', fontFamily: 'Roboto, sans-serif' }}>
            with your Google Account
          </p>
        </div>
        <div style={{ padding: '16px 8px' }}>
          {GOOGLE_ACCOUNTS.map(acc => (
            <button key={acc.email} onClick={() => onSelect(acc)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 16px', background: 'none', border: 'none',
              cursor: 'pointer', borderRadius: 4, textAlign: 'left', transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f1f3f4'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: acc.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 600, fontSize: 15, flexShrink: 0,
              }}>{acc.initials}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#202124' }}>{acc.name}</div>
                <div style={{ fontSize: 13, color: '#5f6368' }}>{acc.email}</div>
              </div>
            </button>
          ))}
        </div>
        <div style={{ padding: '12px 24px 16px', borderTop: '1px solid #e8eaed', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: '#5f6368' }}>Privacy Policy · Terms of Service</span>
          <button onClick={onClose} style={{ fontSize: 12, color: '#1a73e8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  const { login, googleLogin } = useAuth()
  const navigate = useNavigate()
  const { isDark } = useTheme()

  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [showDemo, setShowDemo]     = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try { login(email, password); navigate('/dashboard') }
    catch (err) { setError(err.message) }
    setLoading(false)
  }

  const handleGoogleSelect = (acc) => {
    setShowPicker(false)
    googleLogin({ name: acc.name, email: acc.email, picture: null })
    navigate('/dashboard')
  }

  // Theme-aware local values (left panel has its own bg, doesn't use CSS vars)
  const hair      = isDark ? 'rgba(240,225,200,0.08)' : 'rgba(45,30,15,0.12)'
  const textPri   = isDark ? '#f3ead8' : '#1d150a'
  const textDim   = isDark ? '#a39a87' : '#6b5a3f'
  const textFaint = isDark ? '#5b5366' : '#a59575'
  const accent    = isDark ? '#e8a04a' : '#a86512'
  const accentDim = isDark ? 'rgba(232,160,74,0.09)' : 'rgba(168,101,18,0.07)'
  const bgSunken  = isDark ? '#0a0810' : '#ede5d2'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: isDark ? '#0e0c14' : '#f5efe1' }}>
      {showPicker && <GooglePicker onSelect={handleGoogleSelect} onClose={() => setShowPicker(false)} />}

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex" style={{
        width: '58%', flexShrink: 0,
        flexDirection: 'column', justifyContent: 'space-between',
        padding: '40px 56px 36px',
        background: isDark
          ? 'linear-gradient(165deg, #16121d 0%, #0d0b13 75%)'
          : 'linear-gradient(165deg, #ece2c8 0%, #f5efe1 75%)',
        borderRight: `1px solid ${hair}`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Single warm radial glow — upper left */}
        <div style={{
          position: 'absolute', top: '-15%', left: '-10%', width: 460, height: 460,
          pointerEvents: 'none',
          background: `radial-gradient(circle at 50% 50%, ${isDark ? 'rgba(232,160,74,0.13)' : 'rgba(168,101,18,0.08)'}, transparent 65%)`,
        }} />

        {/* Header row */}
        <header style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%',
                border: `1px solid ${isDark ? 'rgba(240,225,200,0.22)' : 'rgba(45,30,15,0.22)'}` }} />
              <div style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7,
                background: accent, transform: 'rotate(45deg)',
                boxShadow: `0 0 10px ${accent}88` }} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500,
                fontSize: 16, color: textPri, letterSpacing: '-0.02em' }}>T</span>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500,
                color: textPri, letterSpacing: '0.02em', lineHeight: 1 }}>TALASH</div>
              <div style={{ fontSize: 9, fontWeight: 500, color: textFaint,
                letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 3 }}>Smart Hiring</div>
            </div>
          </div>
          <span style={{ fontSize: 11, color: textDim, padding: '5px 11px', borderRadius: 9999,
            border: `1px solid ${hair}`, fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
            What's new: bias audit
          </span>
        </header>

        {/* Hero */}
        <div style={{ position: 'relative', maxWidth: 500 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', color: textPri, margin: 0,
            fontSize: 50, fontWeight: 300, lineHeight: 1.06, letterSpacing: '-0.025em',
          }}>
            Hiring deserves<br/>
            the same care<br/>
            as <em style={{ color: accent, fontWeight: 400 }}>the work itself.</em>
          </h1>
          <p style={{ color: textDim, marginTop: 22, lineHeight: 1.7, maxWidth: 440, fontSize: 15 }}>
            TALASH reads each CV the way a thoughtful colleague would —
            checking the school, the journals, the gaps — so by the time you
            open a profile, the homework is done.
          </p>

          {/* Testimonial */}
          <div style={{
            marginTop: 32, padding: '18px 20px',
            borderLeft: `2px solid ${accent}`,
            background: accentDim, maxWidth: 460,
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic',
              color: textPri, fontSize: 15.5, lineHeight: 1.6 }}>
              "It saved us most of a week on the last batch. The part I love
              is that it just <em style={{ color: accent }}>shows its work.</em>"
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: isDark ? '#a994ff' : '#5c3fb5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#fff' }}>SL</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: textPri }}>Sarah Lin</div>
                <div style={{ fontSize: 11, color: textFaint }}>Head of Talent · Stripe</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ position: 'relative', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          paddingTop: 16, borderTop: `1px solid ${hair}` }}>
          <span style={{ fontSize: 11, color: textFaint }}>Made with care · trusted by growing teams</span>
          <div style={{ display: 'flex', gap: 16 }}>
            {['Privacy', 'Terms', 'Status'].map(x => (
              <span key={x} style={{ fontSize: 11, color: textFaint }}>{x}</span>
            ))}
          </div>
        </footer>
      </div>

      {/* ── Right login panel ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 32px', position: 'relative',
      }}>
        <div style={{ width: '100%', maxWidth: 340 }} className="fade-up">

          {/* Mobile wordmark */}
          <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
            <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${hair}` }} />
              <div style={{ position: 'absolute', top: -2, right: -2, width: 6, height: 6,
                background: 'var(--accent)', transform: 'rotate(45deg)' }} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 14, color: 'var(--text-primary)' }}>T</span>
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>TALASH</span>
          </div>

          <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)',
            fontSize: 28, fontWeight: 400, letterSpacing: '-0.015em', margin: 0 }}>
            Welcome back, friend.
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
            Sign in to your TALASH workspace.
          </p>

          {/* Google */}
          <button className="btn-google" style={{ width: '100%', marginTop: 24 }}
            onClick={() => setShowPicker(true)}>
            <GoogleLogo />
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic',
              fontFamily: 'var(--font-display)' }}>or with email</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 500,
                color: 'var(--text-secondary)', marginBottom: 5 }}>Email</label>
              <input type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="input-dark" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 500,
                color: 'var(--text-secondary)', marginBottom: 5 }}>Password</label>
              <input type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-dark" />
            </div>

            {error && (
              <div style={{
                padding: '10px 13px', borderRadius: 8, fontSize: 12, color: 'var(--error)',
                background: 'rgba(238,116,128,0.08)', border: '1px solid rgba(238,116,128,0.2)',
              }}>{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn-primary"
              style={{ width: '100%', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Signing in...</> : 'Sign in'}
            </button>
          </form>

          <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
            Forgot your password?{' '}
            <span style={{ color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' }}>
              We'll email you a link.
            </span>
          </div>

          {/* Demo hint */}
          <button onClick={() => setShowDemo(p => !p)} style={{
            marginTop: 20, background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5,
            padding: 0, transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            <ChevronDown size={11} style={{ transform: showDemo ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            Want to look around first?
          </button>

          {showDemo && (
            <div style={{
              marginTop: 8, padding: '12px 14px', borderRadius: 8,
              background: bgSunken, border: `1px dashed ${hair}`,
              fontSize: 11, lineHeight: 1.9,
            }}>
              <div style={{ fontStyle: 'italic', fontFamily: 'var(--font-display)', color: textFaint, marginBottom: 4, fontSize: 10 }}>
                Demo accounts
              </div>
              {['admin@talash.ai', 'tamkeen@talash.ai', 'furqan@talash.ai'].map(e => (
                <div key={e} style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-primary)' }}>{e}</div>
              ))}
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                password:{' '}
                <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-primary)' }}>talash12345</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}