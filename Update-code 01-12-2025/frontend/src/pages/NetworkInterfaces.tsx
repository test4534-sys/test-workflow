import React, { useState, useEffect } from 'react'
import { Network, RefreshCw, ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../hooks/useToast'

interface NetworkInterface {
  name: string
  ip: string
  gateway: string
  dns: string
  mac: string
  netmask: string
  connected: boolean
  state: string
}

export default function NetworkInterfaces() {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { addToast } = useToast()

  const loadInterfaces = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await api.get('/api/network/interfaces')
      setInterfaces(response.data)

      addToast({
        title: 'Network Interfaces',
        description: `Loaded ${response.data.length} network interfaces`,
        type: 'success'
      })
    } catch (error: any) {
      console.error('Error loading network interfaces:', error)
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to load network interfaces'
      setError(errorMessage)
      addToast({
        title: 'Error',
        description: errorMessage,
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInterfaces()
  }, [])

  const getStatusColor = (connected: boolean) => {
    return connected ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading network interfaces...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <div className="flex items-center">
            <Network className="h-8 w-8 text-red-600 dark:text-red-400 mr-4" />
            <div>
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-300">
                Connection Error
              </h3>
              <p className="text-red-700 dark:text-red-400 mt-1">
                {error}
              </p>
              <button
                onClick={loadInterfaces}
                className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const connectedCount = interfaces.filter(i => i.connected).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Network Interfaces</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage and monitor network connections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
          <button
            onClick={loadInterfaces}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Interfaces</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{interfaces.length}</p>
            </div>
            <Network className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Connected</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{connectedCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Disconnected</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{interfaces.length - connectedCount}</p>
          </div>
        </div>
      </div>

      {/* Interfaces List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Interface Details
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Detailed information about each network interface
          </p>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {interfaces.length === 0 ? (
            <div className="p-6 text-center">
              <Network className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No network interfaces found</p>
            </div>
          ) : (
            interfaces.map((iface) => (
              <div key={iface.name} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Network className="h-6 w-6 text-blue-500" />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {iface.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {iface.connected ? 'Connected' : 'Disconnected'} • {iface.state}
                      </p>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(iface.connected)}`}>
                    {iface.connected ? 'UP' : 'DOWN'}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">IP Address</p>
                    <p className="font-mono text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
                      {iface.ip || 'Not configured'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Netmask</p>
                    <p className="font-mono text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
                      {iface.netmask || 'Not available'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Gateway</p>
                    <p className="font-mono text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
                      {iface.gateway || 'Not configured'}
                    </p>
                  </div>

                  <div className="space-y-2 md:col-span-2 lg:col-span-1">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">DNS Servers</p>
                    <p className="font-mono text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded break-all">
                      {iface.dns || 'Not configured'}
                    </p>
                  </div>

                  <div className="space-y-2 md:col-span-2 lg:col-span-3">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">MAC Address</p>
                    <p className="font-mono text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
                      {iface.mac || 'Not available'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}