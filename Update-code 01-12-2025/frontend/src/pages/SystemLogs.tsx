import React, { useState, useEffect, useCallback } from 'react'
import { FileText, RefreshCw, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { FixedSizeList as List } from 'react-window'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'

interface SystemLog {
  timestamp: string
  service: string
  message: string
  level: string
}

export default function SystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(50)
  const [serviceFilter, setServiceFilter] = useState('all')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const { addToast } = useToast()

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: limit.toString()
      })

      if (serviceFilter !== 'all') {
        params.append('service', serviceFilter)
      }

      if (debouncedSearchTerm.trim()) {
        params.append('search', debouncedSearchTerm.trim())
      }

      const response = await api.get(`/api/system/logs?${params.toString()}`)
      setLogs(response.data)
    } catch (error: any) {
      addToast({
        title: 'Error loading logs',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }, [limit, serviceFilter, debouncedSearchTerm, addToast])

  useEffect(() => {
    loadLogs()
  }, [limit, serviceFilter, debouncedSearchTerm])

  // Set debounced search term to empty since search is removed
  useEffect(() => {
    setDebouncedSearchTerm('')
  }, [])

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      if (isNaN(date.getTime())) {
        return timestamp
      }
      return date.toLocaleString([], {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    } catch (error) {
      console.warn('Error formatting timestamp:', error)
      return timestamp
    }
  }

  const getLogLevelIcon = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />
      default:
        return <Info className="h-4 w-4 text-gray-500" />
    }
  }

  const getLogLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'border-red-200 bg-red-50 dark:bg-red-900/20'
      case 'warning':
        return 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20'
      case 'info':
        return 'border-blue-200 bg-blue-50 dark:bg-blue-900/20'
      default:
        return 'border-gray-200 bg-gray-50 dark:bg-gray-700'
    }
  }

  // Log item component for virtualization
  const LogItem = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const log = logs[index]
    return (
      <div style={style} className="px-6 py-1">
        <div
          className={`flex items-start space-x-3 p-4 rounded-lg border ${getLogLevelColor(log.level)}`}
        >
          {getLogLevelIcon(log.level)}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {log.service}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatTimestamp(log.timestamp)}
              </p>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
              {log.message}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Skeleton loading component
  const LogSkeleton = () => (
    <div className="px-6 py-1">
      <div className="flex items-start space-x-3 p-4 rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-700 dark:border-gray-600 animate-pulse">
        <div className="h-4 w-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-20"></div>
            <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-24"></div>
          </div>
          <div className="space-y-1">
            <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-full"></div>
            <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">System Logs</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              View system logs and monitor service activity
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-md w-24 animate-pulse"></div>
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-md w-32 animate-pulse"></div>
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-md w-32 animate-pulse"></div>
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-md w-20 animate-pulse"></div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              System Logs
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                Loading...
              </span>
            </h2>

            <div className="max-h-96 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
              <List
                height={384}
                itemCount={8} // Show 8 skeleton items
                itemSize={120}
                width="100%"
              >
                {({ index, style }: { index: number; style: React.CSSProperties }) => <div style={style}><LogSkeleton key={index} /></div>}
              </List>
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">System Logs</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            View system logs and monitor service activity
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          >
            <option value={20}>Last 20 logs</option>
            <option value={50}>Last 50 logs</option>
            <option value={100}>Last 100 logs</option>
            <option value={200}>Last 200 logs</option>
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All Services</option>
            <option value="systemd">System</option>
            <option value="kernel">Kernel</option>
            <option value="NetworkManager">Network</option>
            <option value="smbd">Samba</option>
            <option value="nmbd">Samba (NMB)</option>
            <option value="targetcli">iSCSI</option>
            <option value="iscsid">iSCSI (Client)</option>
            <option value="zfs">ZFS</option>
          </select>


          <button
            onClick={loadLogs}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            System Logs
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
              ({logs.length} entries)
            </span>
          </h2>

          <div className="max-h-96 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
            {logs.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No system logs available</p>
            ) : (
              <List
                height={384} // 96 * 4 = 384px (max-h-96)
                itemCount={logs.length}
                itemSize={120} // Approximate height per log item
                width="100%"
              >
                {LogItem}
              </List>
            )}
          </div>
        </div>
      </div>

      {/* Information Panel */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Log Levels
            </h4>
            <ul className="text-sm text-blue-700 dark:text-blue-400 mt-2 space-y-1">
              <li>• <strong>ERROR</strong>: Critical errors that require attention</li>
              <li>• <strong>WARNING</strong>: Potential issues or important notifications</li>
              <li>• <strong>INFO</strong>: General information and service status updates</li>
              <li>• <strong>DEBUG</strong>: Detailed debugging information</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}