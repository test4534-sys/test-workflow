import React, { useState, useEffect } from 'react'
import { Share2, Plus, RefreshCw, Trash2, Settings, HardDrive, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'

interface SambaShare {
  name: string  // Changed from 'id' to 'name' since we're using share names directly
  path: string
  browseable: boolean
  writable: boolean
  valid_users: string
  force_group: string
  audit_enabled: boolean
}

interface Dataset {
  name: string
  used: string
  available: string
  referenced: string
  mountpoint: string
  type: string
}

export default function SambaShares() {
  const [shares, setShares] = useState<SambaShare[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const { addToast } = useToast()
  const { canEdit } = useAuth()
  const navigate = useNavigate()

  const [shareFormData, setShareFormData] = useState({
    name: '',
    path: '',
    browseable: true,
    writable: true,
    valid_users: '',
    force_group: '',
    audit_enabled: false
  })

  const [editFormData, setEditFormData] = useState({
    name: '',
    path: '',
    browseable: true,
    writable: true,
    valid_users: '',
    force_group: '',
    audit_enabled: false
  })

  const [editingShare, setEditingShare] = useState<string | null>(null)

  const [configData, setConfigData] = useState({
    workgroup: 'WORKGROUP',
    server_string: 'ZFS Storage Server',
    netbios_name: 'ZFS-SERVER'
  })

  const loadData = async () => {
    try {
      setLoading(true)
      const [sharesRes, datasetsRes, groupsRes] = await Promise.all([
        api.get('/api/samba/shares'),
        api.get('/api/zfs/datasets'),
        api.get('/api/users/groups')
      ])
      
      // Ensure shares data is an array
      if (sharesRes.data && Array.isArray(sharesRes.data.data)) {
        setShares(sharesRes.data.data)
      } else if (Array.isArray(sharesRes.data)) {
        // Fallback for old format
        setShares(sharesRes.data)
      } else {
        setShares([])
      }
      
      // Filter to show only filesystem datasets with mountpoints
      if (datasetsRes.data && Array.isArray(datasetsRes.data)) {
        setDatasets(datasetsRes.data.filter((d: Dataset) => d.type === 'filesystem' && d.mountpoint && d.mountpoint !== '-'))
      } else {
        setDatasets([])
      }
      
      if (groupsRes.data && Array.isArray(groupsRes.data)) {
        setGroups(groupsRes.data)
      } else {
        setGroups([])
      }
    } catch (error: any) {
      addToast({
        title: 'Error loading Samba data',
        description: error.message,
        type: 'error'
      })
      // Set empty arrays to prevent UI issues
      setShares([])
      setDatasets([])
      setGroups([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateShare = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/api/samba/shares', shareFormData)
      addToast({
        title: 'Samba share created successfully',
        type: 'success'
      })
      setCreateModalOpen(false)
      setShareFormData({
        name: '',
        path: '',
        browseable: true,
        writable: true,
        valid_users: '',
        force_group: '',
        audit_enabled: false
      })
      loadData()
    } catch (error: any) {
      addToast({
        title: 'Error creating Samba share',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleDeleteShare = async (share: SambaShare) => {
    if (!confirm(`Are you sure you want to delete Samba share:\n${share.name}?`)) {
      return
    }

    try {
      // Use share.name instead of share.id
      await api.delete(`/api/samba/shares/${share.name}`)
      addToast({
        title: 'Samba share deleted successfully',
        type: 'success'
      })
      loadData()
    } catch (error: any) {
      addToast({
        title: 'Error deleting Samba share',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/api/samba/config', configData)
      addToast({
        title: 'Samba configuration updated successfully',
        type: 'success'
      })
      setConfigModalOpen(false)
    } catch (error: any) {
      addToast({
        title: 'Error updating Samba configuration',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleRestartSamba = async () => {
    try {
      await api.post('/api/samba/restart')
      addToast({
        title: 'Samba service restarted successfully',
        type: 'success'
      })
    } catch (error: any) {
      addToast({
        title: 'Error restarting Samba service',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleEditShare = (share: SambaShare) => {
    setEditingShare(share.name)
    setEditFormData({
      name: share.name,
      path: share.path,
      browseable: share.browseable,
      writable: share.writable,
      valid_users: share.valid_users,
      force_group: share.force_group,
      audit_enabled: share.audit_enabled
    })
    setEditModalOpen(true)
  }

  const handleViewAuditLogs = () => {
    navigate('/samba/audit')
  }

  const handleUpdateShare = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingShare) return

    try {
      // For now, we'll delete and recreate the share since the backend doesn't have an update endpoint
      // First delete the old share
      await api.delete(`/api/samba/shares/${editingShare}`)

      // Then create the new share with updated data
      await api.post('/api/samba/shares', editFormData)

      addToast({
        title: 'Samba share updated successfully',
        type: 'success'
      })
      setEditModalOpen(false)
      setEditingShare(null)
      setEditFormData({
        name: '',
        path: '',
        browseable: true,
        writable: true,
        valid_users: '',
        force_group: '',
        audit_enabled: false
      })
      loadData()
    } catch (error: any) {
      addToast({
        title: 'Error updating Samba share',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  // Function to parse size string to bytes for comparison
  const parseSizeToBytes = (size: string): number => {
    const units: { [key: string]: number } = {
      'B': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024
    }
    
    const match = size.match(/^([\d.]+)([KMGTP])?$/)
    if (!match) return 0
    
    const value = parseFloat(match[1])
    const unit = match[2] || 'B'
    return value * (units[unit] || 1)
  }

  // Function to format bytes to human readable size
  const formatSize = (bytes: number): string => {
    const units = ['B', 'K', 'M', 'G', 'T']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(1)}${units[unitIndex]}`
  }

  // Function to calculate available space
  const calculateAvailableSpace = (total: string, used: string): string => {
    const totalBytes = parseSizeToBytes(total)
    const usedBytes = parseSizeToBytes(used)
    const availableBytes = Math.max(0, totalBytes - usedBytes)
    
    return formatSize(availableBytes)
  }

  // Function to estimate total space for datasets without explicit quota
  const estimateTotalSpace = (dataset: Dataset): string => {
    const usedBytes = parseSizeToBytes(dataset.used)
    const availableBytes = parseSizeToBytes(dataset.available)
    const estimatedTotal = usedBytes + availableBytes
    
    return formatSize(estimatedTotal)
  }

  // Function to get dataset information for a path
  const getDatasetInfo = (path: string) => {
    const dataset = datasets.find(d => d.mountpoint === path)
    if (!dataset) return null
    
    // For filesystem datasets, estimate allocated space
    const totalSize = estimateTotalSpace(dataset)
    const actualData = dataset.referenced  // Actual data referenced
    
    // Calculate available space as total - referenced
    const availableSpace = calculateAvailableSpace(totalSize, actualData)
    
    return {
      name: dataset.name,
      total: totalSize,       // Allocated space for this dataset
      used: actualData,       // Show REFER as used (actual data)
      free: availableSpace,   // Show calculated available space
      usagePercentage: 0 // Not used, but keeping for compatibility
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Samba Shares</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage Samba file shares and configuration
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {canEdit ? (
            <Button onClick={() => setCreateModalOpen(true)} variant="primary">
              <Plus className="h-4 w-4 mr-2" />
              Create Share
            </Button>
          ) : (
            <Button variant="primary" disabled>
              <Lock className="h-4 w-4 mr-2" />
              Create Share
            </Button>
          )}
          <Button onClick={handleViewAuditLogs} variant="outline">
            <HardDrive className="h-4 w-4 mr-2" />
            View Audit Logs
          </Button>
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Samba Shares List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Samba Shares ({shares.length})
          </h2>

          {shares.length === 0 ? (
            <div className="text-center py-12">
              <Share2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No Samba Shares
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Create your first Samba share to get started
              </p>
              {canEdit ? (
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Share
                </Button>
              ) : (
                <Button disabled>
                  <Lock className="h-4 w-4 mr-2" />
                  Create Share
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Path
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Storage Space
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Permissions
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Audit
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Group
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  {shares.map((share) => {
                    // Ensure audit_enabled is always defined
                    const safeShare = { ...share, audit_enabled: share.audit_enabled || false }
                    const datasetInfo = getDatasetInfo(safeShare.path)
                    return (
                      <tr key={safeShare.name}>  {/* Use safeShare.name as key */}
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                          {safeShare.name}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-mono text-gray-900 dark:text-white">
                            {safeShare.path}
                          </div>
                          {datasetInfo && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Dataset: {datasetInfo.name}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {datasetInfo ? (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500 dark:text-gray-400">Total:</span>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                  {datasetInfo.total}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500 dark:text-gray-400">Used:</span>
                                <span className="font-semibold text-orange-600 dark:text-orange-400">
                                  {datasetInfo.used}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500 dark:text-gray-400">Free:</span>
                                <span className="font-semibold text-green-600 dark:text-green-400">
                                  {datasetInfo.free}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-gray-500 dark:text-gray-400 text-xs">
                              Space info unavailable
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-2">
                            {safeShare.browseable && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                                Browseable
                              </span>
                            )}
                            {safeShare.writable && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                                Writable
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {safeShare.audit_enabled ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
                              Enabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {safeShare.force_group || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-2">
                            {canEdit ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditShare(safeShare)}
                              >
                                <Settings className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" disabled>
                                <Lock className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            )}
                            {canEdit ? (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteShare(safeShare)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            ) : (
                              <Button variant="danger" size="sm" disabled>
                                <Lock className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Share Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Samba Share"
        size="lg"
      >
        <form onSubmit={handleCreateShare} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Share Name
            </label>
            <input
              type="text"
              value={shareFormData.name}
              onChange={(e) => setShareFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., SharedFolder"
              pattern="[a-zA-Z0-9\-_]+"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Path
            </label>
            <select
              value={shareFormData.path}
              onChange={(e) => setShareFormData(prev => ({ ...prev, path: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select a dataset path</option>
              {datasets.map((dataset) => (
                <option key={dataset.name} value={dataset.mountpoint}>
                  {dataset.mountpoint}
                </option>
              ))}
            </select>
            {shareFormData.path && (() => {
              const datasetInfo = getDatasetInfo(shareFormData.path)
              return datasetInfo ? (
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-blue-700 dark:text-blue-300">Total</div>
                      <div className="font-semibold text-blue-800 dark:text-blue-200">
                        {datasetInfo.total}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-orange-600 dark:text-orange-400">Used</div>
                      <div className="font-semibold text-orange-700 dark:text-orange-300">
                        {datasetInfo.used}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-green-600 dark:text-green-400">Free</div>
                      <div className="font-semibold text-green-700 dark:text-green-300">
                        {datasetInfo.free}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null
            })()}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={shareFormData.browseable}
                onChange={(e) => setShareFormData(prev => ({ ...prev, browseable: e.target.checked }))}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Browseable
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={shareFormData.writable}
                onChange={(e) => setShareFormData(prev => ({ ...prev, writable: e.target.checked }))}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Writable
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Force Group
            </label>
            <select
              value={shareFormData.force_group}
              onChange={(e) => setShareFormData(prev => ({ ...prev, force_group: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">No forced group</option>
              {groups.map((group) => (
                <option key={group.name} value={group.name}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Valid Users (Optional)
            </label>
            <input
              type="text"
              value={shareFormData.valid_users}
              onChange={(e) => setShareFormData(prev => ({ ...prev, valid_users: e.target.value }))}
              placeholder="e.g., user1,user2 or @group"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Comma-separated usernames or @groupname
            </p>
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit_audit_enabled"
                checked={editFormData.audit_enabled}
                onChange={(e) => setEditFormData(prev => ({ ...prev, audit_enabled: e.target.checked }))}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="edit_audit_enabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable Audit Logging
              </label>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Log all file access (create, delete, rename, read, write, directory browsing) with usernames
            </p>
            {editFormData.audit_enabled && (
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Audit logging will be configured for this share.</strong>
                  Logs will be written to <code>/var/log/samba-audit.log</code>
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Share2 className="h-4 w-4 mr-2" />
              Create Share
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Share Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setEditingShare(null)
          setEditFormData({
            name: '',
            path: '',
            browseable: true,
            writable: true,
            valid_users: '',
            force_group: '',
            audit_enabled: false
          })
        }}
        title="Edit Samba Share"
        size="lg"
      >
        <form onSubmit={handleUpdateShare} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Share Name
            </label>
            <input
              type="text"
              value={editFormData.name}
              onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., SharedFolder"
              pattern="[a-zA-Z0-9\-_]+"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Path
            </label>
            <select
              value={editFormData.path}
              onChange={(e) => setEditFormData(prev => ({ ...prev, path: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select a dataset path</option>
              {datasets.map((dataset) => (
                <option key={dataset.name} value={dataset.mountpoint}>
                  {dataset.mountpoint}
                </option>
              ))}
            </select>
            {editFormData.path && (() => {
              const datasetInfo = getDatasetInfo(editFormData.path)
              return datasetInfo ? (
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-blue-700 dark:text-blue-300">Total</div>
                      <div className="font-semibold text-blue-800 dark:text-blue-200">
                        {datasetInfo.total}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-orange-600 dark:text-orange-400">Used</div>
                      <div className="font-semibold text-orange-700 dark:text-orange-300">
                        {datasetInfo.used}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-green-600 dark:text-green-400">Free</div>
                      <div className="font-semibold text-green-700 dark:text-green-300">
                        {datasetInfo.free}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null
            })()}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={editFormData.browseable}
                onChange={(e) => setEditFormData(prev => ({ ...prev, browseable: e.target.checked }))}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Browseable
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={editFormData.writable}
                onChange={(e) => setEditFormData(prev => ({ ...prev, writable: e.target.checked }))}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Writable
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Force Group
            </label>
            <select
              value={editFormData.force_group}
              onChange={(e) => setEditFormData(prev => ({ ...prev, force_group: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">No forced group</option>
              {groups.map((group) => (
                <option key={group.name} value={group.name}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Valid Users (Optional)
            </label>
            <input
              type="text"
              value={editFormData.valid_users}
              onChange={(e) => setEditFormData(prev => ({ ...prev, valid_users: e.target.value }))}
              placeholder="e.g., user1,user2 or @group"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Comma-separated usernames or @groupname
            </p>
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit_audit_enabled"
                checked={editFormData.audit_enabled}
                onChange={(e) => setEditFormData(prev => ({ ...prev, audit_enabled: e.target.checked }))}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="edit_audit_enabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable Audit Logging
              </label>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Log all file access (create, delete, rename, read, write, directory browsing) with usernames
            </p>
            {editFormData.audit_enabled && (
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Audit logging will be configured for this share.</strong>
                  Logs will be written to <code>/var/log/samba-audit.log</code>
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditModalOpen(false)
                setEditingShare(null)
                setEditFormData({
                  name: '',
                  path: '',
                  browseable: true,
                  writable: true,
                  valid_users: '',
                  force_group: '',
                  audit_enabled: false
                })
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Settings className="h-4 w-4 mr-2" />
              Update Share
            </Button>
          </div>
        </form>
      </Modal>

      {/* Configuration Modal */}
      <Modal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        title="Samba Global Configuration"
        size="lg"
      >
        <form onSubmit={handleUpdateConfig} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Workgroup
            </label>
            <input
              type="text"
              value={configData.workgroup}
              onChange={(e) => setConfigData(prev => ({ ...prev, workgroup: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Server String
            </label>
            <input
              type="text"
              value={configData.server_string}
              onChange={(e) => setConfigData(prev => ({ ...prev, server_string: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              NetBIOS Name
            </label>
            <input
              type="text"
              value={configData.netbios_name}
              onChange={(e) => setConfigData(prev => ({ ...prev, netbios_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              Changing these settings will update the global Samba configuration and restart the Samba service.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfigModalOpen(false)}
            >
              Cancel
            </Button>
            {canEdit ? (
              <Button type="submit" variant="primary">
                <Settings className="h-4 w-4 mr-2" />
                Update Configuration
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled>
                <Lock className="h-4 w-4 mr-2" />
                Update Configuration
              </Button>
            )}
          </div>
        </form>
      </Modal>

      
    </div>
  )
}