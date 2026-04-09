import { Link, useLocation } from 'react-router-dom'

const links = [
  { to: '/', label: 'Upload' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/compare', label: 'Compare' },
]

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <nav className="bg-[#1a3557] text-white shadow-md">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-8">
        <span className="text-xl font-bold tracking-wide">TALASH</span>
        <div className="flex gap-6 text-sm font-medium">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`hover:text-blue-300 transition-colors ${
                pathname === to ? 'text-blue-300 border-b-2 border-blue-300 pb-0.5' : ''
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
