import { useState, useEffect } from 'react'
import { Search, Filter } from 'lucide-react'
import api from '../services/api'

export default function History() {
  const [reports, setReports] = useState([])
  const [filterBarangay, setFilterBarangay] = useState('All')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    try {
      const response = await api.getReports()
      let reportsList = []
      
      if (response.success && response.data) {
        reportsList = Array.isArray(response.data) ? response.data : response.data.reports || []
      } else if (Array.isArray(response)) {
        reportsList = response
      }
      
      const closedReports = reportsList.filter(r => 
        r.ReportTicket?.status === 'closed' || 
        r.ReportTicket?.status === 'rejected' || 
        r.status === 'closed' || 
        r.status === 'rejected'
      )
      setReports(closedReports)
    } catch (error) {
      console.error('Failed to fetch reports:', error)
    } finally {
      setLoading(false)
    }
  }

  const getBarangays = () => {
    const barangays = new Set(reports.map(r => r.IrrigatorAssociation?.name || r.IA?.name).filter(Boolean))
    return ['All', ...barangays]
  }

  const filteredReports = reports.filter(record => {
    const matchesBarangay = filterBarangay === 'All' || (record.IrrigatorAssociation?.name || record.IA?.name) === filterBarangay
    const barangay = record.IrrigatorAssociation?.name || record.IA?.name || ''
    const matchesSearch = barangay.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (record.remarks || '').toLowerCase().includes(searchTerm.toLowerCase())
    
    let matchesDate = true
    const createdDate = record.createdAt || record.created_at
    if (dateRange.start && createdDate) {
      matchesDate = matchesDate && new Date(createdDate) >= new Date(dateRange.start)
    }
    if (dateRange.end && createdDate) {
      matchesDate = matchesDate && new Date(createdDate) <= new Date(dateRange.end)
    }
    
    return matchesBarangay && matchesSearch && matchesDate
  })

  const getDaysToResolve = (createdAt, updatedAt) => {
    const start = new Date(createdAt)
    const end = new Date(updatedAt)
    const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24))
    return diff || 1
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
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search history..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterBarangay}
            onChange={(e) => setFilterBarangay(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
          >
            {getBarangays().map(b => (
              <option key={b} value={b}>{b === 'All' ? 'All Barangays' : b}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Date Range:</span>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
          />
          <span className="text-slate-400">-</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Barangay</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Start Date</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Resolution Date</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Days to Resolve</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Initial Problem</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Resolution Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredReports.map((record) => {
              const createdAt = record.createdAt || record.created_at
              const updatedAt = record.ReportTicket?.updatedAt || record.updated_at
              const daysToResolve = getDaysToResolve(createdAt, updatedAt)
              return (
                <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-slate-800">
                    {record.IrrigatorAssociation?.name || record.IA?.name || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {createdAt ? new Date(createdAt).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {updatedAt ? new Date(updatedAt).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      daysToResolve <= 2 ? 'bg-green-100 text-green-700' :
                      daysToResolve <= 4 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {daysToResolve} days
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                    {record.remarks || 'No description'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                    {record.ReportTicket?.comments?.length > 0 
                      ? record.ReportTicket.comments[record.ReportTicket.comments.length - 1]?.comment 
                      : 'Resolved'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filteredReports.length === 0 && (
          <div className="text-center py-8 text-slate-500">No resolved reports found</div>
        )}
      </div>
    </div>
  )
}
