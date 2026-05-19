//src/pages/Tickets.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Search, MapPin, Droplets, Clock,
  CheckCircle, AlertCircle, ArrowRight, Send,
  Calendar, User, Hash, Tag, ChevronLeft,
  ChevronRight as ChevronRightIcon, SortAsc, SortDesc, Image as ImageIcon,
  ClipboardCheck, Wrench, Sparkles, AlertTriangle, HelpCircle,
  Eye, XCircle, Mountain, Box, Link2, FolderOpen, Anchor,
  Check, Pencil, X
} from 'lucide-react'
import api from '../services/api'

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const categoryConfig = {
  inspection: { color: '#3B82F6', bgClass: 'bg-blue-100 text-blue-700', label: 'Inspection', icon: ClipboardCheck },
  maintenance: { color: '#F59E0B', bgClass: 'bg-amber-100 text-amber-700', label: 'Maintenance', icon: Wrench },
  cleaning: { color: '#06B6D4', bgClass: 'bg-cyan-100 text-cyan-700', label: 'Cleaning', icon: Sparkles },
  issue: { color: '#EF4444', bgClass: 'bg-red-100 text-red-700', label: 'Issue', icon: AlertTriangle },
  other: { color: '#6B7280', bgClass: 'bg-slate-100 text-slate-700', label: 'Other', icon: HelpCircle },
}

const DEFAULT_COLORS = {
  main_canal: '#2563EB', lateral: '#7C3AED', farm_ditch: '#06B6D4',
  pipeline: '#F59E0B', canal: '#74A5A8', other: '#6B7280'
}

function getFeatureColors() {
  try {
    const saved = localStorage.getItem('mapFeatureColors')
    return saved ? { ...DEFAULT_COLORS, ...JSON.parse(saved) } : DEFAULT_COLORS
  } catch { return DEFAULT_COLORS }
}

function GeoJSONLayer({ data }) {
  const map = useMap()
  const layerRef = useRef(null)
  useEffect(() => {
    if (!data || !map || layerRef.current) return
    const colors = getFeatureColors()
    const layer = L.geoJSON(data, {
      style: (f) => {
        const type = f.properties?.feature_type
        return { color: colors[type] || colors.canal, weight: type === 'main_canal' ? 6 : type === 'lateral' ? 5 : type === 'farm_ditch' ? 2 : 4, opacity: 0.85 }
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties) {
          const p = feature.properties
          let html = `<strong>GIS Feature</strong><br>`
          if (p.name) html += `Name: ${p.name}<br>`
          if (p.feature_type) html += `Type: ${p.feature_type}<br>`
          if (p.remarks) html += `Remarks: ${p.remarks}<br>`
          layer.bindPopup(html)
          layer.on('mouseover', () => layer.setStyle({ weight: 8, opacity: 1 }))
          layer.on('mouseout', () => { const t = feature.properties?.feature_type; layer.setStyle({ weight: t === 'main_canal' ? 6 : t === 'lateral' ? 5 : t === 'farm_ditch' ? 2 : 4, opacity: 0.85 }) })
        }
      }
    }).addTo(map)
    layerRef.current = layer
    return () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null } }
  }, [data, map])
  return null
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  in_progress: 'bg-red-100 text-red-700 border-red-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  closed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}
const statusLabels = { pending: 'Pending', in_progress: 'In Progress', rejected: 'Rejected', closed: 'Closed' }
const statusIcons = { pending: AlertCircle, in_progress: Clock, rejected: XCircle, closed: CheckCircle }

const levelToNumber = (level) => {
  if (typeof level === 'number') return Math.min(Math.max(level, 1), 5)
  const waterLevels    = { dry: 1, low: 2, normal: 3, high: 4, overflow: 5 }
  const siltLevels     = { clean: 1, light: 2, dirty: 4, heavily_silted: 5 }
  const debrisLevels   = { clear: 1, light: 2, heavy: 4, blocked: 5 }
  if (waterLevels[level] !== undefined)   return waterLevels[level]
  if (siltLevels[level] !== undefined)    return siltLevels[level]
  if (debrisLevels[level] !== undefined)  return debrisLevels[level]
  return 3
}
const LEVEL_DESCRIPTIONS = {
  water: { 1: 'No water', 2: 'Minimal water', 3: 'Adequate water', 4: 'Above normal', 5: 'Flooding' },
  silt: { 1: 'No silt · Clean', 2: 'Light silt', 4: 'Heavy silt', 5: 'Fully silted' },
  debris: { 1: 'No obstruction · Clear', 2: 'Minor debris', 4: 'Heavy debris', 5: 'Fully blocked' },
}
const getLevelDesc = (type, level) => {
  const num = typeof level === 'number' ? level : levelToNumber(level)
  return LEVEL_DESCRIPTIONS[type]?.[num] || 'Moderate silt'
}
const levelColorClasses = { 1: 'bg-green-100 text-green-700', 2: 'bg-lime-100 text-lime-700', 3: 'bg-yellow-100 text-yellow-700', 4: 'bg-orange-100 text-orange-700', 5: 'bg-red-100 text-red-700' }

const calculateUrgency = (w, s, d) => {
  const wv = levelToNumber(w), sv = levelToNumber(s), dv = levelToNumber(d)

  // 1. Immediate Critical
  if (wv === 1 || wv === 5 || sv === 5 || dv === 5) {
    return { label: 'Critical', color: 'text-red-600 bg-red-50 border border-red-100', order: 1 }
  }

  // 2. Moderate — Water 2 & 4, Silt 4, Debris 4
  if (dv === 4 || sv === 4 || wv === 4 || wv === 2) {
    return { label: 'Moderate', color: 'text-amber-600 bg-amber-50 border border-amber-100', order: 2 }
  }

  // 3. Low — everything else (Water 3, Silt 1-3, Debris 1-3)
  return { label: 'Low', color: 'text-green-600 bg-green-50 border border-green-100', order: 3 }
}

const getImageUrl = (img) => {
  if (!img) return ''
  let url = img.imageUrl || img.image_url || ''
  if (url && url.startsWith('/uploads/')) {
    const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : window.location.origin
    return `${baseUrl}${url}`
  }
  return url
}

function createCategoryMarkerIcon(category) {
  const cat = categoryConfig[category] || categoryConfig.other
  return L.divIcon({
    className: 'custom-category-marker',
    html: `<div style="background:${cat.color};width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.4);border:2px solid white;"><div style="transform:rotate(45deg);"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
      category === 'inspection' ? '<path d="M9 5H2v7l6.29 6.29a1 1 0 0 0 1.42 0l4.59-4.59a1 1 0 0 0 0-1.42L9 5z"/><circle cx="12" cy="12" r="3"/>' :
      category === 'maintenance' ? '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' :
      category === 'cleaning' ? '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h1"/><path d="M3 12h1"/><path d="M3 18h1"/>' :
      category === 'issue' ? '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' :
      '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
    }</svg></div></div>`,
    iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -36]
  })
}

function createTicketFlagIcon(status = 'pending') {
  let color = '#F59E0B' // Yellow for pending tickets
  if (status === 'closed') {
    color = '#10B981' // Green for closed tickets
  } else if (status === 'in_progress') {
    color = '#EF4444' // Red for in_progress tickets
  }
  
  return L.divIcon({
    className: 'custom-ticket-flag-marker',
    html: `<div style="position: relative; display: flex; align-items: center; justify-content: center;">
      <div style="position: relative; z-index: 1; filter: drop-shadow(0 3px 8px rgba(0,0,0,0.4));">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
          <line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
      </div>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  })
}

function MiniMap({ coordinates, gisFeatures, category, status, height = 'h-48' }) {
  if (!coordinates || !coordinates.length) {
    return (
      <div className={`${height} bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200`}>
        <div className="text-center text-slate-400"><MapPin className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">No location data</p></div>
      </div>
    )
  }
  const [lng, lat] = coordinates
  const cat = categoryConfig[category] || categoryConfig.other
  const useFlagIcon = status !== undefined
  return (
    <div className={`${height} rounded-lg overflow-hidden border border-slate-200`}>
      <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {gisFeatures && <GeoJSONLayer data={gisFeatures} />}
        <Marker position={[lat, lng]} icon={useFlagIcon ? createTicketFlagIcon(status) : createCategoryMarkerIcon(category)}>
          <Popup>
            <div className="text-sm">
              <p className="font-medium">Report Location</p>
              <p className="text-slate-500 text-xs">Lat: {lat?.toFixed(6)}, Lng: {lng?.toFixed(6)}</p>
              {category && <p className="mt-1"><span style={{ color: cat.color, fontWeight: 600 }}>{cat.label}</span></p>}
              {status && <p className="mt-1"><span className="font-semibold">Status: {statusLabels[status] || status}</span></p>}
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  )
}

function ImageGalleryModal({ images, initialIndex = 0, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  if (!images || images.length === 0) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[90vh] w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"><X className="w-5 h-5" /></button>
        <div className="relative bg-black rounded-lg overflow-hidden">
          <img src={getImageUrl(images[currentIndex])} alt={images[currentIndex].caption || `Image ${currentIndex + 1}`} className="w-full h-[60vh] object-contain" onError={(e) => { e.target.style.display = 'none' }} />
          {images[currentIndex].caption && <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4"><p className="text-white text-sm">{images[currentIndex].caption}</p></div>}
        </div>
        {images.length > 1 && <>
          <button onClick={() => setCurrentIndex(p => p > 0 ? p - 1 : images.length - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70"><ChevronLeft className="w-5 h-5" /></button>
          <button onClick={() => setCurrentIndex(p => p < images.length - 1 ? p + 1 : 0)} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70"><ChevronRightIcon className="w-5 h-5" /></button>
          <div className="flex gap-2 mt-3 overflow-x-auto pb-2">{images.map((img, idx) => <button key={idx} onClick={() => setCurrentIndex(idx)} className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${idx === currentIndex ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'}`}><img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" /></button>)}</div>
          <div className="text-center mt-2 text-sm text-slate-500">{currentIndex + 1} / {images.length}</div>
        </>}
      </div>
    </div>
  )
}

function renderLevelBadge(level, label, type = 'water') {
  const n = levelToNumber(level)
  return (
    <div className="flex flex-col items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
      <span className="text-xs text-slate-500 mb-1">{label}</span>
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${levelColorClasses[n]}`}>{getLevelDesc(type, n)}</span>
      <span className="text-lg font-bold text-slate-700 mt-1">{n}/5</span>
    </div>
  )
}

// Rewritten SingleTicketCard strictly following the requested layout design
function SingleTicketCard({ report, ticket, showGroupBadge }) {
  const images = report.ReportImages || report.images || []
  const primaryImage = images.find(i => i.isPrimary) || images[0]
  const waterLevel = levelToNumber(report.water_level)
  const siltLevel = levelToNumber(report.silt_level)
  const debrisLevel = levelToNumber(report.debris_level)
  const urgency = calculateUrgency(report.water_level, report.silt_level, report.debris_level)
  const loc = report.location_name || report.IrrigatorAssociation?.name || ''
  const coords = report.location?.coordinates
  let displayLocation = loc || (coords?.length === 2 ? `Lat: ${coords[1]?.toFixed(4)}, Lng: ${coords[0]?.toFixed(4)}` : 'Unknown Location')
  const submitter = report.User
    ? `${report.User.first_name || report.User.firstName || ''} ${report.User.last_name || report.User.lastName || ''}`.trim() || 'Unknown'
    : 'Unknown'
  const dateSubmitted = (report.createdAt || report.created_at)
    ? new Date(report.createdAt || report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'N/A'
  const StatusIcon = statusIcons[ticket.status] || AlertCircle
  const cat = categoryConfig[report.category] || categoryConfig.other

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative transition-shadow hover:shadow-md">
      <div className="flex flex-col sm:flex-row">
        {/* Left Side Image Panel */}
        <div className="relative w-full sm:w-48 h-48 sm:h-auto flex-shrink-0 bg-slate-100">
          {primaryImage ? (
             <img src={getImageUrl(primaryImage)} alt="Report" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <ImageIcon className="w-8 h-8" />
            </div>
          )}
          {/* Bottom color stripe accent on the image */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5" style={{ backgroundColor: cat.color }} />
        </div>

        {/* Right Side Content Panel */}
        <div className="flex-1 p-5 flex flex-col min-w-0">
          
          {/* Header Row: Location, Submitter on Left | Badges on Right */}
          <div className="flex justify-between items-start gap-4 mb-5">
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                <h3 className="text-base font-bold text-slate-800 truncate">{displayLocation}</h3>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{dateSubmitted}</span>
                <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{submitter}</span>
              </div>
            </div>

            {/* Structured Metadata Badges Array */}
            <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Status</span>
                <span className={`inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-semibold ${statusColors[ticket.status]}`}>
                  <StatusIcon className="w-3.5 h-3.5" />{statusLabels[ticket.status]}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Category</span>
                <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: cat.color + '15', color: cat.color }}>
                  {cat.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Urgency</span>
                <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold ${urgency.color}`}>
                  {urgency.label}
                </span>
              </div>
              {showGroupBadge && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Reports</span>
                  <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-sm">
                    <Link2 className="w-3.5 h-3.5" />{ticket.reports.length} grouped
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Condition Ratings */}
          <div className="flex items-center gap-4 mb-4">
            <span className="text-xs font-medium text-slate-500">Condition:</span>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 border border-blue-100">
                <Droplets className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-semibold text-blue-600">{getLevelDesc('water', waterLevel)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-100">
                <Mountain className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-600">{getLevelDesc('silt', siltLevel)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-50 border border-red-100">
                <Box className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-600">{getLevelDesc('debris', debrisLevel)}</span>
              </div>
            </div>
          </div>

          {/* Remarks Box */}
          {report.remarks && (
            <div className="mb-4 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
              <p className="text-sm text-slate-600 line-clamp-2">{report.remarks}</p>
            </div>
          )}

          {/* Bottom Action Link */}
          <div className="mt-auto flex justify-end pt-2">
            <span className="text-sm font-semibold text-[#4E8B8B] flex items-center gap-1.5 transition-all group-hover:gap-2">
              View Details <Eye className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Updated TicketCard creating a custom stacked/clustered visual array shifted to the bottom-right
function TicketCard({ ticket, onClick }) {
  const reports = ticket.reports || []
  const anchorReportId = ticket.anchorReportId
  
  // Find the anchor report (origin) - fall back to first report if no anchor
  const anchorReport = anchorReportId 
    ? reports.find(r => r.id === anchorReportId) || reports[0]
    : reports[0]

  const hasMultiple = reports.length > 1;

  return (
    <div className="relative cursor-pointer mb-10 group" onClick={onClick}>
      
      {/* Visual Cluster Card 2 (Bottom-most layer, shifted right and down) */}
      {hasMultiple && reports.length > 2 && (
        <div className="absolute top-4 left-4 right-[-16px] bottom-[-16px] rounded-2xl border border-slate-200/70 bg-white shadow-sm flex overflow-hidden z-10 transition-transform duration-300">
          <div className="w-full sm:w-48 flex-shrink-0 bg-slate-100/50 relative border-r border-slate-100">
            <div className="absolute bottom-0 left-0 right-0 h-1.5" style={{ backgroundColor: categoryConfig[anchorReport.category]?.color || '#94a3b8', opacity: 0.4 }} />
          </div>
          <div className="flex-1 bg-gradient-to-br from-white to-slate-50/50" />
        </div>
      )}

      {/* Visual Cluster Card 1 (Middle layer, partially shifted right and down) */}
      {hasMultiple && (
        <div className="absolute top-2 left-2 right-[-8px] bottom-[-8px] rounded-2xl border border-slate-200/90 bg-white shadow-md flex overflow-hidden z-20 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0.5">
          <div className="w-full sm:w-48 flex-shrink-0 bg-slate-100 relative border-r border-slate-100">
            <div className="absolute bottom-0 left-0 right-0 h-1.5" style={{ backgroundColor: categoryConfig[anchorReport.category]?.color || '#94a3b8', opacity: 0.8 }} />
          </div>
          {/* Added a subtle shadow outline of the view details for added depth */}
          <div className="flex-1 flex flex-col justify-end p-5 bg-white">
            <div className="flex justify-end opacity-30 pointer-events-none">
              <span className="text-sm font-semibold text-[#4E8B8B] flex items-center gap-1.5">
                View Details <Eye className="w-4 h-4" />
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Primary Top Card - Renders perfectly over the stack container */}
      <div className="relative z-30 transition-transform duration-300 group-hover:-translate-y-1 group-hover:-translate-x-1">
        <SingleTicketCard report={anchorReport} ticket={ticket} showGroupBadge={hasMultiple} />
      </div>

    </div>
  )
}

function ReportCarouselSlide({ report, gisFeatures, onImageClick, onNavigate, reportNumber, totalReports, onPrev, onNext, canPrev, canNext, anchorReportId, ticketStatus }) {
  const isAnchor = anchorReportId && report.id === anchorReportId
  const images = report.ReportImages || report.images || []
  const primaryImage = images.find(img => img.isPrimary) || images[0]
  const waterLevel = levelToNumber(report.water_level)
  const siltLevel = levelToNumber(report.silt_level)
  const debrisLevel = levelToNumber(report.debris_level)
  const coords = report.location?.coordinates
  let displayLocation = report.location_name || report.IrrigatorAssociation?.name || 'Unknown Location'
  if (!displayLocation && coords?.length === 2) { const [lng, lat] = coords; displayLocation = `Lat: ${lat?.toFixed(4)}, Lng: ${lng?.toFixed(4)}` }
  const reportId = report.id?.slice(0, 8) || '—'
  const submitter = report.User ? `${report.User.first_name || report.User.firstName || ''} ${report.User.last_name || report.User.lastName || ''}`.trim() : 'Unknown'
  const dateSubmitted = (report.createdAt || report.created_at) ? new Date(report.createdAt || report.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'N/A'
  const cat = categoryConfig[report.category] || categoryConfig.other

  return (
    <div className="flex items-stretch">
      <button onClick={onPrev} disabled={!canPrev || totalReports <= 1}
        className={`w-10 flex-shrink-0 flex items-center justify-center border-r border-slate-200 transition-colors ${(!canPrev || totalReports <= 1) ? 'text-slate-200 cursor-default' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
        <ChevronLeft className="w-6 h-6" />
      </button>

      <div className="flex-1 p-4 space-y-4 min-w-0">
        {/* Row 1 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded">Report #{reportNumber}{totalReports > 1 ? `/${totalReports}` : ''}</span>
            {isAnchor && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                <Anchor className="w-3 h-3" />Origin
              </span>
            )}
            <span className="text-xs text-slate-400 font-mono">{reportId}</span>
          </div>
          <button onClick={() => onNavigate && onNavigate('/reports', { state: { selectedReportId: report.id } })}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/10 px-2.5 py-1 rounded-lg transition-colors">
            <Pencil className="w-3.5 h-3.5" />edit
          </button>
        </div>

        {/* Row 2: info left | big image right */}
        <div className="flex gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <div className="min-w-0">
                <p className="text-xs text-slate-500 flex items-center gap-1 mb-0.5"><MapPin className="w-3 h-3" />Location</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{displayLocation}</p>
                {coords?.length === 2 && <p className="text-xs text-slate-400">{coords[1]?.toFixed(4)}, {coords[0]?.toFixed(4)}</p>}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 flex items-center gap-1 mb-0.5"><User className="w-3 h-3" />Submitter</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{submitter}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 flex items-center gap-1 mb-0.5"><Calendar className="w-3 h-3" />Date</p>
                <p className="text-sm font-semibold text-slate-800">{dateSubmitted}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 flex items-center gap-1 mb-0.5"><Tag className="w-3 h-3" />Category</p>
                <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold" style={{ backgroundColor: cat.color + '20', color: cat.color }}>{cat.label}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 flex flex-col items-center gap-1 py-3 bg-blue-50 rounded-lg border border-blue-100">
                <Droplets className="w-5 h-5 text-blue-400" /><span className="text-xs font-medium text-blue-600">Water</span>
                <span className="text-2xl font-bold text-blue-800 leading-none">{waterLevel}</span><span className="text-xs text-blue-400">/5</span>
              </div>
              <div className="flex-1 flex flex-col items-center gap-1 py-3 bg-amber-50 rounded-lg border border-amber-100">
                <Mountain className="w-5 h-5 text-amber-500" /><span className="text-xs font-medium text-amber-600">Silt</span>
                <span className="text-2xl font-bold text-amber-800 leading-none">{siltLevel}</span><span className="text-xs text-amber-400">/5</span>
              </div>
              <div className="flex-1 flex flex-col items-center gap-1 py-3 bg-red-50 rounded-lg border border-red-100">
                <Box className="w-5 h-5 text-red-400" /><span className="text-xs font-medium text-red-600">Debris</span>
                <span className="text-2xl font-bold text-red-800 leading-none">{debrisLevel}</span><span className="text-xs text-red-400">/5</span>
              </div>
            </div>
            {report.remarks && <p className="text-sm text-slate-600 italic bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 line-clamp-2">{report.remarks}</p>}
          </div>
          {/* Big square image */}
          <div className="w-56 h-56 flex-shrink-0 rounded-xl overflow-hidden bg-slate-100 cursor-pointer group relative border border-slate-200 shadow-sm"
            onClick={() => images.length > 0 && onImageClick(images, 0)}>
            {primaryImage ? (
              <>
                <img src={getImageUrl(primaryImage)} alt="Report" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { e.target.style.display = 'none' }} />
                {images.length > 1 && <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full flex items-center gap-1"><ImageIcon className="w-3 h-3" />{images.length}</div>}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2"><Eye className="w-5 h-5 text-white" /></div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-2"><ImageIcon className="w-14 h-14" /><span className="text-sm">No images</span></div>
            )}
          </div>
        </div>

        {/* Row 3: Wide map */}
        <MiniMap coordinates={coords} gisFeatures={gisFeatures} category={report.category} status={ticketStatus} height="h-56" />
      </div>

      <button onClick={onNext} disabled={!canNext || totalReports <= 1}
        className={`w-10 flex-shrink-0 flex items-center justify-center border-l border-slate-200 transition-colors ${(!canNext || totalReports <= 1) ? 'text-slate-200 cursor-default' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
        <ChevronRightIcon className="w-6 h-6" />
      </button>
    </div>
  )
}

// ─── Teal color used throughout the stepper & timeline ───
const TEAL = '#4E8B8B'

function WorkflowStepper({ status }) {
  const steps = [
    { key: 'pending', label: 'Pending', icon: AlertCircle },
    { key: 'in_progress', label: 'In Progress', icon: Clock },
    { key: 'closed', label: 'Closed', icon: CheckCircle },
  ]
  if (status === 'rejected') {
    return (
      <div className="flex justify-center py-4">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg ring-4 ring-red-200"><XCircle className="w-8 h-8" /></div>
          <p className="text-sm font-bold mt-3 text-red-600 bg-red-50 px-4 py-1.5 rounded-full">Rejected / Invalid</p>
        </div>
      </div>
    )
  }
  const order = { pending: 0, in_progress: 1, closed: 2 }
  const cur = order[status] ?? 0
  return (
    <div className="relative py-2 px-2">
      {/* Track */}
      <div className="absolute top-[2.35rem] left-[3.5rem] right-[3.5rem] h-[3px] bg-slate-200 rounded-full" />
      {/* Progress fill — amber */}
      <div className="absolute top-[2.35rem] left-[3.5rem] h-[3px] rounded-full transition-all duration-700"
        style={{ width: cur === 0 ? '0%' : cur === 1 ? '50%' : '100%', maxWidth: 'calc(100% - 7rem)', backgroundColor: '#F59E0B' }} />
      <div className="relative flex justify-between items-start">
        {steps.map((step, idx) => {
          const done = idx < cur
          const active = idx === cur
          const Icon = step.icon
          return (
            <div key={step.key} className="flex flex-col items-center" style={{ width: '33.33%' }}>
              <div className={`rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                done ? 'w-14 h-14 text-white border-transparent shadow-md'
                : active ? 'w-16 h-16 bg-white border-[#4E8B8B] text-[#4E8B8B] ring-4 ring-[#4E8B8B]/20 shadow-lg'
                : 'w-11 h-11 bg-white border-slate-300 text-slate-400'
              }`} style={done ? { backgroundColor: TEAL, borderColor: TEAL } : {}}>
                <Icon className={active ? 'w-7 h-7' : done ? 'w-6 h-6' : 'w-5 h-5'} />
              </div>
              <p className={`text-sm font-semibold mt-2 ${active ? 'text-[#4E8B8B]' : done ? 'text-slate-700' : 'text-slate-400'}`}>{step.label}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SubStatusSection({ ticket, subStatuses, onAddSubStatus, updating, newStepSubStatus, setNewStepSubStatus }) {
  const [showForm, setShowForm] = useState(false)
  const [comment, setComment] = useState('')
  const [search, setSearch] = useState('')

  const handleSave = () => {
    if (onAddSubStatus) {
      onAddSubStatus(comment)
      setComment(''); setSearch(''); setNewStepSubStatus(''); setShowForm(false)
    }
  }

  const filtered = (subStatuses || []).filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="mt-6">
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Clock className="w-4 h-4 text-amber-500" />
        </div>
        <span className="text-base font-bold text-amber-600">Sub-Status Progress</span>
      </div>

      {/* Timeline */}
      <div className="relative ml-4">
        {/* Vertical amber line — extends full height */}
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-amber-200 rounded-full" />

        <div className="pl-7 space-y-3">
          {/* Entries */}
          {ticket.workflowSteps && ticket.workflowSteps.length > 0 ? (
            ticket.workflowSteps.map((step, i) => {
              const stepColor = step.color || subStatuses.find(s => s.id === step.sub_status_id)?.color || '#6B7280'
              return (
                <div key={i} className="relative">
                  <div className="absolute -left-[1.5rem] top-3.5 w-4 h-4 rounded-full border-2 bg-white" style={{ borderColor: stepColor }} />
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4" style={{ borderLeftWidth: '3px', borderLeftColor: stepColor }}>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-sm font-semibold" style={{ color: stepColor }}>{step.sub_status_name || 'Acknowledged'}</span>
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {new Date(step.created_at).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    {step.comment && <p className="text-sm text-slate-500 leading-relaxed">{step.comment}</p>}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="relative">
              <div className="absolute -left-[1.5rem] top-2 w-4 h-4 rounded-full border-2 bg-white border-slate-300" />
              <p className="text-sm text-slate-400 italic py-1 pb-3">No substatus entries yet.</p>
            </div>
          )}

          {/* Add step — only in_progress */}
          {ticket.status === 'in_progress' && (
            <div className="relative pt-1">
              <div className={`absolute -left-[1.5rem] top-4 w-4 h-4 rounded-full border-2 bg-white transition-colors ${showForm ? 'border-[#4E8B8B]' : 'border-dashed border-slate-400'}`} />

              {!showForm ? (
                <button onClick={() => setShowForm(true)}
                  className="flex items-center gap-2.5 text-sm font-semibold text-[#4E8B8B] hover:text-[#3a6b6b] py-2 px-1 rounded-lg hover:bg-[#4E8B8B]/5 transition-colors">
                  <span className="w-6 h-6 rounded-full bg-[#4E8B8B] text-white flex items-center justify-center text-base leading-none font-bold">+</span>
                  Add Workflow Step
                </button>
              ) : (
                /* Inline form — matching the screenshot style */
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-5 mt-2">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-base font-semibold text-slate-800">New Progress Entry</span>
                    <button onClick={() => { setShowForm(false); setComment(''); setSearch(''); setNewStepSubStatus('') }}
                      className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>

                  {/* Sub-Status */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-600 mb-2">Sub-Status</label>
                    {/* Search */}
                    <div className="relative mb-2.5">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="text" placeholder="Search sub-status..." value={search} onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#4E8B8B]/30 focus:border-[#4E8B8B]/50 transition-all" />
                    </div>
                    {/* 4-column pill grid */}
                    <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto">
                      {filtered.map((sub) => (
                        <button key={sub.id} onClick={() => setNewStepSubStatus(sub.id)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                            newStepSubStatus === sub.id
                              ? 'border-[#4E8B8B] bg-[#4E8B8B]/10 text-[#4E8B8B] font-semibold'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}>
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: sub.color }} />
                          <span className="truncate text-xs font-medium">{sub.name}</span>
                        </button>
                      ))}
                      {filtered.length === 0 && <p className="col-span-4 text-sm text-slate-400 italic py-1">No sub-statuses found</p>}
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="mb-5">
                    <label className="block text-sm font-medium text-slate-600 mb-2">Progress Notes</label>
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                      placeholder="Describe actions taken, progress made, or issues encountered..."
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none resize-none focus:ring-2 focus:ring-[#4E8B8B]/30 focus:border-[#4E8B8B]/50 transition-all"
                      rows={3} />
                  </div>

                  <div className="flex justify-end gap-3">
                    <button onClick={() => { setShowForm(false); setComment(''); setSearch(''); setNewStepSubStatus('') }}
                      className="px-5 py-2.5 text-slate-600 bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleSave} disabled={updating}
                      className="px-6 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2 shadow-md transition-all"
                      style={{ backgroundColor: TEAL }}>
                      {updating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                      Save Step
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TicketExpandedView({ ticket, gisFeatures, onBack, onAcknowledge, onReject, onClose, onReopen, onAddSubStatus, updating, navigate, newStepSubStatus, setNewStepSubStatus, subStatuses }) {
  const reports = ticket.reports || []
  const [currentReportIndex, setCurrentReportIndex] = useState(0)
  const [imageModal, setImageModal] = useState(null)
  const currentReport = reports[currentReportIndex] || {}
  const StatusIcon = statusIcons[ticket.status] || AlertCircle

  const goPrev = () => { if (currentReportIndex > 0) setCurrentReportIndex(p => p - 1) }
  const goNext = () => { if (currentReportIndex < reports.length - 1) setCurrentReportIndex(p => p + 1) }

  if (!ticket || reports.length === 0) {
    return <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4"><p className="text-slate-500">No reports found</p></div>
  }

  return (
    <div className="space-y-3">
      {imageModal && <ImageGalleryModal images={imageModal.images} initialIndex={imageModal.index} onClose={() => setImageModal(null)} />}

      {/* TOP CARD */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"><ChevronLeft className="w-4 h-4 text-slate-600" /></button>
            <div className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold text-slate-800">Ticket:</span>
              <span className="text-sm font-mono text-slate-600">#{ticket.id?.slice(0, 8)}</span>
              {reports.length > 1 && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded ml-1">{reports.length} reports</span>}
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColors[ticket.status]}`}>
            <StatusIcon className="w-3 h-3" />{statusLabels[ticket.status]}
          </span>
        </div>
        <ReportCarouselSlide
          report={currentReport} gisFeatures={gisFeatures}
          onImageClick={(imgs, idx) => setImageModal({ images: imgs, index: idx })}
          onNavigate={(path, state) => navigate && navigate(path, state)}
          reportNumber={currentReportIndex + 1} totalReports={reports.length}
          onPrev={goPrev} onNext={goNext}
          canPrev={currentReportIndex > 0} canNext={currentReportIndex < reports.length - 1}
          anchorReportId={ticket.anchorReportId}
          ticketStatus={ticket.status}
        />
      </div>

      {/* BOTTOM CARD: Workflow */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-5">

        {/* Status pill + action button */}
        <div className="flex items-center justify-between mb-5">
          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${statusColors[ticket.status]}`}>
            <StatusIcon className="w-4 h-4" />{statusLabels[ticket.status]}
          </span>

          {ticket.status === 'pending' && (
            <button onClick={() => onAcknowledge && onAcknowledge(ticket.id)} disabled={updating}
              className="px-5 py-2.5 text-sm font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-amber-500/25 transition-all">
              <Check className="w-4 h-4" />Acknowledge
            </button>
          )}
          {ticket.status === 'in_progress' && (
            <button onClick={() => onClose && onClose(ticket.id)} disabled={updating}
              className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all">
              <CheckCircle className="w-4 h-4" />Close Ticket
            </button>
          )}
          {ticket.status === 'closed' && (
            <button onClick={() => onReopen && onReopen(ticket.id)} disabled={updating}
              className="px-5 py-2.5 text-sm font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-xl hover:bg-amber-200 disabled:opacity-50 flex items-center gap-2 transition-all">
              <Clock className="w-4 h-4" />Reopen
            </button>
          )}
        </div>

        {/* Progress stepper */}
        <WorkflowStepper status={ticket.status} />

        {/* Sub-status timeline + form */}
        <SubStatusSection
          ticket={ticket}
          subStatuses={subStatuses}
          onAddSubStatus={onAddSubStatus}
          updating={updating}
          newStepSubStatus={newStepSubStatus}
          setNewStepSubStatus={setNewStepSubStatus}
        />
      </div>
    </div>
  )
}

export default function Tickets() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [gisFeatures, setGisFeatures] = useState(null)
  const [subStatuses, setSubStatuses] = useState([])
  const [updating, setUpdating] = useState(false)
  const [newStepSubStatus, setNewStepSubStatus] = useState('')
  const [newStepComment, setNewStepComment] = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const [showAckModal, setShowAckModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null)
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterUrgency, setFilterUrgency] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')

  useEffect(() => { fetchTickets(); fetchGISFeatures(); fetchSubStatuses() }, [])

  const handleOpenTicketFromNavigation = useCallback(async (ticketId) => {
    try { const r = await api.getTicket(ticketId); if (r.success) setSelectedTicket(formatTicketData(r.data)) }
    catch (e) { console.error(e) }
  }, [])

  useEffect(() => {
    const id = location.state?.selectedTicketId
    if (!loading && id) { handleOpenTicketFromNavigation(id); window.history.replaceState({}, document.title) }
  }, [loading, location.state, handleOpenTicketFromNavigation])

  const fetchTickets = async () => {
    try {
      const r = await api.getTickets({ limit: 200 })
      if (r.success && r.data) setTickets((r.data.tickets || r.data).map(t => ({ ...t, reports: t.Reports || t.reports || t.data?.Reports || t.data?.reports || [] })))
    } catch (e) { console.error(e); setTickets([]) }
    finally { setLoading(false) }
  }

  const fetchGISFeatures = async () => {
    try {
      const r = await api.getGISFeatures()
      let f = null
      if (r?.features) f = { type: 'FeatureCollection', features: r.features }
      else if (r?.data?.features) f = r.data
      else if (r?.data?.type === 'FeatureCollection') f = r.data
      setGisFeatures(f)
    } catch (e) { console.error(e) }
  }

  const fetchSubStatuses = async () => {
    try {
      const r = await api.getTicketSubStatuses()
      if (r.success && r.data) setSubStatuses(r.data.filter(s => s.is_active !== false))
    } catch (e) { console.error(e) }
  }

  const formatTicketData = (t) => {
    const reports = t.Reports || t.reports || t.data?.Reports || t.data?.reports || []
    const anchorReportId = t.report_id || null
    return {
      id: t.id, status: t.status || 'pending',
      subStatusId: t.sub_status_id || t.subStatusId,
      subStatus: t.subStatus || null,
      workflowSteps: t.workflow_steps || t.workflowSteps || [],
      acknowledgedAt: t.acknowledged_at || t.acknowledgedAt,
      resolvedAt: t.resolved_at || t.resolvedAt,
      anchorReportId: anchorReportId,
      reports,
    }
  }

  const handleStatusUpdate = async (ticketId, newStatus, subStatusId = null) => {
    setUpdating(true)
    try {
      const data = { status: newStatus }
      if (newStatus === 'in_progress' && subStatusId) data.sub_status_id = subStatusId
      else if (newStatus !== 'in_progress') data.sub_status_id = null
      if (selectedTicket?.status === 'pending' && newStatus === 'in_progress') {
        const subStatusObj = subStatuses.find(s => s.id === (subStatusId || subStatuses[0]?.id))
        data.workflow_steps = [{
          sub_status_id: subStatusId || subStatuses[0]?.id || null,
          sub_status_name: subStatusObj?.name || 'Acknowledged',
          color: subStatusObj?.color || '#f2ff00',
          comment: newStepComment || 'Ticket acknowledged and work initiated',
          created_at: new Date().toISOString(),
        }]
        setNewStepComment('')
      }
      await api.updateTicket(ticketId, data)
      await fetchTickets()
      if (selectedTicket) {
        const u = await api.getTicket(ticketId)
        if (u.success) setSelectedTicket(formatTicketData(u.data))
      }
    } catch (e) { console.error(e) }
    finally { setUpdating(false) }
  }

  const handleAcknowledgeClick = (ticketId) => {
    setPendingStatusUpdate({ ticketId, status: 'in_progress', subStatusId: subStatuses[0]?.id || null })
    setShowAckModal(true)
  }
  const confirmAcknowledgment = async () => {
    if (pendingStatusUpdate) { await handleStatusUpdate(pendingStatusUpdate.ticketId, pendingStatusUpdate.status, pendingStatusUpdate.subStatusId); setShowAckModal(false); setPendingStatusUpdate(null) }
  }
  const handleCloseTicket = async () => { await handleStatusUpdate(selectedTicket.id, 'closed', null) }
  const handleRejectTicket = async () => {
    if (!rejectReason.trim()) return
    setUpdating(true)
    try {
      const reports = selectedTicket.reports || []
      if (reports.length > 0) await api.updateReport(reports[0].id, { is_valid: false, invalid_reason: rejectReason })
      await api.updateTicket(selectedTicket.id, { status: 'rejected' })
      setShowRejectModal(false); setRejectReason('')
      const u = await api.getTicket(selectedTicket.id)
      if (u.success) setSelectedTicket(formatTicketData(u.data))
      await fetchTickets()
    } catch (e) { console.error(e) }
    finally { setUpdating(false) }
  }

  const handleAddWorkflowStep = async (comment) => {
    if (!comment?.trim() && !newStepSubStatus) return
    let sub = subStatuses.find(s => s.id === newStepSubStatus) || subStatuses.find(s => s.is_active !== false) || subStatuses[0] || { id: null, name: 'In Progress', color: '#6C757D' }
    const newStep = { sub_status_id: sub.id, sub_status_name: sub.name || 'In Progress', color: sub.color || '#6C757D', comment: comment?.trim() || '', created_at: new Date().toISOString() }
    const steps = [...(selectedTicket.workflowSteps || []), newStep]
    try {
      setUpdating(true)
      await api.updateTicket(selectedTicket.id, { sub_status_id: sub.id, workflow_steps: steps })
      const u = await api.getTicket(selectedTicket.id)
      if (u.success) setSelectedTicket(formatTicketData(u.data))
      setAddingStep(false); setNewStepSubStatus('')
    } catch (e) { console.error(e) }
    finally { setUpdating(false) }
  }

  const filteredTickets = tickets
    .filter(ticket => {
      const r = ticket.reports?.[0] || {}
      const loc = r.location_name || r.IrrigatorAssociation?.name || ''
      const urg = calculateUrgency(r.water_level, r.silt_level, r.debris_level)
      return (filterStatus === 'All' || ticket.status === filterStatus) &&
        (filterUrgency === 'All' || urg.label === filterUrgency) &&
        (!searchTerm || ticket.id?.toLowerCase().includes(searchTerm.toLowerCase()) || loc.toLowerCase().includes(searchTerm.toLowerCase()) || (r.remarks && r.remarks.toLowerCase().includes(searchTerm.toLowerCase())))
    })
    .sort((a, b) => {
      const dA = new Date(a.created_at || a.createdAt || 0), dB = new Date(b.created_at || b.createdAt || 0)
      const rA = a.reports?.[0] || {}, rB = b.reports?.[0] || {}
      const uA = calculateUrgency(rA.water_level, rA.silt_level, rA.debris_level).order
      const uB = calculateUrgency(rB.water_level, rB.silt_level, rB.debris_level).order
      if (sortBy === 'date') return sortOrder === 'desc' ? dB - dA : dA - dB
      if (sortBy === 'urgency') return sortOrder === 'desc' ? uA - uB : uB - uA
      if (sortBy === 'status') { const so = { pending: 1, in_progress: 2, rejected: 3, closed: 4 }; return sortOrder === 'desc' ? (so[b.status] || 0) - (so[a.status] || 0) : (so[a.status] || 0) - (so[b.status] || 0) }
      return 0
    })

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by location, ID, or remarks..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none">
          <option value="All">All Status</option><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="rejected">Rejected</option><option value="closed">Closed</option>
        </select>
        <select value={filterUrgency} onChange={(e) => setFilterUrgency(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none">
          <option value="All">All Urgency</option><option value="Critical">Critical</option><option value="Moderate">Moderate</option><option value="Low">Low</option>
        </select>
        <div className="flex items-center gap-2">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none">
            <option value="date">Sort by Date</option><option value="urgency">Sort by Urgency</option><option value="status">Sort by Status</option>
          </select>
          <button onClick={() => setSortOrder(p => p === 'desc' ? 'asc' : 'desc')} className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50">
            {sortOrder === 'desc' ? <SortDesc className="w-4 h-4 text-slate-600" /> : <SortAsc className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
        <div className="text-sm text-slate-500 ml-auto">{filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}</div>
      </div>

      {!selectedTicket ? (
        filteredTickets.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No tickets found</p><p className="text-sm text-slate-400 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {filteredTickets.map(t => <TicketCard key={t.id} ticket={t} onClick={() => { const r = t; api.getTicket(r.id).then(res => { if (res.success) setSelectedTicket(formatTicketData(res.data)) }).catch(console.error) }} />)}
          </div>
        )
      ) : (
        <TicketExpandedView
          ticket={selectedTicket} gisFeatures={gisFeatures}
          onBack={() => setSelectedTicket(null)}
          onAcknowledge={handleAcknowledgeClick}
          onReject={() => setShowRejectModal(true)}
          onClose={handleCloseTicket}
          onReopen={(id) => handleStatusUpdate(id, 'in_progress')}
          onAddSubStatus={handleAddWorkflowStep}
          updating={updating} navigate={navigate}
          addingStep={addingStep} newStepComment={newStepComment} setNewStepComment={setNewStepComment}
          newStepSubStatus={newStepSubStatus} setNewStepSubStatus={setNewStepSubStatus}
          subStatuses={subStatuses}
        />
      )}

      {/* Acknowledge Modal */}
      {showAckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAckModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-amber-50 p-5 border-b border-amber-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center"><AlertCircle className="w-5 h-5 text-amber-600" /></div>
                <div><h3 className="text-lg font-semibold text-slate-800">Certify & Acknowledge Ticket</h3><p className="text-xs text-slate-600">Confirmation required to proceed</p></div>
              </div>
            </div>
            <div className="p-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
                <p className="text-sm text-amber-900 mb-3">By clicking <strong>"Certify & Acknowledge"</strong>, you confirm that:</p>
                <ul className="text-sm text-amber-800 space-y-1.5">
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />The information in this report/s is <strong>correct and accurate</strong></li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />The report meets <strong>proper standards</strong> and is valid for processing</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />You take <strong>responsibility</strong> for this acknowledgment</li>
                </ul>
                <p className="text-sm text-amber-700 mt-4 pt-3 border-t border-amber-200">Once acknowledged, this ticket will move to <span className="font-semibold">In Progress</span> status and cannot be reverted to Pending.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowAckModal(false)} className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={confirmAcknowledgment} disabled={updating} className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {updating ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Check className="w-4 h-4" />Certify & Acknowledge</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRejectModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-red-50 p-5 border-b border-red-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><XCircle className="w-5 h-5 text-red-600" /></div>
                <div><h3 className="text-lg font-semibold text-slate-800">Reject / Mark as Invalid</h3><p className="text-xs text-slate-600">This report appears to be invalid or spam</p></div>
              </div>
            </div>
            <div className="p-5">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-red-800 mb-2"><strong>Reason for rejection:</strong></p>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g., spam, incorrect location, duplicate report, false information..."
                  className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:ring-2 focus:ring-red-300 outline-none resize-none" rows={3} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowRejectModal(false); setRejectReason('') }} className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleRejectTicket} disabled={!rejectReason.trim() || updating} className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {updating ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><XCircle className="w-4 h-4" />Reject Report</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}