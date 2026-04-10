import { Link, useLocation } from 'react-router-dom'

const links = [
  { to: '/', label: 'Upload' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/compare', label: 'Compare' },
]

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <nav className="sticky top-0 z-50 hero-gradient shadow-lg">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">
            T
          </div>
          <span className="text-white font-bold text-lg tracking-wide">TALASH</span>
          <span className="hidden sm:block text-white/40 text-xs font-medium ml-1">
            Faculty Recruitment AI
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {links.map(({ to, label }) => {
            const active = pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-white/20 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}