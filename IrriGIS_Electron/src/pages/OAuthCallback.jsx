import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { completeOAuthLogin } = useAuth()
  const processedRef = useRef(false)

  useEffect(() => {
    if (processedRef.current) return
    processedRef.current = true

    const token = searchParams.get('token')
    const userParam = searchParams.get('user')

    if (!token || !userParam) {
      navigate('/login', { replace: true })
      return
    }

    try {
      const userData = JSON.parse(decodeURIComponent(userParam))
      completeOAuthLogin(token, userData, true)
      navigate('/dashboard', { replace: true })
    } catch {
      navigate('/login', { replace: true })
    }
  }, [searchParams, completeOAuthLogin, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-slate-600">Completing sign in...</p>
      </div>
    </div>
  )
}
