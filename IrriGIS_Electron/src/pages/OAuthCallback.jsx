import { useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

export default function OAuthCallback() {
  const { completeOAuthLogin } = useAuth()
  const processedRef = useRef(false)

  const goHome = useCallback(() => {
    window.location.replace('/')
  }, [])

  useEffect(() => {
    if (processedRef.current) return
    processedRef.current = true

    let token = localStorage.getItem('interceptedToken')
    let userRaw = localStorage.getItem('interceptedUser')
    if (!token || !userRaw) {
      try {
        const p = new URLSearchParams(window.location.search)
        token = p.get('token')
        userRaw = p.get('user')
      } catch (_) {}
    }

    localStorage.removeItem('interceptedToken')
    localStorage.removeItem('interceptedUser')

    if (!token || !userRaw) { goHome(); return }

    let userData
    try { userData = JSON.parse(userRaw) }
    catch { goHome(); return }

    completeOAuthLogin(token, userData, true)
    window.location.replace(window.location.pathname)
  }, [completeOAuthLogin, goHome])

  return null
}
