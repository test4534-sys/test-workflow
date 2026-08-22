import React, { useState, useEffect } from 'react'
import { Server, Database, Target, HardDrive, RefreshCw, Network, Share2, FileText, Users, Wifi, WifiOff, Monitor, Clock } from 'lucide-react'
import { api } from '../lib/api'
import { Pool, Target as TargetType, Dataset } from '../lib/types'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../hooks/useToast'

interface SystemStatus {
  iscsi: any
  zfs: any
  samba: any
}

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



export default function Dashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [pools, setPools] = useState<Pool[]>([])
  const [targets, setTargets] = useState<TargetType[]>([])
  const [sambaShares, setSambaShares] = useState<any[]>([])
  const [networkInterfaces, setNetworkInterfaces] = useState<NetworkInterface[]>([])
  const [systemBasicInfo, setSystemBasicInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { addToast } = useToast()

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Load all data in parallel with individual error handling
      const requests = [
        { key: 'status', request: api.get('/api/system/status') },
        { key: 'pools', request: api.get('/api/zfs/pools') },
        { key: 'targets', request: api.get('/api/targets') },
        { key: 'sambaShares', request: api.get('/api/samba/shares') },
        { key: 'networkInterfaces', request: api.get('/api/network/interfaces') },
        { key: 'systemBasicInfo', request: api.get('/api/system/basic-info') }
      ]

      const results = await Promise.allSettled(requests.map(r => r.request))

      // Process results and set state
      results.forEach((result, index) => {
        const { key } = requests[index]
        if (result.status === 'fulfilled') {
          switch (key) {
            case 'status': setStatus(result.value.data); break
            case 'pools': setPools(result.value.data); break
            case 'targets': setTargets(result.value.data); break
            case 'sambaShares': setSambaShares(result.value.data.data || []); break
            case 'networkInterfaces': setNetworkInterfaces(result.value.data); break
            case 'systemBasicInfo': setSystemBasicInfo(result.value.data.data || null); break
          }
        } else {
          console.warn(`Failed to load ${key}:`, result.reason)
          // Set empty arrays/objects for failed requests to prevent UI crashes
          switch (key) {
            case 'pools': setPools([]); break
            case 'targets': setTargets([]); break
            case 'sambaShares': setSambaShares([]); break
            case 'networkInterfaces': setNetworkInterfaces([]); break
          }
          // Show error toast for failed requests
          addToast({
            title: `${key.charAt(0).toUpperCase() + key.slice(1)} Error`,
            description: `Failed to load ${key} data. Some information may be incomplete.`,
            type: 'error'
          })
        }
      })

      // Show success toast when data loads successfully (only for manual refresh)
      // Auto-refresh will not show success toasts to avoid spam

      // Check if any critical requests failed
      const criticalFailures = results.filter((result, index) =>
        result.status === 'rejected' && ['status', 'pools', 'targets'].includes(requests[index].key)
      )

      if (criticalFailures.length > 0) {
        const errorMessage = 'Some services are unavailable. Dashboard may show incomplete information.'
        setError(errorMessage)
        addToast({
          title: 'Connection Issues',
          description: errorMessage,
          type: 'warning'
        })
      }

    } catch (error: any) {
      console.error('Error loading dashboard data:', error)
      const errorMessage = error.response?.data?.detail || error.userMessage || error.message || 'Failed to load dashboard data'
      setError(errorMessage)
      addToast({
        title: 'Dashboard Error',
        description: errorMessage,
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const getServiceStatus = (service: string) => {
    if (!status) return 'unknown'

    try {
      switch (service) {
        case 'iscsi':
          // Use the overall status from the backend with fallback
          return status.iscsi?.overall === 'running' ? 'running' :
                 status.iscsi?.overall === 'stopped' ? 'stopped' : 'unknown'
        case 'samba':
          // Use the overall status from the backend with fallback
          return status.samba?.services?.overall === 'running' ? 'running' :
                 status.samba?.services?.overall === 'stopped' ? 'stopped' : 'unknown'
        case 'zfs':
          // Check if pools exist and are healthy
          return pools.length > 0 && pools.some(pool => pool.health === 'ONLINE') ? 'running' : 'stopped'
        default:
          return 'unknown'
      }
    } catch (error) {
      console.warn(`Error getting status for ${service}:`, error)
      return 'unknown'
    }
  }

  const getServiceStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'stopped': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
      case 'warning': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return timestamp
      }
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    } catch (error) {
      console.warn('Error formatting timestamp:', error)
      return timestamp
    }
  }

  const stats = [
    {
      name: 'iSCSI Service',
      value: getServiceStatus('iscsi') === 'running' ? 'Running' : 'Stopped',
      icon: Target,
      status: getServiceStatus('iscsi'),
      onClick: () => {
        navigate('/services')
        addToast({
          title: 'Navigating',
          description: 'Opening Services management...',
          type: 'info'
        })
      },
      description: 'iSCSI target service'
    },
    {
      name: 'Samba Service',
      value: getServiceStatus('samba') === 'running' ? 'Running' : 'Stopped',
      icon: Share2,
      status: getServiceStatus('samba'),
      onClick: () => {
        navigate('/services')
        addToast({
          title: 'Navigating',
          description: 'Opening Services management...',
          type: 'info'
        })
      },
      description: 'Samba file sharing'
    },
    {
      name: 'ZFS Pools',
      value: pools.length,
      icon: Database,
      status: 'info',
      onClick: () => {
        navigate('/zfs')
        addToast({
          title: 'Navigating',
          description: 'Opening ZFS Storage management...',
          type: 'info'
        })
      },
      description: 'Active storage pools'
    },
    {
      name: 'iSCSI Targets',
      value: targets.length,
      icon: Target,
      status: 'info',
      onClick: () => {
        navigate('/targets')
        addToast({
          title: 'Navigating',
          description: 'Opening iSCSI Targets management...',
          type: 'info'
        })
      },
      description: 'Configured targets'
    },
    {
      name: 'Samba Shares',
      value: sambaShares.length,
      icon: Share2,
      status: 'info',
      onClick: () => {
        navigate('/samba')
        addToast({
          title: 'Navigating',
          description: 'Opening Samba Shares management...',
          type: 'info'
        })
      },
      description: 'Shared folders'
    },
    {
      name: 'Network Interfaces',
      value: networkInterfaces.filter(i => i.connected).length,
      icon: Network,
      status: 'info',
      onClick: () => {
        navigate('/network')
        addToast({
          title: 'Navigating',
          description: 'Opening Network Interfaces management...',
          type: 'info'
        })
      },
      description: 'Active connections'
    }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading dashboard...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Overview of your ZFS storage and iSCSI targets
          </p>
        </div>
        
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <div className="flex items-center">
            <Server className="h-8 w-8 text-red-600 dark:text-red-400 mr-4" />
            <div>
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-300">
                Connection Error
              </h3>
              <p className="text-red-700 dark:text-red-400 mt-1">
                {error}
              </p>
              <p className="text-sm text-red-600 dark:text-red-500 mt-2">
                Make sure the backend server is running on port 8000
              </p>
              <button
                onClick={loadData}
                className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Retry Connection
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Overview of your storage system and services
          </p>
        </div>
        <button
          onClick={() => {
            loadData()
            addToast({
              title: 'Refreshing',
              description: 'Updating dashboard data...',
              type: 'info'
            })
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          const statusColors = {
            running: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
            stopped: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
            warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
            info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
            unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
          }
          
          return (
            <div 
              key={stat.name} 
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={stat.onClick}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-full ${statusColors[stat.status as keyof typeof statusColors]}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${statusColors[stat.status as keyof typeof statusColors]}`}>
                  {stat.status === 'running' ? 'Running' : stat.status === 'stopped' ? 'Stopped' : stat.status === 'warning' ? 'Warning' : 'Info'}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {stat.name}
                </p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">
                  {stat.value}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {stat.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* System Information */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            System Information
          </h2>
          <div className="space-y-4">
            {systemBasicInfo ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                     <p className="text-sm text-gray-500 dark:text-gray-400">PC Name</p>
                     <p className="font-semibold text-gray-900 dark:text-white">{systemBasicInfo.hostname}</p>
                   </div>
                   <div>
                     <p className="text-sm text-gray-500 dark:text-gray-400">Kernel Version</p>
                     <p className="font-semibold text-gray-900 dark:text-white">{systemBasicInfo.kernel_version}</p>
                   </div>
                   <div>
                     <p className="text-sm text-gray-500 dark:text-gray-400">Date & Time</p>
                     <p className="font-semibold text-gray-900 dark:text-white">{systemBasicInfo.current_datetime}</p>
                   </div>
                   <div>
                     <p className="text-sm text-gray-500 dark:text-gray-400">Timezone</p>
                     <p className="font-semibold text-gray-900 dark:text-white">{systemBasicInfo.timezone}</p>
                   </div>
                   <div>
                     <p className="text-sm text-gray-500 dark:text-gray-400">CPU Cores</p>
                     <p className="font-semibold text-gray-900 dark:text-white">{systemBasicInfo.cpu_cores}</p>
                   </div>
                   <div>
                     <p className="text-sm text-gray-500 dark:text-gray-400">RAM Total</p>
                     <p className="font-semibold text-gray-900 dark:text-white">{systemBasicInfo.ram_total}</p>
                   </div>
                   <div>
                     <p className="text-sm text-gray-500 dark:text-gray-400">RAM Used</p>
                     <p className="font-semibold text-gray-900 dark:text-white">{systemBasicInfo.ram_used}</p>
                   </div>
                   <div>
                     <p className="text-sm text-gray-500 dark:text-gray-400">RAM Available</p>
                     <p className="font-semibold text-gray-900 dark:text-white">{systemBasicInfo.ram_available}</p>
                   </div>
                 </div>
                <div className="border-t border-gray-200 dark:border-gray-600 pt-4 -mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">System Uptime</p>
                  </div>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{systemBasicInfo.uptime}</p>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">Loading system information...</p>
              </div>
            )}
          </div>
        </div>

        {/* ZFS Pools Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Database className="h-5 w-5" />
            ZFS Pools Status
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
              ({pools.length} pools)
            </span>
          </h2>
          <div className="space-y-3">
            {pools.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">No ZFS pools found</p>
            ) : (
              pools.map((pool) => (
                <div key={pool.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{pool.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {pool.size} total • {pool.allocated} used • {pool.free} free
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    pool.health === 'ONLINE'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                  }`}>
                    {pool.health}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

    </div>
  )
}