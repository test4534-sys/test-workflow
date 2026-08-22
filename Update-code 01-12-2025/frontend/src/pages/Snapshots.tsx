import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Plus, RefreshCw, Trash2, RotateCcw, Copy, AlertCircle, Clock, Lock } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'

interface Snapshot {
  name: string
  creation: string
  used: string
  referenced: string
  dataset: string
  snapshot_name: string
  display_name: string
  short_name: string
}

export default function Snapshots() {
  const navigate = useNavigate()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [datasets, setDatasets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [cloneModalOpen, setCloneModalOpen] = useState(false)
  const [cloneErrorModalOpen, setCloneErrorModalOpen] = useState(false)
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null)
  const [cloneErrorData, setCloneErrorData] = useState<{snapshot: string; clones: string; message: string} | null>(null)
  const { addToast } = useToast()
  const { canEdit } = useAuth()

  const [createFormData, setCreateFormData] = useState({
    dataset: '',
    snapshot_name: ''
  })


  const [cloneFormData, setCloneFormData] = useState({
    clone_name: ''
  })

  const loadData = async () => {
    try {
      setLoading(true)
      const [snapshotsRes, datasetsRes] = await Promise.all([
        api.get('/api/zfs/snapshots'),
        api.get('/api/zfs/datasets'),
      ])
      setSnapshots(snapshotsRes.data)
      // Filter to show only datasets and volumes (not snapshots)
      setDatasets(datasetsRes.data.filter((d: any) => d.type === 'filesystem' || d.type === 'volume'))
    } catch (error: any) {
      addToast({
        title: 'Error loading snapshots',
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

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await api.post('/api/zfs/snapshot', {
        dataset: createFormData.dataset,
        snapshot_name: createFormData.snapshot_name
      })
      if (response.data.success) {
        addToast({
          title: 'Snapshot created successfully',
          type: 'success'
        })
        setCreateModalOpen(false)
        setCreateFormData({ dataset: '', snapshot_name: '' })
        loadData()
      } else {
        addToast({
          title: 'Error creating snapshot',
          description: response.data.message || 'Failed to create snapshot',
          type: 'error'
        })
      }
    } catch (error: any) {
      addToast({
        title: 'Error creating snapshot',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }


  const handleDeleteSnapshot = async (snapshot: Snapshot) => {
    if (!confirm(`Are you sure you want to delete snapshot:\n${snapshot.name}?`)) {
      return
    }

    try {
      // Use request body for DELETE request
      const response = await api.delete('/api/zfs/snapshot', {
        data: {
          snapshot_name: snapshot.name
        }
      })

      // Check the response data for success or error details
      if (response.data.success) {
        addToast({
          title: 'Snapshot deleted successfully',
          type: 'success'
        })
        loadData()
      } else {
        // Handle error cases returned in response.data
        const errorMessage = response.data.message || 'Failed to delete snapshot'

        // Check if this is a clone dependency error
        if (errorMessage.includes('dependent clones') || errorMessage.includes('has dependent clones')) {
          // Extract clone information from the error message
          const cloneMatch = errorMessage.match(/Dependent clones:([\s\S]*?)(?:\n\n|$)/)
          const clones = cloneMatch ? cloneMatch[1].trim() : 'Unable to detect specific clones'

          setCloneErrorData({
            snapshot: snapshot.name,
            clones: clones,
            message: errorMessage
          })
          setCloneErrorModalOpen(true)
        } else {
          addToast({
            title: 'Error deleting snapshot',
            description: errorMessage,
            type: 'error'
          })
        }
      }
    } catch (error: any) {
      console.error('Snapshot deletion error:', error)

      // Handle HTTP errors (like 500 server errors)
      if (error.response?.status >= 500) {
        addToast({
          title: 'Server Error',
          description: 'Failed to delete snapshot due to server error. Please try again.',
          type: 'error'
        })
      } else {
        // Handle other client errors
        const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.userMessage || error.message || 'Unknown error occurred'
        addToast({
          title: 'Error deleting snapshot',
          description: errorMessage,
          type: 'error'
        })
      }
    }
  }

  const handleRollbackSnapshot = async (snapshot: Snapshot) => {
    if (!confirm(`Are you sure you want to rollback to snapshot:\n${snapshot.name}?\n\nThis will destroy any changes made since the snapshot was taken!`)) {
      return
    }

    try {
      const response = await api.post('/api/zfs/snapshot/rollback', {
        snapshot_name: snapshot.name
      })
      if (response.data.success) {
        addToast({
          title: 'Rollback completed successfully',
          type: 'success'
        })
        loadData()
      } else {
        addToast({
          title: 'Error rolling back snapshot',
          description: response.data.message || 'Failed to rollback snapshot',
          type: 'error'
        })
      }
    } catch (error: any) {
      addToast({
        title: 'Error rolling back snapshot',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleCloneSnapshot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSnapshot) return

    try {
      const response = await api.post('/api/zfs/snapshot/clone', {
        snapshot_name: selectedSnapshot.name,
        clone_name: cloneFormData.clone_name
      })
      if (response.data.success) {
        addToast({
          title: 'Snapshot cloned successfully',
          type: 'success'
        })
        setCloneModalOpen(false)
        setCloneFormData({ clone_name: '' })
        setSelectedSnapshot(null)
        loadData()
      } else {
        addToast({
          title: 'Error cloning snapshot',
          description: response.data.message || 'Failed to clone snapshot',
          type: 'error'
        })
      }
    } catch (error: any) {
      addToast({
        title: 'Error cloning snapshot',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }


  const showCloneModal = (snapshot: Snapshot) => {
    setSelectedSnapshot(snapshot)
    setCloneFormData({ clone_name: '' })
    setCloneModalOpen(true)
  }

  // Extract pool name from snapshot for display
  const getPoolName = (snapshotName: string) => {
    return snapshotName.split('/')[0]
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">ZFS Snapshots</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Create and manage ZFS snapshots for data protection
          </p>
        </div>
        <div className="flex gap-3">
          {canEdit ? (
            <Button onClick={() => setCreateModalOpen(true)} variant="primary">
              <Plus className="h-4 w-4 mr-2" />
              Create Snapshot
            </Button>
          ) : (
            <Button variant="primary" disabled>
              <Lock className="h-4 w-4 mr-2" />
              Create Snapshot
            </Button>
          )}
          {canEdit ? (
            <Button onClick={() => navigate('/scheduled-snapshots')} variant="secondary">
              <Clock className="h-4 w-4 mr-2" />
              Schedule Snapshot
            </Button>
          ) : (
            <Button variant="secondary" disabled>
              <Lock className="h-4 w-4 mr-2" />
              Schedule Snapshot
            </Button>
          )}
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>


      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Available Snapshots
          </h2>

          {snapshots.length === 0 ? (
            <div className="text-center py-12">
              <Camera className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No Snapshots Found
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Create your first ZFS snapshot to protect your data
              </p>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Snapshot
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Snapshot
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Dataset
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Used
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Referenced
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  {snapshots.map((snapshot) => (
                    <tr key={snapshot.name}>
                      <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                        <div className="flex flex-col">
                          <span className="font-semibold">{snapshot.short_name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {snapshot.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">
                        {snapshot.dataset}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {snapshot.creation}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {snapshot.used}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {snapshot.referenced}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2">
                          {canEdit ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => showCloneModal(snapshot)}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Clone
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" disabled>
                              <Lock className="h-3 w-3 mr-1" />
                              Clone
                            </Button>
                          )}
                          {canEdit ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRollbackSnapshot(snapshot)}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Rollback
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" disabled>
                              <Lock className="h-3 w-3 mr-1" />
                              Rollback
                            </Button>
                          )}
                          {canEdit ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeleteSnapshot(snapshot)}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Snapshot Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create ZFS Snapshot"
      >
        <form onSubmit={handleCreateSnapshot} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Dataset or Volume
            </label>
            <select
              value={createFormData.dataset}
              onChange={(e) => setCreateFormData(prev => ({ ...prev, dataset: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select a dataset or volume</option>
              {datasets.map((dataset) => (
                <option key={dataset.name} value={dataset.name}>
                  {dataset.name} ({dataset.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Snapshot Name
            </label>
            <input
              type="text"
              value={createFormData.snapshot_name}
              onChange={(e) => setCreateFormData(prev => ({ ...prev, snapshot_name: e.target.value }))}
              placeholder="e.g., backup-2024-01-01"
              pattern="[a-zA-Z0-9\-_]+"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Use descriptive names like "backup-YYYY-MM-DD" or "before-update"
            </p>
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
              <Camera className="h-4 w-4 mr-2" />
              Create Snapshot
            </Button>
          </div>
        </form>
      </Modal>

      {/* Clone Snapshot Modal */}
      <Modal
        isOpen={cloneModalOpen}
        onClose={() => setCloneModalOpen(false)}
        title="Clone Snapshot"
      >
        <form onSubmit={handleCloneSnapshot} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Source Snapshot
            </label>
            <div className="bg-gray-50 dark:bg-gray-600 rounded-md p-3">
              <div className="text-sm font-mono text-gray-900 dark:text-white">
                {selectedSnapshot?.name}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              New Dataset Name
            </label>
            <div className="flex items-center">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-400 text-sm">
                {selectedSnapshot ? getPoolName(selectedSnapshot.name) + '/' : ''}
              </span>
              <input
                type="text"
                value={cloneFormData.clone_name}
                onChange={(e) => setCloneFormData(prev => ({ ...prev, clone_name: e.target.value }))}
                placeholder="e.g., my-new-dataset"
                pattern="[a-zA-Z0-9\-_]+"
                className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Enter only the dataset name. The full path will be:{" "}
              <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">
                {selectedSnapshot ? getPoolName(selectedSnapshot.name) + '/' + cloneFormData.clone_name : 'pool/name'}
              </code>
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCloneModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Copy className="h-4 w-4 mr-2" />
              Clone Snapshot
            </Button>
          </div>
        </form>
      </Modal>

      {/* Clone Dependency Error Modal */}
      <Modal
        isOpen={cloneErrorModalOpen}
        onClose={() => setCloneErrorModalOpen(false)}
        title="Cannot Delete Snapshot - Dependent Clones Found"
        size="lg"
      >
        <div className="space-y-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
                  Snapshot cannot be deleted because it has dependent clones
                </h3>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                  The snapshot <code className="font-mono bg-red-100 dark:bg-red-800 px-1 rounded">{cloneErrorData?.snapshot}</code> 
                  has the following dependent clones that rely on it:
                </p>
              </div>
            </div>
          </div>

          {cloneErrorData?.clones && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                Dependent Clones:
              </h4>
              <div className="font-mono text-sm text-yellow-700 dark:text-yellow-400 whitespace-pre-wrap bg-yellow-100 dark:bg-yellow-800 p-3 rounded">
                {cloneErrorData.clones}
              </div>
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
              Resolution Options:
            </h4>
            <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-2">
              <li className="flex items-start">
                <span className="mr-2">1.</span>
                <span>Delete the dependent clones listed above first, then try deleting the snapshot again</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">2.</span>
                <span>Use the recursive destroy option (not available in GUI) which will delete both the snapshot and all dependent clones</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">3.</span>
                <span>Keep the snapshot if the clones are still needed</span>
              </li>
            </ul>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={() => setCloneErrorModalOpen(false)} variant="primary">
              Understand
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}