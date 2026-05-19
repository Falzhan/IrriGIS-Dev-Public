import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

const OfflineContext = createContext()

// IndexedDB setup
const DB_NAME = 'IrriGIS_OfflineDB'
const DB_VERSION = 1
const STORE_NAME = 'cached_data'

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
  })
}

const cacheData = async (key, data) => {
  try {
    const db = await openDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    await store.put({ key, data, timestamp: Date.now() })
    db.close()
  } catch (error) {
    console.error('[Offline] Failed to cache data:', error)
  }
}

const getCachedData = async (key) => {
  try {
    const db = await openDB()
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(key)
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close()
        resolve(request.result?.data || null)
      }
      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch (error) {
    console.error('[Offline] Failed to get cached data:', error)
    return null
  }
}

const clearCache = async () => {
  try {
    const db = await openDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    await store.clear()
    db.close()
  } catch (error) {
    console.error('[Offline] Failed to clear cache:', error)
  }
}

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('online') // 'online' | 'offline'
  const toastTimeoutRef = useRef(null)
  const previousStatus = useRef(null) // null = initial/unknown, prevents toast on startup
  const hasInitialized = useRef(false)

  // Show toast notification
  const showToastNotification = (message, type) => {
    setToastMessage(message)
    setToastType(type)
    setShowToast(true)
    
    // Clear existing timeout
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }
    
    // Hide toast after 10 seconds
    toastTimeoutRef.current = setTimeout(() => {
      setShowToast(false)
    }, 10000)
  }

  // Hide toast immediately (for click-to-close)
  const hideToast = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }
    setShowToast(false)
  }

  // Check actual server connectivity (not just browser online status)
  const checkServerConnectivity = useCallback(async () => {
    try {
      const backendUrl = localStorage.getItem('irrigis_backend_url') || 'http://localhost:3000/api'
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      // Use a lightweight existing endpoint for health check
      const response = await fetch(`${backendUrl}/gis/stats`, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store'
      }).catch(() => null)
      
      // Suppress connection errors in console (expected when offline)
      
      clearTimeout(timeoutId)
      // Accept 200 OK or 401 (auth required but server is up)
      return response && (response.ok || response.status === 401)
    } catch {
      return false
    }
  }, [])

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = async () => {
      const serverReachable = await checkServerConnectivity()
      if (serverReachable) {
        setIsOnline(true)
        // Always update toast when going online (clear any offline message)
        if (hasInitialized.current) {
          showToastNotification('Connected to server', 'online')
        }
        previousStatus.current = true
      } else {
        // Browser reports online but server not reachable
        setIsOnline(false)
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      // Always show toast when going offline
      if (hasInitialized.current) {
        showToastNotification('Disconnected from server - Using offline data', 'offline')
      }
      previousStatus.current = false
    }

    // Listen for browser online/offline events
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Periodic connectivity check (every 10 seconds for more responsive updates)
    const intervalId = setInterval(async () => {
      const serverReachable = await checkServerConnectivity()
      if (serverReachable !== previousStatus.current) {
        setIsOnline(serverReachable)
        // Always show toast when status changes (after initial load)
        if (hasInitialized.current) {
          if (serverReachable) {
            showToastNotification('Connected to server', 'online')
          } else {
            showToastNotification('Disconnected from server - Using offline data', 'offline')
          }
        }
        previousStatus.current = serverReachable
      }
    }, 10000)

    // Initial check - silent (no toast)
    checkServerConnectivity().then(reachable => {
      setIsOnline(reachable)
      previousStatus.current = reachable
      hasInitialized.current = true
    })

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(intervalId)
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkServerConnectivity, isOnline])

  // Cache data helper
  const cacheOfflineData = useCallback(async (key, data) => {
    await cacheData(key, data)
  }, [])

  // Get cached data helper
  const getOfflineData = useCallback(async (key) => {
    return await getCachedData(key)
  }, [])

  // Clear cache helper
  const clearOfflineCache = useCallback(async () => {
    await clearCache()
  }, [])

  // Preload critical data for offline use
  const preloadOfflineData = useCallback(async (fetchFunctions) => {
    if (!navigator.onLine) return
    
    try {
      for (const { key, fetcher } of fetchFunctions) {
        try {
          const data = await fetcher()
          await cacheData(key, data)
        } catch (error) {
          console.error(`[Offline] Failed to preload ${key}:`, error)
        }
      }
    } catch (error) {
      console.error('[Offline] Preload failed:', error)
    }
  }, [])

  const value = {
    isOnline,
    isOffline: !isOnline,
    cacheOfflineData,
    getOfflineData,
    clearOfflineCache,
    preloadOfflineData,
    showToast,
    hideToast,
    toastMessage,
    toastType
  }

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  )
}

export const useOffline = () => {
  const context = useContext(OfflineContext)
  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider')
  }
  return context
}

// Enhanced API request with offline support
export const makeOfflineAwareRequest = async (endpoint, requestFn, options = {}) => {
  const { cacheKey, forceFresh = false } = options
  
  // Try online request first
  if (navigator.onLine && !forceFresh) {
    try {
      const data = await requestFn()
      // Cache successful response
      if (cacheKey) {
        await cacheData(cacheKey, data)
      }
      return { data, fromCache: false }
    } catch (error) {
      // If request fails, try cache
      if (cacheKey) {
        const cached = await getCachedData(cacheKey)
        if (cached) {
          return { data: cached, fromCache: true }
        }
      }
      throw error
    }
  } else {
    // Offline mode - serve from cache
    if (cacheKey) {
      const cached = await getCachedData(cacheKey)
      if (cached) {
        return { data: cached, fromCache: true }
      }
    }
    throw new Error('No cached data available')
  }
}

export default OfflineContext
