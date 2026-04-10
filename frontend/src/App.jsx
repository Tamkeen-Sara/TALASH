import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Upload from './pages/Upload'
import Dashboard from './pages/Dashboard'
import CandidateView from './pages/CandidateView'
import Compare from './pages/Compare'
import Profile from './pages/Profile'

function ProtectedLayout() {
  const { isAuth } = useAuth()
  if (!isAuth) return <Navigate to="/login" replace />

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{
        marginLeft: 'var(--sidebar-w)',
        width: 'calc(100vw - var(--sidebar-w))',
        minHeight: '100vh',
        background: 'var(--bg-base)',
        overflowX: 'hidden',
        overflowY: 'auto',
      }}>
        <Routes>
          <Route path="/"              element={<Upload />} />
          <Route path="/dashboard"     element={<Dashboard />} />
          <Route path="/candidate/:id" element={<CandidateView />} />
          <Route path="/compare"       element={<Compare />} />
          <Route path="/profile"       element={<Profile />} />
        </Routes>
      </main>
    </div>
  )
}

function LoginGuard() {
  const { isAuth } = useAuth()
  return isAuth ? <Navigate to="/dashboard" replace /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginGuard />} />
          <Route path="/*"     element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}