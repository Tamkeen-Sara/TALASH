import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Upload, LayoutDashboard, ArrowLeftRight, User, LogOut, Users, Sun, Moon } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import useCandidateStore from '../store/candidateStore'
import useTheme from '../hooks/useTheme'

const NAV = [
  { to: '/',          Icon: Upload,          label: 'Upload' },
  { to: '/dashboard', Icon: LayoutDashboard,  label: 'Dashboard' },
  { to: '/compare',   Icon: ArrowLeftRight,   label: 'Compare' },
  { to: '/profile',   Icon: User,             label: 'Profile' },
]

const S = {
  aside: {
    width: 'var(--sidebar-w)',
    position: 'fixed',
    top: 0, left: 0,
    height: '100vh',
    zIndex: 40,
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
  },
}

export default function Sidebar() {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const candidates = useCandidateStore(s => s.candidates)
  const { isDark, toggle: toggleTheme } = useTheme()

  const handleLogout = () => { logout(); navigate('/login') }

  const bg = isDark
    ? 'linear-gradient(180deg, #0b0a18 0%, #09080e 100%)'
    : 'linear-gradient(180deg, #fffdf6 0%, #faf7f0 100%)'

  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'

  return (
    <aside style={{ ...S.aside, background: bg, borderRight: `1px solid ${borderColor}` }}>

      {/* Logo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '0 18px', height: 58,
        borderBottom: `1px solid ${borderColor}`,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: 'linear-gradient(135deg, #e8930a, #f5b030)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 14, color: '#fff',
          boxShadow: '0 2px 10px rgba(232,147,10,0.38)',
        }}>T</div>
        <div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>
            TALASH
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 1 }}>
            Recruitment AI
          </div>
        </div>
      </div>

      {/* Candidates pill */}
      <div style={{ padding: '14px 12px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px', borderRadius: 10,
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent-ring)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={13} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)' }}>Candidates</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-light, var(--accent))' }}>
            {candidates.length}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '18px 8px 8px', overflowY: 'auto' }}>
        <p style={{
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.12em', color: 'var(--text-muted)',
          padding: '0 10px', marginBottom: 8,
        }}>Navigation</p>

        {NAV.map(({ to, Icon, label }) => {
          const active = pathname === to
          return (
            <Link key={to} to={to} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 10, marginBottom: 2,
              fontSize: 13, fontWeight: 500, textDecoration: 'none',
              transition: 'all 0.14s',
              background: active ? 'var(--accent-dim)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              border: active ? '1px solid var(--accent-ring)' : '1px solid transparent',
            }}
            onMouseEnter={e => {
              if (!active) {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-muted)'
              }
            }}>
              <Icon size={15} style={{ flexShrink: 0 }} />
              {label}
              {active && (
                <span style={{
                  marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--accent)', flexShrink: 0,
                  boxShadow: '0 0 6px var(--accent-glow)',
                }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Theme toggle + user */}
      <div style={{ padding: '8px', borderTop: `1px solid ${borderColor}` }}>

        {/* Dark/Light toggle */}
        <button onClick={toggleTheme} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 10px', borderRadius: 10, border: 'none',
          background: 'transparent', cursor: 'pointer', marginBottom: 2,
          transition: 'background 0.14s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {isDark ? <Moon size={13} /> : <Sun size={13} />}
            {isDark ? 'Dark mode' : 'Light mode'}
          </span>
          {/* Toggle pill */}
          <div style={{
            width: 34, height: 18, borderRadius: 9,
            background: isDark ? 'var(--accent-dim)' : 'var(--border-default)',
            border: '1px solid var(--border-default)',
            position: 'relative', transition: 'background 0.2s',
          }}>
            <div style={{
              position: 'absolute', top: 2,
              left: isDark ? 16 : 2,
              width: 12, height: 12, borderRadius: '50%',
              background: isDark ? 'var(--accent)' : 'var(--text-secondary)',
              transition: 'left 0.2s',
            }} />
          </div>
        </button>

        {/* User row */}
        <Link to="/profile" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 10px', borderRadius: 10, textDecoration: 'none',
          transition: 'background 0.14s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          {user?.picture
            ? <img src={user.picture} alt={user.name} style={{
                width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
                border: '2px solid var(--accent-ring)',
              }} />
            : <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #e8930a, #f5b030)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 10, fontWeight: 700,
              }}>
                {user?.initials || user?.name?.[0] || '?'}
              </div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{user?.name}</p>
            <p style={{
              fontSize: 10, color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{user?.role}</p>
          </div>
        </Link>

        <button onClick={handleLogout} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 10, border: 'none',
          background: 'transparent', cursor: 'pointer',
          fontSize: 12, color: 'var(--text-muted)', transition: 'all 0.14s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,113,133,0.08)'; e.currentTarget.style.color = '#fb7185' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </aside>
  )
}