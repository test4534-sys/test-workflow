import React, { useState, useEffect } from 'react'
import { Users, Plus, RefreshCw, Trash2, UserPlus, Users as GroupsIcon, Shield, ShieldOff, User, Key, UserMinus, Edit, UserCheck, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'

interface User {
  id: number
  username: string
  full_name: string
  groups: string[]
  samba_enabled: boolean
  created_at: string
  is_system_user?: boolean
}

interface Group {
  id: number
  name: string
  users: string[]
  created_at: string
  is_system_group?: boolean
}

export default function UsersGroups() {
  const [users, setUsers] = useState<User[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false)
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false)
  const [addUserToGroupModalOpen, setAddUserToGroupModalOpen] = useState(false)
  const [removeUserFromGroupModalOpen, setRemoveUserFromGroupModalOpen] = useState(false)
  const [enableSambaModalOpen, setEnableSambaModalOpen] = useState(false)
  const [editUserModalOpen, setEditUserModalOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const { addToast } = useToast()
  const { isAdmin, canEdit } = useAuth()
  const navigate = useNavigate()

  const [userFormData, setUserFormData] = useState({
    username: '',
    full_name: '',
    password: '',
    groups: [] as string[],
    enable_samba: true
  })

  const [groupFormData, setGroupFormData] = useState({
    name: ''
  })

  const [addUserFormData, setAddUserFormData] = useState({
    username: ''
  })

  const [removeUserFormData, setRemoveUserFormData] = useState({
    username: ''
  })

  const [sambaPasswordFormData, setSambaPasswordFormData] = useState({
    password: '',
    confirmPassword: ''
  })

  const [editUserFormData, setEditUserFormData] = useState({
    full_name: '',
    password: '',
    confirmPassword: '',
    groups: [] as string[]
  })

  const loadData = async () => {
    try {
      setLoading(true)
      const [usersRes, groupsRes] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/users/groups')
      ])
      setUsers(usersRes.data)
      setGroups(groupsRes.data)
    } catch (error: any) {
      addToast({
        title: 'Error loading users and groups',
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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/api/users', userFormData)
      addToast({
        title: 'User created successfully',
        type: 'success'
      })
      setCreateUserModalOpen(false)
      setUserFormData({
        username: '',
        full_name: '',
        password: '',
        groups: [],
        enable_samba: true
      })
      await loadData()
    } catch (error: any) {
      addToast({
        title: 'Error creating user',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/api/users/groups', groupFormData)
      addToast({
        title: 'Group created successfully',
        type: 'success'
      })
      setCreateGroupModalOpen(false)
      setGroupFormData({ name: '' })
      await loadData()
    } catch (error: any) {
      addToast({
        title: 'Error creating group',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleAddUserToGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGroup) return

    try {
      await api.post(`/api/users/groups/${selectedGroup.name}/add-user`, {
        username: addUserFormData.username
      })
      addToast({
        title: 'User added to group successfully',
        type: 'success'
      })
      setAddUserToGroupModalOpen(false)
      setAddUserFormData({ username: '' })
      setSelectedGroup(null)
      await loadData()
    } catch (error: any) {
      addToast({
        title: 'Error adding user to group',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleRemoveUserFromGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGroup) return

    try {
      await api.post(`/api/users/groups/${selectedGroup.name}/remove-user`, {
        username: removeUserFormData.username
      })
      addToast({
        title: 'User removed from group successfully',
        type: 'success'
      })
      setRemoveUserFromGroupModalOpen(false)
      setRemoveUserFormData({ username: '' })
      setSelectedGroup(null)
      await loadData()
    } catch (error: any) {
      addToast({
        title: 'Error removing user from group',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleEnableSamba = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return

    if (sambaPasswordFormData.password !== sambaPasswordFormData.confirmPassword) {
      addToast({
        title: 'Passwords do not match',
        type: 'error'
      })
      return
    }

    try {
      await api.post(`/api/users/${selectedUser.username}/enable-samba`, {
        password: sambaPasswordFormData.password
      })
      addToast({
        title: 'Samba enabled successfully',
        type: 'success'
      })
      setEnableSambaModalOpen(false)
      setSambaPasswordFormData({ password: '', confirmPassword: '' })
      setSelectedUser(null)
      await loadData()
    } catch (error: any) {
      addToast({
        title: 'Error enabling Samba',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleDisableSamba = async (user: User) => {
    if (!confirm(`Are you sure you want to disable Samba for user:\n${user.username}?`)) {
      return
    }

    try {
      await api.post(`/api/users/${user.username}/disable-samba`)
      addToast({
        title: 'Samba disabled successfully',
        type: 'success'
      })
      await loadData()
    } catch (error: any) {
      addToast({
        title: 'Error disabling Samba',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return

    if (editUserFormData.password !== editUserFormData.confirmPassword) {
      addToast({
        title: 'Passwords do not match',
        type: 'error'
      })
      return
    }

    try {
      await api.put(`/api/users/${selectedUser.username}`, {
        full_name: editUserFormData.full_name,
        password: editUserFormData.password || undefined,
        groups: editUserFormData.groups
      })
      addToast({
        title: 'User updated successfully',
        type: 'success'
      })
      setEditUserModalOpen(false)
      setSelectedUser(null)
      setEditUserFormData({
        full_name: '',
        password: '',
        confirmPassword: '',
        groups: []
      })
      await loadData()
    } catch (error: any) {
      addToast({
        title: 'Error updating user',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete user:\n${user.username}?`)) {
      return
    }

    try {
      await api.delete(`/api/users/${user.username}`)
      addToast({
        title: 'User deleted successfully',
        type: 'success'
      })
      await loadData()
    } catch (error: any) {
      addToast({
        title: 'Error deleting user',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleDeleteGroup = async (group: Group) => {
    if (!confirm(`Are you sure you want to delete group:\n${group.name}?`)) {
      return
    }

    try {
      await api.delete(`/api/users/groups/${group.name}`)
      addToast({
        title: 'Group deleted successfully',
        type: 'success'
      })
      await loadData()
    } catch (error: any) {
      addToast({
        title: 'Error deleting group',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const openAddUserToGroupModal = (group: Group) => {
    setSelectedGroup(group)
    setAddUserToGroupModalOpen(true)
  }

  const openRemoveUserFromGroupModal = (group: Group) => {
    setSelectedGroup(group)
    setRemoveUserFromGroupModalOpen(true)
  }

  const openEnableSambaModal = (user: User) => {
    if (user.samba_enabled) {
      addToast({
        title: 'Samba already enabled',
        description: `User ${user.username} already has Samba access enabled.`,
        type: 'warning'
      })
      return
    }
    setSelectedUser(user)
    setEnableSambaModalOpen(true)
  }

  const openEditUserModal = (user: User) => {
    setSelectedUser(user)
    setEditUserFormData({
      full_name: user.full_name,
      password: '',
      confirmPassword: '',
      groups: [...user.groups]
    })
    setEditUserModalOpen(true)
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Users & Groups</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage system users and groups for Samba access
          </p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <Button onClick={() => navigate('/users/delegated')} variant="secondary">
              <UserCheck className="h-4 w-4 mr-2" />
              Delegated Administrator
            </Button>
          )}
          {canEdit ? (
            <Button onClick={() => setCreateGroupModalOpen(true)} variant="secondary">
              <GroupsIcon className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          ) : (
            <Button variant="secondary" disabled>
              <Lock className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          )}
          {canEdit ? (
            <Button onClick={() => setCreateUserModalOpen(true)} variant="primary">
              <UserPlus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          ) : (
            <Button variant="primary" disabled>
              <Lock className="h-4 w-4 mr-2" />
              Create User
            </Button>
          )}
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <Users className="h-5 w-5" />
              System Users ({users.length})
            </h2>

            {users.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No users found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{user.username}</h3>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                          System
                        </span>
                        {user.samba_enabled && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                            Samba Enabled
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{user.full_name}</p>
                      <div className="flex flex-wrap gap-2">
                        {user.groups.map((group) => (
                          <span key={group} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                            {group}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {canEdit ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditUserModal(user)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled>
                          <Lock className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                      )}
                      {canEdit ? (
                        !user.samba_enabled ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openEnableSambaModal(user)}
                          >
                            <Key className="h-3 w-3 mr-1" />
                            Enable Samba
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDisableSamba(user)}
                          >
                            <ShieldOff className="h-3 w-3 mr-1" />
                            Disable Samba
                          </Button>
                        )
                      ) : (
                        <Button variant="primary" size="sm" disabled>
                          <Lock className="h-3 w-3 mr-1" />
                          {user.samba_enabled ? 'Disable Samba' : 'Enable Samba'}
                        </Button>
                      )}
                      {canEdit ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeleteUser(user)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button variant="danger" size="sm" disabled>
                          <Lock className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Groups List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <GroupsIcon className="h-5 w-5" />
              System Groups ({groups.length})
            </h2>

            {groups.length === 0 ? (
              <div className="text-center py-8">
                <GroupsIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No groups found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map((group) => (
                  <div key={group.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{group.name}</h3>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                          System
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {group.users.length} members
                      </p>
                      {group.users.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {group.users.map((user) => (
                            <span key={user} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                              {user}
                              {canEdit ? (
                                <button
                                  onClick={() => {
                                    if (confirm(`Remove user "${user}" from group "${group.name}"?`)) {
                                      api.post(`/api/users/groups/${group.name}/remove-user`, { username: user })
                                        .then(() => {
                                          addToast({
                                            title: 'User removed from group',
                                            description: `User ${user} removed from ${group.name}`,
                                            type: 'success'
                                          })
                                          loadData()
                                        })
                                        .catch((error: any) => {
                                          addToast({
                                            title: 'Error removing user from group',
                                            description: error.response?.data?.detail || error.message,
                                            type: 'error'
                                          })
                                        })
                                    }
                                  }}
                                  className="ml-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  ×
                                </button>
                              ) : (
                                <span className="ml-1 text-gray-400 dark:text-gray-500 cursor-not-allowed">×</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        {canEdit ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAddUserToGroupModal(group)}
                          >
                            <User className="h-3 w-3 mr-1" />
                            Add User
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled>
                            <Lock className="h-3 w-3 mr-1" />
                            Add User
                          </Button>
                        )}
                        {group.users.length > 0 && canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRemoveUserFromGroupModal(group)}
                          >
                            <UserMinus className="h-3 w-3 mr-1" />
                            Remove User
                          </Button>
                        )}
                        {group.users.length > 0 && !canEdit && (
                          <Button variant="outline" size="sm" disabled>
                            <Lock className="h-3 w-3 mr-1" />
                            Remove User
                          </Button>
                        )}
                      </div>
                    </div>
                    {canEdit ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteGroup(group)}
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
            )}
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      <Modal
        isOpen={createUserModalOpen}
        onClose={() => setCreateUserModalOpen(false)}
        title="Create System User"
        size="lg"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={userFormData.username}
              onChange={(e) => setUserFormData(prev => ({ ...prev, username: e.target.value }))}
              placeholder="e.g., john"
              pattern="[a-z0-9_]+"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Full Name
            </label>
            <input
              type="text"
              value={userFormData.full_name}
              onChange={(e) => setUserFormData(prev => ({ ...prev, full_name: e.target.value }))}
              placeholder="e.g., John Doe"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={userFormData.password}
              onChange={(e) => setUserFormData(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Enter password"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Groups
            </label>
            <select
              multiple
              value={userFormData.groups}
              onChange={(e) => setUserFormData(prev => ({ 
                ...prev, 
                groups: Array.from(e.target.selectedOptions, option => option.value)
              }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              size={4}
            >
              {groups.map((group) => (
                <option key={group.name} value={group.name}>
                  {group.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Hold Ctrl/Cmd to select multiple groups
            </p>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              checked={userFormData.enable_samba}
              onChange={(e) => setUserFormData(prev => ({ ...prev, enable_samba: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Enable Samba access for this user
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateUserModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <UserPlus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Group Modal */}
      <Modal
        isOpen={createGroupModalOpen}
        onClose={() => setCreateGroupModalOpen(false)}
        title="Create System Group"
      >
        <form onSubmit={handleCreateGroup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Group Name
            </label>
            <input
              type="text"
              value={groupFormData.name}
              onChange={(e) => setGroupFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., sharegroup"
              pattern="[a-z0-9_]+"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateGroupModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <GroupsIcon className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add User to Group Modal */}
      <Modal
        isOpen={addUserToGroupModalOpen}
        onClose={() => setAddUserToGroupModalOpen(false)}
        title={`Add User to ${selectedGroup?.name}`}
      >
        <form onSubmit={handleAddUserToGroup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Username
            </label>
            <select
              value={addUserFormData.username}
              onChange={(e) => setAddUserFormData(prev => ({ ...prev, username: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select a user</option>
              {users
                .filter(user => !selectedGroup?.users.includes(user.username))
                .map((user) => (
                  <option key={user.username} value={user.username}>
                    {user.username} ({user.full_name})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddUserToGroupModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <User className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </div>
        </form>
      </Modal>

      {/* Remove User from Group Modal */}
      <Modal
        isOpen={removeUserFromGroupModalOpen}
        onClose={() => setRemoveUserFromGroupModalOpen(false)}
        title={`Remove User from ${selectedGroup?.name}`}
      >
        <form onSubmit={handleRemoveUserFromGroup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select User to Remove
            </label>
            <select
              value={removeUserFormData.username}
              onChange={(e) => setRemoveUserFormData(prev => ({ ...prev, username: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select a user</option>
              {selectedGroup?.users.map((user) => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              This will remove the selected user from the group. The user will lose any permissions associated with this group.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveUserFromGroupModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              <UserMinus className="h-4 w-4 mr-2" />
              Remove User
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={editUserModalOpen}
        onClose={() => setEditUserModalOpen(false)}
        title={`Edit User: ${selectedUser?.username}`}
        size="lg"
      >
        <form onSubmit={handleEditUser} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Full Name
            </label>
            <input
              type="text"
              value={editUserFormData.full_name}
              onChange={(e) => setEditUserFormData(prev => ({ ...prev, full_name: e.target.value }))}
              placeholder="e.g., John Doe"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              New Password (leave empty to keep current)
            </label>
            <input
              type="password"
              value={editUserFormData.password}
              onChange={(e) => setEditUserFormData(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Enter new password"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              value={editUserFormData.confirmPassword}
              onChange={(e) => setEditUserFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              placeholder="Confirm new password"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Groups
            </label>
            <select
              multiple
              value={editUserFormData.groups}
              onChange={(e) => setEditUserFormData(prev => ({
                ...prev,
                groups: Array.from(e.target.selectedOptions, option => option.value)
              }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              size={4}
            >
              {groups.map((group) => (
                <option key={group.name} value={group.name}>
                  {group.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Hold Ctrl/Cmd to select multiple groups
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditUserModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Edit className="h-4 w-4 mr-2" />
              Update User
            </Button>
          </div>
        </form>
      </Modal>

      {/* Enable Samba Modal */}
      <Modal
        isOpen={enableSambaModalOpen}
        onClose={() => setEnableSambaModalOpen(false)}
        title={`Enable Samba for ${selectedUser?.username}`}
      >
        <form onSubmit={handleEnableSamba} className="space-y-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              Set Samba password for user {selectedUser?.username}. This will enable Samba access for file sharing.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Samba Password
            </label>
            <input
              type="password"
              value={sambaPasswordFormData.password}
              onChange={(e) => setSambaPasswordFormData(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Enter Samba password"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={sambaPasswordFormData.confirmPassword}
              onChange={(e) => setSambaPasswordFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              placeholder="Confirm Samba password"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEnableSambaModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Key className="h-4 w-4 mr-2" />
              Enable Samba
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}