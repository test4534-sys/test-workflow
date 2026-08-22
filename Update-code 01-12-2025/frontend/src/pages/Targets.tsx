import React, { useState, useEffect } from 'react'
import { Target, Plus, RefreshCw, Trash2, Shield, FileText, Lock } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Target as TargetType, Pool, Dataset } from '../lib/types'

export default function Targets() {
  const [targets, setTargets] = useState<TargetType[]>([])
  const [pools, setPools] = useState<Pool[]>([])
  const [availableZvols, setAvailableZvols] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [aclModalOpen, setAclModalOpen] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState<string>('')
  const [editingTarget, setEditingTarget] = useState<TargetType | null>(null)
  const [creating, setCreating] = useState(false)
  const { addToast } = useToast()

  const [formData, setFormData] = useState({
    name: '',
    zvol_name: '',
    pool_name: ''
  })

  const [editFormData, setEditFormData] = useState({
    name: '',
    zvol_name: '',
    pool_name: ''
  })

  const [aclData, setAclData] = useState({
    client_iqn: ''
  })

  const [restoreLoading, setRestoreLoading] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [configContent, setConfigContent] = useState('')
  const [configLoading, setConfigLoading] = useState(false)
  const { canEdit } = useAuth()

  const loadData = async () => {
    try {
      setLoading(true)
      const [targetsRes, poolsRes] = await Promise.all([
        api.get('/api/targets'),
        api.get('/api/zfs/pools')
      ])
      setTargets(targetsRes.data)
      setPools(poolsRes.data)
    } catch (error: any) {
      addToast({
        title: 'Error loading targets',
        description: error.message,
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handlePoolChange = async (poolName: string) => {
    setFormData(prev => ({ ...prev, pool_name: poolName, zvol_name: '' }))
    try {
      const response = await api.get(`/api/zfs/zvols/available?pool_name=${poolName}`)
      setAvailableZvols(response.data)
    } catch (error: any) {
      addToast({
        title: 'Error loading volumes',
        description: error.message,
        type: 'error'
      })
    }
  }

  const handleCreateTarget = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.zvol_name || !formData.pool_name) {
      addToast({
        title: 'Error',
        description: 'Please fill in all fields',
        type: 'error'
      })
      return
    }

    setCreating(true)
    try {
      const response = await api.post('/api/targets', formData)
      addToast({
        title: 'Target created successfully',
        type: 'success'
      })
      setCreateModalOpen(false)
      setFormData({ name: '', zvol_name: '', pool_name: '' })
      setAvailableZvols([])
      loadData()
    } catch (error: any) {
      console.error('Target creation error:', error)
      addToast({
        title: 'Error creating target',
        description: error.response?.data?.detail || error.message || 'Unknown error occurred',
        type: 'error'
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteTarget = async (targetIqn: string) => {
    if (!confirm(`Are you sure you want to delete target:\n${targetIqn}?`)) {
      return
    }

    try {
      const response = await api.delete(`/api/targets/${targetIqn}`)

      if (response.data.success) {
        addToast({
          title: 'Target deleted successfully',
          type: 'success'
        })
        loadData()
      } else {
        addToast({
          title: 'Error deleting target',
          description: response.data.error || response.data.message || 'Failed to delete target',
          type: 'error'
        })
      }
    } catch (error: any) {
      console.error('Target deletion error:', error)
      addToast({
        title: 'Error deleting target',
        description: error.response?.data?.message || error.response?.data?.detail || error.message || 'Unknown error occurred',
        type: 'error'
      })
    }
  }

  const handleAddAcl = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/api/targets/acl', {
        target_iqn: selectedTarget,
        client_iqn: aclData.client_iqn
      })
      addToast({
        title: 'ACL added successfully',
        type: 'success'
      })
      setAclModalOpen(false)
      setAclData({ client_iqn: '' })
      loadData()
    } catch (error: any) {
      addToast({
        title: 'Error adding ACL',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleRemoveAcl = async (targetIqn: string, clientIqn: string) => {
    if (!confirm(`Remove ACL for target server:\n${clientIqn}?`)) {
      return
    }

    try {
      const response = await api.delete('/api/targets/acl', {
        data: {
          target_iqn: targetIqn,
          client_iqn: clientIqn
        }
      })

      if (response.data.success) {
        addToast({
          title: 'ACL removed successfully',
          type: 'success'
        })
        // Force refresh the data
        await loadData()
      } else {
        addToast({
          title: 'Error removing ACL',
          description: response.data.error || 'Failed to remove ACL',
          type: 'error'
        })
      }
    } catch (error: any) {
      console.error('ACL removal error:', error)
      addToast({
        title: 'Error removing ACL',
        description: error.response?.data?.message || error.response?.data?.detail || error.message || 'Unknown error occurred',
        type: 'error'
      })
      // Force refresh the data even on error to ensure UI is consistent
      await loadData()
    }
  }

  const resetForm = () => {
    setFormData({ name: '', zvol_name: '', pool_name: '' })
    setAvailableZvols([])
    setCreateModalOpen(false)
  }

  const handleEditTarget = (target: TargetType) => {
    setEditingTarget(target)
    // Extract the target name from IQN (remove the prefix)
    const targetName = target.iqn.split(':').pop() || ''
    // Extract pool name and zvol name from the LUN path
    const lun = target.luns[0] // Assuming single LUN per target
    const zvolPath = lun?.path || ''
    const pathParts = zvolPath.replace('/dev/zvol/', '').split('/')
    const poolName = pathParts[0] || ''
    const zvolName = pathParts.slice(1).join('/') || ''

    setEditFormData({
      name: targetName,
      zvol_name: zvolName,
      pool_name: poolName
    })
    setEditModalOpen(true)
  }

  const handleUpdateTarget = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTarget) return

    try {
      // For now, we'll delete and recreate the target since the backend doesn't have an update endpoint
      // First delete the old target
      await api.delete(`/api/targets/${editingTarget.iqn}`)

      // Then create the new target with updated data
      const response = await api.post('/api/targets', editFormData)

      addToast({
        title: 'Target updated successfully',
        type: 'success'
      })
      setEditModalOpen(false)
      setEditingTarget(null)
      setEditFormData({ name: '', zvol_name: '', pool_name: '' })
      loadData()
    } catch (error: any) {
      console.error('Target update error:', error)
      addToast({
        title: 'Error updating target',
        description: error.response?.data?.detail || error.message || 'Unknown error occurred',
        type: 'error'
      })
    }
  }

  const handleEditPoolChange = async (poolName: string) => {
    setEditFormData(prev => ({ ...prev, pool_name: poolName, zvol_name: '' }))
    try {
      const response = await api.get(`/api/zfs/zvols/available?pool_name=${poolName}`)
      setAvailableZvols(response.data)
    } catch (error: any) {
      addToast({
        title: 'Error loading volumes',
        description: error.message,
        type: 'error'
      })
    }
  }

  const handleRestoreTargets = async () => {
    if (!confirm('Are you sure you want to restore iSCSI targets from saved configuration? This will recreate all previously configured targets.')) {
      return
    }

    setRestoreLoading(true)
    try {
      const response = await api.post('/api/targets/restore')
      if (response.data.success) {
        addToast({
          title: 'Targets restored successfully',
          description: `Restored ${response.data.targets_restored} targets`,
          type: 'success'
        })
        loadData() // Refresh the targets list
      } else {
        addToast({
          title: 'Error restoring targets',
          description: response.data.message,
          type: 'error'
        })
      }
    } catch (error: any) {
      addToast({
        title: 'Error restoring targets',
        description: error.response?.data?.message || error.message,
        type: 'error'
      })
    } finally {
      setRestoreLoading(false)
    }
  }

  const handleShowConfig = async () => {
    setConfigLoading(true)
    try {
      const response = await api.get('/api/targets/saveconfig')
      if (response.data.success) {
        setConfigContent(JSON.stringify(response.data.config, null, 2))
        setConfigModalOpen(true)
      } else {
        addToast({
          title: 'Error loading configuration',
          description: response.data.error || 'Failed to load saveconfig.json',
          type: 'error'
        })
      }
    } catch (error: any) {
      addToast({
        title: 'Error loading configuration',
        description: error.response?.data?.message || error.message,
        type: 'error'
      })
    } finally {
      setConfigLoading(false)
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">iSCSI Targets</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage iSCSI targets and LUNs
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {canEdit ? (
            <Button onClick={() => setCreateModalOpen(true)} variant="primary">
              <Plus className="h-4 w-4 mr-2" />
              Create iSCSI
            </Button>
          ) : (
            <Button variant="primary" disabled>
              <Lock className="h-4 w-4 mr-2" />
              Create iSCSI
            </Button>
          )}
          {canEdit ? (
            <Button
              onClick={handleRestoreTargets}
              variant="secondary"
              loading={restoreLoading}
              disabled={restoreLoading}
            >
              <Target className="h-4 w-4 mr-2" />
              Restore Targets
            </Button>
          ) : (
            <Button variant="secondary" disabled>
              <Lock className="h-4 w-4 mr-2" />
              Restore Targets
            </Button>
          )}
          <Button
            onClick={handleShowConfig}
            variant="outline"
            loading={configLoading}
            disabled={configLoading}
          >
            <FileText className="h-4 w-4 mr-2" />
            Show Config
          </Button>
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Targets List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            iSCSI Targets
          </h2>
          
          {targets.length === 0 ? (
            <div className="text-center py-12">
              <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No iSCSI Targets
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Create your first iSCSI target to get started
              </p>
              {canEdit ? (
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create iSCSI
                </Button>
              ) : (
                <Button disabled>
                  <Lock className="h-4 w-4 mr-2" />
                  Create iSCSI
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {targets.map((target) => (
                <div key={target.iqn} className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Target className="h-5 w-5 text-blue-600" />
                        {target.iqn}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                          {target.tpg_groups.length} TPGs
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                          {target.luns.length} LUNs
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
                          {target.acls.length} ACLs
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                          Auth Disabled
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {canEdit ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditTarget(target)}
                        >
                          <Target className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled>
                          <Lock className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      )}
                      {canEdit ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedTarget(target.iqn)
                            setAclModalOpen(true)
                          }}
                        >
                          <Shield className="h-4 w-4 mr-1" />
                          Add Target Server IQN
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled>
                          <Lock className="h-4 w-4 mr-1" />
                          Add Target Server IQN
                        </Button>
                      )}
                      {canEdit ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeleteTarget(target.iqn)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      ) : (
                        <Button variant="danger" size="sm" disabled>
                          <Lock className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* LUNs */}
                  {target.luns.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        LUNs
                      </h4>
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                          <thead>
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                LUN ID
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Backstore
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Path
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                            {target.luns.map((lun) => (
                              <tr key={lun.id}>
                                <td className="px-4 py-2 text-sm font-mono text-gray-900 dark:text-white">
                                  {lun.id}
                                </td>
                                <td className="px-4 py-2 text-sm font-mono text-gray-900 dark:text-white">
                                  {lun.backstore}
                                </td>
                                <td className="px-4 py-2 text-sm font-mono text-gray-900 dark:text-white">
                                  {lun.path || 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ACLs */}
                  {target.acls.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Target Server IQN
                      </h4>
                      <div className="space-y-2">
                        {target.acls.map((acl) => (
                          <div key={acl} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-2">
                            <span className="font-mono text-sm text-gray-900 dark:text-white">
                              {acl}
                            </span>
                            {canEdit ? (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleRemoveAcl(target.iqn, acl)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            ) : (
                              <Button variant="danger" size="sm" disabled>
                                <Lock className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Portals */}
                  {target.portals.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Portals
                      </h4>
                      <div className="space-y-2">
                        {target.portals.map((portal, index) => (
                          <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-2">
                            <span className="font-mono text-sm text-gray-900 dark:text-white">
                              {portal.ip}:{portal.port}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Target Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={resetForm}
        title="Create New iSCSI"
        size="lg"
      >
        <form onSubmit={handleCreateTarget} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pool Name
            </label>
            <select
              value={formData.pool_name}
              onChange={(e) => handlePoolChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select a pool</option>
              {pools.map((pool) => (
                <option key={pool.name} value={pool.name}>
                  {pool.name} ({pool.free} free)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ZFS Volume
            </label>
            <select
              value={formData.zvol_name}
              onChange={(e) => setFormData(prev => ({ ...prev, zvol_name: e.target.value }))}
              disabled={!formData.pool_name || availableZvols.length === 0}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
              required
            >
              <option value="">{!formData.pool_name ? 'Select pool first' : availableZvols.length === 0 ? 'No available volumes' : 'Select volume'}</option>
              {availableZvols.map((zvol) => (
                <option key={zvol.name} value={zvol.name.split('/').pop()}>
                  {zvol.name} ({zvol.used})
                </option>
              ))}
            </select>
            {formData.pool_name && availableZvols.length === 0 && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                No available volumes found in this pool. Create a ZFS volume first.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Name
            </label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-300 text-sm">
                iqn.2025-09.local.ubuntu:
              </span>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value.replace(/\s+/g, '-') }))}
                placeholder="enter-custom-name"
                pattern="[a-zA-Z0-9\-_]+"
                className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Custom name part after the IQN prefix (alphanumeric, hyphens, and underscores only)
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={resetForm}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={creating}
              disabled={creating}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create iSCSI
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Target Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setEditingTarget(null)
          setEditFormData({ name: '', zvol_name: '', pool_name: '' })
          setAvailableZvols([])
        }}
        title="Edit iSCSI Target"
        size="lg"
      >
        <form onSubmit={handleUpdateTarget} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pool Name
            </label>
            <select
              value={editFormData.pool_name}
              onChange={(e) => handleEditPoolChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select a pool</option>
              {pools.map((pool) => (
                <option key={pool.name} value={pool.name}>
                  {pool.name} ({pool.free} free)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ZFS Volume
            </label>
            <select
              value={editFormData.zvol_name}
              onChange={(e) => setEditFormData(prev => ({ ...prev, zvol_name: e.target.value }))}
              disabled={!editFormData.pool_name || availableZvols.length === 0}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
              required
            >
              <option value="">{!editFormData.pool_name ? 'Select pool first' : availableZvols.length === 0 ? 'No available volumes' : 'Select volume'}</option>
              {availableZvols.map((zvol) => (
                <option key={zvol.name} value={zvol.name.split('/').pop()}>
                  {zvol.name} ({zvol.used})
                </option>
              ))}
            </select>
            {editFormData.pool_name && availableZvols.length === 0 && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                No available volumes found in this pool. Create a ZFS volume first.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Name
            </label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-300 text-sm">
                iqn.2025-09.local.ubuntu:
              </span>
              <input
                type="text"
                value={editFormData.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value.replace(/\s+/g, '-') }))}
                placeholder="enter-custom-name"
                pattern="[a-zA-Z0-9\-_]+"
                className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Custom name part after the IQN prefix (alphanumeric, hyphens, and underscores only)
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditModalOpen(false)
                setEditingTarget(null)
                setEditFormData({ name: '', zvol_name: '', pool_name: '' })
                setAvailableZvols([])
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Target className="h-4 w-4 mr-2" />
              Update Target
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add ACL Modal */}
      <Modal
        isOpen={aclModalOpen}
        onClose={() => setAclModalOpen(false)}
        title="Add Target Server IQN"
      >
        <form onSubmit={handleAddAcl} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              iSCSI IQN
            </label>
            <input
              type="text"
              value={selectedTarget}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-400"
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Server IQN
            </label>
            <input
              type="text"
              value={aclData.client_iqn}
              onChange={(e) => setAclData(prev => ({ ...prev, client_iqn: e.target.value }))}
              placeholder="e.g., iqn.2025-09.com.client:desktop1"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAclModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Shield className="h-4 w-4 mr-2" />
              Add ACL
            </Button>
          </div>
        </form>
      </Modal>

      {/* Config Modal */}
      <Modal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        title="iSCSI Saved Configuration"
        size="xl"
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            This shows the current saved configuration from /etc/rtslib-fb-target/saveconfig.json
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 max-h-96 overflow-auto">
            <pre className="text-xs font-mono text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
              {configContent}
            </pre>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfigModalOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}