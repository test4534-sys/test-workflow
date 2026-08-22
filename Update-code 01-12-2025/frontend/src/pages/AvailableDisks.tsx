import React, { useState, useEffect } from 'react'
import { ArrowLeft, RefreshCw, HardDrive, Database } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { Button } from '../components/ui/Button'

interface Disk {
  name: string
  path: string
  size: string
  used: string
  available: string
  use_percent: string
  filesystem: string
  mountpoint: string
  type: string
  model?: string
  serial?: string
}

export default function AvailableDisks() {
  const [disks, setDisks] = useState<Disk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { addToast } = useToast()
  const navigate = useNavigate()

  const loadDisks = async () => {
    try {
      setLoading(true)
      setError(null)
      console.log('Loading disks...')
      
      const response = await api.get('/api/system/disks')
      console.log('API response:', response)
      
      if (response.data && response.data.success) {
        const allDisksData = response.data.data || []
        // Filter out loop devices (snap packages) and floppy drives
        const filteredDisks = allDisksData.filter((disk: Disk) => {
          const deviceType = disk.type
          const deviceName = disk.name
          return !(
            deviceType === 'loop' || 
            deviceType === 'rom' || 
            deviceName.startsWith('fd')
          )
        })
        console.log('Setting disks:', filteredDisks.length, 'out of', allDisksData.length)
        setDisks(filteredDisks)
      } else {
        console.error('API response not successful:', response.data)
        setError(response.data?.error || 'Failed to load disk information')
        setDisks([])
      }
    } catch (error: any) {
      console.error('Error loading disks:', error)
      setError(error.message || 'Network error')
      setDisks([])
      addToast({
        title: 'Error loading disks',
        description: error.message || 'Network error',
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    console.log('AvailableDisks component mounted')
    loadDisks()
  }, [])

  const handleGoBack = () => {
    navigate('/zfs')
  }

  const formatSize = (size: string): string => {
    const units = { 'B': 1, 'K': 1024, 'M': 1024**2, 'G': 1024**3, 'T': 1024**4 }
    const match = size.match(/^([\d.]+)([KMGTP])?$/)
    if (!match) return size
    
    const value = parseFloat(match[1])
    const unit = match[2] || 'B'
    const bytes = value * (units[unit as keyof typeof units] || 1)
    
    const sizes = ['B', 'K', 'M', 'G', 'T']
    let sizeIndex = 0
    let formattedSize = bytes
    
    while (formattedSize >= 1024 && sizeIndex < sizes.length - 1) {
      formattedSize /= 1024
      sizeIndex++
    }
    
    return `${formattedSize.toFixed(1)}${sizes[sizeIndex]}`
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading disk information...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Available Disks</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">Error: {error}</p>
          </div>
          <Button onClick={handleGoBack} variant="secondary">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Error:</strong> {error}
        </div>
        <Button onClick={loadDisks} className="mt-4" variant="primary">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6">
      
      
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Available Disks</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            View all disk devices in the system with storage information
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={loadDisks} variant="primary">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleGoBack} variant="secondary">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to ZFS
          </Button>
        </div>
      </div>

      {/* Disk Statistics */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          System Disk Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{disks.length}</div>
            <div className="text-sm text-blue-700 dark:text-blue-300">Total Disks</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {disks.filter(d => d.mountpoint && d.mountpoint !== 'none' && d.mountpoint !== '-').length}
            </div>
            <div className="text-sm text-green-700 dark:text-green-300">Mounted</div>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {disks.filter(d => !d.mountpoint || d.mountpoint === 'none' || d.mountpoint === '-').length}
            </div>
            <div className="text-sm text-orange-700 dark:text-orange-300">Available</div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {disks.filter(d => d.type === 'disk').length}
            </div>
            <div className="text-sm text-purple-700 dark:text-purple-300">Physical Disks</div>
          </div>
        </div>
      </div>

      {/* Disks List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Database className="h-5 w-5" />
            Disk Devices ({disks.length})
          </h2>

          {disks.length === 0 ? (
            <div className="text-center py-12">
              <HardDrive className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No disks found
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                No disk devices could be detected in the system
              </p>
              <Button
                onClick={loadDisks}
                variant="outline"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Device
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Used
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Available
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Use%
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Filesystem
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Mount Point
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  {disks.map((disk, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-blue-500" />
                          {disk.name}
                        </div>
                        {disk.model && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {disk.model}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          disk.type === 'disk' 
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                        }`}>
                          {disk.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                        {formatSize(disk.size)}
                      </td>
                      <td className="px-4 py-3 text-sm text-orange-600 dark:text-orange-400">
                        {disk.used ? formatSize(disk.used) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400">
                        {disk.available ? formatSize(disk.available) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {disk.use_percent ? (
                          <span className={`font-medium ${
                            parseInt(disk.use_percent) > 90 
                              ? 'text-red-600 dark:text-red-400'
                              : parseInt(disk.use_percent) > 70
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-gray-900 dark:text-white'
                          }`}>
                            {disk.use_percent}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">
                        {disk.filesystem || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">
                        {disk.mountpoint || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Information Panel */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mt-6">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-3">
          Disk Information
        </h3>
        <div className="grid md:grid-cols-2 gap-6 text-sm text-blue-800 dark:text-blue-400">
          <div>
            <h4 className="font-semibold mb-2">What this shows:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>All disk devices detected in the system</li>
              <li>Storage capacity and usage information</li>
              <li>Filesystem types and mount points</li>
              <li>Device types (disk, partition, loop, etc.)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Usage for ZFS:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Available disks can be used to create ZFS pools</li>
              <li>Unmounted disks are ideal for pool creation</li>
              <li>Check device models for hardware compatibility</li>
              <li>Consider disk size when planning storage pools</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}