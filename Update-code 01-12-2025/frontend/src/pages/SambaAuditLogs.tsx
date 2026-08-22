import React, { useState, useEffect } from 'react'
import { ArrowLeft, RefreshCw, HardDrive, Search } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { Button } from '../components/ui/Button'
import { useNavigate } from 'react-router-dom'

export default function SambaAuditLogs() {
  const [auditLogs, setAuditLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredLogs, setFilteredLogs] = useState<string[]>([])
  const { addToast } = useToast()
  const navigate = useNavigate()

  const loadAuditLogs = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/samba/audit/logs?lines=500')
      const logs = response.data.logs || []
      setAuditLogs(logs)
      setFilteredLogs(logs)
    } catch (error: any) {
      addToast({
        title: 'Error loading audit logs',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAuditLogs()
  }, [])

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredLogs(auditLogs)
    } else {
      const filtered = auditLogs.filter(log => 
        log.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredLogs(filtered)
    }
  }, [searchTerm, auditLogs])

  const handleGoBack = () => {
    navigate('/samba')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading audit logs...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Samba Audit Logs</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Monitor file access and operations across all Samba shares
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={loadAuditLogs}
            variant="primary"
            loading={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={handleGoBack}
            variant="secondary"
            size="sm"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Samba Shares
          </Button>
        </div>
      </div>

      {/* Search and Statistics */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-gray-500" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span>Total logs: {auditLogs.length}</span>
            <span>Filtered: {filteredLogs.length}</span>
          </div>
        </div>
      </div>

      {/* Audit Logs Display */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Audit Log Entries
          </h2>

          {filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <HardDrive className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {searchTerm ? 'No matching logs found' : 'No audit logs found'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {searchTerm 
                  ? `No logs match your search term: "${searchTerm}"`
                  : 'Enable audit logging on shares to see activity logs'
                }
              </p>
              {searchTerm && (
                <Button
                  onClick={() => setSearchTerm('')}
                  variant="outline"
                >
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-gray-900 text-gray-100 rounded-lg max-h-[calc(100vh-300px)] overflow-y-auto font-mono text-sm">
              <div className="p-4">
                <div className="space-y-1">
                  {filteredLogs.map((log, index) => (
                    <div key={index} className="border-b border-gray-700 pb-2 last:border-b-0">
                      <div className="break-all">{log}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Information Panel */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-3">
          Audit Log Information
        </h3>
        <div className="grid md:grid-cols-2 gap-6 text-sm text-blue-800 dark:text-blue-400">
          <div>
            <h4 className="font-semibold mb-2">Operations logged:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>connect</strong> - User connects to Samba share</li>
              <li><strong>disconnect</strong> - User disconnects from share</li>
              <li><strong>mkdirat</strong> - Creating a new directory</li>
              <li><strong>unlinkat</strong> - Deleting a file</li>
              <li><strong>read</strong> - Reading file contents</li>
              <li><strong>write</strong> - Writing/creating file contents</li>
              <li><strong>renameat</strong> - Renaming a file or directory</li>
              <li><strong>readdir</strong> - Browsing directory contents</li>
              <li>User information and IP addresses</li>
              <li>Share access patterns and timestamps</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Log format & setup:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Format: user|ip|share|operation</li>
              <li>Logs written to <code>/var/log/samba-audit.log</code></li>
              <li>To enable audit: check option when creating/editing share</li>
              <li>Detailed timestamps and file paths tracked</li>
              <li>Logs automatically rotated by system</li>
              <li>Useful for security monitoring and troubleshooting</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}