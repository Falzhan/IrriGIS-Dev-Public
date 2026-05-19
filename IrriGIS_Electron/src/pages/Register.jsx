import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Droplets, Eye, EyeOff, ArrowLeft, User, Mail, Phone, MapPin, Building, Camera, Loader } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export default function Register() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    contactNumber: '',
    address: '',
    ia_id: '',
    profileImage: null
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ias, setIAs] = useState([])
  const [locating, setLocating] = useState(false)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchOptions()
    getDeviceLocation()
  }, [])

  const fetchOptions = async () => {
    try {
      const iasRes = await fetch(`${API_BASE_URL}/users/ias`)
      const iasData = await iasRes.json()
      if (iasData.success) setIAs(iasData.data || [])
    } catch (err) {
      console.error('Failed to fetch options:', err)
    }
  }

  const getDeviceLocation = () => {
    if (!navigator.geolocation) return
    
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`
          )
          const data = await response.json()
          if (data.address) {
            const parts = []
            if (data.address.neighbourhood) parts.push(data.address.neighbourhood)
            if (data.address.suburb) parts.push(data.address.suburb)
            if (data.address.city || data.address.town || data.address.municipality) parts.push(data.address.city || data.address.town || data.address.municipality)
            if (data.address.province) parts.push(data.address.province)
            if (data.address.postcode) parts.push(data.address.postcode)
            
            const fullAddress = parts.join(', ')
            setFormData(prev => ({ ...prev, address: fullAddress }))
          }
        } catch (err) {
          console.error('Reverse geocoding error:', err)
        } finally {
          setLocating(false)
        }
      },
      (err) => {
        console.error('Geolocation error:', err)
        setLocating(false)
      }
    )
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be less than 5MB')
        return
      }
      setFormData(prev => ({ ...prev, profileImage: file }))
    }
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      setError('Please fill in all required fields')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (!formData.ia_id) {
      setError('Please select an Irrigator Association')
      return
    }

    setLoading(true)
    setError('')

    try {
      const formDataToSend = new FormData()
      formDataToSend.append('email', formData.email)
      formDataToSend.append('password', formData.password)
      formDataToSend.append('firstName', formData.firstName)
      formDataToSend.append('lastName', formData.lastName)
      if (formData.contactNumber) formDataToSend.append('contact_number', formData.contactNumber)
      if (formData.address) formDataToSend.append('address', formData.address)
      formDataToSend.append('ia_id', formData.ia_id)
      if (formData.profileImage) {
        formDataToSend.append('profileImage', formData.profileImage)
      }

      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        body: formDataToSend
      })

      const data = await res.json()

      if (data.success) {
        localStorage.setItem('token', data.token)
        navigate('/dashboard')
      } else {
        setError(data.message || 'Registration failed')
      }
    } catch (err) {
      setError('Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen">
      {/* Left Pane - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-primary to-secondary">
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-12">
          <Droplets className="w-20 h-20 text-white mb-6" />
          <h1 className="text-4xl font-bold text-white text-center">IrriGIS</h1>
          <p className="text-white/80 text-lg mt-2 text-center">Irrigation Canal Monitoring & Reporting Platform</p>
        </div>
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200)' }}
        />
      </div>

      {/* Right Pane - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50 overflow-y-auto">
        <div className="w-full max-w-lg">
          <div className="lg:hidden flex items-center justify-center mb-8">
            <Droplets className="w-12 h-12 text-primary mr-3" />
            <h1 className="text-3xl font-bold text-slate-800">IrriGIS</h1>
          </div>

          <Link to="/login" className="inline-flex items-center text-primary hover:text-primary-600 mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Login
          </Link>

          <h2 className="text-2xl font-bold text-slate-800 mb-2">Create Account</h2>
          <p className="text-slate-500 mb-6">
            IA Admin Registration - Register as an Irrigator Association Administrator
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  First Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                    placeholder="John"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="Doe"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="user@example.com"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Irrigator Association (IA) *
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <select
                    name="ia_id"
                    value={formData.ia_id}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none appearance-none bg-white"
                    disabled={loading}
                  >
                    <option value="">Select IA</option>
                    {ias.map(ia => (
                      <option key={ia.id} value={ia.id}>{ia.name} ({ia.code})</option>
                    ))}
                  </select>
                </div>
              </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Contact Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="tel"
                  name="contactNumber"
                  value={formData.contactNumber}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="09123456789"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Profile Picture
              </label>
              <div className="flex items-center gap-4">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-primary overflow-hidden bg-slate-100"
                >
                  {formData.profileImage ? (
                    <img 
                      src={URL.createObjectURL(formData.profileImage)} 
                      alt="Profile" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera className="w-8 h-8 text-slate-400" />
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-primary hover:text-primary-600"
                >
                  Choose Image
                </button>
                {formData.profileImage && (
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, profileImage: null }))}
                    className="text-sm text-red-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Address
                {locating && <span className="ml-2 text-xs text-blue-500">(Getting location...)</span>}
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows={2}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="Your address (auto-detected from GPS)"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={getDeviceLocation}
                  disabled={locating}
                  className="absolute right-2 top-2 text-xs text-primary hover:text-primary-600"
                >
                  {locating ? <Loader className="w-5 h-5 animate-spin" /> : 'Use GPS'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="Create a password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Confirm Password *
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="Confirm your password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
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
                'Create Account'
              )}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-500 text-center">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:text-primary-600 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
