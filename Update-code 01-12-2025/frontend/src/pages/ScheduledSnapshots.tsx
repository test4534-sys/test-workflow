import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Plus, RefreshCw, Trash2, AlertCircle, ArrowLeft, FileText } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'

interface ScheduledSnapshot {
  dataset: string
  snapshot_name: string
  cron_comment: string
  cron_expression: string
  command: string
  next_run: string
  last_run: string
  retention_days?: number
}

export default function ScheduledSnapshots() {
  const navigate = useNavigate()
  const [scheduledSnapshots, setScheduledSnapshots] = useState<ScheduledSnapshot[]>([])
  const [datasets, setDatasets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [logsModalOpen, setLogsModalOpen] = useState(false)
  const [selectedSnapshot, setSelectedSnapshot] = useState<ScheduledSnapshot | null>(null)
  const [snapshotLogs, setSnapshotLogs] = useState<any[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const { addToast } = useToast()

  const [scheduleFormData, setScheduleFormData] = useState({
    dataset: '',
    snapshot_name: '',
    schedule_type: 'daily',
    hour: '*',
    minute: '*',
    day_of_week: '*',
    day_of_month: '*',
    month: '*',
    retention_days: 7
  })

  const loadData = async () => {
    try {
      setLoading(true)
      const [datasetsRes, scheduledRes] = await Promise.all([
        api.get('/api/zfs/datasets'),
        api.get('/api/zfs/snapshots/scheduled'),
      ])
      // Filter to show only datasets and volumes (not snapshots)
      setDatasets(datasetsRes.data.filter((d: any) => d.type === 'filesystem' || d.type === 'volume'))
      setScheduledSnapshots(scheduledRes.data || [])
    } catch (error: any) {
      addToast({
        title: 'Error loading scheduled snapshots',
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

  const validateScheduleForm = () => {
    const errors: string[] = []

    // Validate dataset
    if (!scheduleFormData.dataset) {
      errors.push('Dataset is required')
    }

    // Validate snapshot name
    if (!scheduleFormData.snapshot_name) {
      errors.push('Snapshot name is required')
    } else if (!/^[a-zA-Z0-9\-_]+$/.test(scheduleFormData.snapshot_name)) {
      errors.push('Snapshot name can only contain letters, numbers, hyphens, and underscores')
    }

    // Validate custom schedule fields
    if (scheduleFormData.schedule_type === 'custom') {
      // More robust cron validation regex
      const cronPartRegex = (max: number) => new RegExp(`^(\\*|([0-9]|[1-${Math.floor(max / 10)}][0-9${max > 9 ? `]|${max}` : ''}])|\\*\\/([1-9]|[1-${Math.floor(max / 10)}][0-9${max > 9 ? `]|${max}` : ''}])|(([0-9]|[1-${Math.floor(max / 10)}][0-9${max > 9 ? `]|${max}` : ''}])-([0-9]|[1-${Math.floor(max / 10)}][0-9${max > 9 ? `]|${max}` : ''}]))|(([0-9]|[1-${Math.floor(max / 10)}][0-9${max > 9 ? `]|${max}` : ''}])(,(([0-9]|[1-${Math.floor(max / 10)}][0-9${max > 9 ? `]|${max}` : ''}]))+))$`);
      const cronMinuteRegex = /^(\*|([0-5]?[0-9])|\*\/([1-9]|[1-5][0-9])|([0-5]?[0-9])-([0-5]?[0-9])|([0-5]?[0-9])(,[0-5]?[0-9])+)(,([0-5]?[0-9]))*$/;
      const cronHourRegex = /^(\*|([0-1]?[0-9]|2[0-3])|\*\/([1-9]|1[0-9]|2[0-3])|([0-1]?[0-9]|2[0-3])-([0-1]?[0-9]|2[0-3])|([0-1]?[0-9]|2[0-3])(,[0-1]?[0-9]|2[0-3])+)(,([0-1]?[0-9]|2[0-3]))*$/;
      const cronDayOfMonthRegex = /^(\*|([1-9]|[1-2][0-9]|3[0-1])|\*\/([1-9]|[1-2][0-9]|3[0-1])|([1-9]|[1-2][0-9]|3[0-1])-([1-9]|[1-2][0-9]|3[0-1])|([1-9]|[1-2][0-9]|3[0-1])(,[1-9]|[1-2][0-9]|3[0-1])+)(,([1-9]|[1-2][0-9]|3[0-1]))*$/;
      const cronMonthRegex = /^(\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])|([1-9]|1[0-2])-([1-9]|1[0-2])|([1-9]|1[0-2])(,[1-9]|1[0-2])+)(,([1-9]|1[0-2]))*$/;
      const cronDayOfWeekRegex = /^(\*|[0-7]|\*\/[0-7]|([0-7]-[0-7])|[0-7](,[0-7])+)(,[0-7])*$/;

      // Validate minute (0-59, ranges, lists, steps)
      if (scheduleFormData.minute && !cronMinuteRegex.test(scheduleFormData.minute)) {
        errors.push('Minute must be *, single value (0-59), range (0-59), list (0,15,30), or */X format')
      }

      // Validate hour (0-23, ranges, lists, steps)
      if (scheduleFormData.hour && !cronHourRegex.test(scheduleFormData.hour)) {
        errors.push('Hour must be *, single value (0-23), range (0-23), list (0,6,12), or */X format')
      }

      // Validate day of month (1-31, ranges, lists, steps)
      if (scheduleFormData.day_of_month && !cronDayOfMonthRegex.test(scheduleFormData.day_of_month)) {
        errors.push('Day of month must be *, single value (1-31), range (1-31), list (1,15,30), or */X format')
      }

      // Validate month (1-12, ranges, lists, steps)
      if (scheduleFormData.month && !cronMonthRegex.test(scheduleFormData.month)) {
        errors.push('Month must be *, single value (1-12), range (1-12), list (1,6,12), or */X format')
      }

      // Validate day of week (0-7, ranges, lists, steps)
      if (scheduleFormData.day_of_week && !cronDayOfWeekRegex.test(scheduleFormData.day_of_week)) {
        errors.push('Day of week must be *, single value (0-7), range (0-7), list (0,2,4), or */X format')
      }
    }

    // Validate retention days
    if (scheduleFormData.retention_days !== 0 && (!scheduleFormData.retention_days || scheduleFormData.retention_days < 1)) {
      errors.push('Retention days must be at least 1 or off')
    }

    return errors
  }

  const handleScheduleSnapshot = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate form
    const validationErrors = validateScheduleForm()
    if (validationErrors.length > 0) {
      addToast({
        title: 'Validation Error',
        description: validationErrors.join(', '),
        type: 'error'
      })
      return
    }

    try {
      const response = await api.post('/api/zfs/snapshot/schedule', {
        dataset: scheduleFormData.dataset,
        snapshot_name: scheduleFormData.snapshot_name,
        schedule_type: scheduleFormData.schedule_type,
        hour: scheduleFormData.hour,
        minute: scheduleFormData.minute,
        day_of_week: scheduleFormData.day_of_week,
        day_of_month: scheduleFormData.day_of_month,
        month: scheduleFormData.month,
        retention_days: scheduleFormData.retention_days
      })
      if (response.data.success) {
        addToast({
          title: 'Snapshot scheduled successfully',
          type: 'success'
        })
        setCreateModalOpen(false)
        setScheduleFormData({
          dataset: '',
          snapshot_name: '',
          schedule_type: 'daily',
          hour: '*',
          minute: '*',
          day_of_week: '*',
          day_of_month: '*',
          month: '*',
          retention_days: 7
        })
        loadData() // Refresh the scheduled snapshots list
      } else {
        addToast({
          title: 'Error scheduling snapshot',
          description: response.data.message || 'Failed to schedule snapshot',
          type: 'error'
        })
      }
    } catch (error: any) {
      addToast({
        title: 'Error scheduling snapshot',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleRemoveScheduled = async (dataset: string, snapshotName: string) => {
    if (!confirm(`Are you sure you want to remove the scheduled snapshot for:\n${dataset}@${snapshotName}?`)) {
      return
    }

    try {
      const response = await api.delete('/api/zfs/snapshot/scheduled', {
        params: {
          dataset,
          snapshot_name: snapshotName
        }
      })
      if (response.data.success) {
        addToast({
          title: 'Scheduled snapshot removed successfully',
          type: 'success'
        })
        // Remove from UI after successful backend removal
        setScheduledSnapshots(prev => prev.filter(scheduled =>
          !(scheduled.dataset === dataset && scheduled.snapshot_name === snapshotName)
        ))
      } else {
        addToast({
          title: 'Error removing scheduled snapshot',
          description: response.data.message || 'Failed to remove scheduled snapshot',
          type: 'error'
        })
      }
    } catch (error: any) {
      addToast({
        title: 'Error removing scheduled snapshot',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    }
  }

  const handleViewLogs = async (snapshot: ScheduledSnapshot) => {
    setSelectedSnapshot(snapshot)
    setLoadingLogs(true)
    setLogsModalOpen(true)

    try {
      const response = await api.get('/api/zfs/snapshot/logs', {
        params: {
          dataset: snapshot.dataset,
          snapshot_name: snapshot.snapshot_name
        }
      })
      setSnapshotLogs(response.data || [])
    } catch (error: any) {
      addToast({
        title: 'Error loading snapshot logs',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
      setSnapshotLogs([])
    } finally {
      setLoadingLogs(false)
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Scheduled Snapshots</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Configure and manage automatic ZFS snapshot schedules
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/snapshots')} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Snapshots
          </Button>
          <Button onClick={() => setCreateModalOpen(true)} variant="primary">
            <Plus className="h-4 w-4 mr-2" />
            Schedule Snapshot
          </Button>
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Configured Schedules
          </h2>

          {scheduledSnapshots.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No Scheduled Snapshots
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Create your first scheduled snapshot to automate data protection
              </p>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Schedule Snapshot
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {scheduledSnapshots.map((scheduled, index) => (
                <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                        {scheduled.dataset}@{scheduled.snapshot_name}
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                        Scheduled
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewLogs(scheduled)}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        Logs
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemoveScheduled(scheduled.dataset, scheduled.snapshot_name)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Next Run:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-white">
                        {scheduled.next_run || 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Last Run:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-white">
                        {scheduled.last_run || 'Never'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Retention:</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-white">
                        {scheduled.retention_days === 0 ? 'Off' : `${scheduled.retention_days || 7} days`}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                    <div className="font-mono bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded">
                      {scheduled.cron_expression} {scheduled.command}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Snapshot Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Schedule ZFS Snapshot"
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" form="schedule-form">
              <Clock className="h-4 w-4 mr-2" />
              Schedule Snapshot
            </Button>
          </>
        }
      >
        <form id="schedule-form" onSubmit={handleScheduleSnapshot} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Dataset or Volume
            </label>
            <select
              value={scheduleFormData.dataset}
              onChange={(e) => setScheduleFormData(prev => ({ ...prev, dataset: e.target.value }))}
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
              Snapshot Name Prefix
            </label>
            <input
              type="text"
              value={scheduleFormData.snapshot_name}
              onChange={(e) => setScheduleFormData(prev => ({ ...prev, snapshot_name: e.target.value }))}
              placeholder="e.g., daily-backup"
              pattern="[a-zA-Z0-9\-_]+"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              A timestamp will be automatically appended (e.g., daily-backup-2024-01-01-120000)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Schedule Type
            </label>
            <select
              value={scheduleFormData.schedule_type}
              onChange={(e) => {
                const value = e.target.value
                setScheduleFormData(prev => ({
                  ...prev,
                  schedule_type: value,
                  hour: value === 'hourly' ? '*' : value === 'custom' ? prev.hour : '0',
                  minute: value === 'hourly' ? '0' : value === 'custom' ? prev.minute : '0',
                  day_of_week: value === 'weekly' ? '1' : value === 'custom' ? prev.day_of_week : '*',
                  day_of_month: value === 'monthly' ? '1' : value === 'custom' ? prev.day_of_month : '*',
                  month: value === 'custom' ? prev.month : '*'
                }))
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {scheduleFormData.schedule_type === 'custom' && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Minute (0-59)
                </label>
                <input
                  type="text"
                  value={scheduleFormData.minute}
                  onChange={(e) => setScheduleFormData(prev => ({ ...prev, minute: e.target.value }))}
                  placeholder="*"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Hour (0-23)
                </label>
                <input
                  type="text"
                  value={scheduleFormData.hour}
                  onChange={(e) => setScheduleFormData(prev => ({ ...prev, hour: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Day of Month (1-31)
                </label>
                <input
                  type="text"
                  value={scheduleFormData.day_of_month}
                  onChange={(e) => setScheduleFormData(prev => ({ ...prev, day_of_month: e.target.value }))}
                  placeholder="*"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Month (1-12)
                </label>
                <input
                  type="text"
                  value={scheduleFormData.month}
                  onChange={(e) => setScheduleFormData(prev => ({ ...prev, month: e.target.value }))}
                  placeholder="*"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Day of Week (0-7, 0=Sunday)
                </label>
                <input
                  type="text"
                  value={scheduleFormData.day_of_week}
                  onChange={(e) => setScheduleFormData(prev => ({ ...prev, day_of_week: e.target.value }))}
                  placeholder="*, 1-5, 0,1,2"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Retention Period (Days)
            </label>
            <select
              value={scheduleFormData.retention_days}
              onChange={(e) => setScheduleFormData(prev => ({ ...prev, retention_days: e.target.value === 'off' ? 0 : parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value={0}>Off (no automatic cleanup)</option>
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days (1 week)</option>
              <option value={14}>14 days (2 weeks)</option>
              <option value={30}>30 days (1 month)</option>
              <option value={90}>90 days (3 months)</option>
            </select>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Automatically delete snapshots older than the specified period. Select "Off" to keep all snapshots indefinitely.
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
              Schedule Preview:
            </h4>
            <div className="font-mono text-sm text-blue-700 dark:text-blue-400">
              {scheduleFormData.schedule_type === 'hourly' && 'Every hour at minute 0'}
              {scheduleFormData.schedule_type === 'daily' && `Daily at ${scheduleFormData.hour === '*' ? '00' : scheduleFormData.hour}:${scheduleFormData.minute === '*' ? '00' : scheduleFormData.minute.padStart(2, '0')}`}
              {scheduleFormData.schedule_type === 'weekly' && `Weekly (Monday) at ${scheduleFormData.hour === '*' ? '00' : scheduleFormData.hour}:${scheduleFormData.minute === '*' ? '00' : scheduleFormData.minute.padStart(2, '0')}`}
              {scheduleFormData.schedule_type === 'monthly' && `Monthly (1st) at ${scheduleFormData.hour === '*' ? '00' : scheduleFormData.hour}:${scheduleFormData.minute === '*' ? '00' : scheduleFormData.minute.padStart(2, '0')}`}
              {scheduleFormData.schedule_type === 'custom' && `Custom: ${scheduleFormData.minute || '*'} ${scheduleFormData.hour || '*'} ${scheduleFormData.day_of_month || '*'} ${scheduleFormData.month || '*'} ${scheduleFormData.day_of_week || '*'}`}
            </div>
            <div className="text-sm text-blue-600 dark:text-blue-400 mt-2">
              Retention: {scheduleFormData.retention_days === 0 ? 'Off (no automatic cleanup)' : `Keep snapshots for ${scheduleFormData.retention_days} days`}
            </div>
          </div>

        </form>
      </Modal>

      {/* Logs Modal */}
      <Modal
        isOpen={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
        title={`Snapshot Logs: ${selectedSnapshot?.dataset}@${selectedSnapshot?.snapshot_name}`}
      >
        {loadingLogs ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading logs...</span>
          </div>
        ) : snapshotLogs.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No Logs Found
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              No logs are available for this scheduled snapshot.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {snapshotLogs.map((log, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  log.level === 'error'
                    ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                    : log.level === 'warning'
                    ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                    : 'bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {log.timestamp}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    log.level === 'error'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                      : log.level === 'warning'
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                  }`}>
                    {log.level}
                  </span>
                </div>
                <p className="text-sm text-gray-900 dark:text-white font-mono break-all">
                  {log.message}
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}