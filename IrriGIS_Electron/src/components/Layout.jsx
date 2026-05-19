import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { useOffline } from '../context/OfflineContext'
import { 
  LayoutDashboard, 
  Map, 
  FileText, 
  Users, 
  LogOut, 
  Bell,
  Settings,
  Check,
  Trash2,
  Menu,
  ChevronLeft,
  Send,
  ChevronDown,
  User,
  Building,
  Ticket,
  RefreshCw,
  Wifi,
  WifiOff,
  X
} from 'lucide-react'
import fullIconUrl from '/full-icon.png'
import faviconUrl from '/favicon.png'
import { useState, useRef, useEffect } from 'react'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/monitoring', label: 'Monitoring', icon: Map },
  { path: '/tickets', label: 'Tickets', icon: Ticket },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/users', label: 'Users', icon: Users },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, fetchAll } = useNotifications()
  const { isOnline, showToast, hideToast, toastMessage, toastType } = useOffline()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const notificationRef = useRef(null)
  const userMenuRef = useRef(null)

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (showNotifications) {
      fetchAll()
    }
  }, [showNotifications, fetchAll])

  // Handle Ctrl+R / Cmd+R — hard reload the whole Electron window
  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault()
        window.location.reload()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true)
  }

  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false)
    logout()
    navigate('/login')
  }

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false)
  }

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  const getUserProfileImage = (user) => {
    if (user?.profile_image_url) {
      // If it's already a full Supabase URL, return as-is
      if (user.profile_image_url.startsWith('https://')) {
        return user.profile_image_url
      }
      
      // Legacy local path - redirect to backend which redirects to Supabase
      const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : window.location.origin
      return `${baseUrl}/users/${user.profile_image_url}`
    }
    return null
  }

  // Reload connection handler — full reload (same as Ctrl+R)
  const handleRefreshConnection = () => {
    window.location.reload()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {/* Sidebar - Glassmorphic */}
      <aside 
        className={`${isCollapsed ? 'w-20' : 'w-64'} transition-all duration-300 ease-in-out bg-white/70 backdrop-blur-xl border-r border-white/50 shadow-[4px_0_24px_rgba(0,0,0,0.02)] flex flex-col z-20`}
      >
        {/* Logo */}
        <div className={`h-20 flex ${isCollapsed ? 'justify-center' : 'justify-center px-4'} items-center border-b border-white/40 transition-all`}>
          {isCollapsed ? (
            <img src={faviconUrl} alt="IrriGIS" className="w-16 h-16 object-contain" />
          ) : (
            <img src={fullIconUrl} alt="IrriGIS" className="h-16 w-auto object-contain" />
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => ( 
            <NavLink
              key={item.path}
              to={item.path}
              title={isCollapsed ? item.label : ""}
              className={({ isActive }) =>
                `flex items-center rounded-xl transition-all duration-200 ${
                  isCollapsed ? 'justify-center py-3' : 'px-4 py-3'
                } ${
                  isActive
                    ? 'bg-primary/90 text-white shadow-md'
                    : 'text-slate-500 hover:bg-white/60 hover:text-primary hover:shadow-sm'
                }`
              }
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span className="text-45px] font-medium ml-3 whitespace-nowrap">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-white/40 space-y-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`flex items-center w-full rounded-xl text-slate-500 hover:bg-white/60 hover:text-primary transition-all duration-200 ${
              isCollapsed ? 'justify-center py-3' : 'px-4 py-3'
            }`}
          >
            {isCollapsed ? <Menu className="w-5 h-5 shrink-0" /> : <ChevronLeft className="w-5 h-5 shrink-0 ml-auto" />}
            {!isCollapsed && <span className="text-55px] font-medium mr-auto">Collapse</span>}
          </button>
          
          <NavLink
            to="/settings"
            title={isCollapsed ? "Settings" : ""}
            className={({ isActive }) =>
              `flex items-center rounded-xl transition-all duration-200 ${
                isCollapsed ? 'justify-center py-3' : 'px-4 py-3'
              } ${
                isActive
                  ? 'bg-primary/90 text-white shadow-md'
                  : 'text-slate-500 hover:bg-white/60 hover:text-primary hover:shadow-sm'
              }`
            }
          >
            <Settings className="w-5 h-5 shrink-0" />
            {!isCollapsed && <span className="text-45px] font-medium ml-3 whitespace-nowrap">Settings</span>}
          </NavLink>
          
          <button
            onClick={handleLogoutClick}
            className={`flex items-center w-full rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200 ${
              isCollapsed ? 'justify-center py-3' : 'px-4 py-3'
            }`}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!isCollapsed && <span className="text-45px] font-medium ml-3 whitespace-nowrap">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar - Glassmorphic */}
        <header className="h-16 bg-white/60 backdrop-blur-md border-b border-white/50 flex items-center justify-between px-6 z-10">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            {navItems.find(item => window.location.pathname.startsWith(item.path))?.label?.toUpperCase() || 'DASHBOARD'}
          </h1>

          <div className="flex items-center space-x-4">
            {/* Connection Status Dot + Refresh */}
            <div className="relative">
              <div className="flex items-center gap-2 cursor-pointer" title={isOnline ? 'Connected to server' : 'Offline mode - Using cached data'}>
                <div className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  isOnline 
                    ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' 
                    : 'bg-gray-400 shadow-none'
                }`} />
                <button
                  onClick={handleRefreshConnection}
                  className="p-1 text-slate-400 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                  title="Reload (Ctrl+R)"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Tooltip */}
              <div className="absolute top-full right-0 mt-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {isOnline ? 'Online' : 'Offline'}
              </div>
            </div>

            {/* Notifications */}
            <div className="relative" ref={notificationRef}>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-500 hover:bg-white/80 hover:text-primary rounded-xl transition-colors shadow-sm bg-white/40 border border-white/50"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-3 w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/50 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100/50 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800">Notifications</h3>
                      <button
                        onClick={() => { setRefreshing(true); fetchAll().finally(() => setRefreshing(false)) }}
                        disabled={refreshing}
                        className="p-1 text-slate-400 hover:text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
                        title="Refresh notifications"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                    {unreadCount > 0 && (
                      <button 
                        onClick={() => markAllAsRead()}
                        className="text-xs text-primary font-medium hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-slate-500 text-sm">
                        No notifications yet
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((notification) => (
                        <div 
                          key={notification.id}
                          className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer transition-colors ${
                            !notification.is_read ? 'bg-primary/5' : ''
                          }`}
                          onClick={() => !notification.is_read && markAsRead(notification.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-800 font-medium truncate">
                                {notification.title || 'Notification'}
                              </p>
                              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                {notification.message}
                              </p>
                              <p className="text-xs text-slate-400 mt-1.5">
                                {formatTime(notification.createdAt)}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteNotification(notification.id)
                              }}
                              className="ml-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          {!notification.is_read && (
                            <div className="mt-2 flex items-center gap-1.5">
                              <Check className="w-3 h-3 text-primary" />
                              <span className="text-[11px] font-medium text-primary uppercase tracking-wide">Click to mark as read</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  {notifications.length > 10 && (
                    <div className="px-4 py-3 border-t border-slate-100/50 bg-slate-50/50 text-center">
                      <span className="text-xs font-medium text-slate-500">Showing 10 of {notifications.length}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User Profile */}
            <div className="relative" ref={userMenuRef}>
              <button 
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-3 bg-white/40 border border-white/50 pl-1.5 pr-4 py-1.5 rounded-full shadow-sm hover:bg-white/60 transition-colors"
              >
                {getUserProfileImage(user) ? (
                  <img
                    src={getUserProfileImage(user)}
                    alt={user?.name || 'User'}
                    className="w-8 h-8 rounded-full object-cover ring-2 ring-white/50 shadow-sm"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-primary to-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-medium shadow-sm">
                    {user?.name?.charAt(0) || 'A'}
                  </div>
                )}
                <div className="text-sm hidden sm:block">
                  <p className="font-semibold text-slate-700 leading-tight">{user?.name || 'Admin'}</p>
                  <p className="text-slate-500 text-[11px] leading-tight mt-0.5 font-medium">{user?.role || 'NIA Admin'}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {/* User Menu Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <button 
                      onClick={() => {
                        setShowUserMenu(false)
                        navigate('/users')
                      }}
                      className="flex items-center gap-3 w-full text-left hover:bg-slate-50 rounded-lg p-2 transition-colors"
                    >
                      {getUserProfileImage(user) ? (
                        <img
                          src={getUserProfileImage(user)}
                          alt={user?.name || 'User'}
                          className="w-12 h-12 rounded-full object-cover ring-2 ring-white/50"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gradient-to-br from-primary to-emerald-600 rounded-full flex items-center justify-center text-white text-lg font-medium">
                          {user?.name?.charAt(0) || 'A'}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-800">{user?.name || 'Admin'}</p>
                        <p className="text-sm text-slate-500">{user?.email || 'admin@example.com'}</p>
                      </div>
                    </button>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <User className="w-4 h-4" />
                      <span className="font-medium">Role:</span>
                      <span className="capitalize">{user?.role?.replace('_', ' ') || 'NIA Admin'}</span>
                    </div>
                    {user?.ia_name && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Building className="w-4 h-4" />
                        <span className="font-medium">IA:</span>
                        <span>{user.ia_name}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 border-t border-slate-100 bg-slate-50">
                    <button
                      onClick={handleLogoutClick}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8 z-0">
          <Outlet />
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <LogOut className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">Sign Out</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">Are you sure you want to sign out?</p>
            <div className="flex gap-3">
              <button
                onClick={handleLogoutCancel}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogoutConfirm}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connection Status Toast */}
      <div 
        className={`fixed bottom-4 right-4 z-50 transition-all duration-300 transform ${
          showToast ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-16 opacity-0 pointer-events-none'
        }`}
        onClick={hideToast}
      >
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg backdrop-blur-md border cursor-pointer hover:shadow-xl transition-shadow ${
          toastType === 'online' 
            ? 'bg-green-50/95 border-green-200 text-green-800' 
            : 'bg-gray-50/95 border-gray-200 text-gray-700'
        }`}>
          {toastType === 'online' ? (
            <Wifi className="w-5 h-5 text-green-600" />
          ) : (
            <WifiOff className="w-5 h-5 text-gray-500" />
          )}
          <span className="text-sm font-medium">{toastMessage}</span>
          <button 
            onClick={(e) => { e.stopPropagation(); hideToast(); }}
            className="ml-2 p-1 rounded hover:bg-black/10 transition-colors"
            title="Click or press to close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}