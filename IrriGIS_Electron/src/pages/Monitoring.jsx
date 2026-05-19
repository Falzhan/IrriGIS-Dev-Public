//src/pages/monitoring.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { X, Droplets, Filter, Layers, Eye, EyeOff, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ClipboardCheck, Wrench, Sparkles, AlertTriangle, HelpCircle, ArrowRight, Calendar, CalendarCheck, MapPin, Tag, Clock, User, Search, Globe, CheckCircle } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../services/api'

const getImageUrl = (img) => {
  if (!img) return ''
  let url = ''
  if (typeof img === 'string') {
    url = img
  } else {
    url = img.imageUrl || img.image_url || ''
  }
  
  // Handle Supabase URLs (full URLs) and legacy local paths
  if (url && url.startsWith('/uploads/')) {
    // Legacy local path - redirect to backend which redirects to Supabase
    const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : window.location.origin
    return `${baseUrl}${url}`
  }
  
  // Return URL as-is if it's already a full Supabase URL
  return url
}

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const statusLabels = {
  'pending': 'Pending',
  'in_progress': 'In Progress',
  'closed': 'Closed',
}

const DEFAULT_COLORS = {
  main_canal: '#2563EB',
  lateral: '#7C3AED',
  farm_ditch: '#06B6D4',
  pipeline: '#F59E0B',
  canal: '#74A5A8',
  other: '#6B7280'
}

const DEFAULT_CATEGORY_COLORS = {
  inspection: '#3B82F6',
  maintenance: '#F59E0B',
  cleaning: '#06B6D4',
  issue: '#EF4444',
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

function getCategoryColors() {
  try {
    const saved = localStorage.getItem('categoryColors')
    return saved ? { ...DEFAULT_CATEGORY_COLORS, ...JSON.parse(saved) } : DEFAULT_CATEGORY_COLORS
  } catch {
    return DEFAULT_CATEGORY_COLORS
  }
}

// Report category colors and icons - uses customizable colors
function getCategoryConfig() {
  const colors = getCategoryColors()
  return {
    inspection: { color: colors.inspection, label: 'Inspection', icon: ClipboardCheck },
    maintenance: { color: colors.maintenance, label: 'Maintenance', icon: Wrench },
    cleaning: { color: colors.cleaning, label: 'Cleaning', icon: Sparkles },
    issue: { color: colors.issue, label: 'Issue', icon: AlertTriangle },
    other: { color: colors.other, label: 'Other', icon: HelpCircle },
  }
}

const CLOSED_COLOR = '#10B981'

function getReportDisplayDays() {
  try {
    const saved = localStorage.getItem('reportDisplayDays')
    return saved ? parseInt(saved, 10) : 7
  } catch {
    return 7
  }
}

function getPendingOpacity() {
  try {
    const saved = localStorage.getItem('pendingMarkerOpacity')
    return saved ? parseInt(saved, 10) / 100 : 0.4
  } catch {
    return 0.4
  }
}

function calculateClosedReportOpacity(createdAt) {
  const displayDays = getReportDisplayDays()
  const created = new Date(createdAt)
  const now = new Date()
  const daysOld = (now - created) / (1000 * 60 * 60 * 24)
  
  if (daysOld > displayDays) return 0
  if (daysOld < 1) return 1
  
  const remainingDays = displayDays - daysOld
  return Math.max(0.2, remainingDays / 3)
}

function createCategoryMarkerIcon(category, isSelected = false, status = 'pending', createdAt = null) {
  const categoryConfig = getCategoryConfig()
  let opacity = 1
  let color
  
  if (status === 'closed') {
    color = CLOSED_COLOR
    if (createdAt) {
      opacity = calculateClosedReportOpacity(createdAt)
    }
  } else if (status === 'pending') {
    color = categoryConfig[category]?.color || '#6B7280'
    opacity = getPendingOpacity()
  } else {
    color = categoryConfig[category]?.color || categoryConfig.other.color
  }
  
  const scale = isSelected ? 1.15 : 1
  const shadow = isSelected ? '0 6px 16px rgba(0,0,0,0.5)' : '0 3px 8px rgba(0,0,0,0.4)'
  
  const selectedRing = isSelected ? `
    <div style="
      position: absolute;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: 3px solid ${color};
      animation: pulse 1.5s ease-out infinite;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 0;
    "></div>
    <style>@keyframes pulse { 0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; } 100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; } }</style>
  ` : ''
  
  return L.divIcon({
    className: 'custom-category-marker',
    html: `<div style="position: relative; display: flex; align-items: center; justify-content: center; transform: scale(${scale}); transition: transform 0.2s; opacity: ${opacity};">
      ${selectedRing}
      <div style="
        background: ${color};
        width: 36px;
        height: 36px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: ${shadow};
        border: ${isSelected ? '3px solid white' : '2px solid white'};
        position: relative;
        z-index: 1;
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
      </div>
    </div>`,
    iconSize: isSelected ? [42, 42] : [36, 36],
    iconAnchor: isSelected ? [21, 42] : [18, 36],
    popupAnchor: [0, -36]
  })
}

function createTicketFlagIcon(isSelected = false, status = 'pending', createdAt = null) {
  let opacity = 1
  let color = '#F59E0B' // Yellow for pending tickets

  if (status === 'closed') {
    color = '#10B981' // Green for closed tickets
    if (createdAt) {
      opacity = calculateClosedReportOpacity(createdAt)
    }
  } else if (status === 'in_progress') {
    color = '#EF4444' // Red for in_progress tickets
  } else if (status === 'pending') {
    color = '#F59E0B' // Yellow for pending tickets
    opacity = getPendingOpacity()
  }

  const scale = isSelected ? 1.15 : 1
  const shadow = isSelected ? '0 6px 16px rgba(0,0,0,0.5)' : '0 3px 8px rgba(0,0,0,0.4)'

  const selectedRing = isSelected ? `
    <div style="
      position: absolute;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: 3px solid ${color};
      animation: pulse 1.5s ease-out infinite;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 0;
    "></div>
    <style>@keyframes pulse { 0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; } 100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; } }</style>
  ` : ''

  return L.divIcon({
    className: 'custom-ticket-flag-marker',
    html: `<div style="position: relative; display: flex; align-items: center; justify-content: center; transform: scale(${scale}); transition: transform 0.2s; opacity: ${opacity};">
      ${selectedRing}
      <div style="
        position: relative;
        z-index: 1;
        filter: drop-shadow(${shadow});
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
          <line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
      </div>
    </div>`,
    iconSize: isSelected ? [42, 42] : [36, 36],
    iconAnchor: isSelected ? [21, 42] : [18, 36],
    popupAnchor: [0, -36]
  })
}

const levelToNumber = (level) => {
  const levels = { dry: 1, low: 2, normal: 3, high: 4, overflow: 5, clean: 1, light: 2, dirty: 4, heavily_silted: 5, clear: 1, heavy: 4, blocked: 5 }
  return levels[level] || 3
}

function MapUpdater({ center }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.setView(center, 13)
  }, [center, map])
  return null
}

function GeoJSONLayer({ data, name, onFeatureClick }) {
  const map = useMap()
  
  useEffect(() => {
    if (!data || !map) return

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
        const props = feature.properties || {}
        const featureId = feature.id || feature.properties?.id
        const featureName = props.name || props.code || props.feature_type || 'Unknown'
        
        // Only bind popup + style if properties exist
        if (feature.properties) {
          let popupContent = `<strong>${name}</strong><br>`
          if (featureName !== 'Unknown') popupContent += `Name: ${featureName}<br>`
          if (props.feature_type) popupContent += `Type: ${props.feature_type}<br>`
          layer.bindPopup(popupContent)
          
          layer.on('mouseover', () => {
            layer.setStyle({ weight: 8, opacity: 1 })
          })
          layer.on('mouseout', () => {
            const type = feature.properties?.feature_type
            layer.setStyle({ weight: type === 'main_canal' ? 6 : type === 'lateral' ? 5 : type === 'farm_ditch' ? 2 : 4, opacity: 0.85 })
          })
        }
        
        // Click handler always attached — fires even when properties are null
        layer.on('click', () => {
          console.log('Clicked feature:', featureId, featureName)
          if (onFeatureClick) {
            onFeatureClick(featureId, featureName)
          }
        })
      }
    }).addTo(map)

    return () => {
      map.removeLayer(geojsonLayer)
    }
  }, [data, map, name, onFeatureClick])

  return null
}

function GeoJSONLabels({ data, visibleTypes, showLabels }) {
  const map = useMap()
  const labelMarkersRef = useRef([])
  
  useEffect(() => {
    if (!data || !map || !data.features) return

    labelMarkersRef.current.forEach(marker => {
      map.removeLayer(marker)
    })
    labelMarkersRef.current = []

    if (!showLabels) return

    const featureCount = data.features.length
    let labelCount = 0

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
      } else if (geomType === 'MultiPolygon' && Array.isArray(coords) && coords.length > 0) {
        const exterior = coords[0][0]
        if (!exterior || exterior.length < 2) return
        const midIndex = Math.floor(exterior.length / 2)
        centerLng = exterior[midIndex][0]
        centerLat = exterior[midIndex][1]
      } else {
        return
      }

      if (!centerLat || !centerLng || isNaN(centerLat) || isNaN(centerLng)) return

      labelCount++
      const colors = getFeatureColors()
      const color = colors[featureType] || colors.other
      
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

    console.log(`GeoJSONLabels: ${featureCount} features, ${labelCount} labels created (showLabels: ${showLabels})`)

    return () => {
      labelMarkersRef.current.forEach(marker => {
        map.removeLayer(marker)
      })
      labelMarkersRef.current = []
    }
  }, [data, map, visibleTypes, showLabels])

  return null
}

function MapBoundsControl({ bounds }) {
  const map = useMap()
  
  useEffect(() => {
    if (!bounds) return

    map.setMaxBounds(bounds)
    map.setMinZoom(10)
    map.setMaxZoom(18)

  }, [map, bounds])

  return null
}

export default function Monitoring() {
  const navigate = useNavigate()
  const [layers, setLayers] = useState({
    canalRoutes: true,
    showLabels: true,
    showTickets: true,
    showTicketPending: true,
    showTicketInProgress: true,
    showTicketClosed: true,
    showStandalone: true,
    showStandaloneInspection: true,
    showStandaloneMaintenance: true,
    showStandaloneCleaning: true,
    showStandaloneOther: true,
  })
  const [originReportIds, setOriginReportIds] = useState(new Set())
  const [featureColors, setFeatureColors] = useState(() => getFeatureColors())
  const [categoryColors, setCategoryColors] = useState(() => getCategoryColors())
  const [selectedReport, setSelectedReport] = useState(null)
  const [selectedGisFeature, setSelectedGisFeature] = useState(null)
  const [gisFeatureReports, setGisFeatureReports] = useState([])
  const [gisFeatureReportsLoading, setGisFeatureReportsLoading] = useState(false)
  const [gisReports, setGisReports] = useState([])
  const [reportStatuses, setReportStatuses] = useState({})
  const [selectedMarkerId, setSelectedMarkerId] = useState(null)
  const [gisFeatures, setGisFeatures] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mapCenter, setMapCenter] = useState([6.1128, 125.2108])
  
  const [filters, setFilters] = useState({
    feature_type: '',
    ris_id: '',
    ia_id: ''
  })
  const [risList, setRisList] = useState([])
  const [iaList, setIaList] = useState([])
  const [featureTypes] = useState([
    { value: 'main_canal', label: 'Main Canal' },
    { value: 'lateral', label: 'Lateral' },
    { value: 'farm_ditch', label: 'Farm Ditch' },
    { value: 'pipeline', label: 'Pipeline' },
    { value: 'canal', label: 'Canal' },
  ])
  const [showFilters, setShowFilters] = useState(true)
  const [showLayerPanel, setShowLayerPanel] = useState(true)
  const [mapBounds, setMapBounds] = useState(null)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimeoutRef = useRef(null)

  // Period filter state - default to current month
  const current = new Date()
  const [filterPeriod, setFilterPeriod] = useState('month') // 'week' | 'month' | 'year'
  const [filterMonth, setFilterMonth] = useState(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`)
  const [filterWeek, setFilterWeek] = useState(null)
  const [filterYear, setFilterYear] = useState(String(current.getFullYear()))
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState(current.getFullYear())
  const [showTodayOnly, setShowTodayOnly] = useState(false)

  const getWeeksInMonth = (year, month) => {
    const weeks = []
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    const startOfWeek = new Date(firstDay)
    startOfWeek.setDate(firstDay.getDate() - firstDay.getDay())
    let currentWeekStart = new Date(startOfWeek)
    while (currentWeekStart <= lastDay) {
      const weekEnd = new Date(currentWeekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      const isoWeek = getISOWeek(currentWeekStart)
      weeks.push({
        start: new Date(currentWeekStart),
        end: new Date(weekEnd > lastDay ? lastDay : weekEnd),
        label: `W${isoWeek}`,
        isoWeek: isoWeek
      })
      currentWeekStart.setDate(currentWeekStart.getDate() + 7)
    }
    return weeks
  }

  const getISOWeek = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  }

  const getDateFilterParams = () => {
    if (showTodayOnly) {
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)
      return { date_from: start.toISOString().split('T')[0], date_to: end.toISOString().split('T')[0] }
    }
    
    if (filterPeriod === 'week' && filterWeek) {
      const year = parseInt(filterWeek.split('-W')[0])
      const weekNum = parseInt(filterWeek.split('-W')[1])
      const jan1 = new Date(year, 0, 1)
      const dayOfYear = ((weekNum - 1) * 7) + 1
      const start = new Date(jan1)
      start.setDate(jan1.getDate() + dayOfYear - jan1.getDay() - 6)
      const end = new Date(start)
      end.setDate(end.getDate() + 6, 23, 59, 59, 999)
      return { date_from: start.toISOString().split('T')[0], date_to: end.toISOString().split('T')[0] }
    }
    
    if (filterPeriod === 'year' && filterYear) {
      const start = new Date(parseInt(filterYear), 0, 1)
      const end = new Date(parseInt(filterYear), 11, 31, 23, 59, 59, 999)
      return { date_from: start.toISOString().split('T')[0], date_to: end.toISOString().split('T')[0] }
    }
    
    if (filterMonth) {
      const [year, monthNum] = filterMonth.split('-').map(Number)
      const monthStart = new Date(year, monthNum - 1, 1)
      const monthEnd = new Date(year, monthNum, 0, 23, 59, 59, 999)
      return { date_from: monthStart.toISOString().split('T')[0], date_to: monthEnd.toISOString().split('T')[0] }
    }
    
    return {}
  }

  useEffect(() => {
    fetchDropdownData()
    fetchGISData()
  }, [])

  useEffect(() => {
    fetchGISData()
  }, [filters, filterMonth, filterPeriod, filterWeek, filterYear, showTodayOnly])

  useEffect(() => {
    const handleStorageChange = () => {
      setFeatureColors(getFeatureColors())
      setCategoryColors(getCategoryColors())
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  const fetchDropdownData = async () => {
    try {
      const [risRes, iaRes] = await Promise.all([
        api.request('/gis/ris'),
        api.request('/gis/ias')
      ])
      if (risRes.success) {
        setRisList(risRes.data || [])
        
        const gensanRIS = risRes.data?.find(r => r.name?.toLowerCase().includes('gensan') || r.name?.toLowerCase().includes('general santos'))
        if (gensanRIS) {
          const risDetail = await api.request(`/gis/ris/${gensanRIS.id}`)
          if (risDetail.success && risDetail.data?.service_area) {
            const serviceArea = risDetail.data.service_area
            if (serviceArea.geometry && serviceArea.geometry.coordinates) {
              const coords = serviceArea.geometry.coordinates
              let bounds
              if (serviceArea.geometry.type === 'Polygon') {
                const exterior = coords[0]
                const lats = exterior.map(c => c[1])
                const lngs = exterior.map(c => c[0])
                bounds = L.latLngBounds(
                  [Math.min(...lats), Math.min(...lngs)],
                  [Math.max(...lats), Math.max(...lngs)]
                )
              } else if (serviceArea.geometry.type === 'MultiPolygon') {
                let allLats = [], allLngs = []
                coords.forEach(poly => {
                  const exterior = poly[0]
                  allLats.push(...exterior.map(c => c[1]))
                  allLngs.push(...exterior.map(c => c[0]))
                })
                bounds = L.latLngBounds(
                  [Math.min(...allLats), Math.min(...allLngs)],
                  [Math.max(...allLats), Math.max(...allLngs)]
                )
              }
              if (bounds) {
                setMapBounds(bounds)
              }
            }
          }
        }
      }
      if (iaRes.success) setIaList(iaRes.data || [])
    } catch (error) {
      console.error('Failed to fetch dropdown data:', error)
    }
  }

  const fetchGISData = async () => {
    setLoading(true)
    try {
      const queryParams = new URLSearchParams()
      if (filters.feature_type) queryParams.set('feature_type', filters.feature_type)
      if (filters.ris_id) queryParams.set('ris_id', filters.ris_id)
      if (filters.ia_id) queryParams.set('ia_id', filters.ia_id)
      
      // Compute date filter params based on period selection
      const dateParams = getDateFilterParams()
      if (dateParams.date_from) queryParams.set('date_from', dateParams.date_from)
      if (dateParams.date_to) queryParams.set('date_to', dateParams.date_to)

      const queryString = queryParams.toString()
      const featuresUrl = queryString ? `/gis/features?${queryString}` : '/gis/features'
      const reportsUrl = queryString ? `/gis/reports?${queryString}` : '/gis/reports'

      const [reportsRes, featuresRes] = await Promise.all([
        api.request(reportsUrl),
        api.request(featuresUrl)
      ])

      let reports = []
      if (reportsRes.features) {
        reports = reportsRes.features
      } else if (reportsRes.data?.features) {
        reports = reportsRes.data.features
      } else if (Array.isArray(reportsRes.data)) {
        reports = reportsRes.data
      }
      setGisReports(reports)

      const ticketsRes = await api.getTickets({ limit: 200 })
      const statusMap = {}
      const originIds = new Set()
      if (ticketsRes.success) {
        const tickets = ticketsRes.data?.tickets || ticketsRes.data || []
        tickets.forEach(ticket => {
          statusMap[ticket.reportId] = ticket.status || 'pending'
          if (ticket.reportId) originIds.add(ticket.reportId)
        })
      }
      setReportStatuses(statusMap)
      setOriginReportIds(originIds)

      let features = null
      if (featuresRes.features) {
        features = {
          type: 'FeatureCollection',
          features: featuresRes.features
        }
      } else if (featuresRes.data?.features) {
        features = featuresRes.data
      } else       if (featuresRes.data) {
        features = featuresRes.data
      }

      setGisFeatures(features)

      if (reports.length > 0) {
        const firstGeom = reports[0]?.geometry
        if (firstGeom?.coordinates) {
          setMapCenter([firstGeom.coordinates[1], firstGeom.coordinates[0]])
        }
      }
    } catch (error) {
      console.error('Failed to fetch GIS data:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleLayer = (key) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({ feature_type: '', ris_id: '', ia_id: '' })
    setFilterPeriod('month')
    setFilterWeek(null)
    setFilterYear(String(new Date().getFullYear()))
    setFilterMonth(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)
    setShowTodayOnly(false)
  }

  const reverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`, {
        headers: { 'User-Agent': 'IrriGIS-Admin/1.0' }
      })
      if (response.ok) {
        const data = await response.json()
        const addr = data.address || {}
        return addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city || null
      }
    } catch (error) {
      console.error('Geocoding error:', error)
    }
    return null
  }

  const parseDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return 'N/A'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const parseFullDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return 'N/A'
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const handleMarkerClick = async (report) => {
    const props = report.properties || {}
    const geom = report.geometry?.coordinates || []
    const reportId = props.id || report.id
    
    console.log('Report clicked:', report)
    console.log('Props:', props)
    console.log('Props created_at:', props.created_at)
    console.log('Props images:', props.images)
    
    let ticket = null
    let ticketStatus = null
    let iaName = null
    let ticketData = null
    
    // Determine if this is a ticket based on the report properties
    const hasTicketId = !!props.ticket_id
    // A report is only a ticket if it has a ticket_id
    const isTicket = hasTicketId
    
    console.log('Report ticket_id:', props.ticket_id, 'report_id:', props.report_id, 'isTicket:', isTicket)
    
    // If this is a ticket, fetch the ticket data using the ticket_id
    if (isTicket && props.ticket_id) {
      try {
        const ticketRes = await api.getTicket(props.ticket_id)
        if (ticketRes.success) {
          ticketData = ticketRes.data
          ticketStatus = ticketData?.status || 'pending'
          ticket = { id: props.ticket_id }
          console.log('Ticket data fetched:', ticketData)
        }
      } catch (error) {
        console.error('Failed to fetch ticket:', error)
      }
    }
    
    // Also try reverse geocoding for location
    try {
      if (geom.length === 2) {
        const [lng, lat] = geom
        iaName = await reverseGeocode(lat, lng)
      }
    } catch (error) {
      console.error('Failed to reverse geocode:', error)
    }
    
    // Use report.created_at or ticket's Report.created_at as primary, coalesce both field name variants
    let dateValue = props.created_at || props.createdAt
    if (ticketData) {
      const tc = ticketData.createdAt || ticketData.created_at
      const trc = ticketData.Report?.createdAt || ticketData.Report?.created_at
      dateValue = dateValue || trc || tc
    }
    dateValue = dateValue || ticket?.createdAt || ticket?.created_at
    // Fallback: if still undefined and not a ticket, fetch the full report record
    if (!dateValue && !isTicket) {
      try {
        const reportRes = await api.getReport(reportId)
        const fetchedDateStr = reportRes?.data?.createdAt || reportRes?.data?.created_at
        if (fetchedDateStr) dateValue = fetchedDateStr
      } catch (e) {
        console.error('Failed to fetch report date:', e)
      }
    }
    console.log('Date value for parseFullDate:', dateValue)
    console.log('Is ticket:', isTicket, 'Ticket data:', ticket)
    console.log('Full ticket data:', ticketData)
    
    const reportImages = (props.images && props.images.length > 0) 
      ? props.images 
      : ticketData?.Report?.ReportImages || ticketData?.Report?.images || []
    console.log('Report images:', reportImages)
    
    setSelectedMarkerId(reportId)
    setSelectedReport({
      id: reportId,
      ticketId: ticket?.id,
      isTicket: isTicket,
      location: props.location_name || props.irrigator_association?.name ||
                (geom.length ? `Lat: ${geom[1]?.toFixed(4)}, Lng: ${geom[0]?.toFixed(4)}` : 'Unknown Location'),
      lat: geom[1],
      lng: geom[0],
      date: parseFullDate(dateValue),
      createdAt: dateValue
        || ticketData?.Report?.createdAt || ticketData?.Report?.created_at
        || ticketData?.createdAt || ticketData?.created_at
        || ticket?.createdAt || ticket?.created_at
        || props.createdAt || props.created_at,
      resolvedAt: ticketData?.resolved_at,
      status: ticketData?.status || ticketStatus,
      waterLevel: levelToNumber(props.water_level),
      siltLevel: levelToNumber(props.silt_level),
      debrisLevel: levelToNumber(props.debris_level),
      remarks: props.remarks || 'No remarks',
      images: reportImages.map(img => img.imageUrl || img),
      submitter: ticketData?.Report?.User ? `${ticketData.Report.User.first_name || ''} ${ticketData.Report.User.last_name || ''}`.trim() : props.reporter?.name || 'Unknown',
    })
  }

  // Search functionality using OpenStreetMap Nominatim
  const performSearch = useCallback(async (query) => {
    if (!query.trim()) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }

    setSearchLoading(true)
    const lowerQuery = query.toLowerCase()
    const results = []

    // 1. Search OpenStreetMap Nominatim for real locations (barangays, places, etc.)
    try {
      // Use the current map center as a bias for local search results
      const viewbox = `${mapCenter[1] - 0.5},${mapCenter[0] - 0.5},${mapCenter[1] + 0.5},${mapCenter[0] + 0.5}`
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&bounded=0&limit=5&accept-language=en`
      
      const response = await fetch(nominatimUrl, {
        headers: { 'User-Agent': 'IrriGIS-Admin/1.0' }
      })
      
      if (response.ok) {
        const data = await response.json()
        data.forEach((place, index) => {
          const lat = parseFloat(place.lat)
          const lon = parseFloat(place.lon)
          const displayName = place.display_name
          const type = place.type || place.category || 'place'
          
          // Determine the place type label
          let typeLabel = 'Location'
          if (type.includes('suburb') || type.includes('neighbourhood') || type.includes('quarter')) typeLabel = 'Barangay/Area'
          else if (type.includes('village') || type.includes('hamlet')) typeLabel = 'Village'
          else if (type.includes('town')) typeLabel = 'Town'
          else if (type.includes('city')) typeLabel = 'City'
          else if (type.includes('road') || type.includes('street')) typeLabel = 'Street'
          else if (type.includes('canal')) typeLabel = 'Waterway'
          else if (type.includes('water')) typeLabel = 'Water'
          else if (place.category === 'boundary' && type === 'administrative') typeLabel = 'Administrative Area'
          
          // Extract a shorter name from display_name
          const nameParts = displayName.split(',')
          const shortName = nameParts[0].trim()
          const locationContext = nameParts.slice(1, 3).join(',').trim()
          
          results.push({
            id: `nominatim-${place.place_id || index}`,
            type: 'location',
            title: shortName,
            subtitle: locationContext || typeLabel,
            fullAddress: displayName,
            center: [lat, lon],
            icon: 'location',
            boundingbox: place.boundingbox
          })
        })
      }
    } catch (error) {
      console.error('Nominatim search error:', error)
    }

    // 2. Search through canal lines (GIS features)
    if (gisFeatures?.features) {
      gisFeatures.features.forEach((feature, index) => {
        const props = feature.properties || {}
        const name = props.name || props.remarks || ''
        const featureType = props.feature_type || 'canal'
        const sourceFile = props.source_file || ''
        
        if (name.toLowerCase().includes(lowerQuery) || 
            sourceFile.toLowerCase().includes(lowerQuery) ||
            featureType.toLowerCase().includes(lowerQuery)) {
          // Calculate center point for the feature
          let center = null
          const geom = feature.geometry
          if (geom?.coordinates) {
            if (geom.type === 'LineString' && geom.coordinates.length > 0) {
              const midIndex = Math.floor(geom.coordinates.length / 2)
              center = [geom.coordinates[midIndex][1], geom.coordinates[midIndex][0]]
            } else if (geom.type === 'MultiLineString' && geom.coordinates.length > 0) {
              const line = geom.coordinates[0]
              if (line.length > 0) {
                const midIndex = Math.floor(line.length / 2)
                center = [line[midIndex][1], line[midIndex][0]]
              }
            }
          }
          
          results.push({
            id: `canal-${index}`,
            type: 'canal',
            title: name || `${featureType} #${props.original_id || index}`,
            subtitle: `${featureType}${sourceFile ? ` - ${sourceFile}` : ''}`,
            center: center,
            feature: feature,
            icon: 'canal'
          })
        }
      })
    }

    // 3. Search through reports (only origin and standalone, exclude invalid/grouped)
    if (gisReports) {
      gisReports.forEach((report, index) => {
        const props = report.properties || {}
        const reportId = props.id || report.id || index

        // Exclude invalid reports
        if (props.is_valid === false) return

        // Only include origin reports and standalone reports
        const isOrigin = originReportIds.has(reportId)
        const isStandalone = !props.ticket_id
        if (!isOrigin && !isStandalone) return

        const location = props.location_name || ''
        const remarks = props.remarks || ''
        const category = props.category || 'other'

        if (location.toLowerCase().includes(lowerQuery) ||
            remarks.toLowerCase().includes(lowerQuery) ||
            reportId.toString().toLowerCase().includes(lowerQuery) ||
            category.toLowerCase().includes(lowerQuery)) {

          const geom = report.geometry?.coordinates
          const center = geom?.length >= 2 ? [geom[1], geom[0]] : null

          results.push({
            id: `report-${reportId}`,
            type: 'report',
            title: location || `Report #${String(reportId).slice(0, 8)}`,
            subtitle: `${category} - ${remarks?.slice(0, 40) || 'No remarks'}`,
            center: center,
            report: report,
            icon: 'report'
          })
        }
      })
    }

    // Sort results: local data first, then by relevance
    results.sort((a, b) => {
      const aIsLocal = a.type === 'canal' || a.type === 'report'
      const bIsLocal = b.type === 'canal' || b.type === 'report'
      if (aIsLocal && !bIsLocal) return -1
      if (bIsLocal && !aIsLocal) return 1
      return a.title.localeCompare(b.title)
    })

    // Limit to top 12 results
    setSearchResults(results.slice(0, 12))
    setShowSearchDropdown(results.length > 0)
    setSearchLoading(false)
  }, [gisFeatures, gisReports, mapCenter, originReportIds])

  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchQuery(value)
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value)
    }, 300)
  }

  const handleSearchResultClick = (result) => {
    setShowSearchDropdown(false)
    setSearchQuery(result.title)
    
    if (result.center) {
      // Zoom to the result location
      setMapCenter(result.center)
    }
    
    // If it's a Nominatim location with bounding box, zoom to fit
    if (result.type === 'location' && result.boundingbox) {
      // boundingbox is [minLat, maxLat, minLon, maxLon]
      const [minLat, maxLat, minLon, maxLon] = result.boundingbox.map(parseFloat)
      // Create a proper bounds that Leaflet can use
      const southWest = [minLat, minLon]
      const northEast = [maxLat, maxLon]
      // Store this for the map to use
      setMapCenter([(minLat + maxLat) / 2, (minLon + maxLon) / 2])
    }
    
    // If it's a report, show its details
    if (result.type === 'report' && result.report) {
      handleMarkerClick(result.report)
    }
    
    // If it's a canal feature, show its details
    if (result.type === 'canal' && result.feature) {
      const props = result.feature.properties || {}
      const featureId = props.id
      const featureName = props.name || props.remarks || 'Unknown'
      if (featureId) {
        handleGisFeatureClick(featureId, featureName)
      }
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setShowSearchDropdown(false)
  }

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      const searchContainer = document.getElementById('search-container')
      if (searchContainer && !searchContainer.contains(e.target)) {
        setShowSearchDropdown(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleGisFeatureClick = async (featureId, featureName) => {
    // If featureId not provided, look it up from gisFeatures state by name
    let resolvedFeatureId = featureId
    if (!resolvedFeatureId && gisFeatures?.features && featureName && featureName !== 'Unknown') {
      const found = gisFeatures.features.find(f =>
        (f.properties?.name || f.properties?.code || '') === featureName
      )
      resolvedFeatureId = found?.id || found?.properties?.id
    }
    setSelectedGisFeature({ id: resolvedFeatureId, name: featureName })
    // Only fetch data if we have a valid feature ID
    if (!resolvedFeatureId) {
      console.warn('Could not resolve feature ID for:', featureName)
      setGisFeatureReportsLoading(false)
      setGisFeatureReports([])
      return
    }
    setGisFeatureReportsLoading(true)
    setGisFeatureReports([])
    const dateParams = getDateFilterParams()
    try {
      const [reportsRes, ticketsRes] = await Promise.all([
        api.getReportsByGisFeature(resolvedFeatureId, dateParams),
        api.getTickets({ limit: 100 })
      ])
      
      console.log('GIS Feature Reports Response:', reportsRes)
      console.log('GIS Feature Tickets Response:', ticketsRes)
      
      if (reportsRes.success) {
        const reports = reportsRes.data?.reports || (Array.isArray(reportsRes.data) ? reportsRes.data : [])
        const tickets = ticketsRes.success ? (ticketsRes.data?.tickets || ticketsRes.data || []) : []
        
        const reportsWithTickets = reports.map(report => {
          const ticket = tickets.find(t => t.reportId === report.id)
          return { ...report, ticket }
        })
        
        console.log('Parsed reports with tickets:', reportsWithTickets)
        setGisFeatureReports(Array.isArray(reportsWithTickets) ? reportsWithTickets : [])
      } else {
        console.log('Response not successful:', reportsRes)
        setGisFeatureReports([])
      }
    } catch (error) {
      console.error('Failed to fetch reports for GIS feature:', error)
      setGisFeatureReports([])
    } finally {
      setGisFeatureReportsLoading(false)
    }
  }

  // Open a report from the canal history list — also highlights the map marker
  const handleCanalReportClick = (report) => {
    const ticket = report.ticket
    setSelectedGisFeature(null) // close the canal history panel
    setSelectedMarkerId(report.id) // highlight the matching map marker
    const isTicket = !!(ticket && ticket.id)
    const dateStr = report.created_at || report.createdAt || ''
    setSelectedReport({
      id: report.id,
      ticketId: ticket?.id,
      isTicket: isTicket,
      location: report.location_name || 'Unknown Location',
      lat: null,
      lng: null,
      date: parseFullDate(dateStr),
      createdAt: dateStr,
      resolvedAt: ticket?.resolved_at,
      status: ticket?.status || 'no_ticket',
      waterLevel: levelToNumber(report.water_level),
      siltLevel: levelToNumber(report.silt_level),
      debrisLevel: levelToNumber(report.debris_level),
      remarks: report.remarks || 'No remarks',
      images: [],
      submitter: report.User ? `${report.User.first_name || ''} ${report.User.last_name || ''}`.trim() : 'Unknown',
    })
  }

  const canalStyle = (feature) => {
    const type = feature?.properties?.feature_type
    const colors = getFeatureColors()
    const color = colors[type] || colors.canal
    return {
      color: color,
      weight: type === 'main_canal' ? 6 : type === 'lateral' ? 5 : type === 'farm_ditch' ? 2 : 4,
      opacity: 0.85,
    }
  }

  const visibleFeatureTypes = filters.feature_type ? [filters.feature_type] : []

  // Compute display counts for layer panel
  const ticketCounts = { total: 0, pending: 0, in_progress: 0, closed: 0 }
  const standaloneCounts = { total: 0, inspection: 0, maintenance: 0, cleaning: 0, other: 0 }

  gisReports.forEach(report => {
    const props = report.properties || {}
    if (props.is_valid === false) return
    const reportId = props.id || report.id
    // A report is a ticket if it has a ticket_id (it's the origin report that created the ticket)
    const hasTicketId = !!props.ticket_id
    const isStandalone = !hasTicketId

    if (hasTicketId) {
      ticketCounts.total++
      const status = props.status || 'pending'
      if (status === 'pending') ticketCounts.pending++
      else if (status === 'in_progress') ticketCounts.in_progress++
      else if (status === 'closed') ticketCounts.closed++
    } else if (isStandalone) {
      standaloneCounts.total++
      const category = props.category || 'other'
      if (category !== 'issue') {
        standaloneCounts[category] = (standaloneCounts[category] || 0) + 1
      }
    }
  })

  if (loading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Build period display text
  const getPeriodLabel = () => {
    if (showTodayOnly) return 'Today'
    if (filterPeriod === 'week' && filterWeek) {
      const year = parseInt(filterWeek.split('-W')[0])
      const weekNum = parseInt(filterWeek.split('-W')[1])
      return `W${weekNum}, ${year}`
    }
    if (filterPeriod === 'year') return filterYear
    if (filterMonth) return new Date(filterMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    return 'All'
  }

  return (
    <div className="h-[calc(100vh-8rem)] relative flex">
      <div className="flex-1 rounded-xl overflow-hidden">
        <MapContainer 
          center={mapCenter} 
          zoom={13} 
          style={{ height: '100%', width: '100%' }}
          minZoom={10}
          maxZoom={18}
          worldCopyJump={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapUpdater center={mapCenter} />
          <MapBoundsControl bounds={mapBounds} />
          
          {layers.canalRoutes && gisFeatures && (
            <GeoJSONLayer 
              data={gisFeatures} 
              name="Canal" 
              onFeatureClick={handleGisFeatureClick}
            />
          )}
          
          {layers.canalRoutes && gisFeatures && layers.showLabels && (
            <GeoJSONLabels data={gisFeatures} visibleTypes={visibleFeatureTypes} showLabels={layers.showLabels} />
          )}
          
          {gisReports.map((report, index) => {
            const geom = report.geometry?.coordinates || []
            if (!geom.length) return null

            const props = report.properties || {}
            const reportId = props.id || report.id

            // Exclude invalid reports
            if (props.is_valid === false) return null

            // A report is a ticket if it has a ticket_id (it's the origin report that created the ticket)
            const hasTicketId = !!props.ticket_id
            const isStandalone = !hasTicketId

            const status = props.status || 'pending'
            const category = props.category || 'other'
            const createdAt = props.createdAt || report.createdAt

            if (hasTicketId) {
              if (!layers.showTickets) return null
              if (status === 'pending' && !layers.showTicketPending) return null
              if (status === 'in_progress' && !layers.showTicketInProgress) return null
              if (status === 'closed' && !layers.showTicketClosed) return null

              return (
                <Marker
                  key={props.id || index}
                  position={[geom[1], geom[0]]}
                  icon={createTicketFlagIcon(selectedMarkerId === (props.id || index), status, createdAt)}
                  eventHandlers={{
                    click: () => handleMarkerClick(report)
                  }}
                />
              )
            }

            if (isStandalone) {
              if (!layers.showStandalone) return null
              if (category === 'inspection' && !layers.showStandaloneInspection) return null
              if (category === 'maintenance' && !layers.showStandaloneMaintenance) return null
              if (category === 'cleaning' && !layers.showStandaloneCleaning) return null
              if (category === 'other' && !layers.showStandaloneOther) return null
              if (category === 'issue') return null

              return (
                <Marker
                  key={props.id || index}
                  position={[geom[1], geom[0]]}
                  icon={createCategoryMarkerIcon(category, selectedMarkerId === (props.id || index), status, createdAt)}
                  eventHandlers={{
                    click: () => handleMarkerClick(report)
                  }}
                />
              )
            }

            return null
          })}
        </MapContainer>
      </div>

      {/* Search Bar */}
      <div id="search-container" className="absolute top-4 left-16 z-[5000] w-80">
        <div className="relative flex gap-2">
          {/* Period Filter */}
          <div className="relative">
            <button onClick={() => setCalendarOpen(!calendarOpen)}
              className={`px-3 py-2.5 border rounded-lg text-sm font-medium transition-all flex items-center justify-between gap-2 bg-white ${
                filterMonth || filterWeek || filterYear || showTodayOnly
                  ? 'border-slate-800 text-slate-800 hover:bg-slate-50'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}>
              <Calendar className="w-4 h-4" />
              <span className="max-w-[120px] truncate">{getPeriodLabel()}</span>
              {showTodayOnly && <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
            </button>

            {/* Calendar Picker */}
            {calendarOpen && (
              <div className="absolute top-full left-0 mt-2 z-20 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 min-w-[320px]">
                {/* Period Tabs */}
                <div className="flex gap-1 mb-3 p-0.5 bg-slate-50 rounded-lg">
                  {['week', 'month', 'year'].map((period) => (
                    <button
                      key={period}
                      onClick={() => {
                        setFilterPeriod(period)
                        if (period === 'week') {
                          const current = new Date()
                          const isoWeek = getISOWeek(current)
                          setFilterWeek(`${current.getFullYear()}-W${String(isoWeek).padStart(2, '0')}`)
                        } else if (period === 'month') {
                          const current = new Date()
                          setFilterMonth(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`)
                        } else if (period === 'year') {
                          setFilterYear(String(new Date().getFullYear()))
                        }
                        setShowTodayOnly(false)
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${
                        filterPeriod === period
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {period === 'week' ? 'Week' : period === 'month' ? 'Month' : 'Year'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                  <span className="text-sm font-semibold text-slate-700">
                    {filterPeriod === 'week' ? 'Select Week' : filterPeriod === 'month' ? 'Select Month' : 'Select Year'}
                  </span>
                  <button onClick={() => setCalendarOpen(false)} className="p-1 hover:bg-slate-100 rounded">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                {/* Week Selection */}
                {filterPeriod === 'week' && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => {
                          const current = new Date()
                          const isoWeek = getISOWeek(current)
                          setFilterWeek(`${current.getFullYear()}-W${String(isoWeek).padStart(2, '0')}`)
                          setCalendarOpen(false)
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-lg transition-colors"
                      >
                        This Week
                      </button>
                      <button
                        onClick={() => {
                          const current = new Date()
                          current.setDate(current.getDate() - 7)
                          const isoWeek = getISOWeek(current)
                          setFilterWeek(`${current.getFullYear()}-W${String(isoWeek).padStart(2, '0')}`)
                          setCalendarOpen(false)
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        Last Week
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(() => {
                        const weeks = []
                        const now = new Date()
                        for (let i = 0; i < 4; i++) {
                          const d = new Date(now)
                          d.setDate(d.getDate() - (i * 7))
                          const isoWeek = getISOWeek(d)
                          const weekKey = `${d.getFullYear()}-W${String(isoWeek).padStart(2, '0')}`
                          const isSelected = filterWeek === weekKey
                          weeks.push(
                            <button
                              key={weekKey}
                              onClick={() => {
                                setFilterWeek(weekKey)
                                setCalendarOpen(false)
                              }}
                              className={`px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                                isSelected
                                  ? 'bg-slate-800 text-white shadow-md'
                                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-700'
                              }`}
                            >
                              {weekKey}
                            </button>
                          )
                        }
                        return weeks
                      })()}
                    </div>
                  </div>
                )}

                {/* Month Selection */}
                {filterPeriod === 'month' && (
                  <>
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <button
                        onClick={() => setSelectedYear(selectedYear - 1)}
                        className="p-1 hover:bg-slate-100 rounded transition-colors">
                        <ChevronLeft className="w-4 h-4 text-slate-600" />
                      </button>
                      <span className="text-sm font-semibold text-slate-700 min-w-[60px] text-center">{selectedYear}</span>
                      <button
                        onClick={() => setSelectedYear(selectedYear + 1)}
                        className="p-1 hover:bg-slate-100 rounded transition-colors">
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((monthName, idx) => {
                        const monthKey = `${selectedYear}-${String(idx + 1).padStart(2, '0')}`
                        const isSelected = filterMonth === monthKey
                        const isCurrentMonth = new Date().getFullYear() === selectedYear && new Date().getMonth() === idx
                        return (
                          <button key={monthKey}
                            onClick={() => {
                              setFilterMonth(monthKey)
                              setCalendarOpen(false)
                            }}
                            className={`px-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                              isSelected
                                ? 'bg-slate-800 text-white shadow-md'
                                : isCurrentMonth
                                  ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-300 hover:bg-slate-200'
                                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-700'
                            }`}>
                            {monthName}
                          </button>
                        )
                      })}
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => {
                        const current = new Date()
                        setFilterMonth(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`)
                        setSelectedYear(current.getFullYear())
                        setCalendarOpen(false)
                      }}
                        className="px-2 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
                        This Month
                      </button>
                      <button onClick={() => {
                        const prev = new Date()
                        prev.setMonth(prev.getMonth() - 1)
                        setFilterMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`)
                        setSelectedYear(prev.getFullYear())
                        setCalendarOpen(false)
                      }}
                        className="px-2 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
                        Last Month
                      </button>
                    </div>
                  </>
                )}

                {/* Year Selection */}
                {filterPeriod === 'year' && (
                  <div className="mb-4">
                    <div className="flex items-center justify-center gap-4 mb-3">
                      <button
                        onClick={() => setFilterYear(String(parseInt(filterYear) - 1))}
                        className="p-1 hover:bg-slate-100 rounded transition-colors">
                        <ChevronLeft className="w-4 h-4 text-slate-600" />
                      </button>
                      <span className="text-sm font-semibold text-slate-700 min-w-[60px] text-center">{filterYear}</span>
                      <button
                        onClick={() => setFilterYear(String(parseInt(filterYear) + 1))}
                        className="p-1 hover:bg-slate-100 rounded transition-colors">
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[0, 1, 2, 3].map((offset) => {
                        const year = parseInt(filterYear) - offset
                        const isSelected = filterYear === String(year)
                        const isCurrentYear = new Date().getFullYear() === year
                        return (
                          <button key={year}
                            onClick={() => {
                              setFilterYear(String(year))
                              setCalendarOpen(false)
                            }}
                            className={`px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                              isSelected
                                ? 'bg-slate-800 text-white shadow-md'
                                : isCurrentYear
                                  ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-300 hover:bg-slate-200'
                                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-700'
                            }`}>
                            {year}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Today Only Toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-slate-600">Today Only</span>
                  </div>
                  <button
                    onClick={() => {
                      setShowTodayOnly(!showTodayOnly)
                      setCalendarOpen(false)
                    }}
                    className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${
                      showTodayOnly ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}>
                    <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${
                      showTodayOnly ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <button onClick={() => {
                  setFilterPeriod('month')
                  setFilterWeek(null)
                  setFilterYear(String(new Date().getFullYear()))
                  setFilterMonth('')
                  setShowTodayOnly(false)
                  setCalendarOpen(false)
                }}
                  className="w-full mt-3 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-all flex items-center justify-center gap-1.5">
                  <X className="w-3 h-3" />
                  Clear Filter
                </button>
              </div>
            )}
          </div>

          {/* Search Input */}
          <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center px-4 py-3">
              <Search className={`w-5 h-5 mr-3 ${searchLoading ? 'animate-pulse text-primary' : 'text-slate-400'}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => searchResults.length > 0 && setShowSearchDropdown(true)}
                placeholder="Search barangays, canals, reports..."
                className="flex-1 text-sm text-slate-700 placeholder-slate-400 outline-none bg-transparent"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="p-1 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>
          
          {/* Search Results Dropdown */}
          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 max-h-80 overflow-y-auto">
              <div className="p-2">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleSearchResultClick(result)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        result.type === 'location' ? 'bg-emerald-100' :
                        result.type === 'canal' ? 'bg-blue-100' :
                        'bg-amber-100'
                      }`}>
                        {result.type === 'location' ? (
                          <Globe className="w-4 h-4 text-emerald-600" />
                        ) : result.type === 'canal' ? (
                          <Layers className="w-4 h-4 text-blue-600" />
                        ) : (
                          <ClipboardCheck className="w-4 h-4 text-amber-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate group-hover:text-primary transition-colors">
                          {result.title}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {result.subtitle}
                        </p>
                      </div>
                      {!result.center && (
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          No location
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 rounded-b-xl">
                <p className="text-[10px] text-slate-400 text-center">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </p>
              </div>
            </div>
          )}
          
          {/* No Results State */}
          {showSearchDropdown && searchQuery && searchResults.length === 0 && !searchLoading && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 p-4">
              <div className="text-center">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Search className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm text-slate-600">No results found</p>
                <p className="text-xs text-slate-400 mt-1">Try searching for barangays, canals, or reports</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      <div className="absolute top-20 left-4 z-[1000] bg-white rounded-xl shadow-lg w-72">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-200"
        >
          <div className="flex items-center">
            <Filter className="w-4 h-4 mr-2 text-slate-500" />
            <span className="font-semibold text-slate-800">Filters</span>
          </div>
          {showFilters ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {showFilters && (
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Feature Type</label>
              <select
                value={filters.feature_type}
                onChange={(e) => handleFilterChange('feature_type', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">All Types</option>
                {featureTypes.map(ft => (
                  <option key={ft.value} value={ft.value}>{ft.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">RIS (System)</label>
              <select
                value={filters.ris_id}
                onChange={(e) => handleFilterChange('ris_id', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">All Systems</option>
                {risList.map(ris => (
                  <option key={ris.id} value={ris.id}>{ris.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">IA (Association)</label>
              <select
                value={filters.ia_id}
                onChange={(e) => handleFilterChange('ia_id', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">All IAs</option>
                {iaList.map(ia => (
                  <option key={ia.id} value={ia.id}>{ia.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={clearFilters}
              className="w-full px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Layer Controls Panel */}
      <div className={`absolute ${showFilters ? 'left-72' : 'left-4'} top-20 z-[1000] bg-white rounded-xl shadow-lg w-56 transition-all`}>
        <button
          onClick={() => setShowLayerPanel(!showLayerPanel)}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-200"
        >
          <div className="flex items-center">
            <Layers className="w-4 h-4 mr-2 text-slate-500" />
            <span className="font-semibold text-slate-800">Map Layers</span>
          </div>
          {showLayerPanel ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {showLayerPanel && (
          <div className="p-3 space-y-2">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.canalRoutes}
                onChange={() => toggleLayer('canalRoutes')}
                className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
              />
              <span className="text-sm text-slate-600">Canal Routes</span>
              <span className="ml-auto text-xs text-slate-400">({gisFeatures?.features?.length || 0})</span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer ml-6">
              <input
                type="checkbox"
                checked={layers.showLabels}
                onChange={() => toggleLayer('showLabels')}
                className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
              />
              <span className="text-xs text-slate-500">Show Labels</span>
            </label>

            <div className="border-t border-slate-200 pt-2 mt-2">
              <p className="text-xs font-semibold text-slate-700 mb-2">Tickets ({ticketCounts.total})</p>
              <div className="space-y-1">
                <label className="flex items-center cursor-pointer">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={layers.showTickets}
                      onChange={() => toggleLayer('showTickets')}
                      className="peer sr-only"
                    />
                    <div
                      className="w-4 h-4 rounded border-2 transition-all duration-200"
                      style={{
                        borderColor: '#EF4444',
                        backgroundColor: layers.showTickets ? '#EF4444' : 'transparent'
                      }}
                    >
                      {layers.showTickets && (
                        <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="ml-2 text-xs text-slate-600">Show Tickets</span>
                </label>
                <label className="flex items-center cursor-pointer ml-5">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={layers.showTicketPending}
                      onChange={() => toggleLayer('showTicketPending')}
                      className="peer sr-only"
                    />
                    <div 
                      className="w-3.5 h-3.5 rounded border-2 transition-all duration-200"
                      style={{ 
                        borderColor: '#F59E0B',
                        backgroundColor: layers.showTicketPending ? '#F59E0B' : 'transparent'
                      }}
                    >
                      {layers.showTicketPending && (
                        <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="ml-2 text-xs text-slate-500">
                    Pending ({ticketCounts.pending})
                  </span>
                </label>
                <label className="flex items-center cursor-pointer ml-5">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={layers.showTicketInProgress}
                      onChange={() => toggleLayer('showTicketInProgress')}
                      className="peer sr-only"
                    />
                    <div 
                      className="w-3.5 h-3.5 rounded border-2 transition-all duration-200"
                      style={{ 
                        borderColor: '#EF4444',
                        backgroundColor: layers.showTicketInProgress ? '#EF4444' : 'transparent'
                      }}
                    >
                      {layers.showTicketInProgress && (
                        <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="ml-2 text-xs text-slate-500">
                    In Progress ({ticketCounts.in_progress})
                  </span>
                </label>
                <label className="flex items-center cursor-pointer ml-5">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={layers.showTicketClosed}
                      onChange={() => toggleLayer('showTicketClosed')}
                      className="peer sr-only"
                    />
                    <div 
                      className="w-3.5 h-3.5 rounded border-2 transition-all duration-200"
                      style={{ 
                        borderColor: '#10B981',
                        backgroundColor: layers.showTicketClosed ? '#10B981' : 'transparent'
                      }}
                    >
                      {layers.showTicketClosed && (
                        <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="ml-2 text-xs text-slate-500">
                    Closed ({ticketCounts.closed})
                  </span>
                </label>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-2 mt-2">
              <p className="text-xs font-semibold text-slate-700 mb-2">Standalone Reports ({standaloneCounts.total})</p>
              <div className="space-y-1">
                <label className="flex items-center cursor-pointer">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={layers.showStandalone}
                      onChange={() => toggleLayer('showStandalone')}
                      className="peer sr-only"
                    />
                    <div
                      className="w-4 h-4 rounded border-2 transition-all duration-200"
                      style={{
                        borderColor: '#6B7280',
                        backgroundColor: layers.showStandalone ? '#6B7280' : 'transparent'
                      }}
                    >
                      {layers.showStandalone && (
                        <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="ml-2 text-xs text-slate-600">Show Reports</span>
                </label>
                {['inspection', 'maintenance', 'cleaning', 'other'].map((cat) => {
                  const categoryConfig = getCategoryConfig()
                  const layerKey = `showStandalone${cat.charAt(0).toUpperCase() + cat.slice(1)}`
                  const isChecked = layers[layerKey]
                  return (
                    <label key={cat} className="flex items-center cursor-pointer ml-5">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleLayer(layerKey)}
                          className="peer sr-only"
                        />
                        <div 
                          className="w-3.5 h-3.5 rounded-sm border-2 transition-all duration-200"
                          style={{ 
                            borderColor: categoryConfig[cat].color,
                            backgroundColor: isChecked ? categoryConfig[cat].color : 'transparent'
                          }}
                        >
                          {isChecked && (
                            <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <span className="ml-2 text-xs text-slate-500">{categoryConfig[cat].label} ({standaloneCounts[cat] || 0})</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-2 mt-2">
              <p className="text-xs text-slate-500 mb-2">Legend by Type:</p>
              <div className="space-y-1">
                {featureTypes.map(ft => (
                  <div key={ft.value} className="flex items-center text-xs">
                    <div className="w-4 h-2.5 rounded-sm mr-2" style={{ backgroundColor: getFeatureColors()[ft.value] }} />
                    <span className="text-slate-600">{ft.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Side Drawer */}
      <div 
        className={`absolute top-0 right-0 h-full w-96 bg-white shadow-xl overflow-y-auto z-[1000] transition-all duration-300 ease-out transform ${
          selectedReport ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
        }`}
        style={{ pointerEvents: selectedReport ? 'auto' : 'none' }}
      >
        {selectedReport && (
          <>
          <div className="p-5 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                {selectedReport.isTicket ? 'Ticket Details' : 'Report Details'}
              </h3>
              <button
                onClick={() => { setSelectedReport(null); setSelectedMarkerId(null) }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
          </div>

          <div className="p-5">
            <div className="h-44 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl mb-5 flex items-center justify-center overflow-hidden">
              {selectedReport.images && selectedReport.images.length > 0 ? (
                <img 
                  src={getImageUrl(selectedReport.images[0])} 
                  alt="Report" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 bg-white/50 backdrop-blur rounded-2xl flex items-center justify-center">
                  <Droplets className="w-8 h-8 text-slate-400" />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Location
                </p>
                <p className="font-semibold text-slate-800">{selectedReport.location}</p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> {selectedReport.isTicket && selectedReport.status === 'closed' ? 'Created' : 'Date'}
                </p>
                <p className="font-semibold text-slate-800">{selectedReport.createdAt ? parseFullDate(selectedReport.createdAt) : selectedReport.date}</p>
                {selectedReport.isTicket && selectedReport.status === 'closed' && selectedReport.resolvedAt && (
                  <>
                    <p className="text-xs font-medium text-slate-500 mb-1 mt-3 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> Resolved
                    </p>
                    <p className="font-semibold text-slate-800">{parseFullDate(selectedReport.resolvedAt)}</p>
                  </>
                )}
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Submitted By
                </p>
                <p className="font-semibold text-slate-800">{selectedReport.submitter}</p>
              </div>

              {selectedReport.isTicket && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" /> Status
                  </p>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    selectedReport.status === 'pending' ? 'bg-blue-100 text-blue-700' :
                    selectedReport.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                    selectedReport.status === 'closed' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {statusLabels[selectedReport.status] || selectedReport.status}
                  </span>
                </div>
              )}

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-3">Condition Assessment</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white rounded-lg p-3 text-center border border-blue-100">
                    <p className="text-[10px] text-blue-500 font-medium">Water</p>
                    <p className="text-lg font-bold text-blue-600">{selectedReport.waterLevel}/5</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center border border-amber-100">
                    <p className="text-[10px] text-amber-500 font-medium">Silt</p>
                    <p className="text-lg font-bold text-amber-600">{selectedReport.siltLevel}/5</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center border border-red-100">
                    <p className="text-[10px] text-red-500 font-medium">Debris</p>
                    <p className="text-lg font-bold text-red-600">{selectedReport.debrisLevel}/5</p>
                  </div>
                </div>
              </div>

              {selectedReport.remarks && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-2">Remarks</p>
                  <p className="text-sm text-slate-700">{selectedReport.remarks}</p>
                </div>
              )}

              <button
                onClick={() => {
                  console.log('Navigation button clicked, isTicket:', selectedReport.isTicket, 'ticketId:', selectedReport.ticketId, 'reportId:', selectedReport.id)
                  if (selectedReport.isTicket) {
                    console.log('Navigating to /tickets with selectedTicketId:', selectedReport.ticketId)
                    navigate('/tickets', { state: { selectedTicketId: selectedReport.ticketId } })
                  } else {
                    console.log('Navigating to /reports with selectedReportId:', selectedReport.id)
                    navigate('/reports', { state: { selectedReportId: selectedReport.id } })
                  }
                }}
                className="w-full py-3 bg-primary hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 mt-2"
              >
                <Eye className="w-4 h-4" />
                {selectedReport.isTicket ? 'View Full Details in Tickets' : 'View Full Details in Reports'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          </>
        )}
      </div>

      {/* GIS Feature History Panel */}
      {selectedGisFeature && (
        <div className="absolute top-0 right-0 h-full w-96 bg-white shadow-xl overflow-y-auto z-[1000] flex flex-col">
          <div className="p-5 border-b border-slate-200 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  Canal History
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">{selectedGisFeature.name}</p>
              </div>
              <button
                onClick={() => { setSelectedGisFeature(null); setGisFeatureReports([]) }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {gisFeatureReportsLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : !gisFeatureReports || gisFeatureReports.length === 0 ? (
              <div className="text-center py-12 px-5">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium">No reports found</p>
                <p className="text-xs text-slate-400 mt-1">for this canal</p>
              </div>
            ) : (() => {
              const ongoingReports = gisFeatureReports.filter(r => r.ticket?.status && r.ticket.status !== 'closed')
              const pastReports = gisFeatureReports.filter(r => !r.ticket?.status || r.ticket.status === 'closed')
              const displayPastCount = 3

              return (
                <div className="p-5 space-y-4">
                  {ongoingReports.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                          Ongoing ({ongoingReports.length})
                        </span>
                      </div>
                      <div className="space-y-3">
                        {ongoingReports.map((report) => {
                          const ticket = report.ticket
                          const ticketStatus = ticket?.status || 'no_ticket'
                          const categoryConfig = getCategoryConfig()
                          const cat = categoryConfig[report.category] || categoryConfig.other
                          const imgUrl = (report.images?.[0]?.imageUrl || report.images?.[0]?.image_url || '')
                          const submitterName = report.User
                            ? `${report.User.first_name || ''} ${report.User.last_name || ''}`.trim()
                            : 'Unknown'
                          const reportDate = report.created_at
                            ? new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : report.createdAt
                              ? new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : 'N/A'
                          const hasImage = !!imgUrl
                          return (
                            <div
                              key={report.id}
                              className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group"
                              onClick={() => handleCanalReportClick(report)}
                            >
                              <div className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-md ${
                                      ticketStatus === 'pending' ? 'bg-blue-100 text-blue-700' :
                                      ticketStatus === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                                      ticketStatus === 'no_ticket' ? 'bg-slate-100 text-slate-500' :
                                      ticketStatus === 'closed' ? 'bg-emerald-100 text-emerald-600' :
                                      'bg-slate-100 text-slate-600'
                                    }`}>
                                      {statusLabels[ticketStatus] || 'No Ticket'}
                                    </span>
                                    {ticket?.subStatus && (
                                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                        style={{ backgroundColor: ticket.subStatus.color + '20', color: ticket.subStatus.color }}>
                                        {ticket.subStatus.name}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {reportDate}
                                  </span>
                                </div>

                                {/* Image + remarks row */}
                                <div className="flex gap-3 mb-3">
                                  {hasImage ? (
                                    <img
                                      src={imgUrl}
                                      alt=""
                                      className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                                    />
                                  ) : (
                                    <div className="w-20 h-20 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                      <ImageIcon className="w-6 h-6 text-slate-300" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                                    <p className="text-sm text-slate-700 line-clamp-3 font-medium">
                                      {report.remarks || 'No remarks'}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      <User className="w-3 h-3 inline mr-1" />
                                      {submitterName}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="flex-1 grid grid-cols-3 gap-2">
                                    <div className="bg-blue-50 rounded-lg p-2 text-center">
                                      <p className="text-[10px] text-blue-500 font-medium">Water</p>
                                      <p className="text-sm font-bold text-blue-700">{levelToNumber(report.water_level)}</p>
                                    </div>
                                    <div className="bg-amber-50 rounded-lg p-2 text-center">
                                      <p className="text-[10px] text-amber-500 font-medium">Silt</p>
                                      <p className="text-sm font-bold text-amber-700">{levelToNumber(report.silt_level)}</p>
                                    </div>
                                    <div className="bg-red-50 rounded-lg p-2 text-center">
                                      <p className="text-[10px] text-red-500 font-medium">Debris</p>
                                      <p className="text-sm font-bold text-red-700">{levelToNumber(report.debris_level)}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="px-4 pb-3">
                                <button
                                  onClick={() => {
                                    setSelectedGisFeature(null)
                                    setSelectedReport(null)
                                    const ticketId = ticket?.id
                                    if (ticketId) {
                                      navigate('/reports', { state: { selectedTicketId: ticketId } })
                                    }
                                  }}
                                  className="w-full py-2 bg-primary/10 hover:bg-primary text-primary hover:text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 group-hover:gap-2"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View Details
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="h-1" style={{ backgroundColor: cat.color }} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {pastReports.length > 0 && (
                    <div>
                      {ongoingReports.length > 0 && (
                        <div className="border-t border-slate-200 pt-4 mb-3">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Past Reports ({pastReports.length})
                          </span>
                        </div>
                      )}
                      <div className="space-y-2">
                        {pastReports.slice(0, displayPastCount).map((report) => {
                          const ticket = report.ticket
                          const ticketStatus = ticket?.status || 'closed'
                          const categoryConfig = getCategoryConfig()
                          const cat = categoryConfig[report.category] || categoryConfig.other
                          const imgUrl = (report.images?.[0]?.imageUrl || report.images?.[0]?.image_url || '')
                          const submitterName = report.User
                            ? `${report.User.first_name || ''} ${report.User.last_name || ''}`.trim()
                            : 'Unknown'
                          const reportDate = report.created_at
                            ? new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : report.createdAt
                              ? new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : ''
                          const hasImage = !!imgUrl
                          return (
                            <div
                              key={report.id}
                              className="bg-slate-50 rounded-lg border border-slate-100 p-3 hover:bg-slate-100 hover:border-slate-200 transition-all cursor-pointer group"
                              onClick={() => handleCanalReportClick(report)}
                            >
                              <div className="flex items-center gap-3">
                                {hasImage ? (
                                  <img
                                    src={imgUrl}
                                    alt=""
                                    className="w-14 h-14 object-cover rounded-lg flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <Droplets className="w-5 h-5 text-slate-300" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-slate-600 line-clamp-1">
                                    {report.remarks || 'No remarks'}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[9px] text-slate-400 flex items-center gap-0.5">
                                      <User className="w-2.5 h-2.5" />
                                      {submitterName}
                                    </span>
                                    <span className="text-[9px] text-slate-300"> · </span>
                                    <span className="text-[9px] text-slate-400">
                                      {reportDate}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      
                      {pastReports.length > displayPastCount && (
                        <button
                          onClick={() => {
                            setSelectedGisFeature(null)
                            navigate('/history', { state: { gisFeatureId: selectedGisFeature.id, gisFeatureName: selectedGisFeature.name } })
                          }}
                          className="w-full mt-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5"
                        >
                          Show more ({pastReports.length - displayPastCount}) past reports
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
