import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

// Demo credentials (course project fallback)
const DEMO_USERS = [
  { email: 'admin@talash.ai',   password: 'talash2024', name: 'Admin User',    role: 'Hiring Manager', initials: 'AU', picture: null },
  { email: 'tamkeen@talash.ai', password: 'talash2024', name: 'Tamkeen Sara',  role: 'Recruiter',      initials: 'TS', picture: null },
  { email: 'furqan@talash.ai',  password: 'talash2024', name: 'Furqan Raza',   role: 'Analyst',        initials: 'FR', picture: null },
]

function persist(user) {
  localStorage.setItem('talash_user', JSON.stringify(user))
}

function initUser() {
  try { return JSON.parse(localStorage.getItem('talash_user')) || null }
  catch { return null }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(initUser)

  const login = (email, password) => {
    const found = DEMO_USERS.find(u => u.email === email && u.password === password)
    if (!found) throw new Error('Invalid email or password')
    const { password: _, ...safe } = found
    persist(safe)
    setUser(safe)
  }

  const googleLogin = (googleUser) => {
    // googleUser: { name, email, picture, sub }
    const safe = {
      name: googleUser.name,
      email: googleUser.email,
      picture: googleUser.picture || null,
      initials: googleUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
      role: 'Recruiter',
    }
    persist(safe)
    setUser(safe)
  }

  const logout = () => {
    localStorage.removeItem('talash_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, googleLogin, logout, isAuth: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)