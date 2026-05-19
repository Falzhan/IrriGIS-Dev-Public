import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import { useAuth } from './AuthContext'

const NotificationContext = createContext()

const POLL_INTERVALS = [15000, 30000, 60000, 120000]
const POLL_RESET_THRESHOLD = 3

export function NotificationProvider({ children }) {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  
  const pollIndexRef = useRef(0)
  const unchangedCountRef = useRef(0)
  const intervalRef = useRef(null)
  const lastCountRef = useRef(0)

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.getNotifications()
      console.log('Fetch notifications response:', response)
      if (response.success) {
        setNotifications(response.data || [])
        if (response.unread_count !== undefined) {
          setUnreadCount(response.unread_count)
        }
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    }
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await api.getUnreadCount()
      console.log('Fetch unread count response:', response)
      if (response.success) {
        const count = response.data?.unread_count ?? response.unread_count ?? response.count ?? 0
        setUnreadCount(count)
        return count
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error)
    }
    return 0
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchNotifications(), fetchUnreadCount()])
    setLoading(false)
  }, [fetchNotifications, fetchUnreadCount])

  const resetPolling = useCallback(() => {
    pollIndexRef.current = 0
    unchangedCountRef.current = 0
  }, [])

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    
    const runPoll = async () => {
      if (document.hidden) return
      
      const currentCount = await fetchUnreadCount()
      
      if (currentCount === lastCountRef.current) {
        unchangedCountRef.current++
        if (unchangedCountRef.current >= POLL_RESET_THRESHOLD && pollIndexRef.current < POLL_INTERVALS.length - 1) {
          pollIndexRef.current++
        }
      } else {
        lastCountRef.current = currentCount
        unchangedCountRef.current = 0
        pollIndexRef.current = 0
      }
    }
    
    const scheduleNext = () => {
      intervalRef.current = setTimeout(() => {
        runPoll()
        scheduleNext()
      }, POLL_INTERVALS[pollIndexRef.current])
    }
    
    scheduleNext()
  }, [fetchUnreadCount])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const markAsRead = async (id) => {
    try {
      await api.markNotificationAsRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
      lastCountRef.current = Math.max(0, lastCountRef.current - 1)
      resetPolling()
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await api.markAllNotificationsAsRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
      lastCountRef.current = 0
      resetPolling()
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const deleteNotification = async (id) => {
    try {
      await api.deleteNotification(id)
      const wasUnread = notifications.find(n => n.id === id && !n.is_read)
      setNotifications(prev => prev.filter(n => n.id !== id))
      if (wasUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1))
        lastCountRef.current = Math.max(0, lastCountRef.current - 1)
      }
      resetPolling()
    } catch (error) {
      console.error('Failed to delete notification:', error)
    }
  }

  useEffect(() => {
    if (!authLoading && isAuthenticated && !loading) {
      fetchAll()
      lastCountRef.current = 0
      startPolling()
    }
    return () => stopPolling()
  }, [isAuthenticated, authLoading, fetchAll])

  useEffect(() => {
    if (!isAuthenticated) return

    const handleVisibilityChange = () => {
      if (document.hidden) return
      resetPolling()
      fetchUnreadCount()
    }

    const handleUserActivity = () => {
      if (pollIndexRef.current > 0) {
        resetPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('click', handleUserActivity)
    window.addEventListener('keydown', handleUserActivity)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('click', handleUserActivity)
      window.removeEventListener('keydown', handleUserActivity)
    }
  }, [isAuthenticated, fetchUnreadCount, resetPolling])

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      loading,
      fetchAll,
      markAsRead,
      markAllAsRead,
      deleteNotification
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}