import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Loader2, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/useAuth'

/* ── Google SVG Logo ── */
function GoogleLogo({ size = 18 }) {
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
        {/* Header */}
        <div style={{ padding: '24px 24px 0', textAlign: 'center' }}>
          <GoogleLogo size={24} />
          <h2 style={{ marginTop: 12, fontSize: 20, fontWeight: 500, color: '#202124', fontFamily: "'Google Sans', sans-serif" }}>
            Sign in to TALASH
          </h2>
          <p style={{ marginTop: 6, fontSize: 14, color: '#5f6368', fontFamily: 'Roboto, sans-serif' }}>
            with your Google Account
          </p>
        </div>

        {/* Accounts */}
        <div style={{ padding: '16px 8px' }}>
          {GOOGLE_ACCOUNTS.map(acc => (
            <button
              key={acc.email}
              onClick={() => onSelect(acc)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', background: 'none', border: 'none',
                cursor: 'pointer', borderRadius: 4, textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f3f4'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: acc.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 600, fontSize: 15, flexShrink: 0,
                fontFamily: "'Google Sans', sans-serif",
              }}>
                {acc.initials}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#202124', fontFamily: 'Roboto, sans-serif' }}>
                  {acc.name}
                </div>
                <div style={{ fontSize: 13, color: '#5f6368', fontFamily: 'Roboto, sans-serif' }}>
                  {acc.email}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px 16px',
          borderTop: '1px solid #e8eaed',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12, color: '#5f6368', fontFamily: 'Roboto, sans-serif' }}>
            Privacy Policy · Terms of Service
          </span>
          <button
            onClick={onClose}
            style={{
              fontSize: 12, color: '#1a73e8', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'Roboto, sans-serif', fontWeight: 500,
            }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  { text: 'Education scoring with QS & HEC rankings' },
  { text: 'Journal & conference tier verification' },
  { text: 'Cohort ranking with adjustable weights' },
  { text: 'AI-drafted follow-up emails' },
]

export default function Login() {
  const { login, googleLogin } = useAuth()
  const navigate = useNavigate()

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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-base)' }}>
      {showPicker && <GooglePicker onSelect={handleGoogleSelect} onClose={() => setShowPicker(false)} />}

      {/* ── Left branding panel ── */}
      <div style={{
        width: '52%',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '52px 60px',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(145deg, #0d0b26 0%, #180e3e 55%, #0c1830 100%)',
        flexShrink: 0,
      }}
      className="hidden lg:flex">

        {/* Orb 1 */}
        <div style={{
          position: 'absolute', top: '22%', left: '-80px',
          width: 380, height: 380, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(124,92,255,0.22), transparent 70%)',
        }} />
        {/* Orb 2 */}
        <div style={{
          position: 'absolute', bottom: '18%', right: '-40px',
          width: 300, height: 300, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(168,85,247,0.14), transparent 70%)',
        }} />
        {/* Orb 3 */}
        <div style={{
          position: 'absolute', top: '70%', left: '35%',
          width: 220, height: 220, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(56,189,248,0.08), transparent 70%)',
        }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #7c5cff, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 17, color: '#fff',
            boxShadow: '0 4px 16px rgba(124,92,255,0.4)',
          }}>T</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>TALASH</div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Recruitment AI
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{
            fontSize: 52, fontWeight: 800, lineHeight: 1.1,
            letterSpacing: '-0.03em', color: '#fff', marginBottom: 20,
          }}>
            Intelligent<br />
            <span style={{
              background: 'linear-gradient(135deg, #a5b4fc, #818cf8, #c4b5fd)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>Faculty Hiring</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.48)', fontSize: 16, lineHeight: 1.65, maxWidth: 320 }}>
            End-to-end AI analysis — from CV parsing to ranked shortlists. Built for SEECS NUST.
          </p>

          <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {FEATURES.map(({ text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6, marginTop: 1,
                  background: 'rgba(139,119,255,0.18)', border: '1px solid rgba(139,119,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#a78bfa' }} />
                </div>
                <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.55 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.2)', fontSize: 12, letterSpacing: '0.04em' }}>
          CS 417 — Large Language Models · SEECS NUST · 2026
        </div>
      </div>

      {/* ── Right login panel ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 32px',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }} className="fade-up">

          {/* Mobile logo */}
          <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #7c5cff, #a855f7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: '#fff', fontSize: 16,
            }}>T</div>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 18 }}>TALASH</span>
          </div>

          <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)', marginBottom: 6 }}>
            Welcome back
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
            Sign in to access the recruitment platform
          </p>

          {/* Google button */}
          <button className="btn-google" style={{ width: '100%', marginBottom: 20 }}
            onClick={() => setShowPicker(true)}>
            <GoogleLogo />
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or sign in with email</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Email address
              </label>
              <input type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@talash.ai"
                className="input-dark" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Password
              </label>
              <input type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-dark" />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 10, fontSize: 13, color: '#fb7185',
                background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.2)',
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary"
              style={{ width: '100%', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Signing in…</>
                : <>Sign in <ChevronRight size={14} /></>
              }
            </button>
          </form>

          {/* Demo hint */}
          <button
            onClick={() => setShowDemo(p => !p)}
            style={{
              marginTop: 20, background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            <ChevronDown size={12} style={{ transform: showDemo ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            Demo credentials
          </button>
          {showDemo && (
            <div style={{
              marginTop: 8, padding: '12px 14px', borderRadius: 10,
              background: 'rgba(139,119,255,0.07)', border: '1px solid rgba(139,119,255,0.14)',
              fontSize: 12, fontFamily: 'monospace', lineHeight: 1.9,
            }}>
              <div style={{ color: 'var(--text-secondary)' }}>admin@talash.ai</div>
              <div style={{ color: 'var(--text-secondary)' }}>tamkeen@talash.ai</div>
              <div style={{ color: 'var(--text-secondary)' }}>furqan@talash.ai</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>password: talash12345</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}