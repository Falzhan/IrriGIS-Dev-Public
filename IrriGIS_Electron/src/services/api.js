// Detect if running in Electron
const isElectron = window.isElectron === true

// Get API URL - prioritize localStorage (for Electron), then env var, then fallback
const getApiBaseUrl = () => {
  // First priority: localStorage (for runtime configuration in Electron)
  if (isElectron) {
    const storedUrl = localStorage.getItem('irrigis_backend_url')
    if (storedUrl) {
      return storedUrl
    }
  }
  
  // Second priority: Vite env variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // Fallback for development
  return 'http://localhost:3000/api'
}

// Log the backend URL being used (helpful for debugging)
const logApiUrl = () => {
  const url = getApiBaseUrl()
  console.log('[API] Using backend URL:', url, isElectron ? '(Electron mode)' : '(Web mode)')
  return url
}
logApiUrl()

// IndexedDB setup for offline caching
const DB_NAME = 'IrriGIS_API_Cache'
const DB_VERSION = 1
const STORE_NAME = 'api_cache'

const openCacheDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })
}

const cacheResponse = async (key, data) => {
  try {
    const db = await openCacheDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    await store.put({ key, data, timestamp: Date.now() })
    db.close()
  } catch (error) {
    console.error('[API Cache] Failed to cache:', error)
  }
}

const getCachedResponse = async (key) => {
  try {
    const db = await openCacheDB()
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    
    return new Promise((resolve, reject) => {
      const request = store.get(key)
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
    console.error('[API Cache] Failed to get cache:', error)
    return null
  }
}

const clearAPICache = async () => {
  try {
    const db = await openCacheDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    await store.clear()
    db.close()
  } catch (error) {
    console.error('[API Cache] Failed to clear:', error)
  }
}

// Export cache functions for external use
export { clearAPICache, getCachedResponse }

const clearAuth = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('user')
  window.location.href = '/login'
}

class ApiService {
  getToken() {
    return localStorage.getItem('token')
  }

  setToken(token) {
    localStorage.setItem('token', token)
  }

  clearToken() {
    localStorage.removeItem('token')
  }

  getHeaders() {
    const token = this.getToken()
    const headers = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  async request(endpoint, options = {}) {
    const url = `${getApiBaseUrl()}${endpoint}`
    const cacheKey = `${endpoint}_${JSON.stringify(options)}`
    const isGetRequest = !options.method || options.method === 'GET'
    
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    }

    try {
      const response = await fetch(url, config)
      const data = await response.json()

      if (response.status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('user')
        window.location.href = '/login'
        return
      }

      if (!response.ok) {
        throw new Error(data.message || 'API request failed')
      }

      // Cache successful GET requests for offline use
      if (isGetRequest) {
        await cacheResponse(cacheKey, data)
        console.log('[API] Cached:', endpoint)
      }

      return data
    } catch (error) {
      // Handle offline scenario - try to serve from cache
      if (isGetRequest) {
        const cached = await getCachedResponse(cacheKey)
        if (cached) {
          console.log('[API] Serving from cache:', endpoint)
          return cached
        }
      }
      
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        throw new Error('Network error. Please check your connection.')
      }
      if (error.message === 'Session expired. Please login again.') {
        throw error
      }
      console.error('API Error:', error)
      throw error
    }
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (data.token) {
      this.setToken(data.token)
    }
    return data
  }

  async logout() {
    this.clearToken()
  }

  async getUsers() {
    return this.request('/users')
  }

  async getUser(id) {
    return this.request(`/users/${id}`)
  }

  async createUser(userData) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    })
  }

  async createUserWithProfile(formData) {
    const url = `${getApiBaseUrl()}/users`
    const token = this.getToken()
    const headers = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    })
    
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message || 'API request failed')
    }
    return data
  }

  async updateUser(id, userData) {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    })
  }

  async deleteUser(id) {
    return this.request(`/users/${id}`, {
      method: 'DELETE',
    })
  }

  async getIrrigatorAssociations() {
    return this.request('/users/ias')
  }

  async getReports(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/reports${query ? `?${query}` : ''}`)
  }

  async getReport(id) {
    return this.request(`/reports/${id}`)
  }

  async updateReport(id, reportData) {
    return this.request(`/reports/${id}`, {
      method: 'PUT',
      body: JSON.stringify(reportData),
    })
  }

  async getReportsByGisFeature(gisFeatureId, params = {}) {
    const query = new URLSearchParams({ gis_feature_id: gisFeatureId, ...params, limit: 100 })
    return this.request(`/reports?${query}`)
  }

  async getTickets(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/tickets${query ? `?${query}` : ''}`)
  }

  async getTicket(id) {
    return this.request(`/tickets/${id}`)
  }

  async updateTicket(id, ticketData) {
    return this.request(`/tickets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(ticketData),
    })
  }

  async addComment(ticketId, comment) {
    return this.request(`/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    })
  }

  async getGISReports() {
    return this.request('/gis/reports')
  }

  async getGISFeatures() {
    return this.request('/gis/features')
  }

  async getRISList() {
    return this.request('/gis/ris')
  }

  async getStats() {
    return this.request('/gis/stats')
  }

  async getNotifications() {
    return this.request('/notifications')
  }

  async getUnreadCount() {
    return this.request('/notifications/unread-count')
  }

  async markNotificationAsRead(id) {
    return this.request(`/notifications/${id}/read`, {
      method: 'PUT',
    })
  }

  async markAllNotificationsAsRead() {
    return this.request('/notifications/read-all', {
      method: 'PUT',
    })
  }

  async deleteNotification(id) {
    return this.request(`/notifications/${id}`, {
      method: 'DELETE',
    })
  }

  // Sub-Status APIs
  async getTicketSubStatuses() {
    return this.request('/ticket-sub-statuses')
  }

  async getTicketSubStatusesForTicket(ticketId) {
    return this.request(`/ticket-sub-statuses/for-ticket?ticket_id=${ticketId}`)
  }

  async createTicketSubStatus(data) {
    return this.request('/ticket-sub-statuses', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateTicketSubStatus(id, data) {
    return this.request(`/ticket-sub-statuses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteTicketSubStatus(id) {
    return this.request(`/ticket-sub-statuses/${id}`, {
      method: 'DELETE',
    })
  }

  // Report Presets APIs
  async getReportPresets() {
    return this.request('/report-presets')
  }

  async getReportPreset(id) {
    return this.request(`/report-presets/${id}`)
  }

  async getReportPresetsByCategory(category) {
    return this.request(`/report-presets/by-category?category=${category}`)
  }

  async getReportPresetCategories() {
    return this.request('/report-presets/categories')
  }

  async createReportPreset(data) {
    return this.request('/report-presets', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateReportPreset(id, data) {
    return this.request(`/report-presets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteReportPreset(id) {
    return this.request(`/report-presets/${id}`, {
      method: 'DELETE',
    })
  }

  async getGISFeatureById(id) {
    return this.request(`/gis/features/${id}`)
  }

  async createGISFeature(data) {
    return this.request('/gis/features', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateGISFeature(id, data) {
    return this.request(`/gis/features/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteGISFeature(id) {
    return this.request(`/gis/features/${id}`, {
      method: 'DELETE',
    })
  }

  async getIAById(id) {
    return this.request(`/gis/ias/${id}`)
  }

  async createIA(data) {
    return this.request('/gis/ias', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateIA(id, data) {
    return this.request(`/gis/ias/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteIA(id) {
    return this.request(`/gis/ias/${id}`, {
      method: 'DELETE',
    })
  }

  async getIAGeoJSON(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/gis/ias/geojson${query ? `?${query}` : ''}`)
  }

  async getTicketSettings() {
    return this.request('/ticket-settings')
  }

  async updateTicketSettings(data) {
    return this.request('/ticket-settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async getUserSettings() {
    return this.request('/user-settings')
  }

  async updateUserSettings(data) {
    return this.request('/user-settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }
}

export const api = new ApiService()
export default api
