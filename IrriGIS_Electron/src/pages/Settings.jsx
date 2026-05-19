import { useState, useEffect, useRef } from 'react'
import {
  Settings as SettingsIcon, Save, Trash2, RefreshCw, Plus, ChevronDown, ChevronRight, ChevronUp,
  Send, RotateCcw, Palette, Map, Tag, Droplets, Eye, Clock, Folder, FileEdit, X, Search, FileText,
  Link, MapPin, AlertTriangle, Edit2, Check, Server, Wifi, WifiOff, Database, Users
} from 'lucide-react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import api, { clearAPICache } from '../services/api'
import { useOffline } from '../context/OfflineContext'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

window.L = L

const DEFAULT_MAP_COLORS = {
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

const DEFAULT_REPORT_DISPLAY_DAYS = 7

const FEATURE_TYPES = [
  { value: 'main_canal', label: 'Main Canal' },
  { value: 'lateral', label: 'Lateral' },
  { value: 'farm_ditch', label: 'Farm Ditch' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'canal', label: 'Canal' },
  { value: 'river', label: 'River' },
  { value: 'other', label: 'Other' },
]

function getFeatureColors() {
  try {
    const saved = localStorage.getItem('mapFeatureColors')
    return saved ? { ...DEFAULT_MAP_COLORS, ...JSON.parse(saved) } : DEFAULT_MAP_COLORS
  } catch {
    return DEFAULT_MAP_COLORS
  }
}

function MapBoundsSetter({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (bounds && bounds.length === 4) {
      map.fitBounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]])
    }
  }, [bounds, map])
  return null
}

function GeoJSONLayer({ data, colors, onEachFeature, highlightedFeature, highlightedColor }) {
  const geoJsonRef = useRef(null)
  const map = useMap()
  
  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.clearLayers()
      if (data) {
        geoJsonRef.current.addData(data)
      }
    }
  }, [data])

  if (!data || !data.features || data.features.length === 0) return null

  const style = (feature) => {
    const featureType = feature.properties?.feature_type || 'other'
    const isHighlighted = highlightedFeature && 
      (highlightedFeature.id === feature.properties?.id || 
       highlightedFeature.properties?.id === feature.properties?.id)
    
    const color = colors[featureType] || colors.other || '#6B7280'
    
    return {
      color: isHighlighted ? highlightedColor : color,
      weight: isHighlighted ? 6 : 3,
      opacity: isHighlighted ? 1 : 0.8,
      fillColor: color,
      fillOpacity: isHighlighted ? 0.4 : 0.15,
    }
  }

  return (
    <GeoJSON 
      ref={geoJsonRef}
      data={data} 
      style={style}
      onEachFeature={onEachFeature}
    />
  )
}

function GeoJSONLabels({ data, colors }) {
  const map = useMap()
  const labelMarkersRef = useRef([])
  const featureColors = colors || getFeatureColors()
  
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

      const color = featureColors[featureType] || featureColors.canal || '#6B7280'
      
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
  }, [data, map, featureColors])

  useEffect(() => {
    return () => {
      labelMarkersRef.current.forEach(marker => {
        if (map && marker) {
          try { map.removeLayer(marker) } catch (e) {}
        }
      })
    }
  }, [map])

  return null
}

function getReportDisplayDays() {
  try {
    const saved = localStorage.getItem('reportDisplayDays')
    return saved ? parseInt(saved, 10) : DEFAULT_REPORT_DISPLAY_DAYS
  } catch {
    return DEFAULT_REPORT_DISPLAY_DAYS
  }
}

function getPendingOpacityValue() {
  try {
    const saved = localStorage.getItem('pendingMarkerOpacity')
    return saved ? parseInt(saved, 10) : 40
  } catch {
    return 40
  }
}

function ReportDisplaySettings() {
  const [displayDays, setDisplayDays] = useState(() => getReportDisplayDays())
  const [pendingOpacity, setPendingOpacity] = useState(() => getPendingOpacityValue())
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    localStorage.setItem('reportDisplayDays', displayDays.toString())
    localStorage.setItem('pendingMarkerOpacity', pendingOpacity.toString())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    setDisplayDays(DEFAULT_REPORT_DISPLAY_DAYS)
    setPendingOpacity(40)
    localStorage.setItem('reportDisplayDays', DEFAULT_REPORT_DISPLAY_DAYS.toString())
    localStorage.setItem('pendingMarkerOpacity', '40')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Ticket Display Settings
          </h3>
          <p className="text-sm text-slate-500">Configure how tickets (origin reports) appear on the map</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </button>
          <button onClick={handleSave}
            className={`flex items-center gap-1 px-4 py-2 text-sm rounded ${
              saved ? 'bg-green-500 text-white' : 'bg-primary text-white hover:bg-primary-600'
            }`}>
            <Save className="w-4 h-4" />
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            Days to Display Closed Tickets on Map
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              max="90"
              value={displayDays}
              onChange={(e) => setDisplayDays(parseInt(e.target.value) || DEFAULT_REPORT_DISPLAY_DAYS)}
              className="w-20 px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
            />
            <span className="text-sm text-slate-600">days</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Closed tickets older than {displayDays} days will gradually fade and disappear.
            Only closed tickets are affected by this setting.
          </p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
            <Droplets className="w-4 h-4 text-slate-500" />
            Pending Ticket Marker Opacity
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="80"
              value={pendingOpacity}
              onChange={(e) => setPendingOpacity(parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-slate-600 w-12 text-right">{pendingOpacity}%</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Set transparency for pending tickets. Higher values = more visible (max 80%).
          </p>
        </div>
      </div>
    </div>
  )
}

function TicketGroupingSettings() {
  const [proximityThreshold, setProximityThreshold] = useState(50)
  const [autoGroupEnabled, setAutoGroupEnabled] = useState(true)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getTicketSettings().then(res => {
      if (res.success && res.data) {
        setProximityThreshold(res.data.proximity_threshold_meters || 50)
        setAutoGroupEnabled(res.data.auto_group_enabled !== false)
      }
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    try {
      await api.updateTicketSettings({
        proximity_threshold_meters: proximityThreshold,
        auto_group_enabled: autoGroupEnabled
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save ticket settings:', error)
    }
  }

  const handleReset = () => {
    setProximityThreshold(50)
    setAutoGroupEnabled(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Link className="w-5 h-5 text-primary" />
            Ticket Grouping Settings
          </h3>
          <p className="text-sm text-slate-500">Configure how reports are grouped into tickets</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </button>
          <button onClick={handleSave}
            className={`flex items-center gap-1 px-4 py-2 text-sm rounded ${
              saved ? 'bg-green-500 text-white' : 'bg-primary text-white hover:bg-primary-600'
            }`}>
            <Save className="w-4 h-4" />
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
        <div>
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoGroupEnabled}
                onChange={(e) => setAutoGroupEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <div>
                <p className="text-sm font-medium text-slate-700">Auto-group Reports</p>
                <p className="text-xs text-slate-500">Automatically link new reports to existing tickets when they match the criteria</p>
              </div>
            </div>
          </label>
        </div>

        {autoGroupEnabled && (
          <div className="border-t border-slate-200 pt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-500" />
              Proximity Threshold
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="10"
                max="500"
                value={proximityThreshold}
                onChange={(e) => setProximityThreshold(parseInt(e.target.value) || 50)}
                className="w-24 px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
              />
              <span className="text-sm text-slate-600">meters</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Reports submitted within {proximityThreshold} meters of each other, on the same day, 
              with the same category and GIS feature will be grouped under the same ticket.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

const CATEGORY_LABELS = {
  inspection: 'Inspection',
  maintenance: 'Maintenance',
  cleaning: 'Cleaning',
  issue: 'Issue',
  other: 'Other'
}

function ColorPersonalizationSettings() {
  const [activeTab, setActiveTab] = useState('map')
  const [mapColors, setMapColors] = useState(() => {
    const saved = localStorage.getItem('mapFeatureColors')
    return saved ? JSON.parse(saved) : DEFAULT_MAP_COLORS
  })
  const [categoryColors, setCategoryColors] = useState(() => {
    const saved = localStorage.getItem('categoryColors')
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORY_COLORS
  })
  const [saved, setSaved] = useState(false)

  const mapFeatureTypes = [
    { key: 'main_canal', label: 'Main Canal' },
    { key: 'lateral', label: 'Lateral' },
    { key: 'farm_ditch', label: 'Farm Ditch' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'canal', label: 'Canal' },
    { key: 'other', label: 'Other' },
  ]

  const handleMapColorChange = (key, color) => {
    setMapColors(prev => ({ ...prev, [key]: color }))
    setSaved(false)
  }

  const handleCategoryColorChange = (key, color) => {
    setCategoryColors(prev => ({ ...prev, [key]: color }))
    setSaved(false)
  }

  const handleSave = () => {
    localStorage.setItem('mapFeatureColors', JSON.stringify(mapColors))
    localStorage.setItem('categoryColors', JSON.stringify(categoryColors))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    setMapColors(DEFAULT_MAP_COLORS)
    setCategoryColors(DEFAULT_CATEGORY_COLORS)
    localStorage.setItem('mapFeatureColors', JSON.stringify(DEFAULT_MAP_COLORS))
    localStorage.setItem('categoryColors', JSON.stringify(DEFAULT_CATEGORY_COLORS))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const ColorPicker = ({ value, onChange }) => (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border border-slate-300 p-0.5"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded font-mono"
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Color Personalization
          </h3>
          <p className="text-sm text-slate-500">Customize map feature and report category colors</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </button>
          <button onClick={handleSave}
            className={`flex items-center gap-1 px-4 py-2 text-sm rounded ${
              saved ? 'bg-green-500 text-white' : 'bg-primary text-white hover:bg-primary-600'
            }`}>
            <Save className="w-4 h-4" />
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setActiveTab('map')}
          className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'map' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <Map className="w-4 h-4" /> Map Features
        </button>
        <button onClick={() => setActiveTab('category')}
          className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'category' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <Tag className="w-4 h-4" /> Report Categories
        </button>
      </div>

      {/* Map Features Tab */}
      {activeTab === 'map' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {mapFeatureTypes.map(ft => (
            <div key={ft.key} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <label className="block text-sm font-medium text-slate-700 mb-2">{ft.label}</label>
              <ColorPicker value={mapColors[ft.key] || DEFAULT_MAP_COLORS[ft.key]} onChange={(c) => handleMapColorChange(ft.key, c)} />
              <div className="mt-2 h-2 rounded" style={{ backgroundColor: mapColors[ft.key] || DEFAULT_MAP_COLORS[ft.key] }} />
            </div>
          ))}
        </div>
      )}

      {/* Report Categories Tab */}
      {activeTab === 'category' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Object.keys(CATEGORY_LABELS).map(key => (
            <div key={key} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <label className="block text-sm font-medium text-slate-700 mb-2">{CATEGORY_LABELS[key]}</label>
              <ColorPicker value={categoryColors[key] || DEFAULT_CATEGORY_COLORS[key]} onChange={(c) => handleCategoryColorChange(key, c)} />
              <div className="mt-2 h-2 rounded" style={{ backgroundColor: categoryColors[key] || DEFAULT_CATEGORY_COLORS[key] }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SubStatusManager() {
  const [subStatuses, setSubStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    name: '', slug: '', color: '#3B82F6', icon: 'circle', description: '', display_order: 0
  })
  const [showForm, setShowForm] = useState(false)

  const fetchSubStatuses = async () => {
    setLoading(true)
    try {
      const response = await api.getTicketSubStatuses()
      if (response.success) {
        setSubStatuses(response.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch sub-statuses:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSubStatuses()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        await api.updateTicketSubStatus(editingId, form)
      } else {
        await api.createTicketSubStatus(form)
      }
      setForm({ name: '', slug: '', color: '#3B82F6', icon: 'circle', description: '', display_order: 0 })
      setShowForm(false)
      setEditingId(null)
      fetchSubStatuses()
    } catch (error) {
      alert(error.message)
    }
  }

  const handleEdit = (item) => {
    setForm(item)
    setEditingId(item.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this sub-status?')) return
    try {
      await api.deleteTicketSubStatus(id)
      fetchSubStatuses()
    } catch (error) {
      alert(error.message)
    }
  }

  const generateSlug = (name) => {
    return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  }

  if (loading) {
    return <div className="flex justify-center py-8"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary"></div>
          <span className="text-sm text-slate-500">{subStatuses.length} sub-statuses</span>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', slug: '', color: '#3B82F6', icon: 'circle', description: '', display_order: 0 }) }}
          className="flex items-center px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary-600"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value, slug: generateSlug(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Slug *</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Color</label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-full h-10 border border-slate-300 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Display Order</label>
              <input
                type="number"
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex items-center px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary-600">
              <Save className="w-4 h-4 mr-1" />
              {editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null) }} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {subStatuses.length === 0 ? (
          <div className="col-span-full text-center py-8 text-slate-500 text-sm">No sub-statuses found</div>
        ) : (
          subStatuses.map((item) => (
            <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                  <div>
                    <p className="font-semibold text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{item.slug}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400">#{item.display_order}</span>
              </div>
              <p className="text-sm text-slate-500 mb-4">{item.description || 'No description'}</p>
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button onClick={() => handleEdit(item)} className="flex-1 flex items-center justify-center px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors">
                  <RotateCcw className="w-3 h-3 mr-1" /> Edit
                </button>
                <button onClick={() => handleDelete(item.id)} className="flex-1 flex items-center justify-center px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function UserSettings() {
  const [defaultUserActive, setDefaultUserActive] = useState(true)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load current setting from API
    const loadSettings = async () => {
      try {
        const res = await api.getUserSettings()
        if (res.success && res.data) {
          setDefaultUserActive(res.data.default_user_active)
        }
      } catch (error) {
        console.error('Failed to load user settings:', error)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    try {
      await api.updateUserSettings({
        default_user_active: defaultUserActive
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save user settings:', error)
    }
  }

  const handleReset = async () => {
    try {
      await api.updateUserSettings({
        default_user_active: true
      })
      setDefaultUserActive(true)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error('Failed to reset user settings:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            User Settings
          </h3>
          <p className="text-sm text-slate-500">Configure default settings for new user accounts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </button>
          <button onClick={handleSave}
            className={`flex items-center gap-1 px-4 py-2 text-sm rounded ${
              saved ? 'bg-green-500 text-white' : 'bg-primary text-white hover:bg-primary-600'
            }`}>
            <Save className="w-4 h-4" />
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
        <div>
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={defaultUserActive}
                onChange={(e) => setDefaultUserActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <div>
                <p className="text-sm font-medium text-slate-700">Default New Users as Active</p>
                <p className="text-xs text-slate-500">
                  When enabled, new user accounts will be set to active by default.
                  When disabled, new users will require manual activation by administrators.
                </p>
              </div>
            </div>
          </label>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Current Setting</p>
                <p>
                  New users will be created as <span className="font-semibold">{defaultUserActive ? 'ACTIVE' : 'INACTIVE'}</span> by default.
                  {defaultUserActive 
                    ? ' They can immediately log in and access the system.'
                    : ' They will require administrator approval before accessing the system.'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReportPresetsManager() {
  const [presets, setPresets] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    name: '', slug: '', category: 'issue', water_level: 3, silt_level: 3, debris_level: 3, icon: 'alert-circle', description: '', display_order: 0
  })
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState(null)

  const fetchPresets = async () => {
    setLoading(true)
    setError(null)
    try {
      const [presetsRes, catsRes] = await Promise.all([
        selectedCategory === 'all' ? api.getReportPresets() : api.getReportPresetsByCategory(selectedCategory),
        api.getReportPresetCategories()
      ])
      console.log('Presets response:', presetsRes)
      console.log('Categories response:', catsRes)
      if (presetsRes.success) {
        setPresets(presetsRes.data || [])
      } else {
        setError(presetsRes.message)
      }
      if (catsRes.success) setCategories(catsRes.data || [])
    } catch (error) {
      console.error('Failed to fetch presets:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPresets()
  }, [selectedCategory])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        await api.updateReportPreset(editingId, form)
      } else {
        await api.createReportPreset(form)
      }
      setForm({ name: '', slug: '', category: 'issue', water_level: 3, silt_level: 3, debris_level: 3, icon: 'alert-circle', description: '', display_order: 0 })
      setShowForm(false)
      setEditingId(null)
      fetchPresets()
    } catch (error) {
      alert(error.message)
    }
  }

  const handleEdit = (item) => {
    setForm(item)
    setEditingId(item.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this preset?')) return
    try {
      await api.deleteReportPreset(id)
      fetchPresets()
    } catch (error) {
      alert(error.message)
    }
  }

  const generateSlug = (name) => {
    return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  }

  const levelOptions = [1, 2, 3, 4, 5]
  const levelLabels = { 1: 'Very Low', 2: 'Low', 3: 'Normal', 4: 'High', 5: 'Very High' }

  if (loading) {
    return <div className="flex justify-center py-8"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-2">{error}</p>
        <button onClick={fetchPresets} className="text-primary hover:underline text-sm">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <span className="text-sm text-slate-500">{presets.length} presets</span>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', slug: '', category: 'issue', water_level: 3, silt_level: 3, debris_level: 3, icon: 'alert-circle', description: '', display_order: 0 }) }}
          className="flex items-center px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary-600"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value, slug: generateSlug(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Slug *</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Icon</label>
              <input
                type="text"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Display Order</label>
              <input
                type="number"
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Active</label>
              <div className="flex items-center h-10">
                <input
                  type="checkbox"
                  checked={form.is_active !== false}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 text-primary rounded"
                />
                <span className="ml-2 text-sm text-slate-600">Active</span>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Levels (1-5)</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Water Level</label>
                <select
                  value={form.water_level}
                  onChange={(e) => setForm({ ...form, water_level: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
                >
                  {levelOptions.map(l => <option key={l} value={l}>{l} - {levelLabels[l]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Silt Level</label>
                <select
                  value={form.silt_level}
                  onChange={(e) => setForm({ ...form, silt_level: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
                >
                  {levelOptions.map(l => <option key={l} value={l}>{l} - {levelLabels[l]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Debris Level</label>
                <select
                  value={form.debris_level}
                  onChange={(e) => setForm({ ...form, debris_level: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
                >
                  {levelOptions.map(l => <option key={l} value={l}>{l} - {levelLabels[l]}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex items-center px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary-600">
              <Save className="w-4 h-4 mr-1" />
              {editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null) }} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {presets.length === 0 ? (
          <div className="col-span-full text-center py-8 text-slate-500 text-sm">No presets found</div>
        ) : (
          presets.map((item) => (
            <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-emerald-500/20 flex items-center justify-center text-sm font-bold text-primary">
                    {item.category?.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{item.slug}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${item.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {item.is_active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex gap-2 mb-3">
                <div className="flex-1 text-center py-1.5 bg-slate-50 rounded text-xs">
                  <span className="text-slate-400 block">Water</span>
                  <span className="font-semibold text-slate-700">{item.water_level}</span>
                </div>
                <div className="flex-1 text-center py-1.5 bg-slate-50 rounded text-xs">
                  <span className="text-slate-400 block">Silt</span>
                  <span className="font-semibold text-slate-700">{item.silt_level}</span>
                </div>
                <div className="flex-1 text-center py-1.5 bg-slate-50 rounded text-xs">
                  <span className="text-slate-400 block">Debris</span>
                  <span className="font-semibold text-slate-700">{item.debris_level}</span>
                </div>
              </div>
              <p className="text-sm text-slate-500 mb-4">{item.description || 'No description'}</p>
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button onClick={() => handleEdit(item)} className="flex-1 flex items-center justify-center px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors">
                  <RotateCcw className="w-3 h-3 mr-1" /> Edit
                </button>
                <button onClick={() => handleDelete(item.id)} className="flex-1 flex items-center justify-center px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function GISSsettings() {
  const [activeSection, setActiveSection] = useState('features')
  const [features, setFeatures] = useState([])
  const [ias, setIAs] = useState([])
  const [risList, setRisList] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterRIS, setFilterRIS] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [form, setForm] = useState({ name: '', code: '', feature_type: 'canal', geometry: null, properties: {}, ris_id: '', ia_id: '' })
  const [gisFeaturesGeoJSON, setGisFeaturesGeoJSON] = useState(null)
  const [iasGeoJSON, setIAsGeoJSON] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [mapBounds, setMapBounds] = useState(null)
  const featureColors = getFeatureColors()
  const mapCenter = [6.17, 125.17]
  const defaultZoom = 12
  const [showNewCard, setShowNewCard] = useState(false)
  const formRef = useRef(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [featuresRes, iasRes, risRes] = await Promise.all([
        api.getGISFeatures(),
        api.getIrrigatorAssociations(),
        api.getRISList()
      ])
      if (featuresRes.type === 'FeatureCollection') {
        setFeatures(featuresRes.features || [])
        setGisFeaturesGeoJSON(featuresRes)
      }
      if (iasRes.success) {
        const iaData = iasRes.data || []
        setIAs(iaData)
        const iaFeatures = iaData.filter(ia => ia.service_area).map(ia => {
          let geom = ia.service_area
          if (geom && typeof geom === 'object' && geom.toGeoJSON) {
            geom = geom.toGeoJSON()
          }
          return {
            type: 'Feature',
            properties: { ...ia, id: ia.id },
            geometry: geom
          }
        })
        const iaGeoJSON = {
          type: 'FeatureCollection',
          features: iaFeatures
        }
        setIAsGeoJSON(iaGeoJSON)
      }
      if (risRes.success) {
        setRisList(risRes.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch GIS data:', error)
    } finally {
      setLoading(false)
    }
  }

  const [step, setStep] = useState(1)

  const handleSubmitStep1 = () => {
    if (!form.name) {
      alert('Name is required')
      return
    }
    if (activeSection === 'ias' && !form.code) {
      alert('Code is required for IA Areas')
      return
    }
    setStep(2)
    setEnableDrawing(true)
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 300)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      let submitData = { ...form }
      
      if (form.geometry) {
        try {
          const parsedGeometry = JSON.parse(form.geometry)
          if (activeSection === 'features') {
            submitData.geometry = parsedGeometry
          } else if (activeSection === 'ias') {
            submitData.service_area = parsedGeometry
          }
        } catch (parseErr) {
          alert('Invalid geometry format')
          return
        }
      }
      
      if (activeSection === 'features') {
        submitData.properties = {
          name: form.name,
          code: form.code || null,
          feature_type: form.feature_type,
          ris_id: form.ris_id || null,
          ia_id: form.ia_id || null
        }
      }

      if (editingItem) {
        if (activeSection === 'features') {
          await api.updateGISFeature(editingItem.id, submitData)
        } else {
          await api.updateIA(editingItem.id, submitData)
        }
      } else {
        if (activeSection === 'features') {
          await api.createGISFeature(submitData)
        } else {
          await api.createIA(submitData)
        }
      }
      setShowModal(false)
      setEditingItem(null)
      setForm({ name: '', code: '', feature_type: 'canal', geometry: null, properties: {}, ris_id: '', ia_id: '' })
      setEnableDrawing(false)
      setStep(1)
      fetchData()
    } catch (error) {
      alert(error.message)
    }
  }

  const handleModalClose = () => {
    setShowModal(false)
    setEnableDrawing(false)
    setStep(1)
  }

  const [editingItemId, setEditingItemId] = useState(null)

  const handleEdit = (item) => {
    const itemId = item.id || item.properties?.id
    setEditingItemId(itemId)
    setForm({
      name: item.properties?.name || item.name || '',
      code: item.properties?.code || item.code || '',
      feature_type: item.properties?.feature_type || item.feature_type || 'canal',
      geometry: item.geometry ? JSON.stringify(item.geometry) : null,
      properties: item.properties || {},
      ris_id: item.properties?.ris_id || item.ris_id || '',
      ia_id: item.properties?.ia_id || item.ia_id || ''
    })
    setEnableDrawing(true)
  }

  const handleCancelEdit = () => {
    setEditingItemId(null)
    setForm({ name: '', code: '', feature_type: 'canal', geometry: null, properties: {}, ris_id: '', ia_id: '' })
    setEnableDrawing(false)
  }

  const handleSaveEdit = async () => {
    try {
      let submitData = { ...form }
      
      if (form.geometry) {
        try {
          const parsedGeometry = JSON.parse(form.geometry)
          if (activeSection === 'features') {
            submitData.geometry = parsedGeometry
          } else if (activeSection === 'ias') {
            submitData.service_area = parsedGeometry
          }
        } catch (parseErr) {
          alert('Invalid geometry format')
          return
        }
      }
      
      if (activeSection === 'features') {
        submitData.properties = {
          name: form.name,
          code: form.code || null,
          feature_type: form.feature_type,
          ris_id: form.ris_id || null,
          ia_id: form.ia_id || null
        }
      }

      if (activeSection === 'features') {
        await api.updateGISFeature(editingItemId, submitData)
      } else {
        await api.updateIA(editingItemId, submitData)
      }
      
      handleCancelEdit()
      fetchData()
    } catch (error) {
      alert(error.message)
    }
  }

  const handleSubmitNew = async () => {
    try {
      let submitData = { ...form }
      
      if (form.geometry) {
        try {
          const parsedGeometry = JSON.parse(form.geometry)
          if (activeSection === 'features') {
            submitData.geometry = parsedGeometry
          } else if (activeSection === 'ias') {
            submitData.service_area = parsedGeometry
          }
        } catch (parseErr) {
          alert('Invalid geometry format')
          return
        }
      }
      
      if (activeSection === 'features') {
        submitData.properties = {
          name: form.name,
          code: form.code || null,
          feature_type: form.feature_type,
          ris_id: form.ris_id || null,
          ia_id: form.ia_id || null
        }
      }

      if (activeSection === 'features') {
        await api.createGISFeature(submitData)
      } else {
        const iaData = {
          name: form.name,
          code: form.code,
          service_area: submitData.service_area,
          ris_id: form.ris_id || null
        }
        await api.createIA(iaData)
      }
      
      setShowNewCard(false)
      setForm({ name: '', code: '', feature_type: 'canal', geometry: null, properties: {}, ris_id: '', ia_id: '' })
      setEnableDrawing(false)
      fetchData()
    } catch (error) {
      alert(error.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this item?')) return
    try {
      if (activeSection === 'features') {
        await api.deleteGISFeature(id)
      } else {
        await api.deleteIA(id)
      }
      setSelectedItem(null)
      fetchData()
    } catch (error) {
      alert(error.message)
    }
  }

  const handleItemClick = (item) => {
    const itemId = item.id || item.properties?.id
    setSelectedItem(item)
    
    setTimeout(() => {
      const element = document.getElementById(`gis-item-${itemId}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
    
    if (item.geometry) {
      const coords = item.geometry.coordinates
      let bounds
      if (item.geometry.type === 'LineString' || item.geometry.type === 'MultiLineString') {
        const flatCoords = item.geometry.type === 'LineString' ? coords : coords.flat()
        const lons = flatCoords.map(c => c[0])
        const lats = flatCoords.map(c => c[1])
        bounds = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
      } else if (item.geometry.type === 'Polygon' || item.geometry.type === 'MultiPolygon') {
        const ring = item.geometry.type === 'Polygon' ? coords[0] : coords[0][0]
        const lons = ring.map(c => c[0])
        const lats = ring.map(c => c[1])
        bounds = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
      }
      if (bounds) {
        setMapBounds(bounds)
      }
    }
  }

  const filteredFeatures = features.filter(f => {
    const matchesSearch = !searchTerm || (f.properties?.name || f.properties?.feature_type || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = !filterType || f.properties?.feature_type === filterType
    const matchesRIS = !filterRIS || f.properties?.ris_id === filterRIS
    return matchesSearch && matchesType && matchesRIS
  })

  const filteredIAs = ias.filter(ia => {
    const matchesSearch = !searchTerm || ia.name?.toLowerCase().includes(searchTerm.toLowerCase()) || ia.code?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRIS = !filterRIS || ia.ris_id === filterRIS
    return matchesSearch && matchesRIS
  })

  const getRISName = (id) => {
    if (!id) return 'None'
    const ris = risList.find(r => String(r.id) === String(id))
    return ris ? ris.name : String(id).substring(0, 8)
  }

  const getIAName = (id) => {
    if (!id) return 'None'
    const ia = ias.find(i => String(i.id) === String(id))
    return ia ? ia.name : 'None'
  }

  const getFeatureColor = (featureType) => {
    return featureColors[featureType] || featureColors.canal
  }

  const renderHighlightedLayer = () => {
    if (!selectedItem || !selectedItem.geometry) return null
    
    const color = activeSection === 'features' ? getFeatureColor(selectedItem.properties?.feature_type) : '#10B981'
    
    const style = {
      color: color,
      weight: 5,
      opacity: 1,
      fillColor: color,
      fillOpacity: 0.3,
    }

    return <GeoJSON data={selectedItem.geometry} style={style} />
  }

  const onEachFeature = (feature, layer) => {
    layer.on('click', () => handleItemClick(feature))
    layer.on('mouseover', () => {
      layer.setStyle({ weight: 5, opacity: 1 })
    })
    layer.on('mouseout', () => {
      const isSelected = selectedItem && (selectedItem.id === feature.properties?.id || selectedItem.properties?.id === feature.properties?.id)
      layer.setStyle({ weight: isSelected ? 6 : 3, opacity: isSelected ? 1 : 0.8 })
    })
  }

  const onEachIAFeature = (feature, layer) => {
    layer.on('click', () => handleIAItemClick(feature))
    layer.on('mouseover', () => {
      layer.setStyle({ weight: 5, fillOpacity: 0.5 })
    })
    layer.on('mouseout', () => {
      const isSelected = selectedItem && (selectedItem.id === feature.properties?.id || selectedItem.properties?.id === feature.properties?.id)
      layer.setStyle({ weight: isSelected ? 6 : 3, fillOpacity: isSelected ? 0.5 : 0.3 })
    })
  }

  const handleIAItemClick = (feature) => {
    const iaId = feature.properties?.id
    setSelectedItem(feature)
    
    setTimeout(() => {
      const element = document.getElementById(`gis-item-${iaId}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
    
    if (feature.geometry) {
      const coords = feature.geometry.coordinates
      let bounds
      if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        const ring = feature.geometry.type === 'Polygon' ? coords[0] : coords[0][0]
        const lons = ring.map(c => c[0])
        const lats = ring.map(c => c[1])
        bounds = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
      }
      if (bounds) {
        setMapBounds(bounds)
      }
    }
  }

  const MapController = ({ enableDrawing, onFeatureCreated, activeSection }) => {
    const map = useMap()
    const featureGroupRef = useRef(null)
    const drawnItemsRef = useRef(null)

    useEffect(() => {
      if (map) {
        drawnItemsRef.current = new L.FeatureGroup()
        map.addLayer(drawnItemsRef.current)

        if (map.pm && typeof map.pm.setOptIn === 'function') {
          map.pm.setOptIn(true)
        }
        
        if (enableDrawing && map.pm) {
          map.pm.addControls({
            position: 'topleft',
            drawCircle: false,
            drawCircleMarker: false,
            drawPolyline: activeSection === 'features',
            drawPolygon: activeSection === 'ias',
            drawRectangle: false,
            editMode: true,
            removalMode: true,
            snapping: true,
            snapDistance: 20,
          })
          
          map.on('pm:create', (e) => {
            const layer = e.layer
            layer.options.pmIgnore = false
            if (map.pm && typeof map.pm.reInitLayer === 'function') {
              map.pm.reInitLayer(layer)
            }
            const geoJson = layer.toGeoJSON()
            drawnItemsRef.current.addLayer(layer)
            
            if (onFeatureCreated) {
              onFeatureCreated(geoJson.geometry)
            }
          })

          map.on('pm:remove', (e) => {
            const layer = e.layer
            if (drawnItemsRef.current && drawnItemsRef.current.hasLayer(layer)) {
              drawnItemsRef.current.removeLayer(layer)
            }
          })
        }

        return () => {
          if (drawnItemsRef.current) {
            map.removeLayer(drawnItemsRef.current)
          }
          if (map.pm && typeof map.pm.removeControls === 'function') {
            map.pm.removeControls()
          }
        }
      }
    }, [map, enableDrawing, activeSection])

    return null
  }

  const [enableDrawing, setEnableDrawing] = useState(false)

  const handleFeatureCreated = (geometry) => {
    setForm(prev => ({ ...prev, geometry: JSON.stringify(geometry) }))
    setEnableDrawing(false)
  }

  const toggleDrawing = () => {
    setEnableDrawing(!enableDrawing)
    if (!enableDrawing) {
      setSelectedItem(null)
    }
  }

  const handleDeleteNewDrawing = () => {
    setForm(prev => ({ ...prev, geometry: null }))
  }

  if (loading) {
    return <div className="flex justify-center py-8"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>
  }

  const currentItems = activeSection === 'features' ? filteredFeatures : filteredIAs

  const handleSectionChange = (section) => {
    setActiveSection(section)
    setSelectedItem(null)
    setShowNewCard(false)
    setForm({ name: '', code: '', feature_type: 'canal', geometry: null, properties: {}, ris_id: '', ia_id: '' })
    setEnableDrawing(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex border-b border-slate-200">
        <button onClick={() => handleSectionChange('features')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeSection === 'features' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <Map className="w-4 h-4" /> Canal Lines
          <span className="ml-1 px-2 py-0.5 text-xs bg-slate-100 rounded-full">{filteredFeatures.length}</span>
        </button>
        <button onClick={() => handleSectionChange('ias')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeSection === 'ias' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <Folder className="w-4 h-4" /> IA Areas
          <span className="ml-1 px-2 py-0.5 text-xs bg-slate-100 rounded-full">{filteredIAs.length}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-1 bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            {activeSection === 'features' ? (
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="flex-1 px-2 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="">All Types</option>
                {FEATURE_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
              </select>
            ) : null}
            <select
              value={filterRIS}
              onChange={(e) => setFilterRIS(e.target.value)}
              className="flex-1 px-2 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">All RIS</option>
              {risList.map(ris => <option key={ris.id} value={ris.id}>{ris.name}</option>)}
            </select>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-2" id="gis-items-list">
            {currentItems.length === 0 && !showNewCard ? (
              <div className="text-center py-8 text-slate-500 text-sm">No items found</div>
            ) : (
              <div className="space-y-2">
                {currentItems.map((item) => {
                const itemId = item.id || item.properties?.id
                const isSelected = selectedItem?.id === itemId || selectedItem?.properties?.id === itemId
                const isEditing = editingItemId === itemId
                const itemType = item.properties?.feature_type || item.feature_type || 'canal'
                
                return (
                  <div 
                    key={itemId}
                    id={`gis-item-${itemId}`}
                    onClick={() => handleItemClick(item)}
                    className={`cursor-pointer rounded-lg border transition-all duration-200 ${
                      isSelected 
                        ? 'border-primary bg-primary/5 shadow-md' 
                        : 'border-slate-200 bg-white hover:border-primary/50 hover:shadow-sm'
                    }`}
                  >
                    <div className="p-3">
                      {isEditing ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Name</label>
                            <input 
                              type="text" 
                              value={form.name} 
                              onChange={(e) => setForm({ ...form, name: e.target.value })}
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                            />
                          </div>
                          {activeSection === 'ias' && (
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Code</label>
                              <input 
                                type="text" 
                                value={form.code} 
                                onChange={(e) => setForm({ ...form, code: e.target.value })}
                                className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                              />
                            </div>
                          )}
                          {activeSection === 'features' && (
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Type</label>
                              <select 
                                value={form.feature_type} 
                                onChange={(e) => setForm({ ...form, feature_type: e.target.value })}
                                className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                              >
                                {FEATURE_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">RIS</label>
                            <select 
                              value={form.ris_id} 
                              onChange={(e) => setForm({ ...form, ris_id: e.target.value })}
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                            >
                              <option value="">Select RIS</option>
                              {risList.map(ris => <option key={ris.id} value={ris.id}>{ris.name}</option>)}
                            </select>
                          </div>
                          {activeSection === 'features' && (
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">IA</label>
                              <select 
                                value={form.ia_id} 
                                onChange={(e) => setForm({ ...form, ia_id: e.target.value })}
                                className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                              >
                                <option value="">Select IA</option>
                                {ias.map(ia => <option key={ia.id} value={ia.id}>{ia.name}</option>)}
                              </select>
                            </div>
                          )}
                          {enableDrawing && (
                            <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                              Drawing active - click map to draw, double-click to finish
                            </div>
                          )}
                          <div className="flex gap-2 pt-2">
                            <button 
                              onClick={handleSaveEdit}
                              className="flex-1 flex items-center justify-center px-2 py-1 text-xs bg-primary text-white rounded"
                            >
                              <Save className="w-3 h-3 mr-1" /> Save
                            </button>
                            <button 
                              onClick={handleCancelEdit}
                              className="flex-1 flex items-center justify-center px-2 py-1 text-xs border border-slate-300 text-slate-600 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-4 h-4 rounded" 
                                style={{ backgroundColor: activeSection === 'features' ? getFeatureColor(itemType) : '#10B981' }}
                              />
                              <div>
                                <p className="text-sm font-semibold text-slate-800">{item.properties?.name || item.name || itemType}</p>
                                <p className="text-xs text-slate-500 font-mono">{(item.properties?.id || item.id || '-').substring(0, 8)}</p>
                              </div>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-primary' : 'bg-slate-300'}`} />
                          </div>
                          
                          {isSelected && (
                            <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                {activeSection === 'features' && (
                                  <>
                                    <div>
                                      <span className="text-slate-400">Type:</span>
                                      <span className="ml-1 font-medium text-slate-700">{FEATURE_TYPES.find(f => f.value === itemType)?.label || itemType}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">RIS:</span>
                                      <span className="ml-1 font-medium text-slate-700">{getRISName(item.properties?.ris_id)}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">IA:</span>
                                      <span className="ml-1 font-medium text-slate-700">{getIAName(item.properties?.ia_id)}</span>
                                    </div>
                                  </>
                                )}
                                {activeSection === 'ias' && (
                                  <>
                                    <div>
                                      <span className="text-slate-400">Code:</span>
                                      <span className="ml-1 font-medium text-slate-700">{item.code}</span>
                                    </div>
                                    <div className="col-span-2">
                                      <span className="text-slate-400">RIS:</span>
                                      <span className="ml-1 font-medium text-slate-700">{getRISName(item.ris_id || item.properties?.ris_id)}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="flex gap-2 pt-2">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleEdit(item) }}
                                  className="flex-1 flex items-center justify-center px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary-600"
                                >
                                  <FileEdit className="w-3 h-3 mr-1" /> Edit
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDelete(itemId) }}
                                  className="flex-1 flex items-center justify-center px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                                >
                                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              </div>
            )}

            {showNewCard && (
              <div className="rounded-lg border-2 border-dashed border-primary bg-primary/5">
                <div className="p-3 space-y-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Name *</label>
                    <input 
                      type="text" 
                      value={form.name} 
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                      placeholder="Enter name..."
                    />
                  </div>
                  {activeSection === 'ias' && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Code *</label>
                      <input 
                        type="text" 
                        value={form.code} 
                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                        placeholder="Enter code..."
                      />
                    </div>
                  )}
                  {activeSection === 'features' && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Type</label>
                      <select 
                        value={form.feature_type} 
                        onChange={(e) => setForm({ ...form, feature_type: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                      >
                        {FEATURE_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">RIS</label>
                    <select 
                      value={form.ris_id} 
                      onChange={(e) => setForm({ ...form, ris_id: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                    >
                      <option value="">Select RIS</option>
                      {risList.map(ris => <option key={ris.id} value={ris.id}>{ris.name}</option>)}
                    </select>
                  </div>
                  {activeSection === 'features' && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">IA</label>
                      <select 
                        value={form.ia_id} 
                        onChange={(e) => setForm({ ...form, ia_id: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                      >
                        <option value="">Select IA</option>
                        {ias.map(ia => <option key={ia.id} value={ia.id}>{ia.name}</option>)}
                      </select>
                    </div>
                  )}
                  {!form.geometry && (
                    <button 
                      onClick={() => setEnableDrawing(true)}
                      className="w-full flex items-center justify-center px-2 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      <Map className="w-3 h-3 mr-1" /> Draw on Map
                    </button>
                  )}
                  {form.geometry && (
                    <div className="text-xs text-green-600 bg-green-50 p-2 rounded flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      Geometry drawn
                    </div>
                  )}
                  {form.geometry && !enableDrawing && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setEnableDrawing(true)}
                        className="flex-1 flex items-center justify-center px-2 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        <Map className="w-3 h-3 mr-1" /> Redraw
                      </button>
                      <button 
                        onClick={handleDeleteNewDrawing}
                        className="flex-1 flex items-center justify-center px-2 py-1.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Clear
                      </button>
                    </div>
                  )}
                  {enableDrawing && (
                    <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                      Drawing active - click map to draw, double-click to finish
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button 
                      onClick={async () => {
                        if (!form.name) {
                          alert('Name is required')
                          return
                        }
                        if (activeSection === 'ias' && !form.code) {
                          alert('Code is required for IA Areas')
                          return
                        }
                        if (!form.geometry) {
                          alert('Please draw on the map first')
                          return
                        }
                        await handleSubmitNew()
                      }}
                      disabled={!form.geometry}
                      className={`flex-1 flex items-center justify-center px-2 py-1 text-xs rounded ${
                        form.geometry 
                          ? 'bg-primary text-white hover:bg-primary-600' 
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <Save className="w-3 h-3 mr-1" /> Save
                    </button>
                    <button 
                      onClick={() => { setShowNewCard(false); setForm({ name: '', code: '', feature_type: 'canal', geometry: null, properties: {}, ris_id: '', ia_id: '' }); setEnableDrawing(false) }}
                      className="flex-1 flex items-center justify-center px-2 py-1 text-xs border border-slate-300 text-slate-600 rounded hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button onClick={() => { setShowNewCard(true); setForm({ name: '', code: '', feature_type: 'canal', geometry: null, properties: {}, ris_id: '', ia_id: '' }); setEnableDrawing(false) }}
            className="w-full flex items-center justify-center px-4 py-2.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-600 font-medium">
            <Plus className="w-4 h-4 mr-2" /> Add {activeSection === 'features' ? 'Canal Line' : 'IA Area'}
          </button>
        </div>

        <div className="xl:col-span-2 rounded-lg overflow-hidden border border-slate-200 relative" style={{ height: '500px', zIndex: 1 }}>
          <MapContainer 
            center={mapCenter} 
            zoom={defaultZoom} 
            style={{ height: '100%', width: '100%', zIndex: 1 }}
            className="geo-map"
          >
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {mapBounds && <MapBoundsSetter bounds={mapBounds} />}
            <MapController 
              enableDrawing={enableDrawing} 
              onFeatureCreated={handleFeatureCreated}
              activeSection={activeSection}
            />
            {gisFeaturesGeoJSON && activeSection === 'features' && (
              <GeoJSONLayer 
                data={gisFeaturesGeoJSON} 
                colors={featureColors} 
                onEachFeature={onEachFeature}
                highlightedFeature={selectedItem}
                highlightedColor="#FF6B00"
              />
            )}
            {gisFeaturesGeoJSON && activeSection === 'features' && (
              <GeoJSONLabels data={gisFeaturesGeoJSON} colors={featureColors} />
            )}
            {iasGeoJSON && activeSection === 'ias' && (
              <GeoJSONLayer 
                data={iasGeoJSON} 
                colors={{ default: '#10B981' }} 
                onEachFeature={onEachIAFeature}
                highlightedFeature={selectedItem}
                highlightedColor="#FF6B00"
              />
            )}
            {iasGeoJSON && activeSection === 'ias' && (
              <GeoJSONLabels data={iasGeoJSON} colors={{ canal: '#10B981' }} />
            )}
            {renderHighlightedLayer()}
          </MapContainer>
        </div>
      </div>

      {showModal && step === 1 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={handleModalClose}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Step 1: Enter Details</h3>
              <button onClick={handleModalClose} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none" 
                  placeholder="e.g., Main Canal - Section A"
                />
              </div>
              {activeSection === 'ias' && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Code *</label>
                  <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none"
                    placeholder="e.g., IA-001"
                  />
                </div>
              )}
              {activeSection === 'features' && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Feature Type *</label>
                  <select value={form.feature_type} onChange={(e) => setForm({ ...form, feature_type: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none">
                    {FEATURE_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-500 mb-1">River Irrigation System (RIS)</label>
                <select value={form.ris_id} onChange={(e) => setForm({ ...form, ris_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none">
                  <option value="">Select RIS</option>
                  {risList.map(ris => <option key={ris.id} value={ris.id}>{ris.name}</option>)}
                </select>
              </div>
              {activeSection === 'features' && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Irrigator Association</label>
                  <select value={form.ia_id} onChange={(e) => setForm({ ...form, ia_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Select IA (Optional)</option>
                    {ias.map(ia => <option key={ia.id} value={ia.id}>{ia.name}</option>)}
                  </select>
                </div>
              )}
              <button 
                type="button" 
                onClick={handleSubmitStep1}
                className="w-full flex items-center justify-center px-4 py-2.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-600 font-medium"
              >
                <Map className="w-4 h-4 mr-2" />
                Next: Draw on Map
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && step === 2 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={handleModalClose}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()} ref={formRef}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Step 2: Draw {activeSection === 'features' ? 'Canal Line' : 'Area'} on Map</h3>
              <button onClick={handleModalClose} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="bg-slate-50 p-3 rounded-lg mb-4">
              <p className="text-sm font-medium text-slate-700">
                {form.name} {form.code && <span className="text-slate-400">({form.code})</span>}
              </p>
              <p className="text-xs text-slate-500">
                {activeSection === 'features' ? FEATURE_TYPES.find(f => f.value === form.feature_type)?.label : 'IA Area'}
              </p>
            </div>

            <div className="space-y-3">
              {enableDrawing && (
                <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                  Drawing mode active - click on the map to draw points, double-click to finish
                </div>
              )}
              
              {form.geometry && (
                <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 p-2 rounded">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  Geometry drawn - ready to save
                </div>
              )}

              <div className="text-xs text-slate-500">
                <strong>Instructions:</strong> Use the drawing tools in the map to draw your {activeSection === 'features' ? 'canal line' : 'area'}. Click on the map to add points, double-click to finish.
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => { setStep(1); setEnableDrawing(false) }}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-100"
                >
                  Back
                </button>
                <button 
                  type="button" 
                  onClick={handleSubmit}
                  disabled={!form.geometry}
                  className={`flex-1 px-4 py-2 text-sm rounded font-medium ${
                    form.geometry 
                      ? 'bg-primary text-white hover:bg-primary-600' 
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {editingItem ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const apiEndpoints = [
  {
    category: 'Auth',
    items: [
      { method: 'POST', path: '/auth/login', name: 'Login', body: { email: 'admin@nia.gov', password: 'admin123' }, noAuth: true },
      { method: 'POST', path: '/auth/register', name: 'Register', body: { email: 'newuser@test.com', password: 'test123', firstName: 'Test', lastName: 'User', role: 'ia_member' }, noAuth: true },
      { method: 'GET', path: '/auth/test', name: 'Test Auth' },
    ]
  },
  {
    category: 'Users',
    items: [
      { method: 'GET', path: '/users', name: 'Get All Users' },
      { method: 'GET', path: '/users/ias', name: 'Get Irrigator Associations' },
      { method: 'GET', path: '/users/me', name: 'Get Current User' },
      { method: 'GET', path: '/users/:id', name: 'Get User by ID' },
      { method: 'POST', path: '/users', name: 'Create User', body: { email: 'new@test.com', password: 'test123', firstName: 'New', lastName: 'User', role: 'ia_member' } },
      { method: 'PUT', path: '/users/:id', name: 'Update User', body: { firstName: 'Updated' } },
      { method: 'PUT', path: '/users/:id/password', name: 'Reset User Password', body: { password: 'newpass123' } },
      { method: 'DELETE', path: '/users/:id', name: 'Delete User' },
    ]
  },
  {
    category: 'Reports',
    items: [
      { method: 'GET', path: '/reports', name: 'Get All Reports' },
      { method: 'GET', path: '/reports?gis_feature_id=7a74db45-0746-4a05-82f4-6641360feb48', name: 'Get Reports by GIS Feature' },
      { method: 'GET', path: '/reports/:id', name: 'Get Report by ID' },
      { method: 'POST', path: '/reports', name: 'Create Report with GIS Link', body: { category: 'issue', water_level: 'high', silt_level: 'dirty', debris_level: 'blocked', remarks: 'Critical blockage at Buayan Lateral A1 Canal - immediate attention needed', latitude: '6.1575', longitude: '125.2133', gis_feature_id: '7a74db45-0746-4a05-82f4-6641360feb48' } },
      { method: 'PUT', path: '/reports/:id', name: 'Update Report', body: { remarks: 'Updated remarks' } },
      { method: 'DELETE', path: '/reports/:id', name: 'Delete Report' },
    ]
  },
  {
    category: 'Tickets',
    items: [
      { method: 'GET', path: '/tickets', name: 'Get All Tickets' },
      { method: 'GET', path: '/tickets/:id', name: 'Get Ticket by ID' },
      { method: 'POST', path: '/tickets', name: 'Create Ticket', body: { status: 'pending' } },
      { method: 'PUT', path: '/tickets/:id', name: 'Update Ticket', body: { status: 'in_progress' } },
      { method: 'POST', path: '/tickets/:id/comments', name: 'Add Comment', body: { comment: 'Test comment' } },
      { method: 'DELETE', path: '/tickets/:id', name: 'Delete Ticket' },
    ]
  },
  {
    category: 'GIS',
    items: [
      { method: 'GET', path: '/gis/reports', name: 'Get GIS Reports (GeoJSON)' },
      { method: 'GET', path: '/gis/features', name: 'Get GIS Features' },
      { method: 'GET', path: '/gis/ris', name: 'Get RIS List' },
      { method: 'GET', path: '/gis/ris/:id', name: 'Get RIS by ID' },
      { method: 'GET', path: '/gis/ias', name: 'Get IA List' },
      { method: 'GET', path: '/gis/stats', name: 'Get Stats' },
    ]
  },
  {
    category: 'Notifications',
    items: [
      { method: 'GET', path: '/notifications', name: 'Get All Notifications' },
      { method: 'GET', path: '/notifications/unread-count', name: 'Get Unread Count' },
      { method: 'PUT', path: '/notifications/:id/read', name: 'Mark as Read' },
      { method: 'PUT', path: '/notifications/read-all', name: 'Mark All as Read' },
      { method: 'DELETE', path: '/notifications/:id', name: 'Delete Notification' },
    ]
  },
  {
    category: 'Report Presets',
    items: [
      { method: 'GET', path: '/report-presets', name: 'List All Presets (Admin)' },
      { method: 'GET', path: '/report-presets/by-category?category=issue', name: 'Get Presets by Category' },
      { method: 'GET', path: '/report-presets/categories', name: 'List Categories' },
      { method: 'GET', path: '/report-presets/:id', name: 'Get Single Preset' },
      { method: 'POST', path: '/report-presets', name: 'Create Preset', body: { name: 'Test Preset', slug: 'test_preset_2', category: 'issue', water_level: 3, silt_level: 3, debris_level: 3, icon: 'alert-circle' } },
      { method: 'PUT', path: '/report-presets/:id', name: 'Update Preset', body: { name: 'Updated Preset', water_level: 4 } },
      { method: 'DELETE', path: '/report-presets/:id', name: 'Delete Preset' },
    ]
  },
  {
    category: 'GIS Features',
    items: [
      { method: 'GET', path: '/gis/features', name: 'Get All Features' },
      { method: 'GET', path: '/gis/features/:id', name: 'Get Feature by ID' },
      { method: 'POST', path: '/gis/features', name: 'Create Feature', body: { feature_type: 'canal', geometry: { type: 'LineString', coordinates: [[125.0, 6.0], [125.1, 6.1]] }, properties: { name: 'Test Canal' } } },
      { method: 'PUT', path: '/gis/features/:id', name: 'Update Feature', body: { properties: { name: 'Updated' } } },
      { method: 'DELETE', path: '/gis/features/:id', name: 'Delete Feature' },
    ]
  },
  {
    category: 'Irrigator Associations',
    items: [
      { method: 'GET', path: '/gis/ias', name: 'Get All IAs' },
      { method: 'GET', path: '/gis/ias/:id', name: 'Get IA by ID' },
      { method: 'POST', path: '/gis/ias', name: 'Create IA', body: { name: 'Test IA', code: 'IA-001' } },
      { method: 'PUT', path: '/gis/ias/:id', name: 'Update IA', body: { name: 'Updated IA' } },
      { method: 'DELETE', path: '/gis/ias/:id', name: 'Delete IA' },
    ]
  },
]

function BackendUrlSettings() {
  const [backendUrl, setBackendUrl] = useState(() => {
    return localStorage.getItem('irrigis_backend_url')
      || api.getApiBaseUrl()
      || 'http://localhost:3000/api'
  })
  const [isEditing, setIsEditing] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tempUrl, setTempUrl] = useState(backendUrl)

  const handleEditClick = () => {
    setShowWarning(true)
  }

  const handleProceedEdit = () => {
    setShowWarning(false)
    setIsEditing(true)
    setTempUrl(backendUrl)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setShowWarning(false)
    setTempUrl(backendUrl)
  }

  const handleSave = () => {
    if (!tempUrl.trim()) {
      alert('Backend URL cannot be empty')
      return
    }
    
    // Basic URL validation
    try {
      new URL(tempUrl.replace('/api', ''))
    } catch {
      alert('Please enter a valid URL (e.g., https://irrigis-backend.onrender.com/api)')
      return
    }
    
    localStorage.setItem('irrigis_backend_url', tempUrl)
    setBackendUrl(tempUrl)
    setIsEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    
    // Reload page to apply new backend URL
    if (confirm('Backend URL saved. The page needs to reload to apply changes. Reload now?')) {
      window.location.reload()
    }
  }

  const handleReset = () => {
    setTempUrl(api.getApiBaseUrl())
  }

  const handleResetToDefault = () => {
    const defaultUrl = api.getApiBaseUrl()

    if (confirm(`Reset backend URL to default?\n\n${defaultUrl}\n\nThe page will reload to apply changes.`)) {
      localStorage.removeItem('irrigis_backend_url')
      window.location.reload()
    }
  }

  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            Backend API URL
          </h3>
          <p className="text-sm text-slate-500">Configure the backend server endpoint</p>
        </div>
        {!isEditing && (
          <div className="flex gap-2">
            <button
              onClick={handleResetToDefault}
              className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50"
              title="Reset to .env default"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Default
            </button>
            <button
              onClick={handleEditClick}
              className="flex items-center gap-1 px-3 py-2 text-sm text-primary border border-primary rounded hover:bg-primary-50"
            >
              <Edit2 className="w-4 h-4" />
              Edit URL
            </button>
          </div>
        )}
      </div>

      {/* Warning Modal */}
      {showWarning && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-red-800 mb-1">⚠️ Warning: Critical Setting</h4>
              <p className="text-sm text-red-700 mb-3">
                Changing the backend URL will disconnect the app from the current server. 
                If you enter an incorrect URL, the application <strong>will not work</strong>.
              </p>
              <ul className="text-sm text-red-600 list-disc list-inside mb-3 space-y-1">
                <li>Make sure the URL is exactly correct</li>
                <li>Include the full path including <code>/api</code></li>
                <li>For Render: <code>https://irrigis-backend.onrender.com/api</code></li>
                <li>For Local: <code>http://localhost:3000/api</code></li>
              </ul>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowWarning(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleProceedEdit}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
            >
              I Understand, Proceed
            </button>
          </div>
        </div>
      )}

      {/* Edit Form */}
      {isEditing && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong>Double-check the URL before saving.</strong> An incorrect URL will break the application.
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Backend API URL
            </label>
            <input
              type="text"
              value={tempUrl}
              onChange={(e) => setTempUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary outline-none font-mono"
              placeholder="https://irrigis-backend.onrender.com/api"
            />
            <p className="text-xs text-slate-500 mt-1">
              Must include protocol (http:// or https://) and /api suffix
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className={`flex items-center gap-1 px-4 py-2 text-sm rounded ${
                saved ? 'bg-green-500 text-white' : 'bg-primary text-white hover:bg-primary-600'
              }`}
            >
              {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Saved!' : 'Save & Apply'}
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded hover:bg-slate-50"
            >
              Reset to Local
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Display Current URL (non-editing mode) */}
      {!isEditing && !showWarning && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Current Backend URL</p>
              <code className="text-sm font-mono text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">
                {backendUrl}
              </code>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Status</p>
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                Active
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            This URL is persisted in localStorage and will be used for all API requests.
            {(() => {
              const defaultUrl = import.meta.env.VITE_API_URL
              return defaultUrl && (
                <span className="block mt-1 text-slate-300">
                  .env default: {defaultUrl}
                </span>
              )
            })()}
          </p>
        </div>
      )}
    </div>
  )
}

function OfflineDataManager() {
  const { isOnline } = useOffline()
  const [cacheSize, setCacheSize] = useState('Unknown')
  const [clearing, setClearing] = useState(false)
  const [lastCleared, setLastCleared] = useState(() => {
    return localStorage.getItem('irrigis_cache_last_cleared') || null
  })

  useEffect(() => {
    // Estimate cache size
    const estimateCacheSize = async () => {
      try {
        const db = await indexedDB.open('IrriGIS_API_Cache', 1)
        db.onsuccess = (event) => {
          const database = event.target.result
          if (database.objectStoreNames.contains('api_cache')) {
            const transaction = database.transaction(['api_cache'], 'readonly')
            const store = transaction.objectStore('api_cache')
            const countRequest = store.count()
            countRequest.onsuccess = () => {
              setCacheSize(`${countRequest.result} cached requests`)
              database.close()
            }
          } else {
            setCacheSize('Empty')
            database.close()
          }
        }
        db.onerror = () => setCacheSize('Unknown')
      } catch {
        setCacheSize('Unknown')
      }
    }
    estimateCacheSize()
    
    // Refresh cache size every 10 seconds
    const interval = setInterval(estimateCacheSize, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleClearCache = async () => {
    setClearing(true)
    try {
      await clearAPICache()
      const now = new Date().toLocaleString()
      localStorage.setItem('irrigis_cache_last_cleared', now)
      setLastCleared(now)
      setCacheSize('Empty')
      alert('Cache cleared successfully')
    } catch (error) {
      alert('Failed to clear cache: ' + error.message)
    } finally {
      setClearing(false)
    }
  }

  const handlePrefetchData = async () => {
    try {
      const endpoints = [
        { key: 'gis_features', endpoint: '/gis/features' },
        { key: 'gis_reports', endpoint: '/gis/reports' },
        { key: 'users_list', endpoint: '/users' },
        { key: 'ias_list', endpoint: '/gis/ias' },
        { key: 'ris_list', endpoint: '/gis/ris' },
      ]
      let successCount = 0
      for (const { endpoint } of endpoints) {
        try {
          await api.request(endpoint)
          successCount++
        } catch (error) {
          console.error('[Offline] Failed to prefetch ' + endpoint + ':', error)
        }
      }
      alert('Data preloaded successfully! (' + successCount + '/' + endpoints.length + ' cached)')
    } catch (error) {
      alert('Failed to preload data: ' + error.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className={`p-4 rounded-xl border ${isOnline ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center gap-3">
          {isOnline ? <Wifi className="w-8 h-8 text-green-600" /> : <WifiOff className="w-8 h-8 text-gray-500" />}
          <div>
            <h4 className={`font-semibold ${isOnline ? 'text-green-800' : 'text-gray-700'}`}>
              {isOnline ? 'Connected to Network' : 'Offline Mode'}
            </h4>
            <p className="text-sm text-slate-500">
              {isOnline ? 'Data is being synchronized with the server' : 'Using cached data. Some features may be limited.'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h4 className="font-semibold text-slate-700 mb-4">Cache Statistics</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 p-3 rounded-lg">
            <p className="text-xs text-slate-500 uppercase">Cached Data</p>
            <p className="text-lg font-semibold text-slate-700">{cacheSize}</p>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg">
            <p className="text-xs text-slate-500 uppercase">Last Cleared</p>
            <p className="text-lg font-semibold text-slate-700">{lastCleared ? new Date(lastCleared).toLocaleDateString() : 'Never'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h4 className="font-semibold text-slate-700 mb-4">Actions</h4>
        <div className="flex flex-wrap gap-3">
          <button onClick={handlePrefetchData} disabled={!isOnline} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed">
            <Database className="w-4 h-4" />
            Prefetch Data for Offline
          </button>
          <button onClick={handleClearCache} disabled={clearing} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
            <Trash2 className="w-4 h-4" />
            {clearing ? 'Clearing...' : 'Clear Cache'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Prefetching data downloads the latest information for offline use. Clear cache removes all stored offline data.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="font-semibold text-blue-800 mb-2">How Offline Mode Works</h4>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li>GET requests are automatically cached for offline access</li>
          <li>When offline, cached data is served instead of live data</li>
          <li>Changes made while offline will need to be synced when back online</li>
          <li>Use "Prefetch Data" to ensure you have the latest data before going offline</li>
        </ul>
      </div>
    </div>
  )
}

function ApiTester() {
  const [expanded, setExpanded] = useState({})
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState({})
  const [customBody, setCustomBody] = useState({})
  const [paramValues, setParamValues] = useState({})
  
  // Get backend URL from localStorage or fallback
  const getBackendUrl = () => {
    if (window.isElectron) {
      return localStorage.getItem('irrigis_backend_url') || import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
    }
    return import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
  }
  
  const [backendUrl, setBackendUrl] = useState(getBackendUrl())

  const toggleExpand = (category) => {
    setExpanded(prev => ({ ...prev, [category]: !prev[category] }))
  }

  const testEndpoint = async (endpoint) => {
    const key = `${endpoint.method}-${endpoint.path}`
    setLoading(prev => ({ ...prev, [key]: true }))

    try {
      let path = endpoint.path
      let body = null
      const method = endpoint.method

      if (endpoint.path.includes(':id') || endpoint.path.includes(':sub_status_id')) {
        path = path.replace(/:sub_status_id/, paramValues[`${key}-sub_status_id`] || '')
        path = path.replace(/:id/, paramValues[key] || '')
      }

      if ((method === 'POST' || method === 'PUT') && endpoint.body) {
        body = customBody[key] || endpoint.body
      }

      const headers = {
        'Content-Type': 'application/json',
      }
      
      if (!endpoint.noAuth) {
        headers['Authorization'] = `Bearer ${localStorage.getItem('token')}`
      }

      const options = {
        method,
        headers
      }
      if (body) options.body = JSON.stringify(body)

      const res = await fetch(`${backendUrl}${path}`, options)
      let data
      const contentType = res.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        data = await res.json()
      } else {
        data = await res.text()
      }

      setResults(prev => ({ ...prev, [key]: { ok: res.ok, status: res.status, ...data } }))
    } catch (error) {
      setResults(prev => ({ ...prev, [key]: { success: false, message: error.message } }))
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const methodColors = {
    GET: 'bg-blue-100 text-blue-700 border-blue-200',
    POST: 'bg-green-100 text-green-700 border-green-200',
    PUT: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    DELETE: 'bg-red-100 text-red-700 border-red-200',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-700">API Testing Console</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Testing against: <code className="font-mono bg-slate-100 px-1 rounded">{backendUrl}</code>
          </p>
        </div>
        <button
          onClick={() => { setResults({}); setCustomBody({}); setParamValues({}) }}
          className="flex items-center px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Clear
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {apiEndpoints.map((category) => (
          <div key={category.category} className="border-b border-slate-200 last:border-b-0">
            <button
              onClick={() => toggleExpand(category.category)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <span className="font-medium text-slate-700">{category.category}</span>
              {expanded[category.category] ? (
                <ChevronDown className="w-5 h-5 text-slate-500" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-500" />
              )}
            </button>

            {expanded[category.category] && (
              <div className="divide-y divide-slate-100">
                {category.items.map((endpoint) => {
                  const key = `${endpoint.method}-${endpoint.path}`
                  const hasParam = endpoint.path.includes(':id') || endpoint.path.includes(':sub_status_id')
                  const hasBody = !!endpoint.body

                  return (
                    <div key={key} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`px-2 py-1 text-xs font-medium rounded border ${methodColors[endpoint.method]}`}>
                          {endpoint.method}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <code className="text-sm text-slate-600 font-mono">/api{endpoint.path}</code>
                          </div>

                          {hasParam && (
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="ID value"
                                value={paramValues[key] || ''}
                                onChange={(e) => setParamValues(prev => ({ ...prev, [key]: e.target.value }))}
                                className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                              />
                            </div>
                          )}

                          {hasBody && (
                            <div className="mt-2">
                              <textarea
                                placeholder="Request body (JSON)"
                                value={customBody[key] ? JSON.stringify(customBody[key], null, 2) : JSON.stringify(endpoint.body, null, 2)}
                                onChange={(e) => {
                                  try {
                                    setCustomBody(prev => ({ ...prev, [key]: JSON.parse(e.target.value) }))
                                  } catch {}
                                }}
                                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                rows={3}
                              />
                            </div>
                          )}

                          <button
                            onClick={() => testEndpoint(endpoint)}
                            disabled={loading[key]}
                            className={`mt-2 flex items-center px-3 py-1.5 text-sm rounded ${
                              loading[key] ? 'bg-slate-100 text-slate-400' : 'bg-primary text-white hover:bg-primary-600'
                            }`}
                          >
                            {loading[key] ? (
                              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4 mr-1" />
                            )}
                            Test
                          </button>

                          {results[key] && (
                            <pre className="mt-3 p-3 bg-slate-900 text-slate-100 rounded-lg text-xs overflow-x-auto max-h-48">
                              {JSON.stringify(results[key], null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('personalization')
  const [subStatusExpanded, setSubStatusExpanded] = useState(true)
  const [presetsExpanded, setPresetsExpanded] = useState(true)
  const [ticketGroupingExpanded, setTicketGroupingExpanded] = useState(true)

  const tabs = [
    { id: 'personalization', label: 'Personalization', icon: Palette },
    { id: 'report', label: 'Report Settings', icon: FileText },
    { id: 'gis', label: 'GIS Map', icon: Map },
    { id: 'users', label: 'User Settings', icon: Users },
    { id: 'api', label: 'API Testing', icon: Send },
    { id: 'offline', label: 'Offline Data', icon: Database },
  ]

  const getTitle = () => {
    switch(activeTab) {
      case 'personalization': return 'Personalization'
      case 'report': return 'Report Settings'
      case 'gis': return 'GIS Map'
      case 'users': return 'User Settings'
      case 'api': return 'API Testing'
      case 'offline': return 'Offline Data'
      default: return 'Settings'
    }
  }

  const getDescription = () => {
    switch(activeTab) {
      case 'personalization': return 'Customize colors and display options'
      case 'report': return 'Manage ticket sub-statuses and report presets'
      case 'gis': return 'Manage canal lines and irrigator association areas'
      case 'users': return 'Configure default settings for new user accounts'
      case 'api': return 'Test API endpoints'
      case 'offline': return 'Manage offline data and caching'
      default: return 'Manage system settings'
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{getTitle()}</h2>
        <p className="text-sm text-slate-500 mt-1">{getDescription()}</p>
      </div>

      <div className="border-b border-slate-200">
        <nav className="flex space-x-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        {activeTab === 'personalization' && (
          <div className="space-y-8">
            <ColorPersonalizationSettings />
            <div className="border-t border-slate-200 pt-8">
              <ReportDisplaySettings />
            </div>
          </div>
        )}

        {activeTab === 'report' && (
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setSubStatusExpanded(!subStatusExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="font-semibold text-slate-700">Ticket Sub-Statuses</span>
                {subStatusExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </button>
              {subStatusExpanded && (
                <div className="p-4">
                  <SubStatusManager />
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setPresetsExpanded(!presetsExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="font-semibold text-slate-700">Report Presets</span>
                {presetsExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </button>
              {presetsExpanded && (
                <div className="p-4">
                  <ReportPresetsManager />
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setTicketGroupingExpanded(!ticketGroupingExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="font-semibold text-slate-700">Ticket Grouping</span>
                {ticketGroupingExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </button>
              {ticketGroupingExpanded && (
                <div className="p-4">
                  <TicketGroupingSettings />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'gis' && <GISSsettings />}
        {activeTab === 'users' && <UserSettings />}
        {activeTab === 'api' && (
          <div className="space-y-6">
            <BackendUrlSettings />
            <ApiTester />
          </div>
        )}
        {activeTab === 'offline' && <OfflineDataManager />}
      </div>
    </div>
  )
}
