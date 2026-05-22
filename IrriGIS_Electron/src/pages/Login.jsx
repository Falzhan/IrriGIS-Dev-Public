// src/pages/Login.jsx - Login page with slideshow and backend URL configuration
import { useState, useEffect } from 'react'
import { useNavigate, Navigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Droplets, Settings, AlertTriangle, X, Check, RotateCcw, Edit2, Server, Save } from 'lucide-react'
import fullIconUrl from '/full-icon.png'

const getDefaultApiUrl = () => import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

// Slideshow images with references
const SLIDESHOW_IMAGES = [
  {
    src: 'https://lqhmeqjramkmzmyexnvk.supabase.co/storage/v1/object/public/users/profile-images/Irrigation-BADOMA.jpg',
    reference: 'https://davaodelsur.gov.ph/agriculture/p25m-irrigation-project-turned-over-to-badoma-ics/',
    caption: 'BADOMA Irrigation Project'
  },
  {
    src: 'https://lqhmeqjramkmzmyexnvk.supabase.co/storage/v1/object/public/users/profile-images/Irrigation-NIA_Cordillera.jpg',
    reference: 'https://www.pids.gov.ph/details/pids-study-proposes-alignment-of-nia-s-functions-staff-complement-with-free-irrigation-law',
    caption: 'NIA Cordillera'
  }
]

export default function Login() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthCallbackPort, setOauthCallbackPort] = useState('18765')
  const { login, logout, isAuthenticated, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  
  // Slideshow state
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  
  // Backend URL settings
  const [showBackendSettings, setShowBackendSettings] = useState(false)
  const [backendUrl, setBackendUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('irrigis_backend_url') || getDefaultApiUrl()
    }
    return getDefaultApiUrl()
  })
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [tempUrl, setTempUrl] = useState(backendUrl)
  const [showWarning, setShowWarning] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const oauthError = searchParams.get('oauth_error')
    const shouldClear = searchParams.get('clear') === '1'
    
    if (shouldClear) {
      logout()
    }
    
    if (oauthError) {
      try {
        const decoded = decodeURIComponent(oauthError)
        setError(decoded)
      } catch (e) {
        setError(oauthError)
      }
      window.history.replaceState({}, document.title, '/login')
    }
  }, [searchParams, logout])

  useEffect(() => {
    const oauthError = searchParams.get('oauth_error')
    // Only redirect if authenticated AND no error AND auth loading is done
    if (!authLoading && isAuthenticated && !oauthError && !error) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, authLoading, navigate, searchParams, error])

  useEffect(() => {
    let cancelled = false
    const port = window.electronAPI?.getEnvVar?.('OAUTH_CALLBACK_PORT', '18765')
    if (port instanceof Promise) {
      port.then(resolved => { if (!cancelled) setOauthCallbackPort(resolved || '18765') })
    } else {
      setOauthCallbackPort(port || '18765')
    }
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please enter both email and password')
      return
    }
    
    setLoading(true)
    setError('')
    
    console.log('Attempting login with:', email)
    const result = await login(email, password, rememberMe)
    console.log('Login result:', result)
    
    setLoading(false)
    
    if (result.success) {
      // Check if user role is allowed before allowing login
      const userRole = result.user?.role
      console.log('User role from login:', userRole)
      if (!userRole || !['nia_admin', 'ia_admin'].includes(userRole)) {
        setError('Access denied. This account is not authorized for admin panel.')
        return
      }
      navigate('/dashboard')
    } else {
      console.log('Login failed, setting error:', result.message)
      setError(result.message || 'Login failed. Please check your credentials.')
    }
  }

  const handleEmailChange = (e) => {
    setEmail(e.target.value)
    setError('')
  }

  const isNiaEmail = email.toLowerCase().endsWith('@nia.gov.ph')
  
  // Slideshow effect - change image every 8 seconds (slower)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % SLIDESHOW_IMAGES.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  // Don't redirect if there's an error to show
  if (isAuthenticated && !error) {
    return <Navigate to="/dashboard" replace />
  }

  const currentImage = SLIDESHOW_IMAGES[currentImageIndex]
  
  // Dynamic API URL for OAuth (uses current backend setting)
  const API_BASE_URL = backendUrl

  return (
    <div className="flex h-screen">
      {/* Left Pane - Slideshow */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 overflow-hidden">
        {/* Slideshow Images with Fade Transition */}
        {SLIDESHOW_IMAGES.map((image, index) => (
          <div
            key={index}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-2000 ease-in-out ${
              index === currentImageIndex ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ backgroundImage: `url(${image.src})` }}
          />
        ))}
        
        {/* Whitish filter overlay */}
        <div className="absolute inset-0 bg-white/30" />
        
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/30" />
        
        {/* Full Icon Logo - Centered & Enlarged */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-12 z-10">
          <img 
            src={fullIconUrl} 
            alt="IrriGIS" 
            className="w-72 h-42 object-contain drop-shadow-2xl"
          />
          <p className="text-white/90 text-xl mt-4 text-center drop-shadow-md font-medium">Irrigation Canal Monitoring & Reporting Platform</p>
        </div>
        
        {/* Reference Link - Bottom Left */}
        <div className="absolute bottom-4 left-4 z-20">
          <a 
            href={currentImage.reference}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-white/60 hover:text-white underline decoration-white/30 transition-colors"
            title={`Reference: ${currentImage.caption}`}
          >
            Image: {currentImage.caption}
          </a>
        </div>
        
        {/* Slide Indicators - Bottom Center */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {SLIDESHOW_IMAGES.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentImageIndex(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentImageIndex ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/70'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Right Pane - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center mb-8">
            <Droplets className="w-12 h-12 text-primary mr-3" />
            <h1 className="text-3xl font-bold text-slate-800">IrriGIS</h1>
          </div>

          <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome Back</h2>
          <p className="text-slate-500 mb-8">Sign in to access the admin dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                placeholder="admin@nia.gov.ph"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
              />
              <label htmlFor="rememberMe" className="ml-2 text-sm text-slate-600">
                Keep me signed in
              </label>
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-600 disabled:bg-primary/50 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-50 text-slate-500">Or continue with</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
                <a
                  href={`${API_BASE_URL}/auth/google?redirect_uri=${encodeURIComponent(
                    (!!window.electronAPI
                      ? `http://localhost:${oauthCallbackPort}`
                      : window.location.origin) + '/oauth/callback'
                  )}`}
                  className="w-full inline-flex justify-center items-center gap-2 py-3 px-4 border border-slate-300 rounded-lg shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </a>

              <a
                href={`${API_BASE_URL}/auth/facebook?redirect_uri=${encodeURIComponent(
                  (!!window.electronAPI
                    ? `http://localhost:${oauthCallbackPort}`
                    : window.location.origin) + '/oauth/callback'
                )}`}
                className="w-full inline-flex justify-center items-center gap-2 py-3 px-4 border border-slate-300 rounded-lg shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <svg className="h-5 w-5" fill="#1877F2" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Facebook
              </a>
            </div>
          </div>

          <p className="mt-6 text-sm text-slate-500 text-center">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary hover:text-primary-600 font-medium">
              Register here
            </Link>
          </p>
          
          {/* Backend Settings - Subtle */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <button
              onClick={() => setShowBackendSettings(true)}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Settings className="w-3 h-3" />
              Configure Backend API URL
            </button>
          </div>
        </div>
      </div>
      
      {/* Backend Settings Modal */}
      {showBackendSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-slate-800">Backend API URL</h3>
              </div>
              <button 
                onClick={() => setShowBackendSettings(false)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Warning */}
              {showWarning && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-red-800 text-sm">Warning: Critical Setting</h4>
                      <p className="text-xs text-red-700 mt-1">
                        Changing the backend URL will disconnect the app from the current server. 
                        An incorrect URL will break the application.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setShowWarning(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { setShowWarning(false); setIsEditingUrl(true); setTempUrl(backendUrl); }}
                      className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      I Understand, Proceed
                    </button>
                  </div>
                </div>
              )}
              
              {/* Current URL Display */}
              {!isEditingUrl && !showWarning && (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Current Backend URL</p>
                    <code className="text-sm font-mono text-slate-700 bg-white px-2 py-1 rounded border border-slate-200 block break-all">
                      {backendUrl}
                    </code>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => { const defaultUrl = getDefaultApiUrl(); if (confirm(`Reset backend URL to default?\n\n${defaultUrl}\n\nThe page will reload to apply changes.`)) { localStorage.removeItem('irrigis_backend_url'); setBackendUrl(defaultUrl); window.location.reload(); } }}
                      className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reset to Default
                    </button>
                    <button
                      onClick={() => setShowWarning(true)}
                      className="flex items-center gap-1 px-3 py-2 text-sm text-primary border border-primary rounded hover:bg-primary-50"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit URL
                    </button>
                  </div>
                  
                  {(() => { const defaultUrl = getDefaultApiUrl(); return defaultUrl && (
                    <p className="text-xs text-slate-400">
                      .env default: {defaultUrl}
                    </p>
                  ); })()}
                </div>
              )}
              
              {/* Edit Form */}
              {isEditingUrl && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-800">
                      <strong>Double-check the URL before saving.</strong> An incorrect URL will break the application.
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Backend API URL
                    </label>
                    <input
                      type="text"
                      value={tempUrl}
                      onChange={(e) => setTempUrl(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary outline-none font-mono"
                      placeholder="https://irrigis-backend.onrender.com/api"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Must include protocol (http:// or https://) and /api suffix
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!tempUrl.trim()) { alert('Backend URL cannot be empty'); return; }
                        try { new URL(tempUrl.replace('/api', '')); } catch { alert('Please enter a valid URL'); return; }
                        localStorage.setItem('irrigis_backend_url', tempUrl);
                        setBackendUrl(tempUrl);
                        setIsEditingUrl(false);
                        setSaved(true);
                        setTimeout(() => setSaved(false), 3000);
                        if (confirm('Backend URL saved. The page needs to reload to apply changes. Reload now?')) { window.location.reload(); }
                      }}
                      className={`flex items-center gap-1 px-4 py-2 text-sm rounded ${
                        saved ? 'bg-green-500 text-white' : 'bg-primary text-white hover:bg-primary-600'
                      }`}
                    >
                      {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                      {saved ? 'Saved!' : 'Save & Apply'}
                    </button>
                    <button
                      onClick={() => setTempUrl(getDefaultApiUrl())}
                      className="px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50"
                    >
                      Reset to Local
                    </button>
                    <button
                      onClick={() => { setIsEditingUrl(false); setTempUrl(backendUrl); }}
                      className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

