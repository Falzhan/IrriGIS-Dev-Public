import { useState, useEffect } from 'react'
import { Search, UserPlus, X, Upload, Edit2, Filter, ArrowUpDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

const roleColors = {
  'nia_admin': 'bg-purple-100 text-purple-700',
  'nia_field_officer': 'bg-blue-100 text-blue-700',
  'ia_admin': 'bg-green-100 text-green-700',
  'ia_member': 'bg-teal-100 text-teal-700',
}

const roleLabels = {
  'nia_admin': 'NIA Admin',
  'nia_field_officer': 'NIA Field Officer',
  'ia_admin': 'IA Admin',
  'ia_member': 'IA Member',
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export default function Users() {
  const { user: currentUser, refreshUser } = useAuth()
  const [users, setUsers] = useState([])
  const [ias, setIAs] = useState([])
  const [risList, setRisList] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [modalAction, setModalAction] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'ia_member',
    iaId: '',
    profileImage: null
  })
  const [editForm, setEditForm] = useState({
    role: '',
    ia_id: '',
    ris_id: '',
    is_active: true,
    contact_number: '',
    address: '',
    profileImage: null
  })
  const [errorMessage, setErrorMessage] = useState('')

  // Filters
  const [filters, setFilters] = useState({
    association: '',
    role: '',
    status: '',
    sortBy: 'createdAt',
    sortOrder: 'DESC'
  })
  const [showFilters, setShowFilters] = useState(false)

  const isNiaAdmin = currentUser?.role === 'nia_admin'

  const availableRoles = isNiaAdmin
    ? [
        { value: 'ia_member', label: 'IA Member' },
        { value: 'ia_admin', label: 'IA Admin' },
        { value: 'nia_field_officer', label: 'NIA Field Officer' },
        { value: 'nia_admin', label: 'NIA Admin' },
      ]
    : [
        { value: 'ia_member', label: 'IA Member' },
        { value: 'ia_admin', label: 'IA Admin' },
      ]

  const availableIAs = isNiaAdmin
    ? ias
    : ias.filter(ia => ia.id === currentUser?.ia_id)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [usersRes, iasRes, risRes] = await Promise.all([
        api.getUsers(),
        api.getIrrigatorAssociations(),
        api.getRISList() ? api.getRISList() : Promise.resolve({ success: true, data: [] })
      ])

      if (usersRes.success) {
        const usersList = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.users || []
        setUsers(usersList)
      }
      if (iasRes.success) {
        setIAs(iasRes.data || [])
      }
      if (risRes?.success) {
        setRisList(risRes.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesAssociation = !filters.association || user.ia_id === filters.association
    const matchesRole = !filters.role || user.role === filters.role
    const matchesStatus = !filters.status || 
      (filters.status === 'active' && user.is_active) ||
      (filters.status === 'inactive' && !user.is_active)
    
    return matchesSearch && matchesAssociation && matchesRole && matchesStatus
  })

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let aVal, bVal
    switch (filters.sortBy) {
      case 'first_name':
        aVal = a.first_name || ''
        bVal = b.first_name || ''
        break
      case 'email':
        aVal = a.email || ''
        bVal = b.email || ''
        break
      case 'createdAt':
        aVal = new Date(a.created_at || 0).getTime()
        bVal = new Date(b.created_at || 0).getTime()
        break
      case 'role':
        aVal = a.role || ''
        bVal = b.role || ''
        break
      default:
        return 0
    }
    if (filters.sortOrder === 'ASC') {
      return aVal > bVal ? 1 : -1
    }
    return aVal < bVal ? 1 : -1
  })

  const handleAction = (user, action, e) => {
    e?.stopPropagation()
    setSelectedUser(user)
    setModalAction(action)
    setShowModal(true)
  }

  const handleViewUser = (user) => {
    setSelectedUser(user)
    setEditForm({
      role: user.role,
      ia_id: user.ia_id || '',
      ris_id: user.ris_id || '',
      is_active: user.is_active,
      contact_number: user.contact_number || '',
      address: user.address || ''
    })
    setIsEditing(false)
    setErrorMessage('')
    setShowDetailsModal(true)
  }

  const handleEditUser = (user, e) => {
    e.stopPropagation()
    setSelectedUser(user)
    setEditForm({
      role: user.role,
      ia_id: user.ia_id || '',
      ris_id: user.ris_id || '',
      is_active: user.is_active,
      contact_number: user.contact_number || '',
      address: user.address || '',
      profileImage: null
    })
    setIsEditing(true)
    setShowDetailsModal(true)
    setErrorMessage('')
  }

  const handleActivateDeactivate = async () => {
    try {
      const newStatus = !selectedUser.is_active
      await api.updateUser(selectedUser.id, { is_active: newStatus })
      setShowModal(false)
      fetchData()
    } catch (error) {
      console.error('Failed to update user:', error)
    }
  }

  const handleSaveUser = async () => {
    setErrorMessage('')
    try {
      const isNiaEmail = selectedUser.email.endsWith('@nia.gov.ph')
      if ((editForm.role === 'nia_admin' || editForm.role === 'nia_field_officer') && !isNiaEmail) {
        setErrorMessage('NIA roles require @nia.gov.ph email address')
        return
      }

      // Handle profile image upload
      if (editForm.profileImage) {
        const formData = new FormData()
        formData.append('profileImage', editForm.profileImage)
        
        try {
          const response = await fetch(`${API_BASE_URL}/auth/profile-image`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
          })
          
          if (!response.ok) {
            throw new Error('Failed to upload profile image')
          }

          const result = await response.json()
          
          // Update user data in localStorage with new profile image URL
          if (result.success && result.profile_image_url) {
            const currentUser = JSON.parse(localStorage.getItem('user') || '{}')
            currentUser.profile_image_url = result.profile_image_url
            localStorage.setItem('user', JSON.stringify(currentUser))
            
            // Also update sessionStorage if that's being used
            const sessionUser = JSON.parse(sessionStorage.getItem('user') || '{}')
            if (sessionUser.id === currentUser.id) {
              sessionUser.profile_image_url = result.profile_image_url
              sessionStorage.setItem('user', JSON.stringify(sessionUser))
            }

            // Refresh the user context to update navbar
            await refreshUser()
          }
        } catch (uploadError) {
          setErrorMessage('Failed to upload profile image')
          return
        }
      }

      // Only update user data if fields have actually changed
      const hasUserDataChanges = (
        editForm.role !== selectedUser.role ||
        (editForm.ia_id || null) !== selectedUser.ia_id ||
        (editForm.ris_id || null) !== selectedUser.ris_id ||
        editForm.is_active !== selectedUser.is_active ||
        editForm.contact_number !== selectedUser.contact_number ||
        editForm.address !== selectedUser.address
      )

      if (hasUserDataChanges) {
        await api.updateUser(selectedUser.id, {
          role: editForm.role,
          ia_id: editForm.ia_id || null,
          ris_id: editForm.ris_id || null,
          is_active: editForm.is_active,
          contact_number: editForm.contact_number,
          address: editForm.address
        })
      }
      setShowDetailsModal(false)
      setIsEditing(false)
      fetchData()
    } catch (error) {
      const msg = error.message || 'Failed to update user'
      setErrorMessage(msg)
      console.error('Failed to update user:', error)
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    try {
      const isNiaEmail = newUser.email.endsWith('@nia.gov.ph')
      if ((newUser.role === 'nia_admin' || newUser.role === 'nia_field_officer') && !isNiaEmail) {
        setErrorMessage('NIA roles require @nia.gov.ph email address')
        return
      }

      const formData = new FormData()
      formData.append('email', newUser.email)
      formData.append('password', newUser.password)
      formData.append('firstName', newUser.firstName)
      formData.append('lastName', newUser.lastName)
      formData.append('role', newUser.role)
      if (newUser.iaId) {
        formData.append('ia_id', newUser.iaId)
      }
      if (newUser.profileImage) {
        formData.append('profileImage', newUser.profileImage)
      }

      await api.createUserWithProfile(formData)
      setShowAddModal(false)
      setNewUser({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        role: 'ia_member',
        iaId: '',
        profileImage: null
      })
      setErrorMessage('')
      fetchData()
    } catch (error) {
      const msg = error.message || 'Failed to create user'
      setErrorMessage(msg)
      console.error('Failed to create user:', error)
    }
  }

  const getUserImage = (user) => {
    if (user.profile_image_url) {
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

  const handleRoleChange = (role, isNewUser = false) => {
    if (isNewUser) {
      const isNiaEmail = newUser.email.endsWith('@nia.gov.ph')
      if ((role === 'nia_admin' || role === 'nia_field_officer') && !isNiaEmail) {
        setErrorMessage('NIA roles require @nia.gov.ph email address')
      } else {
        setErrorMessage('')
      }
      setNewUser(prev => ({ ...prev, role }))
    } else {
      const isNiaEmail = selectedUser?.email.endsWith('@nia.gov.ph')
      if ((role === 'nia_admin' || role === 'nia_field_officer') && !isNiaEmail) {
        setErrorMessage('NIA roles require @nia.gov.ph email address')
      } else {
        setErrorMessage('')
      }
      setEditForm(prev => ({ ...prev, role }))
    }
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
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              showFilters ? 'bg-primary text-white border-primary' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </button>

          {isNiaAdmin && (
            <button 
              onClick={() => {
                setErrorMessage('')
                setShowAddModal(true)
              }}
              className="flex items-center px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-600"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add User
            </button>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-medium text-slate-500 mb-1">Association</label>
              <select
                value={filters.association}
                onChange={(e) => setFilters(prev => ({ ...prev, association: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="">All Associations</option>
                {ias.map(ia => (
                  <option key={ia.id} value={ia.id}>{ia.name}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
              <select
                value={filters.role}
                onChange={(e) => setFilters(prev => ({ ...prev, role: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="">All Roles</option>
                {availableRoles.map(role => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-medium text-slate-500 mb-1">Sort By</label>
              <select
                value={filters.sortBy}
                onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="createdAt">Date Added</option>
                <option value="first_name">Name</option>
                <option value="email">Email</option>
                <option value="role">Role</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilters(prev => ({ ...prev, sortOrder: prev.sortOrder === 'ASC' ? 'DESC' : 'ASC' }))}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 flex items-center"
              >
                <ArrowUpDown className="w-4 h-4 mr-1" />
                {filters.sortOrder === 'ASC' ? 'Asc' : 'Desc'}
              </button>
            </div>

            <button
              onClick={() => setFilters({ association: '', role: '', status: '', sortBy: 'createdAt', sortOrder: 'DESC' })}
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">User</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Association</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Date Added</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sortedUsers.map((user) => {
              const userImage = getUserImage(user)
              return (
                <tr 
                  key={user.id} 
                  onClick={() => handleViewUser(user)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      {userImage ? (
                        <img
                          src={userImage}
                          alt={`${user.first_name} ${user.last_name}`}
                          className="w-14 h-14 rounded-full object-cover ring-2 ring-slate-100"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-primary/20 rounded-full flex items-center justify-center text-primary text-lg font-medium ring-2 ring-slate-100">
                          {user.first_name?.[0]}{user.last_name?.[0]}
                        </div>
                      )}
                      <div className="ml-4">
                        <p className="text-base font-semibold text-slate-800">{user.first_name} {user.last_name}</p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {user.irrigatorAssociation?.name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${roleColors[user.role] || 'bg-slate-100 text-slate-700'}`}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                    {isNiaAdmin && (
                      <button
                        onClick={(e) => handleEditUser(user, e)}
                        className="px-3 py-1 text-xs font-medium rounded border border-primary text-primary hover:bg-primary/10 inline-flex items-center"
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        Edit
                      </button>
                    )}
                    <button
                      onClick={(e) => handleAction(user, user.is_active ? 'deactivate' : 'activate', e)}
                      className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${
                        user.is_active
                          ? 'border-red-500 text-red-500 hover:bg-red-50'
                          : 'border-emerald-500 text-emerald-500 hover:bg-emerald-50'
                      }`}
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sortedUsers.length === 0 && (
          <div className="text-center py-8 text-slate-500">No users found</div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>

            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              {modalAction === 'deactivate' ? 'Deactivate User?' : 'Activate User?'}
            </h3>
            <p className="text-slate-600 mb-6">
              {modalAction === 'deactivate'
                ? `Are you sure you want to deactivate ${selectedUser?.first_name} ${selectedUser?.last_name}? They will lose access to the system.`
                : `Are you sure you want to activate ${selectedUser?.first_name} ${selectedUser?.last_name}? They will regain access to the system.`}
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleActivateDeactivate}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
                  modalAction === 'deactivate' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                {modalAction === 'deactivate' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>

            <h3 className="text-lg font-semibold text-slate-800 mb-4">Add New User</h3>
            
            {errorMessage && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                {errorMessage}
              </div>
            )}
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center border-2 border-dashed border-slate-300">
                    {newUser.profileImage ? (
                      <img 
                        src={URL.createObjectURL(newUser.profileImage)} 
                        alt="Profile Preview" 
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <Upload className="w-8 h-8 text-slate-400" />
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 p-1 bg-primary text-white rounded-full cursor-pointer hover:bg-primary-600">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setNewUser(prev => ({ ...prev, profileImage: e.target.files[0] }))}
                      className="hidden"
                    />
                    <Upload className="w-3 h-3" />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={newUser.firstName}
                    onChange={(e) => setNewUser(prev => ({ ...prev, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={newUser.lastName}
                    onChange={(e) => setNewUser(prev => ({ ...prev, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => {
                    setNewUser(prev => ({ ...prev, email: e.target.value }))
                    if ((newUser.role === 'nia_admin' || newUser.role === 'nia_field_officer') && !e.target.value.endsWith('@nia.gov.ph')) {
                      setErrorMessage('NIA roles require @nia.gov.ph email address')
                    } else {
                      setErrorMessage('')
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
                {newUser.email && !newUser.email.endsWith('@nia.gov.ph') && (newUser.role === 'nia_admin' || newUser.role === 'nia_field_officer') && (
                  <p className="mt-1 text-xs text-amber-600">NIA roles require @nia.gov.ph email address</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => handleRoleChange(e.target.value, true)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                >
                  {availableRoles.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
                {newUser.email && !newUser.email.endsWith('@nia.gov.ph') && (newUser.role === 'nia_admin' || newUser.role === 'nia_field_officer') && (
                  <p className="mt-1 text-xs text-amber-600">Warning: NIA roles require @nia.gov.ph email</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Irrigators Association</label>
                <select
                  value={newUser.iaId}
                  onChange={(e) => setNewUser(prev => ({ ...prev, iaId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                >
                  <option value="">None</option>
                  {availableIAs.map(ia => (
                    <option key={ia.id} value={ia.id}>{ia.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setErrorMessage('')
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-600"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {showDetailsModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => {
            setShowDetailsModal(false)
            setIsEditing(false)
            setErrorMessage('')
          }} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowDetailsModal(false)
                setIsEditing(false)
                setErrorMessage('')
              }}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>

            <div className="flex items-center mb-6">
              <div className="relative">
                {editForm.profileImage || getUserImage(selectedUser) ? (
                  <img
                    src={editForm.profileImage ? URL.createObjectURL(editForm.profileImage) : getUserImage(selectedUser)}
                    alt={`${selectedUser.first_name} ${selectedUser.last_name}`}
                    className="w-20 h-20 rounded-full object-cover ring-2 ring-slate-100"
                  />
                ) : (
                  <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center text-primary text-2xl font-medium ring-2 ring-slate-100">
                    {selectedUser.first_name?.[0]}{selectedUser.last_name?.[0]}
                  </div>
                )}
                {isEditing && (
                  <label className="absolute bottom-0 right-0 p-1 bg-primary text-white rounded-full cursor-pointer hover:bg-primary-600">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setEditForm(prev => ({ ...prev, profileImage: e.target.files[0] }))}
                      className="hidden"
                    />
                    <Upload className="w-3 h-3" />
                  </label>
                )}
              </div>
              <div className="ml-4">
                <h3 className="text-xl font-semibold text-slate-800">{selectedUser.first_name} {selectedUser.last_name}</h3>
                <p className="text-slate-500">{selectedUser.email}</p>
              </div>
            </div>

            {errorMessage && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                {errorMessage}
              </div>
            )}

            <div className="space-y-4">
              {isNiaAdmin ? (
                <>
                  {isEditing ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-500 uppercase mb-1">Role</p>
                          <select
                            value={editForm.role}
                            onChange={(e) => handleRoleChange(e.target.value, false)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                          >
                            {availableRoles.map(role => (
                              <option key={role.value} value={role.value}>{role.label}</option>
                            ))}
                          </select>
                          {selectedUser.email && !selectedUser.email.endsWith('@nia.gov.ph') && (editForm.role === 'nia_admin' || editForm.role === 'nia_field_officer') && (
                            <p className="mt-1 text-xs text-amber-600">Warning: NIA roles require @nia.gov.ph</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase mb-1">Status</p>
                          <select
                            value={editForm.is_active ? 'active' : 'inactive'}
                            onChange={(e) => setEditForm(prev => ({ ...prev, is_active: e.target.value === 'active' }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500 uppercase mb-1">Irrigators Association</p>
                        <select
                          value={editForm.ia_id}
                          onChange={(e) => setEditForm(prev => ({ ...prev, ia_id: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        >
                          <option value="">None</option>
                          {availableIAs.map(ia => (
                            <option key={ia.id} value={ia.id}>{ia.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500 uppercase mb-1">RIS</p>
                        <select
                          value={editForm.ris_id}
                          onChange={(e) => setEditForm(prev => ({ ...prev, ris_id: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        >
                          <option value="">None</option>
                          {risList.map(ris => (
                            <option key={ris.id} value={ris.id}>{ris.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500 uppercase mb-1">Contact Number</p>
                        <input
                          type="text"
                          value={editForm.contact_number}
                          onChange={(e) => setEditForm(prev => ({ ...prev, contact_number: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                          placeholder="Enter contact number"
                        />
                      </div>

                      <div>
                        <p className="text-xs text-slate-500 uppercase mb-1">Address</p>
                        <input
                          type="text"
                          value={editForm.address}
                          onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                          placeholder="Enter address"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Role</p>
                          <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${roleColors[selectedUser.role] || 'bg-slate-100 text-slate-700'}`}>
                            {roleLabels[selectedUser.role] || selectedUser.role}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Status</p>
                          <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                            selectedUser.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {selectedUser.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Irrigators Association</p>
                          <p className="text-sm text-slate-800">{selectedUser.irrigatorAssociation?.name || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">RIS</p>
                          <p className="text-sm text-slate-800">{selectedUser.riverIrrigationSystem?.name || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Contact Number</p>
                          <p className="text-sm text-slate-800">{selectedUser.contact_number || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Address</p>
                          <p className="text-sm text-slate-800">{selectedUser.address || 'N/A'}</p>
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Role</p>
                      <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${roleColors[selectedUser.role] || 'bg-slate-100 text-slate-700'}`}>
                        {roleLabels[selectedUser.role] || selectedUser.role}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Status</p>
                      <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                        selectedUser.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {selectedUser.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Irrigators Association</p>
                      <p className="text-sm text-slate-800">{selectedUser.irrigatorAssociation?.name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase">RIS</p>
                      <p className="text-sm text-slate-800">{selectedUser.riverIrrigationSystem?.name || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Contact Number</p>
                      <p className="text-sm text-slate-800">{selectedUser.contact_number || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Address</p>
                      <p className="text-sm text-slate-800">{selectedUser.address || 'N/A'}</p>
                    </div>
                  </div>
                </>
              )}

              <div className="border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-500 uppercase mb-2">Account Information</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Created</p>
                    <p className="text-slate-800">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Last Updated</p>
                    <p className="text-slate-800">{selectedUser.updated_at ? new Date(selectedUser.updated_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setShowDetailsModal(false)
                  setIsEditing(false)
                  setErrorMessage('')
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {isEditing ? 'Cancel' : 'Close'}
              </button>
              <button
                onClick={() => {
                  setShowDetailsModal(false)
                  handleAction(selectedUser, selectedUser.is_active ? 'deactivate' : 'activate', {})
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
                  selectedUser.is_active ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                {selectedUser.is_active ? 'Deactivate' : 'Activate'}
              </button>
              {isNiaAdmin && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-600"
                >
                  Edit
                </button>
              )}
              {isNiaAdmin && isEditing && (
                <button
                  onClick={handleSaveUser}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-600"
                >
                  Save Changes
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}