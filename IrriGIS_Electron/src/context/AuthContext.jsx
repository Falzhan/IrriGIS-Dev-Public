import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

const AuthContext = createContext(null)

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const sessionCheckRef = useRef(null)

  const clearSessionCheck = useCallback(() => {
    if (sessionCheckRef.current) {
      clearInterval(sessionCheckRef.current)
      sessionCheckRef.current = null
    }
  }, [])

  const startSessionCheck = useCallback((token, storageType) => {
    clearSessionCheck()
    sessionCheckRef.current = setInterval(async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        
        const response = await fetch(`${API_BASE_URL}/users/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          if (data.sessionExpired || response.status === 401) {
            if (storageType === 'local') {
              localStorage.removeItem('token')
              localStorage.removeItem('user')
            } else {
              sessionStorage.removeItem('token')
              sessionStorage.removeItem('user')
            }
            setUser(null)
            setIsAuthenticated(false)
            clearSessionCheck()
            window.location.href = '/login'
          }
        }
      } catch {
        // Network error, ignore
      }
    }, 10000)
  }, [clearSessionCheck])

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token')
      const savedUser = localStorage.getItem('user') || sessionStorage.getItem('user')
      const storageType = localStorage.getItem('token') ? 'local' : 'session'
      
      if (token && savedUser) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)
          
          const response = await fetch(`${API_BASE_URL}/users/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
          })
          clearTimeout(timeoutId)
          
          if (response.ok) {
            setIsAuthenticated(true)
            try {
              setUser(JSON.parse(savedUser))
            } catch (e) {
              localStorage.removeItem('user')
              sessionStorage.removeItem('user')
            }
            startSessionCheck(token, storageType)
          } else {
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            sessionStorage.removeItem('token')
            sessionStorage.removeItem('user')
          }
        } catch (e) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('user')
        }
      }
      setLoading(false)
    }

    initAuth()

    return () => clearSessionCheck()
  }, [clearSessionCheck, startSessionCheck])

  const login = useCallback(async (email, password, rememberMe = true) => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      
      const data = await response.json()
      
      if (data.success && data.token) {
        const storageType = rememberMe ? 'local' : 'session'
        
        if (rememberMe) {
          localStorage.setItem('token', data.token)
        } else {
          sessionStorage.setItem('token', data.token)
        }
        
        const userData = {
          id: data.user?.id,
          name: data.user?.first_name && data.user?.last_name 
            ? `${data.user.first_name} ${data.user.last_name}`
            : data.user?.email?.split('@')[0] || 'Admin',
          email: data.user?.email,
          role: data.user?.role || 'nia_admin'
        }
        
        if (rememberMe) {
          localStorage.setItem('user', JSON.stringify(userData))
        } else {
          sessionStorage.setItem('user', JSON.stringify(userData))
        }
        
        setUser(userData)
        setIsAuthenticated(true)
        startSessionCheck(data.token, storageType)
        return { success: true, user: userData }
      }
      return { success: false, message: data.message }
    } catch (error) {
      return { success: false, message: error.message }
    }
  }, [startSessionCheck])

  const completeOAuthLogin = useCallback((token, userData, rememberMe = true) => {
    const storageType = rememberMe ? 'local' : 'session'
    
    if (rememberMe) {
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(userData))
    } else {
      sessionStorage.setItem('token', token)
      sessionStorage.setItem('user', JSON.stringify(userData))
    }
    
    setUser(userData)
    setIsAuthenticated(true)
    startSessionCheck(token, storageType)
  }, [startSessionCheck])

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    if (!token) return

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch(`${API_BASE_URL}/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const userData = await response.json()
        const userObj = {
          id: userData.data?.id,
          name: userData.data?.first_name && userData.data?.last_name 
            ? `${userData.data.first_name} ${userData.data.last_name}`
            : userData.data?.email?.split('@')[0] || 'Admin',
          email: userData.data?.email,
          role: userData.data?.role || 'nia_admin',
          profile_image_url: userData.data?.profile_image_url,
          ia_name: userData.data?.irrigatorAssociation?.name
        }
        
        const storageType = localStorage.getItem('token') ? 'local' : 'session'
        if (storageType === 'local') {
          localStorage.setItem('user', JSON.stringify(userObj))
        } else {
          sessionStorage.setItem('user', JSON.stringify(userObj))
        }
        
        setUser(userObj)
      }
    } catch (error) {
      console.error('Failed to refresh user data:', error)
    }
  }, [])

  const logout = useCallback(() => {
    clearSessionCheck()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    setUser(null)
    setIsAuthenticated(false)
  }, [clearSessionCheck])

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, loading, completeOAuthLogin, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
