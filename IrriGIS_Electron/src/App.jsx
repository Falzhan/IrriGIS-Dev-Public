import { HashRouter as Router, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import { OfflineProvider } from './context/OfflineContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import OAuthCallback from './pages/OAuthCallback'
import Dashboard from './pages/Dashboard'
import Monitoring from './pages/Monitoring'
import Reports from './pages/Reports'
import Tickets from './pages/Tickets'
import Users from './pages/Users'

import Settings from './pages/Settings'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth()
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }
  
  const allowedRoles = ['nia_admin', 'ia_admin']
  if (!user?.role || !allowedRoles.includes(user.role)) {
    return <Navigate to="/login?oauth_error=Access%20denied.%20This%20account%20is%20not%20authorized%20for%20admin%20panel.&clear=1" replace />
  }
  
  return children
}

function OAuthFailure() {
  const { logout } = useAuth()
  const [searchParams] = useSearchParams()
  const reason = searchParams.get('reason') || searchParams.get('provider') || 'oauth'
  let message = 'Social authentication failed'
  
  if (reason === 'inactive') {
    message = 'Account not activated. Please wait for admin approval.'
  } else if (reason === 'forbidden') {
    message = 'Access denied. This account is not authorized for admin panel.'
  } else if (reason === 'no_ia') {
    message = 'No IA assigned. Please contact administrator.'
  } else if (reason === 'google') {
    message = 'Google sign-in failed. Please try again.'
  } else if (reason === 'facebook') {
    message = 'Facebook sign-in failed. Please try again.'
  }
  
  logout()
  return <Navigate to={`/login?oauth_error=${encodeURIComponent(message)}`} replace />
}

function App() {
  return (
    <OfflineProvider>
      <AuthProvider>
        <NotificationProvider>
          <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/oauth/failure" element={<OAuthFailure />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="monitoring" element={<Monitoring />} />
              <Route path="reports" element={<Reports />} />
              <Route path="tickets" element={<Tickets />} />
              <Route path="users" element={<Users />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </NotificationProvider>
    </AuthProvider>
    </OfflineProvider>
  )
}

export default App