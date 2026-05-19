import { useState, useEffect, useCallback } from 'react'
import { FileText, Clock, Users, RefreshCw, MapPin, ChevronRight, X } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

// GenSan barangays list for matching
const GENSAN_BARANGAYS = [
  'Apopong', 'Dadiangas North', 'Olympog', 'Baluan', 'Dadiangas South', 'San Isidro',
  'Batomelong', 'Dadiangas West', 'San Jose', 'Buayan', 'Fatima', 'Siguel', 'Bawing',
  'Bula', 'Katangawan', 'Sinawal', 'Calumpang', 'Labangal', 'Tambler', 'City Heights',
  'Lagao', 'Tinagacan', 'Conel', 'Ligaya', 'Upper Labay', 'Dadiangas East', 'Mabuhay'
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    inProgressTickets: 0,
    totalReports: 0,
    avgResolutionDays: 0,
    activeCrews: 0
  })
  const [loading, setLoading] = useState(true)
  const [reportsData, setReportsData] = useState([])
  const [issuesData, setIssuesData] = useState([])
  const [updatingBarangays, setUpdatingBarangays] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [updateProgress, setUpdateProgress] = useState({ current: 0, total: 0 })
  const [todayReports, setTodayReports] = useState([])
  const [todayTickets, setTodayTickets] = useState([])
  const [canalLineReportData, setCanalLineReportData] = useState([])
  const [canalLineTicketData, setCanalLineTicketData] = useState([])
  const [categoryDistributionData, setCategoryDistributionData] = useState([])
  const [selectedCanalLineId, setSelectedCanalLineId] = useState(null)
  const [allReports, setAllReports] = useState([])

  const getBarangayCache = () => {
    try {
      const cached = localStorage.getItem('barangayCache')
      return cached ? JSON.parse(cached) : {}
    } catch {
      return {}
    }
  }

  const setBarangayCache = (cache) => {
    try {
      localStorage.setItem('barangayCache', JSON.stringify(cache))
      localStorage.setItem('barangayCacheTimestamp', new Date().toISOString())
    } catch (e) {
      console.error('Failed to save barangay cache:', e)
    }
  }

  useEffect(() => {
    fetchStats()
    fetchChartData()
    fetchTodayData()
    const timestamp = localStorage.getItem('barangayCacheTimestamp')
    if (timestamp) {
      setLastUpdated(new Date(timestamp))
    }
  }, [])

  const fetchStats = async () => {
    try {
      const [ticketsRes, reportsRes, usersRes] = await Promise.all([
        api.getTickets({ limit: 500 }),
        api.getReports({ limit: 500 }),
        api.getUsers()
      ])

      let tickets = []
      let reports = []
      let users = []

      if (ticketsRes.success) {
        tickets = ticketsRes.data?.tickets || ticketsRes.data || []
      }
      if (reportsRes.success) {
        reports = reportsRes.data?.reports || reportsRes.data || []
      }
      if (usersRes.success) {
        users = usersRes.data || []
      }

      const inProgressTickets = tickets.filter(t => t.status === 'in_progress').length
      const totalReports = reports.length

      let avgResolutionDays = 0
      const resolvedTickets = tickets.filter(t => t.status === 'closed' && t.acknowledged_at && t.created_at)
      if (resolvedTickets.length > 0) {
        const totalResolutionTime = resolvedTickets.reduce((sum, t) => {
          const created = new Date(t.created_at)
          const acknowledged = new Date(t.acknowledged_at)
          const diffTime = acknowledged - created
          const diffDays = diffTime / (1000 * 60 * 60 * 24)
          return sum + diffDays
        }, 0)
        avgResolutionDays = (totalResolutionTime / resolvedTickets.length).toFixed(1)
      }

      const activeCrews = users.filter(u => {
        const isActive = u.is_active !== false
        const role = u.role || ''
        return isActive && ['nia_field_officer', 'ia_member', 'ia_admin'].includes(role)
      }).length

      setStats({ inProgressTickets, totalReports, avgResolutionDays, activeCrews })
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch feature details for a single GIS feature by ID
  const fetchFeatureDetails = async (gisFeatureId) => {
    try {
      const res = await api.getGISFeatureById(gisFeatureId)
      if (res && res.success && res.data) {
        const name = res.data.properties?.name || null
        // getGISFeatureById returns feature_type at top level of data
        const featureType = res.data.feature_type || res.data.properties?.feature_type || null
        console.log(`  -> Feature ${gisFeatureId}: name="${name}", type="${featureType}"`)
        return { name, featureType }
      }
    } catch (e) {
      console.error(`  -> Failed to fetch feature ${gisFeatureId}:`, e.message)
    }
    return null
  }

  // Fetch feature details in parallel for missing features
  const fetchMissingFeatureDetails = async (missingIds) => {
    const details = {}
    const results = await Promise.allSettled(
      missingIds.map(id => fetchFeatureDetails(id))
    )
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        details[missingIds[idx]] = result.value
      }
    })
    return details
  }

  // Get feature_type from a feature object, checking multiple locations
  const getFeatureType = (feature) => {
    return feature?.feature_type || feature?.properties?.feature_type || 'unknown'
  }

  // Get name from a feature object
  const getFeatureName = (feature) => {
    return feature?.properties?.name || null
  }

  const fetchChartData = async () => {
    try {
      const [reportsRes, featuresRes] = await Promise.all([
        api.getReports({ limit: 500 }),
        api.getGISFeatures()
      ])

      let reports = []
      let features = []

      // Parse reports
      if (reportsRes.success && reportsRes.data) {
        reports = reportsRes.data?.reports || reportsRes.data || []
      } else if (Array.isArray(reportsRes)) {
        reports = reportsRes
      }

      // Parse GIS features
      // /gis/features returns raw GeoJSON: { type: 'FeatureCollection', features: [...] }
      // or possibly wrapped: { success, data: [...] }
      console.log('featuresRes keys:', featuresRes ? Object.keys(featuresRes).join(', ') : 'null')
      console.log('featuresRes.type:', featuresRes?.type)

      if (featuresRes && featuresRes.type === 'FeatureCollection' && Array.isArray(featuresRes.features)) {
        features = featuresRes.features
      } else if (featuresRes && featuresRes.success && featuresRes.data) {
        features = featuresRes.data.features || (Array.isArray(featuresRes.data) ? featuresRes.data : [])
      } else if (Array.isArray(featuresRes)) {
        features = featuresRes
      } else if (featuresRes && featuresRes.features) {
        features = featuresRes.features
      }

      console.log('Parsed features count:', features.length)
      if (features.length > 0) {
        console.log('First feature:', JSON.stringify(features[0]).substring(0, 300))
      }

      // Build feature map
      const featureMap = {}
      features.forEach(f => {
        featureMap[f.id] = f
      })
      console.log('FeatureMap entries:', Object.keys(featureMap).length)

      // Collect unique gisFeatureIds from reports
      const reportGisIds = new Set()
      reports.forEach(r => {
        const gid = r.gis_feature_id || r.gisFeatureId
        if (gid && gid !== 'null') reportGisIds.add(gid)
      })
      console.log('Unique GIS IDs in reports:', reportGisIds.size, [...reportGisIds].slice(0, 5))

      // Find which report GIS IDs are NOT in the featureMap
      const missingFromMap = [...reportGisIds].filter(id => !featureMap[id])
      console.log('GIS IDs missing from featureMap:', missingFromMap.length, missingFromMap)

      // Fetch details for missing features individually
      if (missingFromMap.length > 0) {
        console.log('Fetching details for', missingFromMap.length, 'missing features...')
        const fetchedDetails = await fetchMissingFeatureDetails(missingFromMap)
        Object.entries(fetchedDetails).forEach(([id, detail]) => {
          if (!featureMap[id]) {
            // Store feature_type in BOTH top-level and properties for consistency
            featureMap[id] = {
              id,
              properties: { name: detail.name, feature_type: detail.featureType },
              feature_type: detail.featureType
            }
          } else {
            if (!featureMap[id].properties) featureMap[id].properties = {}
            if (!featureMap[id].properties.name && detail.name) {
              featureMap[id].properties.name = detail.name
            }
            if (!featureMap[id].properties.feature_type && detail.featureType) {
              featureMap[id].properties.feature_type = detail.featureType
            }
            if (!featureMap[id].feature_type && detail.featureType) {
              featureMap[id].feature_type = detail.featureType
            }
          }
          console.log(`  Updated featureMap[${id}]: name=${detail.name}, type=${detail.featureType}`)
        })
      }

      setAllReports(reports)

      const monthlyData = processMonthlyData(reports)
      setReportsData(monthlyData)

      const barangayData = processBarangayData(reports, getBarangayCache())
      setIssuesData(barangayData)

      await processCanalLineReportData(reports, featureMap)
      await processCanalLineTicketData(reports, featureMap)
      processCategoryDistribution(reports)
    } catch (error) {
      console.error('Failed to fetch reports or GIS features:', error)
    }
  }

  const processCanalLineReportData = async (reports, featureMap) => {
    if (!Array.isArray(reports)) return

    const canalReportCounts = {}

    reports.forEach(report => {
      const gisFeatureId = report.gis_feature_id || report.gisFeatureId
      if (gisFeatureId && gisFeatureId !== 'null') {
        if (!canalReportCounts[gisFeatureId]) {
          const feature = featureMap[gisFeatureId]
          canalReportCounts[gisFeatureId] = {
            id: gisFeatureId,
            count: 0,
            name: getFeatureName(feature),
            featureType: getFeatureType(feature)
          }
        }
        canalReportCounts[gisFeatureId].count++
      }
    })

    // Fetch details for any features still missing name/type
    const entries = Object.values(canalReportCounts)
    const missingDetails = entries.filter(item => !item.name || item.featureType === 'unknown')
    if (missingDetails.length > 0) {
      console.log(`Fetching details for ${missingDetails.length} report features with missing data...`)
      const namePromises = missingDetails.map(item =>
        fetchFeatureDetails(item.id).then(detail => {
          if (detail) {
            if (detail.name) item.name = detail.name
            if (detail.featureType) item.featureType = detail.featureType
            console.log(`Resolved report feature ${item.id}: name="${detail.name}", type="${detail.featureType}"`)
          }
        })
      )
      await Promise.allSettled(namePromises)
    }

    const sorted = entries
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(item => ({
        canalLine: `${item.name || item.id.substring(0, 8)} (${item.featureType || ''})`.replace(/\s*\(\s*\)/g, '').trim(),
        count: item.count,
        featureType: item.featureType,
        gisFeatureId: item.id
      }))

    console.log('Top canal lines by report count:', sorted.map(d => ({ name: d.canalLine, count: d.count, id: d.gisFeatureId })))
    setCanalLineReportData(sorted)
  }

  const processCanalLineTicketData = async (reports, featureMap) => {
    if (!Array.isArray(reports)) return

    const canalTicketCounts = {}

    reports.forEach(report => {
      if (!report.ticket_id && !report.ticketId) return

      const gisFeatureId = report.gis_feature_id || report.gisFeatureId
      if (gisFeatureId && gisFeatureId !== 'null') {
        if (!canalTicketCounts[gisFeatureId]) {
          const feature = featureMap[gisFeatureId]
          canalTicketCounts[gisFeatureId] = {
            id: gisFeatureId,
            count: 0,
            name: getFeatureName(feature),
            featureType: getFeatureType(feature)
          }
        }
        canalTicketCounts[gisFeatureId].count++
      }
    })

    // Fetch details for any features still missing name/type
    const entries = Object.values(canalTicketCounts)
    const missingDetails = entries.filter(item => !item.name || item.featureType === 'unknown')
    if (missingDetails.length > 0) {
      console.log(`Fetching details for ${missingDetails.length} ticket features with missing data...`)
      const namePromises = missingDetails.map(item =>
        fetchFeatureDetails(item.id).then(detail => {
          if (detail) {
            if (detail.name) item.name = detail.name
            if (detail.featureType) item.featureType = detail.featureType
            console.log(`Resolved ticket feature ${item.id}: name="${detail.name}", type="${detail.featureType}"`)
          }
        })
      )
      await Promise.allSettled(namePromises)
    }

    const sorted = entries
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(item => ({
        canalLine: `${item.name || item.id.substring(0, 8)} (${item.featureType || ''})`.replace(/\s*\(\s*\)/g, '').trim(),
        count: item.count,
        featureType: item.featureType,
        gisFeatureId: item.id
      }))

    console.log('Top canal lines by ticket count:', sorted.map(d => ({ name: d.canalLine, count: d.count, id: d.gisFeatureId })))
    setCanalLineTicketData(sorted)
  }

  const processCategoryDistribution = (reports, filterGisFeatureId = null) => {
    if (!Array.isArray(reports)) return

    const categoryCounts = {}
    const excludedCategories = ['issue']

    reports.forEach(report => {
      if (filterGisFeatureId) {
        const reportGisFeatureId = report.gis_feature_id || report.gisFeatureId
        if (reportGisFeatureId !== filterGisFeatureId) return
      }

      const cat = report.category
      if (cat && !excludedCategories.includes(cat)) {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
      }
    })

    const data = Object.entries(categoryCounts).map(([category, count]) => ({
      name: category.charAt(0).toUpperCase() + category.slice(1),
      value: count
    }))

    setCategoryDistributionData(data)
    console.log('Category distribution (excl. issue), filter:', filterGisFeatureId, data)
  }

  const handleCanalLineClick = (data, index) => {
    const clickedGisFeatureId = data.gisFeatureId
    console.log('Canal line clicked:', clickedGisFeatureId, data.canalLine)
    if (selectedCanalLineId === clickedGisFeatureId) {
      setSelectedCanalLineId(null)
      processCategoryDistribution(allReports)
    } else {
      setSelectedCanalLineId(clickedGisFeatureId)
      processCategoryDistribution(allReports, clickedGisFeatureId)
    }
  }

  const fetchTodayData = async () => {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const [reportsRes, ticketsRes] = await Promise.all([
        api.getReports({ limit: 100 }),
        api.getTickets({ limit: 100 })
      ])

      let reports = []
      let tickets = []

      if (reportsRes.success) {
        reports = reportsRes.data?.reports || reportsRes.data || []
      }
      if (ticketsRes.success) {
        tickets = ticketsRes.data?.tickets || ticketsRes.data || []
      }

      const todayReports = reports.filter(r => {
        const reportDate = new Date(r.created_at || r.createdAt)
        return reportDate >= today && !r.ticket_id
      })

      const todayTickets = tickets.filter(t => {
        const ticketDate = new Date(t.created_at || t.createdAt)
        return ticketDate >= today
      })

      setTodayReports(todayReports)
      setTodayTickets(todayTickets)
    } catch (error) {
      console.error('Failed to fetch today data:', error)
    }
  }

  const processMonthlyData = (reports) => {
    if (!Array.isArray(reports)) return []

    const months = {}
    reports.forEach(report => {
      const date = new Date(report.createdAt || report.created_at)
      if (!isNaN(date)) {
        const monthKey = date.toLocaleString('default', { month: 'short', year: 'numeric' })
        months[monthKey] = (months[monthKey] || 0) + 1
      }
    })
    return Object.entries(months).map(([month, count]) => ({ month, reports: count }))
  }

  const reverseGeocodeBarangay = async (lat, lon) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&accept-language=en`
      const response = await fetch(url, {
        headers: { 'User-Agent': 'IrriGIS-Admin/1.0' },
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) return null
      const data = await response.json()

      if (data.address) {
        const addr = data.address
        const possibleNames = [
          addr.suburb, addr.neighbourhood, addr.village,
          addr.hamlet, addr.locality, addr.town,
          addr.city_district, addr.district, addr.quarter
        ].filter(Boolean)

        for (const name of possibleNames) {
          const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '')
          const match = GENSAN_BARANGAYS.find(b =>
            normalizedName.includes(b.toLowerCase().replace(/[^a-z0-9]/g, '')) ||
            b.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalizedName)
          )
          if (match) return match
        }

        return addr.suburb || addr.neighbourhood || addr.village || 'Unknown'
      }
      return null
    } catch (error) {
      console.error('Reverse geocoding error:', error)
      return null
    }
  }

  const updateBarangayAssociations = async () => {
    setUpdatingBarangays(true)
    setUpdateProgress({ current: 0, total: 0 })

    try {
      const response = await api.getReports({ limit: 500 })
      let reports = []

      if (response.success && response.data) {
        reports = response.data
      } else if (Array.isArray(response)) {
        reports = response
      }

      const cache = getBarangayCache()
      const reportsNeedingGeocode = reports.filter(r => {
        const id = r.id || r.reportId
        return !cache[id]
      })

      setUpdateProgress({ current: 0, total: reportsNeedingGeocode.length })

      for (let i = 0; i < reportsNeedingGeocode.length; i++) {
        const report = reportsNeedingGeocode[i]
        const id = report.id || report.reportId

        let lat, lon
        if (report.latitude && report.longitude) {
          lat = report.latitude
          lon = report.longitude
        } else if (report.location?.latitude && report.location?.longitude) {
          lat = report.location.latitude
          lon = report.location.longitude
        } else if (report.Report?.latitude && report.Report?.longitude) {
          lat = report.Report.latitude
          lon = report.Report.longitude
        } else if (report.geometry?.coordinates) {
          [lon, lat] = report.geometry.coordinates
        }

        if (lat && lon) {
          const barangay = await reverseGeocodeBarangay(lat, lon)
          if (barangay) {
            cache[id] = barangay
          }

          if (i < reportsNeedingGeocode.length - 1) {
            await new Promise(r => setTimeout(r, 1000))
          }
        }

        setUpdateProgress({ current: i + 1, total: reportsNeedingGeocode.length })
      }

      setBarangayCache(cache)
      setLastUpdated(new Date())

      const barangayData = processBarangayData(reports, cache)
      setIssuesData(barangayData)

    } catch (error) {
      console.error('Failed to update barangay associations:', error)
    } finally {
      setUpdatingBarangays(false)
      setUpdateProgress({ current: 0, total: 0 })
    }
  }

  const processBarangayData = (reports, cache = null) => {
    if (!Array.isArray(reports)) return []

    const barangayCache = cache || getBarangayCache()
    const barangays = {}

    reports.forEach(report => {
      const id = report.id || report.reportId
      let barangayName = barangayCache[id]

      if (!barangayName && report.location_name) {
        const match = report.location_name.match(/^([^,]+)/)
        if (match) {
          const possibleBarangay = match[1].trim()
          const normalized = possibleBarangay.toLowerCase().replace(/[^a-z0-9]/g, '')
          const knownMatch = GENSAN_BARANGAYS.find(b =>
            normalized.includes(b.toLowerCase().replace(/[^a-z0-9]/g, ''))
          )
          barangayName = knownMatch || possibleBarangay
        }
      }

      if (!barangayName) {
        barangayName = report.IrrigatorAssociation?.name || report.IA?.name || 'Unknown'
      }

      barangays[barangayName] = (barangays[barangayName] || 0) + 1
    })

    return Object.entries(barangays)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([barangay, issues]) => ({ barangay, issues }))
  }

  const kpiData = [
    { label: 'In Progress Tickets', value: stats.inProgressTickets, icon: FileText, color: 'bg-blue-500' },
    { label: 'Total Submitted Reports', value: stats.totalReports, icon: FileText, color: 'bg-green-500' },
    { label: 'Avg Resolution Time', value: `${stats.avgResolutionDays} days`, icon: Clock, color: 'bg-orange-500' },
    { label: 'Active Crews', value: stats.activeCrews, icon: Users, color: 'bg-primary' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">{kpi.label}</p>
                <p className="text-2xl font-bold text-slate-800">{kpi.value}</p>
              </div>
              <div className={`${kpi.color} p-3 rounded-lg`}>
                <kpi.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== ORIGINAL CHARTS ROW ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Reports Submitted Over Time</h3>
          <div className="h-64">
            {reportsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" stroke="#64748B" />
                  <YAxis stroke="#64748B" />
                  <Tooltip />
                  <Line type="monotone" dataKey="reports" stroke="#74A5A8" strokeWidth={2} dot={{ fill: '#74A5A8' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">No data available</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Most Frequent Issues by Location</h3>
            {lastUpdated && (
              <p className="text-xs text-slate-400 mt-0.5">
                Last updated: {lastUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <button
              onClick={updateBarangayAssociations}
              disabled={updatingBarangays}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updatingBarangays ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  {updateProgress.total > 0 && <span>{updateProgress.current}/{updateProgress.total}</span>}
                </>
              ) : (
                <>
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Update</span>
                </>
              )}
            </button>
          </div>

          {updatingBarangays && updateProgress.total > 0 && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Geocoding reports...</span>
                <span>{Math.round((updateProgress.current / updateProgress.total) * 100)}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${(updateProgress.current / updateProgress.total) * 100}%` }} />
              </div>
            </div>
          )}

          <div className="h-64">
            {issuesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={issuesData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" stroke="#64748B" fontSize={11} />
                  <YAxis dataKey="barangay" type="category" stroke="#64748B" width={100} fontSize={11} tick={{ fill: '#475569' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="issues" radius={[0, 4, 4, 0]}>
                    {issuesData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index < 3 ? '#EF4444' : index < 6 ? '#F59E0B' : '#10B981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <MapPin className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No barangay data available</p>
                <p className="text-xs mt-1">Click "Update" to fetch location data</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== NEW CHARTS: Canal Lines Analysis ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Top 10 Canal Lines by Report Count - CLICKABLE */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Top 10 Canal Lines by Report Count</h3>
          <div className="h-72">
            {canalLineReportData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={canalLineReportData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  onClick={(e) => {
                    if (e && e.activePayload && e.activePayload.length > 0) {
                      handleCanalLineClick(e.activePayload[0].payload)
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" stroke="#64748B" fontSize={11} />
                  <YAxis dataKey="canalLine" type="category" stroke="#64748B" width={140} fontSize={10} tick={{ fill: '#475569' }} interval={0} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value, name, props) => [`${value} reports`, props.payload.featureType ? `Type: ${props.payload.featureType}` : ''].filter(Boolean)}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#74A5A8">
                    {canalLineReportData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index < 3 ? '#74A5A8' : index < 6 ? '#9BB88D' : '#A3C4BC'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <FileText className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No canal line data available</p>
                <p className="text-xs mt-1">Reports with GIS features will appear here</p>
              </div>
            )}
          </div>
        </div>

        {/* Report Category Distribution (Excluding Issue) */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">
              Report Category Distribution (Excl. Issues)
              {selectedCanalLineId && <span className="text-sm font-normal text-slate-500 ml-2">— Filtered by canal line</span>}
            </h3>
            {selectedCanalLineId && (
              <button
                onClick={() => { setSelectedCanalLineId(null); processCategoryDistribution(allReports) }}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X className="w-3 h-3" /> Clear Filter
              </button>
            )}
          </div>
          <div className="h-72">
            {categoryDistributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDistributionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    outerRadius={80} innerRadius={45}
                    labelLine={true}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                      const RADIAN = Math.PI / 180;
                      const radius = outerRadius + 18;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      return (
                        <text x={x} y={y} fill="#475569" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight={500}>
                          {`${categoryDistributionData[index].name}: ${value}`}
                        </text>
                      );
                    }}
                  >
                    {categoryDistributionData.map((entry, index) => {
                      const colors = { 'Inspection': '#5DADE2', 'Maintenance': '#F59E0B', 'Cleaning': '#06B6D4', 'Other': '#94A3B8' };
                      return <Cell key={`cell-${index}`} fill={colors[entry.name] || '#94A3B8'} />;
                    })}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }} formatter={(value, name) => [`${value} reports`, name]} />
                  <Legend verticalAlign="bottom" layout="horizontal" wrapperStyle={{ fontSize: '11px', paddingTop: '5px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <FileText className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No category data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Top 10 Canal Lines by Ticket Count */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Top 10 Canal Lines by Ticket Count</h3>
          <div className="h-72">
            {canalLineTicketData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={canalLineTicketData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" stroke="#64748B" fontSize={11} />
                  <YAxis dataKey="canalLine" type="category" stroke="#64748B" width={140} fontSize={10} tick={{ fill: '#475569' }} interval={0} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }} formatter={(value, name, props) => [`${value} reports`, props.payload.featureType ? `Type: ${props.payload.featureType}` : ''].filter(Boolean)} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#F59E0B">
                    {canalLineTicketData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index < 3 ? '#EF4444' : index < 6 ? '#F59E0B' : '#FBBF24'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <FileText className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No ticket data available</p>
                <p className="text-xs mt-1">Reports with tickets will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Today's Reports</h3>
            <button onClick={() => navigate('/reports')} className="text-xs font-medium text-primary hover:text-primary-700 flex items-center gap-1">
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {todayReports.length > 0 ? (
              todayReports.map(report => (
                <div key={report.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => navigate('/reports', { state: { selectedReportId: report.id } })}>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{report.category || 'Other'}</p>
                    <p className="text-xs text-slate-500">{report.location_name || 'Unknown Location'}</p>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(report.created_at || report.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))
            ) : <p className="text-sm text-slate-400 text-center py-4">No reports submitted today</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Today's Tickets</h3>
            <button onClick={() => navigate('/tickets')} className="text-xs font-medium text-primary hover:text-primary-700 flex items-center gap-1">
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {todayTickets.length > 0 ? (
              todayTickets.map(ticket => (
                <div key={ticket.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => navigate('/tickets', { state: { selectedTicketId: ticket.id } })}>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{ticket.Report?.category || 'Other'}</p>
                    <p className="text-xs text-slate-500">{ticket.Report?.location_name || 'Unknown Location'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${ticket.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : ticket.status === 'closed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                    {ticket.status}
                  </span>
                </div>
              ))
            ) : <p className="text-sm text-slate-400 text-center py-4">No tickets created today</p>}
          </div>
        </div>
      </div>
    </div>
  )
}