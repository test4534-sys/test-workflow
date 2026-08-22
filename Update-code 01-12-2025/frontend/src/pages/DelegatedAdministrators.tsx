import React, { useState, useEffect } from 'react'
import { UserCheck, Plus, RefreshCw, Trash2, Shield, Eye, UserX } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'

interface DelegatedUser {
  username: string
  role: 'admin' | 'readonly'
}

export default function DelegatedAdministrators() {
  const [delegatedUsers, setDelegatedUsers] = useState<{ admin: string[], readonly: string[] }>({ admin: [], readonly: [] })
  const [allUsers, setAllUsers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [addAdminModalOpen, setAddAdminModalOpen] = useState(false)
  const [addReadonlyModalOpen, setAddReadonlyModalOpen] = useState(false)
  const [selectedUsername, setSelectedUsername] = useState('')
  const { addToast } = useToast()

  const loadData = async () => {
    try {
      setLoading(true)
      const [delegatedRes, usersRes] = await Promise.all([
        api.get('/api/admin/delegated'),
        api.get('/api/users')
      ])

      if (delegatedRes.data.success) {
        setDelegatedUsers(delegatedRes.data.data)
      }

      // Extract usernames from users response
      const usernames = usersRes.data.map((user: any) => user.username)
      setAllUsers(usernames)
    } catch (error: any) {
      addToast({
        title: 'Error loading delegated administrators',
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

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUsername) return

    try {
      await api.post('/api/admin/delegated/admin', null, { params: { username: selectedUsername } })
      addToast({
        title: 'Administrator added',
        description: `${selectedUsername} has been granted full access administrator privileges`,
        type: 'success'
      })
      setAddAdminModalOpen(false)
      setSelectedUsername('')
      loadData()
    } catch (error: any) {
      addToast({
        title: 'Error adding administrator',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleAddReadonly = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUsername) return

    try {
      await api.post('/api/admin/delegated/readonly', null, { params: { username: selectedUsername } })
      addToast({
        title: 'Read-only administrator added',
        description: `${selectedUsername} has been granted read-only administrator privileges`,
        type: 'success'
      })
      setAddReadonlyModalOpen(false)
      setSelectedUsername('')
      loadData()
    } catch (error: any) {
      addToast({
        title: 'Error adding read-only administrator',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleRemoveUser = async (username: string) => {
    if (!confirm(`Are you sure you want to remove delegated administrator privileges from ${username}?`)) {
      return
    }

    try {
      await api.delete(`/api/admin/delegated/${username}`)
      addToast({
        title: 'Administrator removed',
        description: `${username} has been removed from delegated administrators`,
        type: 'success'
      })
      loadData()
    } catch (error: any) {
      addToast({
        title: 'Error removing administrator',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  // Get available users (not already delegated administrators)
  const getAvailableUsers = () => {
    const delegatedUsernames = [...delegatedUsers.admin, ...delegatedUsers.readonly]
    return allUsers.filter(username => !delegatedUsernames.includes(username))
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Delegated Administrators</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage users with delegated administrative privileges
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setAddReadonlyModalOpen(true)} variant="secondary">
            <Eye className="h-4 w-4 mr-2" />
            Add Read-only Admin
          </Button>
          <Button onClick={() => setAddAdminModalOpen(true)} variant="primary">
            <Shield className="h-4 w-4 mr-2" />
            Add Full Access Admin
          </Button>
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Full Access Administrators */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              Full Access Administrators ({delegatedUsers.admin.length})
            </h2>

            {delegatedUsers.admin.length === 0 ? (
              <div className="text-center py-8">
                <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No full access administrators</p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                  Users with full access can perform all administrative tasks
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {delegatedUsers.admin.map((username) => (
                  <div key={username} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-green-500" />
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{username}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Full Access Administrator</p>
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemoveUser(username)}
                    >
                      <UserX className="h-3 w-3 mr-1" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Read-only Administrators */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-500" />
              Read-only Administrators ({delegatedUsers.readonly.length})
            </h2>

            {delegatedUsers.readonly.length === 0 ? (
              <div className="text-center py-8">
                <Eye className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No read-only administrators</p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                  Users with read-only access can view all configurations but cannot make changes
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {delegatedUsers.readonly.map((username) => (
                  <div key={username} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Eye className="h-5 w-5 text-blue-500" />
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{username}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Read-only Administrator</p>
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemoveUser(username)}
                    >
                      <UserX className="h-3 w-3 mr-1" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Full Access Admin Modal */}
      <Modal
        isOpen={addAdminModalOpen}
        onClose={() => setAddAdminModalOpen(false)}
        title="Add Full Access Administrator"
      >
        <form onSubmit={handleAddAdmin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select User
            </label>
            <select
              value={selectedUsername}
              onChange={(e) => setSelectedUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select a user</option>
              {getAvailableUsers().map((username) => (
                <option key={username} value={username}>
                  {username}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-800 dark:text-green-300">
              <strong>Full Access Administrator:</strong> This user will have complete access to all features including creating pools, iSCSI targets, Samba shares, snapshots, and managing users.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddAdminModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Shield className="h-4 w-4 mr-2" />
              Add Administrator
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Read-only Admin Modal */}
      <Modal
        isOpen={addReadonlyModalOpen}
        onClose={() => setAddReadonlyModalOpen(false)}
        title="Add Read-only Administrator"
      >
        <form onSubmit={handleAddReadonly} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select User
            </label>
            <select
              value={selectedUsername}
              onChange={(e) => setSelectedUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select a user</option>
              {getAvailableUsers().map((username) => (
                <option key={username} value={username}>
                  {username}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Read-only Administrator:</strong> This user can view all configurations and monitor the system, but cannot make any changes or perform administrative actions.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddReadonlyModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Eye className="h-4 w-4 mr-2" />
              Add Read-only Admin
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}