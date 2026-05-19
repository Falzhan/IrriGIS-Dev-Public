//src/pages/Reports.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Search, MapPin, Droplets, Clock,
  MessageSquare, CheckCircle, AlertCircle, ArrowRight, Send,
  Calendar, User, Hash, Tag, ChevronLeft,
  ChevronRight as ChevronRightIcon, SortAsc, SortDesc, Image as ImageIcon,
  Pencil, ClipboardCheck, Wrench, Sparkles, AlertTriangle, HelpCircle,
  Plus, X, Check, AlertTriangle as AlertIcon, Eye, XCircle, Mountain, Box, Link2, Anchor
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

// Leaflet imports
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix Leaflet default icon issue with Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Report category colors and icons
const categoryConfig = {
  inspection: { color: '#3B82F6', bgClass: 'bg-blue-100 text-blue-700', label: 'Inspection', icon: ClipboardCheck },
  maintenance: { color: '#F59E0B', bgClass: 'bg-amber-100 text-amber-700', label: 'Maintenance', icon: Wrench },
  cleaning: { color: '#06B6D4', bgClass: 'bg-cyan-100 text-cyan-700', label: 'Cleaning', icon: Sparkles },
  issue: { color: '#EF4444', bgClass: 'bg-red-100 text-red-700', label: 'Issue', icon: AlertTriangle },
  other: { color: '#6B7280', bgClass: 'bg-slate-100 text-slate-700', label: 'Other', icon: HelpCircle },
}

const DEFAULT_COLORS = {
  main_canal: '#2563EB',
  lateral: '#7C3AED',
  farm_ditch: '#06B6D4',
  pipeline: '#F59E0B',
  canal: '#74A5A8',
  other: '#6B7280'
}

function getFeatureColors() {
  try {
    const saved = localStorage.getItem('mapFeatureColors')
    return saved ? { ...DEFAULT_COLORS, ...JSON.parse(saved) } : DEFAULT_COLORS
  } catch {
    return DEFAULT_COLORS
  }
}

// GeoJSON Layer component for canal lines
function GeoJSONLayer({ data }) {
  const map = useMap()
  const layerRef = useRef(null)
  
  useEffect(() => {
    if (!data || !map || layerRef.current) return

    const colors = getFeatureColors()
    
    const geojsonLayer = L.geoJSON(data, {
      style: (f) => {
        const type = f.properties?.feature_type
        return {
          color: colors[type] || colors.canal,
          weight: type === 'main_canal' ? 6 : type === 'lateral' ? 5 : type === 'farm_ditch' ? 2 : 4,
          opacity: 0.85,
        }
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties) {
          const props = feature.properties
          let popupContent = `<strong>GIS Feature</strong><br>`
          if (props.name) popupContent += `Name: ${props.name}<br>`
          if (props.feature_type) popupContent += `Type: ${props.feature_type}<br>`
          if (props.remarks) popupContent += `Remarks: ${props.remarks}<br>`
          layer.bindPopup(popupContent)
          
          layer.on('mouseover', () => {
            layer.setStyle({ weight: 8, opacity: 1 })
          })
          layer.on('mouseout', () => {
            const type = feature.properties?.feature_type
            layer.setStyle({ weight: type === 'main_canal' ? 6 : type === 'lateral' ? 5 : type === 'farm_ditch' ? 2 : 4, opacity: 0.85 })
          })
        }
      }
    }).addTo(map)

    layerRef.current = geojsonLayer

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [data, map])

  return null
}

// Label component for GIS features
function GeoJSONLabels({ data }) {
  const map = useMap()
  const labelMarkersRef = useRef([])
  
  useEffect(() => {
    if (!data || !map || !data.features) return

    labelMarkersRef.current.forEach(marker => {
      map.removeLayer(marker)
    })
    labelMarkersRef.current = []

    data.features.forEach((feature) => {
      if (!feature.geometry || !feature.geometry.coordinates) return
      
      const props = feature.properties || {}
      const featureType = props.feature_type || 'canal'
      let label = props.remarks || props.name
      if (!label && props.source_file) {
        label = props.original_id ? `${props.source_file} #${props.original_id}` : props.source_file
      }
      if (!label) label = 'Canal'

      const coords = feature.geometry.coordinates
      let centerLat, centerLng
      const geomType = feature.geometry.type

      if (geomType === 'LineString') {
        if (!Array.isArray(coords) || coords.length < 2) return
        const midIndex = Math.floor(coords.length / 2)
        centerLng = coords[midIndex][0]
        centerLat = coords[midIndex][1]
      } else if (geomType === 'MultiLineString' && Array.isArray(coords) && coords.length > 0) {
        const line = coords[0]
        if (!Array.isArray(line) || line.length < 2) return
        const midIndex = Math.floor(line.length / 2)
        centerLng = line[midIndex][0]
        centerLat = line[midIndex][1]
      } else if (geomType === 'Polygon' && Array.isArray(coords) && Array.isArray(coords[0])) {
        const exterior = coords[0]
        if (exterior.length < 2) return
        const midIndex = Math.floor(exterior.length / 2)
        centerLng = exterior[midIndex][0]
        centerLat = exterior[midIndex][1]
      } else {
        return
      }

      if (!centerLat || !centerLng || isNaN(centerLat) || isNaN(centerLng)) return

      const colors = getFeatureColors()
      const color = colors[featureType] || colors.other
      
      // Smaller, more transparent labels
      const labelIcon = L.divIcon({
        className: 'canal-label-container',
        html: `<div class="canal-label-text" style="
          background: ${color}40;
          color: white;
          padding: 2px 6px;
          border-radius: 2px;
          font-size: 9px;
          font-weight: 500;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
          border: 1px solid ${color}60;
          display: inline-block;
        ">${label}</div>`,
        iconSize: [100, 18],
        iconAnchor: [50, 9]
      })
      
      const marker = L.marker([centerLat, centerLng], {
        icon: labelIcon,
        interactive: false,
        opacity: 0.85
      })
      marker.addTo(map)
      labelMarkersRef.current.push(marker)
    })

    return () => {
      labelMarkersRef.current.forEach(marker => {
        map.removeLayer(marker)
      })
      labelMarkersRef.current = []
    }
  }, [data, map])

  return null
}

const statusColors = {
  'pending': 'bg-blue-100 text-blue-700 border-blue-200',
  'in_progress': 'bg-amber-100 text-amber-700 border-amber-200',
  'rejected': 'bg-red-100 text-red-700 border-red-200',
  'closed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'N/A': 'bg-slate-100 text-slate-600 border-slate-200',
}

const statusLabels = {
  'pending': 'Pending',
  'in_progress': 'In Progress',
  'rejected': 'Rejected',
  'closed': 'Closed',
  'N/A': 'No Ticket',
}

const statusIcons = {
  'pending': AlertCircle,
  'in_progress': Clock,
  'rejected': XCircle,
  'closed': CheckCircle,
  'N/A': HelpCircle,
}

const levelToNumber = (level) => {
  if (typeof level === 'number') return Math.min(Math.max(level, 1), 5)
  const levels = { dry: 1, low: 2, normal: 3, high: 4, overflow: 5, clean: 1, light: 2, dirty: 4, heavily_silted: 5, clear: 1, heavy: 4, blocked: 5 }
  return levels[level] || 3
}

const LEVEL_DESCRIPTIONS = {
  water: { 1: 'No water', 2: 'Minimal water', 3: 'Adequate water', 4: 'Above normal', 5: 'Flooding' },
  silt: { 1: 'No silt', 2: 'Light silt', 3: 'Moderate silt', 4: 'Heavy silt', 5: 'Fully silted' },
  debris: { 1: 'No obstruction', 2: 'Minor debris', 3: 'Some debris', 4: 'Heavy debris', 5: 'Fully blocked' },
};

const getLevelDesc = (type, level) => {
  const num = typeof level === 'number' ? level : levelToNumber(level);
  return LEVEL_DESCRIPTIONS[type]?.[num] || 'Moderate silt';
};

const levelColorClasses = {
  1: 'bg-green-100 text-green-700',
  2: 'bg-lime-100 text-lime-700',
  3: 'bg-yellow-100 text-yellow-700',
  4: 'bg-orange-100 text-orange-700',
  5: 'bg-red-100 text-red-700',
}

const calculateUrgency = (waterLevel, siltLevel, debrisLevel) => {
  const water = levelToNumber(waterLevel)
  const silt = levelToNumber(siltLevel)
  const debris = levelToNumber(debrisLevel)
  const avg = (water + silt + debris) / 3
  if (avg >= 4) return { label: 'Critical', color: 'text-red-600 bg-red-50', order: 1 }
  if (avg >= 3) return { label: 'Moderate', color: 'text-amber-600 bg-amber-50', order: 2 }
  return { label: 'Low', color: 'text-green-600 bg-green-50', order: 3 }
}

const reverseGeocode = async (lat, lng) => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`, {
      headers: { 'User-Agent': 'IrriGIS-Admin/1.0' }
    })
    if (response.ok) {
      const data = await response.json()
      const addr = data.address || {}
      
      const parts = []
      
      const street = addr.road || addr.footway || addr.pedestrian || addr.highway || null
      const neighbourhood = addr.neighbourhood || addr.quarter || addr.suburb || null
      const village = addr.village || addr.hamlet || addr.residential || null
      const barangay = addr.suburb || addr.village || addr.neighbourhood || null
      const city = addr.city || addr.town || addr.municipality || null
      const county = addr.county || addr.state_district || null
      
      if (street) parts.push(street)
      if (neighbourhood && neighbourhood !== street) parts.push(neighbourhood)
      if (village && village !== street && village !== neighbourhood) parts.push(village)
      
      const localPart = parts.join(', ')
      
      if (barangay && barangay !== street && barangay !== neighbourhood && barangay !== village) {
        if (localPart) return `${localPart}, Brgy. ${barangay}`
        return `Brgy. ${barangay}`
      }
      
      if (localPart) {
        if (city) return `${localPart}, ${city}`
        if (county) return `${localPart}, ${county}`
        return localPart
      }
      
      if (barangay) return `Brgy. ${barangay}`
      if (city) return city
      if (county) return county
      
      return data.display_name || null
    }
  } catch (error) {
    console.error('Geocoding error:', error)
  }
  return null
}

const getImageUrl = (img) => {
  if (!img) return ''
  let url = img.imageUrl || img.image_url || ''
  
  // Handle Supabase URLs (full URLs) and legacy local paths
  if (url && url.startsWith('/uploads/')) {
    // Legacy local path - redirect to backend which redirects to Supabase
    const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : window.location.origin
    return `${baseUrl}${url}`
  }
  
  // Return URL as-is if it's already a full Supabase URL
  return url
}

// Image Gallery Modal
function ImageGalleryModal({ images, initialIndex = 0, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const goToPrev = () => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
  const goToNext = () => setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))

  if (!images || images.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[90vh] w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-black/70">
          <AlertCircle className="w-5 h-5" />
        </button>
        <div className="relative bg-black rounded-lg overflow-hidden">
          <img src={getImageUrl(images[currentIndex])} alt={images[currentIndex].caption || `Image ${currentIndex + 1}`}
            className="w-full h-[60vh] object-contain" onError={(e) => { e.target.style.display = 'none' }} />
          {images[currentIndex].caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <p className="text-white text-sm">{images[currentIndex].caption}</p>
            </div>
          )}
        </div>
        {images.length > 1 && (
          <>
            <button onClick={goToPrev} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={goToNext} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70">
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </>
        )}
        {images.length > 1 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
            {images.map((img, idx) => (
              <button key={idx} onClick={() => setCurrentIndex(idx)}
                className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${idx === currentIndex ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {images.length > 1 && (
          <div className="text-center mt-2 text-sm text-slate-500">{currentIndex + 1} / {images.length}</div>
        )}
      </div>
    </div>
  )
}

// Create custom marker icon for report location based on category
function createCategoryMarkerIcon(category) {
  const cat = categoryConfig[category] || categoryConfig.other
  const IconComponent = cat.icon
  const color = cat.color
  
  return L.divIcon({
    className: 'custom-category-marker',
    html: `<div style="
      background: ${color};
      width: 36px;
      height: 36px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 3px 8px rgba(0,0,0,0.4);
      border: 2px solid white;
      position: relative;
    ">
      <div style="transform: rotate(45deg);">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${category === 'inspection' ? '<path d="M9 5H2v7l6.29 6.29a1 1 0 0 0 1.42 0l4.59-4.59a1 1 0 0 0 0-1.42L9 5z"/><circle cx="12" cy="12" r="3"/>' :
            category === 'maintenance' ? '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' :
            category === 'cleaning' ? '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h1"/><path d="M3 12h1"/><path d="M3 18h1"/>' :
            category === 'issue' ? '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' :
            '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'}
        </svg>
      </div>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  })
}

// Mini Map Component with GIS Features
function MiniMap({ coordinates, gisFeatures, category, height = 'h-48' }) {
  if (!coordinates || !coordinates.length) {
    return (
      <div className={`${height} bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200`}>
        <div className="text-center text-slate-400">
          <MapPin className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No location data</p>
        </div>
      </div>
    )
  }
  const [lng, lat] = coordinates
  const cat = categoryConfig[category] || categoryConfig.other
  
  return (
    <div className={`${height} rounded-lg overflow-hidden border border-slate-200`}>
      <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {/* GIS Feature Layers */}
        {gisFeatures && <GeoJSONLayer data={gisFeatures} />}
        {gisFeatures && <GeoJSONLabels data={gisFeatures} />}
        {/* Report Marker with category icon */}
        <Marker position={[lat, lng]} icon={createCategoryMarkerIcon(category)}>
          <Popup>
            <div className="text-sm">
              <p className="font-medium">Report Location</p>
              <p className="text-slate-500 text-xs">Lat: {lat?.toFixed(6)}, Lng: {lng?.toFixed(6)}</p>
              {category && <p className="mt-1"><span style={{ color: cat.color, fontWeight: 600 }}>{cat.label}</span></p>}
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  )
}

// Horizontal Report Card
function TicketCard({ ticket: report, onClick, addressCache }) {
  const images = report.ReportImages || report.images || []
  const primaryImage = images.find(img => img.isPrimary) || images[0]
  const ticket = report.ticket || {}
  
  // Check if report is invalid/rejected
  const isValid = report.is_valid !== false
  const invalidReason = report.invalid_reason
  const hasTicket = !!(ticket.id || report.ticketId)
  
  const waterLevel = levelToNumber(report.water_level)
  const siltLevel = levelToNumber(report.silt_level)
  const debrisLevel = levelToNumber(report.debris_level)
  const urgency = calculateUrgency(report.water_level, report.silt_level, report.debris_level)
  
  const locationName = report.location_name || report.IrrigatorAssociation?.name
  const coords = report.location?.coordinates
  let displayLocation = locationName || 'Unknown Location'
  if (!locationName && coords && coords.length === 2) {
    const [lng, lat] = coords
    displayLocation = `Lat: ${lat?.toFixed(4)}, Lng: ${lng?.toFixed(4)}`
  }
  
  const submitter = report.User ? `${report.User.first_name || report.User.firstName} ${report.User.last_name || report.User.lastName}` : 'Unknown'
  const dateSubmitted = new Date(report.createdAt || report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  
  // Determine effective status
  let ticketStatus
  if (!isValid) {
    ticketStatus = 'rejected'
  } else if (!hasTicket) {
    ticketStatus = 'N/A'
  } else {
    ticketStatus = ticket.status || 'pending'
  }
  
  const statusLabel = statusLabels[ticketStatus]
  const dateResolved = ticket.resolved_at ? new Date(ticket.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const StatusIcon = statusIcons[ticketStatus] || AlertCircle
  const cat = categoryConfig[report.category] || categoryConfig.other

  return (
    <div onClick={onClick}
      className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg hover:border-primary/40 transition-all cursor-pointer group">
      <div className="flex flex-col lg:flex-row">
        {/* Image Section */}
        <div className="relative w-full lg:w-48 h-44 lg:h-auto flex-shrink-0 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
          {primaryImage ? (
            <img src={getImageUrl(primaryImage)} alt="Report"
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              onError={(e) => { e.target.style.display = 'none' }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
              <div className="w-16 h-16 rounded-2xl bg-white/50 backdrop-blur flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-slate-400" />
              </div>
            </div>
          )}

          {images.length > 1 && (
            <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />{images.length}
            </div>
          )}
          {/* Invalid Badge */}
          {!isValid && (
            <div className="absolute top-3 left-3 bg-red-500/90 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full flex items-center gap-1.5 font-semibold shadow-lg">
              <XCircle className="w-3.5 h-3.5" />Invalid
            </div>
          )}
          {/* Category Color Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-2" style={{ backgroundColor: cat.color }} />
        </div>

        {/* Content Section */}
        <div className="flex-1 p-6 flex flex-col">
          {/* Header Row with Tags at Top Right */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                <p className="text-lg font-semibold text-slate-800 truncate">{displayLocation}</p>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-2"><Calendar className="w-4 h-4" />{dateSubmitted}</span>
                {dateResolved && <span className="flex items-center gap-2 text-emerald-600"><CheckCircle className="w-4 h-4" />{dateResolved}</span>}
                <span className="flex items-center gap-2"><User className="w-4 h-4" />{submitter}</span>
              </div>
            </div>

            {/* Tags at Top Right of Card */}
            <div className="flex-shrink-0 flex flex-col items-end gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">Status</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm ${statusColors[ticketStatus]}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {statusLabel}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">Category</span>
                {report.category && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm"
                    style={{ backgroundColor: cat.color + '20', color: cat.color }}>
                    {cat.label}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Condition Assessment - Horizontal Bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="group relative shrink-0">
              <span className="text-sm font-medium text-slate-500 cursor-help border-b border-dashed border-slate-400">Condition:</span>
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 bg-slate-800 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap">
                Water • Silt • Debris Level
              </div>
            </div>
            <div className="flex-1 flex gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100" title="Water Level">
                <Droplets className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-blue-700">{getLevelDesc('water', waterLevel)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-100" title="Silt Level">
                <Mountain className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-700">{getLevelDesc('silt', siltLevel)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-50 border border-red-100" title="Debris Level">
                <Box className="w-4 h-4 text-red-500" />
                <span className="text-sm font-semibold text-red-700">{getLevelDesc('debris', debrisLevel)}</span>
              </div>
            </div>
          </div>

          {/* Remarks */}
          {report.remarks && (
            <p className="text-sm text-slate-600 line-clamp-2 mb-4 bg-slate-50 rounded-xl p-3 border border-slate-100">
              {report.remarks}
            </p>
          )}

          {/* Footer */}
          <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-100">
            <div className="flex items-center gap-3">
              {ticket.status === 'in_progress' && ticket.SubStatus && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: ticket.SubStatus.color + '15' }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ticket.SubStatus.color }} />
                  <span className="text-xs font-semibold" style={{ color: ticket.SubStatus.color }}>{ticket.SubStatus.name}</span>
                </div>
              )}
            </div>
            <span className="text-xs text-primary font-medium flex items-center gap-1.5 group-hover:gap-2 transition-all">
              View Details <Eye className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Reports() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLog, setActionLog] = useState('')
  const [subStatuses, setSubStatuses] = useState([])
  const [updating, setUpdating] = useState(false)
  const [imageModal, setImageModal] = useState(null)
  const [addressCache, setAddressCache] = useState({})
  const [gisFeatures, setGisFeatures] = useState(null)
  
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterMonth, setFilterMonth] = useState('All')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')
  
  // Toggles for visibility
  const [showRejected, setShowRejected] = useState(false)
  const [showTickets, setShowTickets] = useState(false)
  
  // Confirmation modal for acknowledgment
  const [showAckModal, setShowAckModal] = useState(false)
  const [showResolveModal, setShowResolveModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null)
  
  // Workflow history (like ERPNext childtable)
  const [workflowHistory, setWorkflowHistory] = useState([])
  const [newStepComment, setNewStepComment] = useState('')
  const [newStepSubStatus, setNewStepSubStatus] = useState('')
  const [addingStep, setAddingStep] = useState(false)

  useEffect(() => {
    fetchReports()
    fetchSubStatuses()
    fetchGISFeatures()
  }, [])

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (calendarOpen && !e.target.closest('[data-calendar-picker]')) {
        setCalendarOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [calendarOpen])

  const handleOpenReportFromNavigation = useCallback(async (reportId) => {
    try {
      const response = await api.getReport(reportId)
      if (response.success) {
        const formatted = formatReportData(response.data)
        setSelectedTicket(formatted)
        if (formatted.ticketId) {
          const ticketResponse = await api.getTicket(formatted.ticketId)
          if (ticketResponse.success && ticketResponse.data) {
            const ticketData = ticketResponse.data
            const ticketWorkflowSteps = ticketData.workflow_steps || ticketData.workflowSteps || []
            setWorkflowHistory(ticketWorkflowSteps)
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch report details:', error)
    }
  }, [])

  const handleReportClick = async (report) => {
    try {
      const response = await api.getReport(report.id)
      if (response.success) {
        const formatted = formatReportData(response.data)
        setSelectedTicket(formatted)
        if (formatted.ticketId) {
          const ticketResponse = await api.getTicket(formatted.ticketId)
          if (ticketResponse.success && ticketResponse.data) {
            const ticketData = ticketResponse.data
            const ticketWorkflowSteps = ticketData.workflow_steps || ticketData.workflowSteps || []
            setWorkflowHistory(ticketWorkflowSteps)
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch report details:', error)
    }
  }

  useEffect(() => {
    const selectedId = location.state?.selectedReportId
    if (!loading && selectedId) {
      handleOpenReportFromNavigation(selectedId)
      window.history.replaceState({}, document.title)
    }
  }, [loading, location.state, handleOpenReportFromNavigation])

  const fetchReports = async () => {
    try {
      const response = await api.getReports({ limit: 100 })
      if (response.success && response.data) {
        const reportList = response.data.reports || response.data
        const reportsArray = Array.isArray(reportList) ? reportList : []
        setTickets(reportsArray)
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error)
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  const fetchSubStatuses = async () => {
    try {
      const response = await api.getTicketSubStatuses()
      if (response.success && response.data) {
        setSubStatuses(response.data.filter(s => s.is_active !== false))
      }
    } catch (error) {
      console.error('Failed to fetch sub-statuses:', error)
    }
  }

  const fetchGISFeatures = async () => {
    try {
      const response = await api.getGISFeatures()
      let features = null
      if (response && response.features) {
        features = { type: 'FeatureCollection', features: response.features }
      } else if (response && response.data && response.data.features) {
        features = response.data
      } else if (response && response.data && response.data.type === 'FeatureCollection') {
        features = response.data
      }
      setGisFeatures(features)
    } catch (error) {
      console.error('Failed to fetch GIS features:', error)
    }
  }

  const getLocationDisplay = useCallback((report) => {
    if (report.IrrigatorAssociation?.name) return report.IrrigatorAssociation.name
    if (report.location?.coordinates?.length) {
      const [lng, lat] = report.location.coordinates
      const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`
      if (addressCache[cacheKey]) return addressCache[cacheKey]
      return `Lat: ${lat?.toFixed(4)}, Lng: ${lng?.toFixed(4)}`
    }
    return 'Unknown Location'
  }, [addressCache])

  const getMonthKey = (date) => {
    const d = new Date(date)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const filteredTickets = tickets
    .filter(report => {
      const ticket = report.ticket || report.Ticket || {}
      const reportData = report.Report || report
      const location = getLocationDisplay(reportData)
      const submitter = reportData.User ? `${reportData.User.first_name || reportData.User.firstName} ${reportData.User.last_name || reportData.User.lastName}` : ''

      const hasTicket = !!(ticket.id || report.ticketId || reportData.ticketId)
      const isValid = report.is_valid !== false

      // Category filter
      const category = reportData.category || 'other'
      const matchesCategory = filterCategory === 'All' || category === filterCategory

      // Determine effective status
      let effectiveStatus
      if (!isValid) {
        effectiveStatus = 'rejected'
      } else if (!hasTicket) {
        effectiveStatus = 'N/A'
      } else {
        effectiveStatus = ticket.status || 'pending'
      }

      // Check visibility toggles
      if (!showRejected && effectiveStatus === 'rejected') return false
      if (!showTickets && hasTicket) return false

      // Status filter
      const matchesStatus = filterStatus === 'All' || effectiveStatus === filterStatus

      const matchesSearch = !searchTerm ||
        location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        submitter.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (reportData.remarks && reportData.remarks.toLowerCase().includes(searchTerm.toLowerCase()))

      // Month filter
      let matchesMonth = filterMonth === 'All'
      if (filterMonth !== 'All') {
        const reportMonth = getMonthKey(reportData.createdAt || reportData.created_at || report.createdAt || report.created_at)
        matchesMonth = reportMonth === filterMonth
      }

      return matchesCategory && matchesStatus && matchesSearch && matchesMonth
    })
    .sort((a, b) => {
      const reportA = a.Report || a
      const reportB = b.Report || b
      const dateA = new Date(reportA.created_at || reportA.createdAt)
      const dateB = new Date(reportB.created_at || reportB.createdAt)
      const ticketA = a.ticket || a.Ticket || a
      const ticketB = b.ticket || b.Ticket || b
      
      if (sortBy === 'date') return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
      if (sortBy === 'status') {
        const statusOrder = { pending: 1, in_progress: 2, rejected: 3, closed: 4 }
        const statusA = statusOrder[ticketA.status] || 0
        const statusB = statusOrder[ticketB.status] || 0
        return sortOrder === 'desc' ? statusB - statusA : statusA - statusB
      }
      return 0
    })

  const handleStatusUpdate = async (ticketId, newStatus, subStatusId = null) => {
    setUpdating(true)
    try {
      const updateData = { status: newStatus }
      if (newStatus === 'in_progress' && subStatusId) updateData.sub_status_id = subStatusId
      else if (newStatus !== 'in_progress') updateData.sub_status_id = null
      
      if (selectedTicket && selectedTicket.status === 'pending' && newStatus === 'in_progress') {
        const subStatusObj = subStatuses.find(s => s.id === (subStatusId || subStatuses[0]?.id))
        const firstStep = {
          sub_status_id: subStatusId || subStatuses[0]?.id || null,
          sub_status_name: subStatusObj?.name || 'In Progress',
          color: subStatusObj?.color || '#6B7280',
          comment: newStepComment || 'Ticket acknowledged and work initiated',
          created_at: new Date().toISOString(),
        }
        updateData.workflow_steps = [firstStep]
        setNewStepComment('')
      }
      
      await api.updateTicket(ticketId, updateData)
      await fetchReports()
      if (selectedTicket) {
        const updated = await api.getTicket(ticketId)
        if (updated.success) {
          const formatted = formatReportData(updated.data)
          setSelectedTicket(formatted)
          setWorkflowHistory(formatted.workflowSteps || [])
        }
      }
    } catch (error) {
      console.error('Failed to update ticket:', error)
    } finally {
      setUpdating(false)
    }
  }

  const handleAcknowledgeClick = (ticketId) => {
    const defaultSub = subStatuses.length > 0 ? subStatuses[0].id : null
    setPendingStatusUpdate({ ticketId, status: 'in_progress', subStatusId: defaultSub })
    setShowAckModal(true)
  }

  const confirmAcknowledgment = async () => {
    if (pendingStatusUpdate) {
      await handleStatusUpdate(pendingStatusUpdate.ticketId, pendingStatusUpdate.status, pendingStatusUpdate.subStatusId)
      setShowAckModal(false)
      setPendingStatusUpdate(null)
    }
  }

  const handleAddWorkflowStep = async () => {
    if (!newStepSubStatus || !newStepComment.trim()) return
    
    const subStatus = subStatuses.find(s => s.id === newStepSubStatus)
    const newStep = {
      sub_status_id: newStepSubStatus,
      sub_status_name: subStatus?.name || 'Unknown',
      color: subStatus?.color || '#6B7280',
      comment: newStepComment.trim(),
      created_at: new Date().toISOString(),
    }
    
    const updatedSteps = [...workflowHistory, newStep]
    
    try {
      setUpdating(true)
      await api.updateTicket(selectedTicket.ticketId, {
        sub_status_id: newStepSubStatus,
        workflow_steps: updatedSteps,
      })
      
      const updated = await api.getTicket(selectedTicket.ticketId)
      if (updated.success) {
        const formatted = formatReportData(updated.data)
        setSelectedTicket(formatted)
        setWorkflowHistory(formatted.workflowSteps || [])
      }
      
      setNewStepSubStatus('')
      setNewStepComment('')
      setAddingStep(false)
    } catch (error) {
      console.error('Failed to add workflow step:', error)
    } finally {
      setUpdating(false)
    }
  }

  const handleCloseTicket = async () => {
    await handleStatusUpdate(selectedTicket.ticketId, 'closed', null)
  }

  const handleRejectTicket = async () => {
    if (!rejectReason.trim()) return
    setUpdating(true)
    try {
      await api.updateReport(selectedTicket.id, { is_valid: false, invalid_reason: rejectReason })
      
      if (selectedTicket.ticketId) {
        await api.updateTicket(selectedTicket.ticketId, { status: 'rejected' })
      }
      
      setShowRejectModal(false)
      setRejectReason('')
      
      const updated = await api.getReport(selectedTicket.id)
      if (updated.success) {
        const formatted = formatReportData(updated.data)
        setSelectedTicket(formatted)
      }
      
      await fetchReports()
    } catch (error) {
      console.error('Failed to reject ticket:', error)
    } finally {
      setUpdating(false)
    }
  }

  const [showEditReportModal, setShowEditReportModal] = useState(false)
  const [editReportData, setEditReportData] = useState({})
  
  const handleEditReport = async () => {
    setUpdating(true)
    try {
      await api.updateReport(selectedTicket.id, editReportData)
      setShowEditReportModal(false)
      
      const updated = await api.getReport(selectedTicket.id)
      if (updated.success) {
        const formatted = formatReportData(updated.data)
        setSelectedTicket(formatted)
      }
    } catch (error) {
      console.error('Failed to update report:', error)
    } finally {
      setUpdating(false)
    }
  }

  const formatReportData = (report) => {
    let ticket = report.ticket || {}
    let isAnchorReport = false
    
    if (!ticket.id && report.ReportTickets?.length > 0) {
      ticket = report.ReportTickets[0]
    }
    
    if (ticket.report_id && ticket.report_id === report.id) {
      isAnchorReport = true
    }
    
    const workflowSteps = ticket.workflow_steps || ticket.workflowSteps || []
    const hasTicket = !!(ticket.id || report.ticketId)
    
    return {
      id: report.id,
      ticketId: ticket.id || report.ticketId,
      isAnchorReport: isAnchorReport,
      location: getLocationDisplay(report),
      coordinates: report.location?.coordinates,
      category: report.category,
      submitter: report.User ? `${report.User.first_name || report.User.firstName} ${report.User.last_name || report.User.last_name}` : 'Unknown',
      date: new Date(report.createdAt || report.created_at).toLocaleString(),
      acknowledgedAt: ticket.acknowledged_at ? new Date(ticket.acknowledged_at).toLocaleString() : null,
      resolvedAt: ticket.resolved_at ? new Date(ticket.resolved_at).toLocaleString() : null,
      status: report.is_valid === false ? 'rejected' : (hasTicket ? (ticket.status || 'pending') : 'N/A'),
      subStatusId: ticket.sub_status_id,
      subStatus: ticket.subStatus || null,
      waterLevel: levelToNumber(report.water_level),
      siltLevel: levelToNumber(report.silt_level),
      debrisLevel: levelToNumber(report.debris_level),
      remarks: report.remarks || 'No remarks',
      images: report.ReportImages || report.images || [],
      workflowSteps: Array.isArray(workflowSteps) ? workflowSteps : [],
      isAcknowledged: ticket.status !== 'pending',
      isValid: report.is_valid !== false,
      invalidReason: report.invalid_reason || null,
    }
  }

  const renderLevelBadge = (level, label, type = 'water') => {
    const numLevel = levelToNumber(level)
    return (
      <div className="flex flex-col items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
        <span className="text-xs text-slate-500 mb-1">{label}</span>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${levelColorClasses[numLevel]}`}>
          {getLevelDesc(type, numLevel)}
        </span>
        <span className="text-lg font-bold text-slate-700 mt-1">{numLevel}/5</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {imageModal && (
        <ImageGalleryModal images={imageModal.images} initialIndex={imageModal.index} onClose={() => setImageModal(null)} />
      )}

      {/* Filters */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Search className="w-5 h-5" />
          </div>
          <input type="text" placeholder="Search reports by location, ID, submitter, or remarks..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-12 py-3 border-2 border-slate-200 rounded-xl text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm hover:border-slate-300" />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          {/* Category Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Category</label>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2.5 border-2 border-slate-200 rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all">
              <option value="All">All</option>
              <option value="inspection">Inspection</option>
              <option value="maintenance">Maintenance</option>
              <option value="cleaning">Cleaning</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2.5 border-2 border-slate-200 rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all">
              <option value="All">All</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Month Calendar Filter */}
          <div className="flex flex-col gap-1.5 relative" data-calendar-picker>
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Month</label>
            <button onClick={() => setCalendarOpen(!calendarOpen)}
              className={`px-3 py-2.5 border-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between gap-2 ${
                filterMonth !== 'All'
                  ? 'border-primary bg-primary/5 text-primary hover:bg-primary/10'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}>
              <Calendar className="w-4 h-4" />
              {filterMonth === 'All' ? 'All Months' : new Date(filterMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </button>
            
            {/* Calendar Picker */}
            {calendarOpen && (
              <div className="absolute top-full left-0 mt-2 z-20 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 min-w-[280px]">
                {/* Header with year navigation */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <button 
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <p className="text-sm font-bold text-slate-800">
                    {new Date().getFullYear()}
                  </p>
                  <button 
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600">
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Months Grid */}
                <div className="grid grid-cols-3 gap-2">
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((monthName, idx) => {
                    const year = new Date().getFullYear()
                    const monthKey = `${year}-${String(idx + 1).padStart(2, '0')}`
                    const isSelected = filterMonth === monthKey
                    const isCurrentMonth = new Date().getMonth() === idx
                    return (
                      <button key={monthKey}
                        onClick={() => {
                          setFilterMonth(monthKey)
                          setCalendarOpen(false)
                        }}
                        className={`px-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-primary text-white shadow-md ring-2 ring-primary/20'
                            : isCurrentMonth
                              ? 'bg-primary/10 text-primary ring-1 ring-primary/30 hover:bg-primary/20'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}>
                        {monthName}
                      </button>
                    )
                  })}
                </div>
                
                <button onClick={() => {
                  setFilterMonth('All')
                  setCalendarOpen(false)
                }}
                  className="w-full mt-3 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-all flex items-center justify-center gap-1.5">
                  <X className="w-3 h-3" /> Clear Filter
                </button>
              </div>
            )}
          </div>

          {/* Sort By */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Sort</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2.5 border-2 border-slate-200 rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all">
              <option value="date">Date</option>
              <option value="urgency">Urgency</option>
              <option value="status">Status</option>
            </select>
          </div>

          {/* Sort Order */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Order</label>
            <button onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="px-3 py-2.5 border-2 border-slate-200 rounded-lg text-sm hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 font-medium">
              {sortOrder === 'desc' ? <SortDesc className="w-4 h-4" /> : <SortAsc className="w-4 h-4" />}
              {sortOrder === 'desc' ? 'Descending' : 'Ascending'}
            </button>
          </div>

          {/* Visibility Options */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Visibility</label>
            <div className="space-y-2">
              <button onClick={() => setShowRejected(!showRejected)}
                className={`w-full px-3 py-2 border-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between ${
                  showRejected
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}>
                Rejected {showRejected && <Check className="w-4 h-4"/>}
              </button>
              <button onClick={() => setShowTickets(!showTickets)}
                className={`w-full px-3 py-2 border-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between ${
                  showTickets
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}>
                Has Tickets {showTickets && <Check className="w-4 h-4"/>}
              </button>
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600 font-medium">
            Showing <span className="text-primary font-semibold">{filteredTickets.length}</span> report{filteredTickets.length !== 1 ? 's' : ''}
          </span>
          {(searchTerm || filterStatus !== 'All' || filterCategory !== 'All' || filterMonth !== 'All' || showRejected || showTickets) && (
            <button onClick={() => {
              setSearchTerm('')
              setFilterStatus('All')
              setFilterCategory('All')
              setFilterMonth('All')
              setShowRejected(false)
              setShowTickets(false)
            }}
              className="text-slate-500 hover:text-slate-700 font-medium text-xs uppercase tracking-wide">
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Ticket Cards List */}
      {!selectedTicket ? (
        <>
          {filteredTickets.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No reports found</p>
              <p className="text-sm text-slate-400 mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTickets.map((report) => (
                <TicketCard key={report.id} ticket={report} onClick={() => handleReportClick(report)} addressCache={addressCache} />
              ))}
            </div>
          )}
        </>
      ) : (
        /* Detail View */
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedTicket(null)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div>
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Hash className="w-4 h-4 text-primary" />Report {selectedTicket.id?.slice(0, 8)}
                  {selectedTicket.isAnchorReport && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                      <Anchor className="w-3 h-3" />Origin
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-500">{selectedTicket.location}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${statusColors[selectedTicket.status]}`}>
                {(() => { const Icon = statusIcons[selectedTicket.status] || AlertCircle; return <Icon className="w-4 h-4" /> })()}
                {statusLabels[selectedTicket.status]}
              </span>
              {selectedTicket.status === 'in_progress' && selectedTicket.subStatus && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ backgroundColor: `${selectedTicket.subStatus.color}20`, color: selectedTicket.subStatus.color }}>
                  <Tag className="w-3 h-3" />{selectedTicket.subStatus.name}
                </span>
              )}
              {selectedTicket.ticketId && (
                <button
                  onClick={() => navigate('/tickets', { state: { selectedTicketId: selectedTicket.ticketId } })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                >
                  <Link2 className="w-3 h-3" />View Ticket
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-1"><MapPin className="w-3 h-3" /> Location</p>
                  <p className="font-medium text-slate-800 text-sm">{selectedTicket.location}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-1"><User className="w-3 h-3" /> Submitter</p>
                  <p className="font-medium text-slate-800 text-sm">{selectedTicket.submitter}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-1"><Calendar className="w-3 h-3" /> Date Submitted</p>
                  <p className="font-medium text-slate-800 text-sm">{selectedTicket.date}</p>
                </div>
                {selectedTicket.acknowledgedAt && (
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-xs text-amber-600 flex items-center gap-1.5 mb-1"><Check className="w-3 h-3" /> Date Acknowledged</p>
                    <p className="font-medium text-slate-800 text-sm">{selectedTicket.acknowledgedAt}</p>
                  </div>
                )}
                {selectedTicket.status === 'rejected' && selectedTicket.invalidReason && (
                  <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-xs text-red-600 flex items-center gap-1.5 mb-1"><XCircle className="w-3 h-3" /> Reason for Rejection</p>
                    <p className="font-medium text-slate-800 text-sm">{selectedTicket.invalidReason}</p>
                  </div>
                )}
                {selectedTicket.resolvedAt && (
                  <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                    <p className="text-xs text-emerald-600 flex items-center gap-1.5 mb-1"><CheckCircle className="w-3 h-3" /> Date Resolved</p>
                    <p className="font-medium text-slate-800 text-sm">{selectedTicket.resolvedAt}</p>
                  </div>
                )}
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-1"><Tag className="w-3 h-3" /> Category</p>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: categoryConfig[selectedTicket.category]?.color + '20', color: categoryConfig[selectedTicket.category]?.color }}>
                    {categoryConfig[selectedTicket.category]?.label || 'Unknown'}
                  </span>
                </div>
              </div>

              {/* Condition Assessment */}
              <div>
                <h4 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-primary" />Condition Assessment
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {renderLevelBadge(selectedTicket.waterLevel, 'Water Level', 'water')}
                  {renderLevelBadge(selectedTicket.siltLevel, 'Silt Level', 'silt')}
                  {renderLevelBadge(selectedTicket.debrisLevel, 'Debris Level', 'debris')}
                </div>
              </div>

              {/* Workflow Timeline - Glassmorphic Design */}
              <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/60 p-6">
                <h4 className="font-semibold text-slate-800 mb-6 flex items-center gap-2">
                  <ArrowRight className="w-5 h-5 text-primary" />Workflow Progress
                </h4>
                
                {/* High-Level Status Header with Action Button */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {selectedTicket.status === 'N/A' && (
                      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-slate-100 border border-slate-200 text-slate-600">
                        <HelpCircle className="w-4 h-4" />No Ticket
                      </span>
                    )}
                    {selectedTicket.status === 'pending' && (
                      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-blue-100/80 border border-blue-200/60 text-blue-700">
                        <AlertCircle className="w-4 h-4" />Pending
                      </span>
                    )}
                    {selectedTicket.status === 'in_progress' && (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-amber-100/80 border border-amber-200/60 text-amber-700">
                          <Clock className="w-4 h-4" />In Progress
                        </span>
                        {selectedTicket.subStatus && (
                          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium"
                            style={{ backgroundColor: `${selectedTicket.subStatus.color}20`, color: selectedTicket.subStatus.color }}>
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedTicket.subStatus.color }} />
                            {selectedTicket.subStatus.name}
                          </span>
                        )}
                      </div>
                    )}
                    {selectedTicket.status === 'closed' && (
                      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-emerald-100/80 border border-emerald-200/60 text-emerald-700">
                        <CheckCircle className="w-4 h-4" />Closed
                      </span>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex items-center justify-center gap-3 mb-6">
                    <button
                      onClick={() => {
                        setEditReportData({ 
                          remarks: selectedTicket.remarks,
                          category: selectedTicket.category,
                          water_level: selectedTicket.waterLevel,
                          silt_level: selectedTicket.siltLevel,
                          debris_level: selectedTicket.debrisLevel
                        })
                        setShowEditReportModal(true)
                      }}
                      className="px-4 py-2.5 text-slate-600 bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-200 flex items-center gap-2">
                      <Pencil className="w-4 h-4" />Edit Report
                    </button>
                    {(selectedTicket.status === 'pending' || selectedTicket.status === 'N/A') && (
                      <button
                        onClick={() => setShowRejectModal(true)}
                        className="px-4 py-2.5 text-red-600 bg-red-50 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 flex items-center gap-2">
                        <X className="w-4 h-4" />Reject / Invalid
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Stepper area logic based on Ticket Status */}
                {selectedTicket.status === 'N/A' ? (
                  <div className="py-8 text-center border-t border-slate-100 mt-4">
                    <p className="text-sm font-medium text-slate-700">Standalone Report</p>
                    <p className="text-xs text-slate-500 mt-1">This report has not been assigned to a workflow ticket yet.</p>
                  </div>
                ) : (
                  <div className="relative mb-8 mt-4">
                    {/* Background line - divided into 3 equal sections */}
                    <div className="absolute top-6 left-0 right-0 h-1.5 bg-slate-200/50 rounded-full" />
                    
                    {/* Active fill - 1/3 sections - READ ONLY (solid colors) */}
                    {selectedTicket.status !== 'rejected' && (
                      <div className="absolute top-6 left-0 h-1.5 rounded-full transition-all duration-500" 
                        style={{ 
                          width: selectedTicket.status === 'pending' ? '0%' : selectedTicket.status === 'in_progress' ? '50%' : '100%',
                          backgroundColor: selectedTicket.status === 'pending' ? '#3B82F6' : selectedTicket.status === 'in_progress' ? '#F59E0B' : '#10B981'
                        }} />
                    )}

                    <div className="relative flex justify-between items-start">
                      {selectedTicket.status === 'rejected' ? (
                        <div className="flex flex-col items-center w-full relative">
                          <div className="absolute top-6 left-0 right-0 h-1.5 bg-emerald-500 rounded-full -z-10" />
                          <div className="rounded-full flex items-center justify-center border-2 w-14 h-14 bg-white border-red-500 text-red-500 ring-4 ring-red-500/30 scale-110 relative z-10 mt-[-20px]">
                            <XCircle className="w-7 h-7" />
                          </div>
                          <p className="text-xs font-semibold mt-3 text-red-600 font-bold">Rejected / Invalid</p>
                        </div>
                      ) : (
                        [
                          { step: 'Pending', icon: AlertCircle, status: 'pending' },
                          { step: 'In Progress', icon: Clock, status: 'in_progress' },
                          { step: 'Closed', icon: CheckCircle, status: 'closed' },
                        ].map((item, index) => {
                          const isCompleted = 
                            (item.status === 'pending' && selectedTicket.status !== 'pending') ||
                            (item.status === 'in_progress' && selectedTicket.status === 'closed') ||
                            (item.status === 'closed' && selectedTicket.status === 'closed')
                          const isActive = selectedTicket.status === item.status
                          const Icon = item.icon
                          
                          return (
                            <div key={index} className="flex flex-col items-center">
                              {/* Step Circle - READ ONLY */}
                              <div className={`rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${
                                isActive 
                                  ? 'w-14 h-14 bg-white border-primary text-primary ring-4 ring-primary/30 scale-110' 
                                  : isCompleted 
                                    ? 'w-12 h-12 bg-primary border-primary text-white'
                                    : 'w-10 h-10 bg-white/80 border-slate-300/60 text-slate-400'
                              }`}>
                                <Icon className={`${isActive ? 'w-7 h-7' : isCompleted ? 'w-5 h-5' : 'w-5 h-5'}`} />
                              </div>
                              <p className={`text-xs font-semibold mt-3 ${isActive || isCompleted ? 'text-slate-800' : 'text-slate-400'} ${isActive ? 'text-primary font-bold' : ''}`}>{item.step}</p>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Vertical Sub-Status Progress - READ ONLY */}
                {selectedTicket.status === 'in_progress' && (
                  <div className="relative pl-8 border-l-2 border-amber-200/60 ml-5 mt-6">
                    <div className="absolute -left-5 top-0 w-8 h-8 rounded-full bg-amber-100/80 border-2 border-amber-300/60 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-amber-600" />
                    </div>
                    <h5 className="text-sm font-semibold text-amber-800 mb-4">Workflow History</h5>
                    
                    {/* Current sub-status indicator - READ ONLY */}
                    {selectedTicket.subStatus && (
                      <div className="mb-4 p-3 rounded-xl border-2" style={{ backgroundColor: `${selectedTicket.subStatus.color}15`, borderColor: `${selectedTicket.subStatus.color}40` }}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedTicket.subStatus.color }} />
                          <span className="font-medium" style={{ color: selectedTicket.subStatus.color }}>{selectedTicket.subStatus.name}</span>
                        </div>
                      </div>
                    )}

                    {/* Workflow history steps - READ ONLY */}
                    {workflowHistory.length > 0 && workflowHistory.map((step, index) => {
                      const stepColor = step.color || subStatuses.find(s => s.id === step.sub_status_id)?.color || '#F59E0B'
                      return (
                        <div key={index} className="relative pb-4 last:pb-0">
                          <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 bg-white" style={{ borderColor: stepColor }} />
                          <div className="ml-2 p-3 rounded-xl border" style={{ backgroundColor: `${stepColor}10`, borderColor: `${stepColor}30` }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold" style={{ color: stepColor }}>{step.sub_status_name || 'In Progress'}</span>
                              <span className="text-xs text-slate-400">{new Date(step.created_at).toLocaleString()}</span>
                            </div>
                            {step.comment && <p className="text-sm text-slate-600">{step.comment}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Closed State - READ ONLY Timeline */}
                {selectedTicket.status === 'closed' && (
                  <div className="relative pl-8 border-l-2 border-emerald-200/60 ml-5 mt-6">
                    <div className="absolute -left-5 top-0 w-8 h-8 rounded-full bg-emerald-100/80 border-2 border-emerald-300/60 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h5 className="text-sm font-semibold text-emerald-800 mb-4">Resolution Summary</h5>
                    
                    {/* Report Created Step */}
                    <div className="relative pb-4">
                      <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 bg-white" style={{ borderColor: '#3B82F6' }} />
                      <div className="ml-2 p-3 rounded-xl border" style={{ backgroundColor: '#F0F9FF', borderColor: '#BFDBFE' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-blue-600">Report Created</span>
                          <span className="text-xs text-slate-400">{selectedTicket.date}</span>
                        </div>
                        <p className="text-sm text-slate-600">Report was submitted and ticket was generated</p>
                      </div>
                    </div>
                    
                    {/* Acknowledged Step (if applicable) */}
                    {selectedTicket.acknowledgedAt && (
                      <div className="relative pb-4">
                        <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 bg-white" style={{ borderColor: '#F59E0B' }} />
                        <div className="ml-2 p-3 rounded-xl border" style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold text-amber-600">Ticket Acknowledged</span>
                            <span className="text-xs text-slate-400">{selectedTicket.acknowledgedAt}</span>
                          </div>
                          <p className="text-sm text-slate-600">Report was verified and acknowledged for processing</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Workflow History Steps */}
                    {workflowHistory.length > 0 && workflowHistory.map((step, index) => {
                      const stepColor = step.color || subStatuses.find(s => s.id === step.sub_status_id)?.color || '#10B981'
                      return (
                        <div key={index} className="relative pb-4 last:pb-0">
                          <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 bg-white" style={{ borderColor: stepColor }} />
                          <div className="ml-2 p-3 rounded-xl border" style={{ backgroundColor: `${stepColor}10`, borderColor: `${stepColor}30` }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold" style={{ color: stepColor }}>{step.sub_status_name || 'In Progress'}</span>
                              <span className="text-xs text-slate-400">{new Date(step.created_at).toLocaleString()}</span>
                            </div>
                            <p className="text-sm text-slate-600">{step.comment}</p>
                          </div>
                        </div>
                      )
                    })}
                    
                    {/* Ticket Resolved Step */}
                    <div className="relative pb-0">
                      <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 bg-emerald-500" style={{ borderColor: '#10B981' }} />
                      <div className="ml-2 p-3 rounded-xl border" style={{ backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-emerald-600">Ticket Resolved</span>
                          <span className="text-xs text-slate-400">{selectedTicket.resolvedAt}</span>
                        </div>
                        <p className="text-sm text-slate-600">This ticket has been closed and marked as resolved</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* Image Gallery */}
              <div>
                <h5 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-primary" />Report Images ({selectedTicket.images.length})
                </h5>
                {selectedTicket.images.length > 0 ? (
                  <div className="space-y-2">
                    <div className="bg-slate-100 rounded-lg overflow-hidden border border-slate-200 cursor-pointer group relative"
                      onClick={() => setImageModal({ images: selectedTicket.images, index: 0 })}>
                      <img src={getImageUrl(selectedTicket.images[0])} alt="Report"
                        className="w-full h-48 object-cover group-hover:scale-105 transition-transform"
                        onError={(e) => { e.target.style.display = 'none' }} />
                      {selectedTicket.images.length > 1 && (
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                          +{selectedTicket.images.length - 1} more
                        </div>
                      )}
                    </div>
                    {selectedTicket.images.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto">
                        {selectedTicket.images.slice(1, 5).map((img, idx) => (
                          <div key={idx}
                            className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                            onClick={() => setImageModal({ images: selectedTicket.images, index: idx + 1 })}>
                            <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        {selectedTicket.images.length > 5 && (
                          <div className="w-16 h-16 flex-shrink-0 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 text-xs cursor-pointer hover:bg-slate-200"
                            onClick={() => setImageModal({ images: selectedTicket.images, index: 5 })}>
                            +{selectedTicket.images.length - 5}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-48 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center">
                    <div className="text-center text-slate-400">
                      <ImageIcon className="w-10 h-10 mx-auto mb-2" />
                      <p className="text-xs">No images uploaded</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Location Map */}
              <div>
                <h5 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />Location Map
                </h5>
                <MiniMap coordinates={selectedTicket.coordinates} gisFeatures={gisFeatures} category={selectedTicket.category} height="h-48" />
              </div>

              {/* Remarks */}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h5 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />Remarks
                </h5>
                <p className="text-sm text-slate-600">{selectedTicket.remarks}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Acknowledgment Confirmation Modal */}
      {showAckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAckModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-amber-50 p-6 border-b border-amber-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertIcon className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Certify & Acknowledge Ticket</h3>
                  <p className="text-sm text-slate-600">Confirmation required to proceed</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
                <p className="text-sm text-amber-900 mb-3">
                  By clicking <strong>"Certify & Acknowledge"</strong>, you confirm that:
                </p>
                <ul className="text-sm text-amber-800 space-y-2">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
                    The information in this report is <strong>correct and accurate</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
                    The report meets <strong>proper standards</strong> and is valid for processing
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
                    You take <strong>responsibility</strong> for this acknowledgment
                  </li>
                </ul>
                <p className="text-sm text-amber-700 mt-4 pt-3 border-t border-amber-200">
                  Once acknowledged, this ticket will move to <span className="font-semibold">In Progress</span> status and cannot be reverted to Pending.
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAckModal(false)}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={confirmAcknowledgment}
                  disabled={updating}
                  className="flex-1 px-4 py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {updating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><Check className="w-5 h-5" />Certify & Acknowledge</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject/Invalid Confirmation Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRejectModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-red-50 p-6 border-b border-red-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <X className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Reject / Mark as Invalid</h3>
                  <p className="text-sm text-slate-600">This report appears to be invalid or spam</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800 mb-2">
                  <strong>Reason for rejection:</strong>
                </p>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g., spam, incorrect location, duplicate report, false information..."
                  className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:ring-2 focus:ring-red-300 focus:border-red-300 outline-none resize-none"
                  rows={3}
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowRejectModal(false); setRejectReason('') }}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleRejectTicket}
                  disabled={!rejectReason.trim() || updating}
                  className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {updating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><X className="w-5 h-5" />Reject Report</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Confirmation Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowResolveModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-emerald-50 p-6 border-b border-emerald-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Mark as Resolved?</h3>
                  <p className="text-sm text-slate-600">Confirmation required to close this ticket</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6">
                <p className="text-sm text-emerald-900 mb-3">
                  By clicking <strong>"Confirm Resolution"</strong>, you confirm that:
                </p>
                <ul className="text-sm text-emerald-800 space-y-2">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                    All required work has been <strong>completed</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                    The issue has been <strong>properly addressed</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                    The ticket can be <strong>closed</strong> and marked as resolved
                  </li>
                </ul>
                <p className="text-sm text-emerald-700 mt-4 pt-3 border-t border-emerald-200">
                  Once resolved, this ticket will be marked as <span className="font-semibold">Closed</span> and can no longer be modified.
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResolveModal(false)}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await handleCloseTicket()
                    setShowResolveModal(false)
                  }}
                  disabled={updating}
                  className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {updating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><CheckCircle className="w-5 h-5" />Confirm Resolution</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Report Modal */}
      {showEditReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowEditReportModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-primary/10 p-6 border-b border-primary/20">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Pencil className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Edit Report Details</h3>
                  <p className="text-sm text-slate-600">Update the report information</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Category</label>
                <select
                  value={editReportData.category || ''}
                  onChange={(e) => setEditReportData({ ...editReportData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none">
                  <option value="inspection">Inspection</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="issue">Issue</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Water Level (1-5)</label>
                <select
                  value={editReportData.water_level || 3}
                  onChange={(e) => setEditReportData({ ...editReportData, water_level: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none">
                  <option value={1}>1 - No water</option>
                  <option value={2}>2 - Minimal water</option>
                  <option value={3}>3 - Adequate water</option>
                  <option value={4}>4 - Above normal</option>
                  <option value={5}>5 - Flooding</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Silt Level (1-5)</label>
                <select
                  value={editReportData.silt_level || 3}
                  onChange={(e) => setEditReportData({ ...editReportData, silt_level: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none">
                  <option value={1}>1 - No silt</option>
                  <option value={2}>2 - Light silt</option>
                  <option value={3}>3 - Moderate silt</option>
                  <option value={4}>4 - Heavy silt</option>
                  <option value={5}>5 - Fully silted</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Debris Level (1-5)</label>
                <select
                  value={editReportData.debris_level || 3}
                  onChange={(e) => setEditReportData({ ...editReportData, debris_level: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none">
                  <option value={1}>1 - No obstruction</option>
                  <option value={2}>2 - Minor debris</option>
                  <option value={3}>3 - Some debris</option>
                  <option value={4}>4 - Heavy debris</option>
                  <option value={5}>5 - Fully blocked</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Remarks</label>
                <textarea
                  value={editReportData.remarks || ''}
                  onChange={(e) => setEditReportData({ ...editReportData, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                  rows={3}
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowEditReportModal(false)}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleEditReport}
                  disabled={updating}
                  className="flex-1 px-4 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {updating ? (
                     <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><Check className="w-5 h-5" />Save Changes</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}