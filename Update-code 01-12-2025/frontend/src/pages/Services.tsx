import React, { useState, useEffect } from 'react'
import { Play, Square, RefreshCw, Power, PowerOff, Settings, Server, AlertCircle, CheckCircle, Clock, FileText, Lock } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'

interface ServiceStatus {
  success: boolean
  service: {
    name: string
    description: string
    service_names: string[]
    display_name: string
  }
  components: {
    [key: string]: {
      simple_status: string
      detailed_status: {
        ActiveState?: string
        SubState?: string
        LoadState?: string
        UnitFileState?: string
      }
    }
  }
  overall_status: string
  is_enabled?: boolean
}

interface AllServicesStatus {
  success: boolean
  services: {
    [key: string]: ServiceStatus
  }
}

export default function Services() {
  const [services, setServices] = useState<AllServicesStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [logsModal, setLogsModal] = useState<{ isOpen: boolean; serviceKey: string; logs: any }>({ isOpen: false, serviceKey: '', logs: null })
  const { addToast } = useToast()
  const { canEdit } = useAuth()

  const loadServices = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/services')
      setServices(response.data)
    } catch (error: any) {
      addToast({
        title: 'Error loading services',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadServices()
  }, [])

  const handleServiceAction = async (serviceKey: string, action: string) => {
    try {
      setActionLoading(`${serviceKey}-${action}`)
      const response = await api.post(`/api/services/${serviceKey}/${action}`)

      if (response.data.success) {
        // Create specific success messages based on action
        const actionMessages = {
          start: 'started',
          stop: 'stopped',
          restart: 'restarted',
          enable: 'enabled',
          disable: 'disabled'
        }

        const serviceName = response.data.service || serviceKey
        const actionText = actionMessages[action as keyof typeof actionMessages] || action + 'ed'

        addToast({
          title: 'Success',
          description: `${serviceName} ${actionText} successfully`,
          type: 'success'
        })
      } else {
        // Show specific error message from backend
        addToast({
          title: `Error ${action}ing service`,
          description: response.data.message,
          type: 'error'
        })
      }

      // Reload services status
      await loadServices()
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message || 'Unknown error occurred'
      addToast({
        title: `Error ${action}ing service`,
        description: errorMessage,
        type: 'error'
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleViewLogs = async (serviceKey: string) => {
    try {
      const response = await api.get(`/api/services/${serviceKey}/logs`)
      setLogsModal({ isOpen: true, serviceKey, logs: response.data })
    } catch (error: any) {
      addToast({
        title: 'Error loading logs',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-300'
      case 'stopped': return 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-300'
      case 'activating': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300'
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <CheckCircle className="h-4 w-4" />
      case 'stopped': return <PowerOff className="h-4 w-4" />
      case 'activating': return <Clock className="h-4 w-4" />
      default: return <AlertCircle className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading services...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Services</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage system services and their status
          </p>
        </div>
        <Button onClick={loadServices} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {services && Object.entries(services.services).map(([serviceKey, serviceStatus]) => (
          <div key={serviceKey} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Server className="h-6 w-6 text-blue-600" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {serviceStatus.service.display_name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {serviceStatus.service.description}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(serviceStatus.overall_status)}`}>
                  {getStatusIcon(serviceStatus.overall_status)}
                  <span className="ml-1 capitalize">{serviceStatus.overall_status}</span>
                </span>
              </div>
            </div>

            {/* Service Components */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Components</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(serviceStatus.components).map(([componentName, component]) => (
                  <div key={componentName} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{componentName}</span>
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${getStatusColor(component.simple_status)}`}>
                      {getStatusIcon(component.simple_status)}
                      <span className="ml-1 capitalize">{component.simple_status}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => handleServiceAction(serviceKey, 'start')}
                  loading={actionLoading === `${serviceKey}-start`}
                  disabled={serviceStatus.overall_status === 'running'}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Start
                </Button>
              ) : (
                <Button
                  variant="success"
                  size="sm"
                  disabled
                >
                  <Lock className="h-4 w-4 mr-1" />
                  Start
                </Button>
              )}

              {canEdit ? (
                <Button
                  variant="warning"
                  size="sm"
                  onClick={() => handleServiceAction(serviceKey, 'stop')}
                  loading={actionLoading === `${serviceKey}-stop`}
                  disabled={serviceStatus.overall_status === 'stopped'}
                >
                  <Square className="h-4 w-4 mr-1" />
                  Stop
                </Button>
              ) : (
                <Button
                  variant="warning"
                  size="sm"
                  disabled
                >
                  <Lock className="h-4 w-4 mr-1" />
                  Stop
                </Button>
              )}

              {canEdit ? (
                <Button
                  variant="info"
                  size="sm"
                  onClick={() => handleServiceAction(serviceKey, 'restart')}
                  loading={actionLoading === `${serviceKey}-restart`}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Restart
                </Button>
              ) : (
                <Button
                  variant="info"
                  size="sm"
                  disabled
                >
                  <Lock className="h-4 w-4 mr-1" />
                  Restart
                </Button>
              )}

              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleViewLogs(serviceKey)}
              >
                <FileText className="h-4 w-4 mr-1" />
                Logs
              </Button>

              {canEdit ? (
                serviceStatus.is_enabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleServiceAction(serviceKey, 'disable')}
                    loading={actionLoading === `${serviceKey}-disable`}
                  >
                    <PowerOff className="h-4 w-4 mr-1" />
                    Disable
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleServiceAction(serviceKey, 'enable')}
                    loading={actionLoading === `${serviceKey}-enable`}
                  >
                    <Power className="h-4 w-4 mr-1" />
                    Enable
                  </Button>
                )
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                >
                  <Lock className="h-4 w-4 mr-1" />
                  {serviceStatus.is_enabled ? 'Disable' : 'Enable'}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Logs Modal */}
      <Modal
        isOpen={logsModal.isOpen}
        onClose={() => setLogsModal({ isOpen: false, serviceKey: '', logs: null })}
        title={`${logsModal.logs?.service || logsModal.serviceKey} Service Logs`}
        size="lg"
      >
        <div className="space-y-4">
          {logsModal.logs?.logs && Object.entries(logsModal.logs.logs).map(([serviceName, logLines]: [string, any]) => (
            <div key={serviceName}>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                {serviceName}
              </h4>
              <div className="bg-gray-100 dark:bg-gray-800 rounded p-3 max-h-96 overflow-y-auto">
                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {Array.isArray(logLines) ? logLines.join('\n') : logLines}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Information Panel */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start">
          <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Service Management Information
            </h4>
            <ul className="text-sm text-blue-700 dark:text-blue-400 mt-2 space-y-1">
              <li>• <strong>Start</strong>: Start the service immediately</li>
              <li>• <strong>Stop</strong>: Stop the service immediately</li>
              <li>• <strong>Restart</strong>: Restart the service (stop then start)</li>
              <li>• <strong>Logs</strong>: View recent service logs for troubleshooting</li>
              <li>• <strong>Enable</strong>: Configure the service to start automatically at boot</li>
              <li>• <strong>Disable</strong>: Prevent the service from starting automatically at boot</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
