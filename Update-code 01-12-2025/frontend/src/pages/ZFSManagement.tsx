import React, { useState, useEffect } from 'react'
import { Database, Plus, RefreshCw, Trash2, Expand, Folder, HardDrive, Server, Lock, Share2, Target } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Pool, Dataset } from '../lib/types'

// Enhanced dataset type with volsize field
interface EnhancedDataset extends Dataset {
  volsize?: string
}

interface Disk {
  name: string
  path: string
  size: string
  model: string
}

export default function ZFSManagement() {
  const [pools, setPools] = useState<Pool[]>([])
  const [datasets, setDatasets] = useState<EnhancedDataset[]>([])
  const [availableDisks, setAvailableDisks] = useState<Disk[]>([])
  const [compressionAlgorithms, setCompressionAlgorithms] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [disksLoading, setDisksLoading] = useState(false)
  const [deletePoolLoading, setDeletePoolLoading] = useState(false)
  const [createVolumeModalOpen, setCreateVolumeModalOpen] = useState(false)
  const [createDatasetModalOpen, setCreateDatasetModalOpen] = useState(false)
  const [createPoolModalOpen, setCreatePoolModalOpen] = useState(false)
  const [deletePoolModalOpen, setDeletePoolModalOpen] = useState(false)
  const [importPoolModalOpen, setImportPoolModalOpen] = useState(false)
  const [resizeVolumeModalOpen, setResizeVolumeModalOpen] = useState(false)
  const [resizeDatasetModalOpen, setResizeDatasetModalOpen] = useState(false)
  const [deleteVolumeModalOpen, setDeleteVolumeModalOpen] = useState(false)
  const [deleteDatasetModalOpen, setDeleteDatasetModalOpen] = useState(false)
  const [selectedVolume, setSelectedVolume] = useState<EnhancedDataset | null>(null)
  const [selectedDataset, setSelectedDataset] = useState<EnhancedDataset | null>(null)
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null)
  const [deleteVolumeLoading, setDeleteVolumeLoading] = useState(false)
  const [deleteDatasetLoading, setDeleteDatasetLoading] = useState(false)
  const [deleteVolumeError, setDeleteVolumeError] = useState<string | null>(null)
  const [deleteDatasetError, setDeleteDatasetError] = useState<string | null>(null)
  const { addToast } = useToast()
  const { canEdit, isReadOnly } = useAuth()
  const navigate = useNavigate()

  const [volumeFormData, setVolumeFormData] = useState({
    name: '',
    size: '',
    size_unit: 'G',
    pool: '', // Changed from 'tank' to empty string - will be populated dynamically
    compression: 'lz4'
  })

  const [datasetFormData, setDatasetFormData] = useState({
    name: '',
    pool: '', // Changed from 'tank' to empty string - will be populated dynamically
    quota: '',
    quota_unit: 'G',
    compression: 'lz4'
  })

  const [poolFormData, setPoolFormData] = useState({
    name: '',
    devices: [] as string[],
    mountpoint: '',
    compression: 'lz4'
  })

  const [resizeVolumeData, setResizeVolumeData] = useState({
    name: '',
    pool: '',
    new_size: '',
    new_size_unit: 'G',
    current_size: ''
  })

  const [resizeDatasetData, setResizeDatasetData] = useState({
    name: '',
    pool: '',
    new_quota: '',
    new_quota_unit: 'G',
    current_quota: ''
  })

  const [importablePools, setImportablePools] = useState<any[]>([])
  const [importPoolLoading, setImportPoolLoading] = useState(false)
  const [selectedImportPool, setSelectedImportPool] = useState<any>(null)

  const loadData = async () => {
    try {
      setLoading(true)
      const [poolsRes, datasetsRes] = await Promise.all([
        api.get('/api/zfs/pools'),
        api.get('/api/zfs/datasets'),
      ])
      setPools(poolsRes.data)
      
      // Filter out pool root entries from datasets
      const poolNames = poolsRes.data.map((pool: Pool) => pool.name)
      const filteredDatasets = datasetsRes.data.filter((dataset: EnhancedDataset) => {
        // Remove pool root entries (dataset names that match pool names without "/")
        return !poolNames.includes(dataset.name) || dataset.name.includes('/')
      })
      
      setDatasets(filteredDatasets)
    } catch (error: any) {
      addToast({
        title: 'Error loading ZFS data',
        description: error.message,
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableDisks = async () => {
    try {
      setDisksLoading(true)
      const response = await api.get('/api/zfs/available-disks')
      setAvailableDisks(response.data)
    } catch (error: any) {
      addToast({
        title: 'Error loading available disks',
        description: error.message,
        type: 'error'
      })
    } finally {
      setDisksLoading(false)
    }
  }

  const loadCompressionAlgorithms = async () => {
    try {
      const response = await api.get('/api/zfs/compression-algorithms')
      setCompressionAlgorithms(response.data)
    } catch (error: any) {
      addToast({
        title: 'Error loading compression algorithms',
        description: error.message,
        type: 'error'
      })
    }
  }

  const loadImportablePools = async () => {
    try {
      const response = await api.get('/api/zfs/importable-pools')
      setImportablePools(response.data)
    } catch (error: any) {
      addToast({
        title: 'Error loading importable pools',
        description: error.message,
        type: 'error'
      })
    }
  }

  useEffect(() => {
    loadData()
    loadCompressionAlgorithms()
  }, [])

  // Set default pool when pools are loaded
  useEffect(() => {
    if (pools.length > 0 && !volumeFormData.pool) {
      setVolumeFormData(prev => ({ ...prev, pool: pools[0].name }))
      setDatasetFormData(prev => ({ ...prev, pool: pools[0].name }))
    }
  }, [pools])

  useEffect(() => {
    if (createPoolModalOpen) {
      loadAvailableDisks()
    }
  }, [createPoolModalOpen])

  const handleCreateVolume = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // Validate pool selection
      if (!volumeFormData.pool) {
        addToast({
          title: 'Error creating volume',
          description: 'Please select a pool',
          type: 'error'
        })
        return
      }

      const size = `${volumeFormData.size}${volumeFormData.size_unit}`
      const response = await api.post('/api/zfs/zvol', {
        name: volumeFormData.name,
        size,
        pool: volumeFormData.pool,
        compression: volumeFormData.compression
      })

      // Check if the backend operation was successful
      if (response.data && response.data.success === false) {
        addToast({
          title: 'Error creating volume',
          description: response.data.message || 'Failed to create volume',
          type: 'error'
        })
        return
      }

      addToast({
        title: 'Volume created successfully',
        type: 'success'
      })
      setCreateVolumeModalOpen(false)
      setVolumeFormData({ name: '', size: '', size_unit: 'G', pool: pools[0]?.name || '', compression: 'lz4' })
      loadData()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.detail || error.userMessage || error.message || 'Unknown error occurred'
      addToast({
        title: 'Error creating volume',
        description: errorMessage,
        type: 'error'
      })
    }
  }

  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // Validate pool selection
      if (!datasetFormData.pool) {
        addToast({
          title: 'Error creating dataset',
          description: 'Please select a pool',
          type: 'error'
        })
        return
      }

      const quota = datasetFormData.quota ? `${datasetFormData.quota}${datasetFormData.quota_unit}` : null
      const response = await api.post('/api/zfs/dataset', {
        name: datasetFormData.name,
        pool: datasetFormData.pool,
        quota,
        compression: datasetFormData.compression
      })

      // Check if the backend operation was successful
      if (response.data && response.data.success === false) {
        addToast({
          title: 'Error creating dataset',
          description: response.data.message || 'Failed to create dataset',
          type: 'error'
        })
        return
      }

      addToast({
        title: 'Dataset created successfully',
        type: 'success'
      })
      setCreateDatasetModalOpen(false)
      setDatasetFormData({ name: '', pool: pools[0]?.name || '', quota: '', quota_unit: 'G', compression: 'lz4' })
      loadData()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.detail || error.userMessage || error.message || 'Unknown error occurred'
      addToast({
        title: 'Error creating dataset',
        description: errorMessage,
        type: 'error'
      })
    }
  }

  const handleCreatePool = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (poolFormData.devices.length === 0) {
        addToast({
          title: 'Error creating pool',
          description: 'Please select at least one disk',
          type: 'error'
        })
        return
      }

      if (!poolFormData.name.trim()) {
        addToast({
          title: 'Error creating pool',
          description: 'Please enter a pool name',
          type: 'error'
        })
        return
      }

      // Validate pool name format
      const poolNameRegex = /^[a-zA-Z0-9\-_]+$/
      if (!poolNameRegex.test(poolFormData.name)) {
        addToast({
          title: 'Error creating pool',
          description: 'Pool name can only contain letters, numbers, hyphens, and underscores',
          type: 'error'
        })
        return
      }

      const response = await api.post('/api/zfs/pool', {
        name: poolFormData.name,
        devices: poolFormData.devices,
        mountpoint: poolFormData.mountpoint || null,
        compression: poolFormData.compression
      })

      // Check if the backend operation was successful
      if (response.data && response.data.success === false) {
        const errorMessage = response.data.message || 'Failed to create pool'

        // Check if it's a disk in use error
        if (errorMessage.includes('is in use') || errorMessage.includes('contains a unknown filesystem') || errorMessage.includes('already in use')) {
          addToast({
            title: 'Disk in use',
            description: 'Selected disk is already in use. Please choose a different disk.',
            type: 'error'
          })
        } else {
          addToast({
            title: 'Error creating pool',
            description: errorMessage,
            type: 'error'
          })
        }
        return
      }

      addToast({
        title: 'Pool created successfully',
        type: 'success'
      })
      setCreatePoolModalOpen(false)
      setPoolFormData({ name: '', devices: [], mountpoint: '', compression: 'lz4' })
      loadData()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.detail || error.userMessage || error.message || 'Unknown error occurred'

      // Check if it's a disk in use error
      if (errorMessage.includes('is in use') || errorMessage.includes('contains a unknown filesystem') || errorMessage.includes('already in use')) {
        addToast({
          title: 'Disk in use',
          description: 'Selected disk is already in use. Please choose a different disk.',
          type: 'error'
        })
      } else {
        addToast({
          title: 'Error creating pool',
          description: errorMessage,
          type: 'error'
        })
      }
    }
  }

  const handleDeletePool = async () => {
    if (!selectedPool) return

    try {
      setDeletePoolLoading(true)
      await api.delete(`/api/zfs/pool?name=${selectedPool.name}`)
      addToast({
        title: 'Pool deleted successfully',
        description: 'Pool destroyed and disks wiped for reuse',
        type: 'success'
      })
      setDeletePoolModalOpen(false)
      setSelectedPool(null)
      loadData()
    } catch (error: any) {
      addToast({
        title: 'Error deleting pool',
        description: error.response?.data?.detail || error.message,
        type: 'error'
      })
    } finally {
      setDeletePoolLoading(false)
    }
  }

  const handleResizeVolume = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const new_size = `${resizeVolumeData.new_size}${resizeVolumeData.new_size_unit}`
      await api.put('/api/zfs/zvol/resize', {
        name: resizeVolumeData.name,
        new_size,
        pool: resizeVolumeData.pool
      })
      addToast({
        title: 'Volume resized successfully',
        type: 'success'
      })
      setResizeVolumeModalOpen(false)
      setResizeVolumeData({ name: '', pool: '', new_size: '', new_size_unit: 'G', current_size: '' })
      loadData()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.detail || error.userMessage || error.message || 'Unknown error occurred'
      addToast({
        title: 'Error resizing volume',
        description: errorMessage,
        type: 'error'
      })
    }
  }

  const handleResizeDataset = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const new_quota = `${resizeDatasetData.new_quota}${resizeDatasetData.new_quota_unit}`
      await api.put('/api/zfs/dataset/resize', {
        name: resizeDatasetData.name,
        new_quota,
        pool: resizeDatasetData.pool
      })
      addToast({
        title: 'Dataset resized successfully',
        type: 'success'
      })
      setResizeDatasetModalOpen(false)
      setResizeDatasetData({ name: '', pool: '', new_quota: '', new_quota_unit: 'G', current_quota: '' })
      loadData()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.detail || error.userMessage || error.message || 'Unknown error occurred'
      addToast({
        title: 'Error resizing dataset',
        description: errorMessage,
        type: 'error'
      })
    }
  }

  const handleDeleteVolume = async (dataset: EnhancedDataset) => {
    const name = dataset.name.split('/').pop()!
    const pool = dataset.name.split('/')[0]

    setSelectedVolume(dataset)
    setDeleteVolumeModalOpen(true)
  }

  const confirmDeleteVolume = async () => {
    if (!selectedVolume) return

    const name = selectedVolume.name.split('/').pop()!
    const pool = selectedVolume.name.split('/')[0]

    try {
      setDeleteVolumeLoading(true)
      setDeleteVolumeError(null)
      await api.delete(`/api/zfs/zvol?name=${name}&pool=${pool}`)
      addToast({
        title: 'Volume deleted successfully',
        type: 'success'
      })
      setDeleteVolumeModalOpen(false)
      setSelectedVolume(null)
      loadData()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.detail || error.userMessage || error.message || 'Unknown error occurred'
      setDeleteVolumeError(errorMessage)
      // Don't show toast here - we'll show it in the modal
    } finally {
      setDeleteVolumeLoading(false)
    }
  }

  const handleDeleteDataset = async (dataset: EnhancedDataset) => {
    const name = dataset.name.split('/').pop()!
    const pool = dataset.name.split('/')[0]

    setSelectedDataset(dataset)
    setDeleteDatasetModalOpen(true)
  }

  const confirmDeleteDataset = async () => {
    if (!selectedDataset) return

    const name = selectedDataset.name.split('/').pop()!
    const pool = selectedDataset.name.split('/')[0]

    try {
      setDeleteDatasetLoading(true)
      setDeleteDatasetError(null)
      await api.delete(`/api/zfs/dataset?name=${name}&pool=${pool}`)
      addToast({
        title: 'Dataset deleted successfully',
        type: 'success'
      })
      setDeleteDatasetModalOpen(false)
      setSelectedDataset(null)
      loadData()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.detail || error.userMessage || error.message || 'Unknown error occurred'
      setDeleteDatasetError(errorMessage)
      // Don't show toast here - we'll show it in the modal
    } finally {
      setDeleteDatasetLoading(false)
    }
  }

  const handleImportPool = async () => {
    if (!selectedImportPool) return

    try {
      setImportPoolLoading(true)
      await api.post('/api/zfs/import-pool', {
        name: selectedImportPool.name,
        pool_id: selectedImportPool.id
      })
      addToast({
        title: 'Pool imported successfully',
        type: 'success'
      })
      setImportPoolModalOpen(false)
      setSelectedImportPool(null)
      loadData()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.detail || error.userMessage || error.message || 'Unknown error occurred'
      addToast({
        title: 'Error importing pool',
        description: errorMessage,
        type: 'error'
      })
    } finally {
      setImportPoolLoading(false)
    }
  }

  const showResizeVolumeModal = (dataset: EnhancedDataset) => {
    const name = dataset.name.split('/').pop()!
    const pool = dataset.name.split('/')[0]
    const volumeSize = dataset.volsize || dataset.used
    
    setResizeVolumeData({
      name,
      pool,
      new_size: '',
      new_size_unit: 'G',
      current_size: volumeSize
    })
    setResizeVolumeModalOpen(true)
  }

  const showResizeDatasetModal = (dataset: EnhancedDataset) => {
    const name = dataset.name.split('/').pop()!
    const pool = dataset.name.split('/')[0]
    const storageInfo = getStorageInfo(dataset)
    
    setResizeDatasetData({
      name,
      pool,
      new_quota: '',
      new_quota_unit: 'G',
      current_quota: storageInfo.total
    })
    setResizeDatasetModalOpen(true)
  }

  const showDeletePoolModal = (pool: Pool) => {
    setSelectedPool(pool)
    setDeletePoolModalOpen(true)
  }

  const showImportPoolModal = () => {
    loadImportablePools()
    setImportPoolModalOpen(true)
  }

  const toggleDeviceSelection = (devicePath: string) => {
    setPoolFormData(prev => {
      const devices = prev.devices.includes(devicePath)
        ? prev.devices.filter(d => d !== devicePath)
        : [...prev.devices, devicePath]
      return { ...prev, devices }
    })
  }

  // Helper function to calculate usage percentage
  const getUsagePercentage = (total: string, used: string): number => {
    const parseSize = (size: string): number => {
      const units: { [key: string]: number } = {
        'K': 1024,
        'M': 1024 * 1024,
        'G': 1024 * 1024 * 1024,
        'T': 1024 * 1024 * 1024 * 1024
      }

      const match = size.match(/^([\d.]+)([KMGTP])?$/)
      if (!match) return 0

      const value = parseFloat(match[1])
      const unit = match[2] || 'B'
      return value * (units[unit] || 1)
    }

    const totalBytes = parseSize(total)
    const usedBytes = parseSize(used)
    
    return totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0
  }

  // Helper function to calculate available space
  const calculateAvailableSpace = (total: string, used: string): string => {
    const parseSize = (size: string): number => {
      const units: { [key: string]: number } = {
        'K': 1024,
        'M': 1024 * 1024,
        'G': 1024 * 1024 * 1024,
        'T': 1024 * 1024 * 1024 * 1024
      }

      const match = size.match(/^([\d.]+)([KMGTP])?$/)
      if (!match) return 0

      const value = parseFloat(match[1])
      const unit = match[2] || 'B'
      return value * (units[unit] || 1)
    }

    const formatSize = (bytes: number): string => {
      const units = ['B', 'K', 'M', 'G', 'T']
      let size = bytes
      let unitIndex = 0

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex++
      }

      return `${size.toFixed(1)}${units[unitIndex]}`
    }

    const totalBytes = parseSize(total)
    const usedBytes = parseSize(used)
    const availableBytes = Math.max(0, totalBytes - usedBytes)
    
    return formatSize(availableBytes)
  }

  // Helper function to estimate total space for datasets without explicit quota
  const estimateTotalSpace = (dataset: EnhancedDataset): string => {
    const parseSize = (size: string): number => {
      const units: { [key: string]: number } = {
        'K': 1024,
        'M': 1024 * 1024,
        'G': 1024 * 1024 * 1024,
        'T': 1024 * 1024 * 1024 * 1024
      }

      const match = size.match(/^([\d.]+)([KMGTP])?$/)
      if (!match) return 0

      const value = parseFloat(match[1])
      const unit = match[2] || 'B'
      return value * (units[unit] || 1)
    }

    const formatSize = (bytes: number): string => {
      const units = ['B', 'K', 'M', 'G', 'T']
      let size = bytes
      let unitIndex = 0

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex++
      }

      return `${size.toFixed(1)}${units[unitIndex]}`
    }

    // For datasets without explicit quota, estimate based on used + available
    const usedBytes = parseSize(dataset.used)
    const availableBytes = parseSize(dataset.available)
    const estimatedTotal = usedBytes + availableBytes
    
    return formatSize(estimatedTotal)
  }

  // Helper function to calculate free space for pools
  const calculatePoolFreeSpace = (total: string, used: string): string => {
    const parseSize = (size: string): number => {
      const units: { [key: string]: number } = {
        'K': 1024,
        'M': 1024 * 1024,
        'G': 1024 * 1024 * 1024,
        'T': 1024 * 1024 * 1024 * 1024
      }

      const match = size.match(/^([\d.]+)([KMGTP])?$/)
      if (!match) return 0

      const value = parseFloat(match[1])
      const unit = match[2] || 'B'
      return value * (units[unit] || 1)
    }

    const formatSize = (bytes: number): string => {
      const units = ['B', 'K', 'M', 'G', 'T']
      let size = bytes
      let unitIndex = 0

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex++
      }

      return `${size.toFixed(1)}${units[unitIndex]}`
    }

    const totalBytes = parseSize(total)
    const usedBytes = parseSize(used)
    const freeBytes = Math.max(0, totalBytes - usedBytes)
    
    return formatSize(freeBytes)
  }

  // Function to calculate storage space information
  const getStorageInfo = (dataset: EnhancedDataset) => {
    // For all datasets:
    // REFER = actual data referenced by this dataset
    // Total = allocated space (quota for datasets, volsize for volumes)
    // Available = Total - REFER
    
    if (dataset.type === 'volume') {
      // For volumes, use volsize as the total allocated space
      const totalSize = dataset.volsize || dataset.used
      const actualUsed = dataset.referenced  // Data stored in the volume
      
      // Calculate available space as total - referenced
      const availableSpace = calculateAvailableSpace(totalSize, actualUsed)
      
      return {
        total: totalSize,
        used: actualUsed,
        free: availableSpace,
        usagePercentage: 0 // Not used, but keeping for compatibility
      }
    } else {
      // For filesystem datasets, estimate allocated space
      const totalSize = estimateTotalSpace(dataset)
      const actualData = dataset.referenced  // Actual data referenced
      
      // Calculate available space as total - referenced
      const availableSpace = calculateAvailableSpace(totalSize, actualData)
      
      return {
        total: totalSize,       // Allocated space for this dataset
        used: actualData,       // Show REFER as used (actual data)
        free: availableSpace,   // Show calculated available space
        usagePercentage: 0 // Not used, but keeping for compatibility
      }
    }
  }

  // Function to parse size string to bytes for comparison
  const parseSizeToBytes = (size: string): number => {
    const units: { [key: string]: number } = {
      'B': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024
    }
    
    const match = size.match(/^([\d.]+)([KMGTP])?$/)
    if (!match) return 0
    
    const value = parseFloat(match[1])
    const unit = match[2] || 'B'
    return value * (units[unit] || 1)
  }

  // Function to check if new size is larger than current size
  const isNewSizeValid = (newSize: string, newUnit: string, currentSize: string): boolean => {
    if (!newSize || !currentSize) return false
    
    const newSizeBytes = parseSizeToBytes(`${newSize}${newUnit}`)
    const currentSizeBytes = parseSizeToBytes(currentSize)
    
    return newSizeBytes > currentSizeBytes
  }

  // Check if pool form is valid
  const isPoolFormValid = () => {
    return (
      poolFormData.name.trim() !== '' &&
      poolFormData.devices.length > 0 &&
      /^[a-zA-Z0-9\-_]+$/.test(poolFormData.name)
    )
  }

  // Check if volume form is valid
  const isVolumeFormValid = () => {
    return (
      volumeFormData.name.trim() !== '' &&
      volumeFormData.size.trim() !== '' &&
      volumeFormData.pool.trim() !== ''
    )
  }

  // Check if dataset form is valid
  const isDatasetFormValid = () => {
    return (
      datasetFormData.name.trim() !== '' &&
      datasetFormData.pool.trim() !== ''
    )
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">ZFS Storage Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage ZFS pools, datasets, and volumes
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button
            onClick={() => navigate('/zfs/disks')}
            variant="secondary"
            className="bg-blue-100 hover:bg-blue-200"
          >
            <HardDrive className="h-4 w-4 mr-2" />
            Disks
          </Button>
          <Button onClick={() => setCreatePoolModalOpen(true)} variant="primary" disabled={!canEdit}>
            {isReadOnly && <Lock className="h-3 w-3 mr-1" />}
            <Server className="h-4 w-4 mr-2" />
            Create Pool
          </Button>
          <Button onClick={showImportPoolModal} variant="secondary" disabled={!canEdit}>
            {isReadOnly && <Lock className="h-3 w-3 mr-1" />}
            <Server className="h-4 w-4 mr-2" />
            Import Pool
          </Button>
          <Button
            onClick={() => setCreateDatasetModalOpen(true)}
            variant="secondary"
            disabled={pools.length === 0 || !canEdit}
          >
            {isReadOnly && <Lock className="h-3 w-3 mr-1" />}
            <Folder className="h-4 w-4 mr-2" />
            Create Dataset
          </Button>
          <Button
            onClick={() => setCreateVolumeModalOpen(true)}
            variant="secondary"
            disabled={pools.length === 0 || !canEdit}
          >
            {isReadOnly && <Lock className="h-3 w-3 mr-1" />}
            <HardDrive className="h-4 w-4 mr-2" />
            Create Volume
          </Button>
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ZFS Pools */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Database className="h-5 w-5" />
          ZFS Pools ({pools.length})
        </h2>
        
        {pools.length === 0 ? (
          <div className="text-center py-8">
            <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No ZFS pools found</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 mb-4">
              Create a ZFS pool to start managing storage
            </p>
            <Button 
              onClick={() => setCreatePoolModalOpen(true)} 
              className="mt-4"
              variant="primary"
            >
              <Server className="h-4 w-4 mr-2" />
              Create Your First Pool
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Storage Space
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Health
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {pools.map((pool) => (
                  <tr key={pool.name}>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-blue-500" />
                        {pool.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-4 text-xs">
                        <div className="text-center">
                          <div className="text-gray-500 dark:text-gray-400 mb-1">Total</div>
                          <div className="font-semibold text-blue-600 dark:text-blue-400">
                            {pool.size}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500 dark:text-gray-400 mb-1">Used</div>
                          <div className="font-semibold text-orange-600 dark:text-orange-400">
                            {pool.allocated}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500 dark:text-gray-400 mb-1">Free</div>
                          <div className="font-semibold text-green-600 dark:text-green-400">
                            {calculatePoolFreeSpace(pool.size, pool.allocated)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        pool.health === 'ONLINE'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                      }`}>
                        {pool.health}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => showDeletePoolModal(pool)}
                        disabled={!canEdit}
                      >
                        {isReadOnly && <Lock className="h-3 w-3 mr-1" />}
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Datasets & Volumes */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Database className="h-5 w-5" />
            Datasets & Volumes ({datasets.length})
          </h2>

          {datasets.length === 0 ? (
            <div className="text-center py-12">
              <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {pools.length === 0 ? 'No Pools Available' : 'No Datasets Found'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {pools.length === 0 
                  ? 'Create a ZFS pool first to manage datasets and volumes'
                  : 'Create your first ZFS dataset or volume'
                }
              </p>
              <div className="flex gap-3 justify-center">
                <Button 
                  onClick={() => setCreateDatasetModalOpen(true)} 
                  variant="secondary"
                  disabled={pools.length === 0}
                >
                  <Folder className="h-4 w-4 mr-2" />
                  Create Dataset
                </Button>
                <Button 
                  onClick={() => setCreateVolumeModalOpen(true)} 
                  variant="secondary"
                  disabled={pools.length === 0}
                >
                  <HardDrive className="h-4 w-4 mr-2" />
                  Create Volume
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Storage Space
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Mountpoint
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  {datasets.map((dataset) => {
                    const storageInfo = getStorageInfo(dataset)
                    return (
                      <tr key={dataset.name}>
                        <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            {dataset.type === 'volume' ? (
                              <HardDrive className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Folder className="h-4 w-4 text-green-500" />
                            )}
                            {dataset.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            dataset.type === 'volume'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          }`}>
                            {dataset.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400">Total:</span>
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {storageInfo.total}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400">Used:</span>
                              <span className="font-semibold text-orange-600 dark:text-orange-400">
                                {storageInfo.used}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400">Free:</span>
                              <span className="font-semibold text-green-600 dark:text-green-400">
                                {storageInfo.free}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">
                          {dataset.mountpoint}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-2">
                            {dataset.type === 'filesystem' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate('/samba')}
                                className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700 hover:text-green-800"
                              >
                                <Share2 className="h-3 w-3 mr-1" />
                                Configure Samba
                              </Button>
                            )}
                            {dataset.type === 'volume' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate('/targets')}
                                className="bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 hover:text-blue-800"
                              >
                                <Target className="h-3 w-3 mr-1" />
                                Configure iSCSI
                              </Button>
                            )}
                            {dataset.type === 'volume' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => showResizeVolumeModal(dataset)}
                                disabled={!canEdit}
                              >
                                {isReadOnly && <Lock className="h-3 w-3 mr-1" />}
                                <Expand className="h-3 w-3 mr-1" />
                                Resize
                              </Button>
                            )}
                            {dataset.type === 'filesystem' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => showResizeDatasetModal(dataset)}
                                disabled={!canEdit}
                              >
                                {isReadOnly && <Lock className="h-3 w-3 mr-1" />}
                                <Expand className="h-3 w-3 mr-1" />
                                Resize
                              </Button>
                            )}
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => dataset.type === 'volume' ? handleDeleteVolume(dataset) : handleDeleteDataset(dataset)}
                              disabled={!canEdit}
                            >
                              {isReadOnly && <Lock className="h-3 w-3 mr-1" />}
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Pool Modal - Fixed Layout */}
      <Modal
        isOpen={createPoolModalOpen}
        onClose={() => setCreatePoolModalOpen(false)}
        title="Create ZFS Pool"
        size="xl"
      >
        <form onSubmit={handleCreatePool} className="space-y-6 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pool Name *
            </label>
            <input
              type="text"
              value={poolFormData.name}
              onChange={(e) => setPoolFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., storage, data, backup"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Pool name can only contain letters, numbers, hyphens, and underscores
            </p>
            {poolFormData.name && !/^[a-zA-Z0-9\-_]+$/.test(poolFormData.name) && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                Pool name can only contain letters, numbers, hyphens, and underscores
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Mountpoint (Optional)
            </label>
            <input
              type="text"
              value={poolFormData.mountpoint}
              onChange={(e) => setPoolFormData(prev => ({ ...prev, mountpoint: e.target.value }))}
              placeholder="e.g., /mnt/storage"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Custom mount point for the pool. Leave empty for default location.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Compression
            </label>
            <select
              value={poolFormData.compression}
              onChange={(e) => setPoolFormData(prev => ({ ...prev, compression: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              {compressionAlgorithms.map((algo) => (
                <option key={algo} value={algo}>
                  {algo}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {poolFormData.compression === 'off' ? 'No compression' : 
               poolFormData.compression.startsWith('lz4') ? 'Fast compression, good performance' :
               poolFormData.compression.startsWith('zstd') ? 'Modern compression, good ratio/performance balance' :
               poolFormData.compression.startsWith('gzip') ? 'Higher compression, more CPU intensive' :
               'Legacy compression algorithms'}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Select Disks *
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadAvailableDisks}
                loading={disksLoading}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </div>
            
            {availableDisks.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                <HardDrive className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No available disks found</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Make sure you have unused disks available in the system
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto p-2 border border-gray-200 dark:border-gray-600 rounded-lg">
                {availableDisks.map((disk) => (
                  <div
                    key={disk.path}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      poolFormData.devices.includes(disk.path)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-400'
                    }`}
                    onClick={() => toggleDeviceSelection(disk.path)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <HardDrive className="h-5 w-5 text-gray-500" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {disk.name}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {disk.size} • {disk.model}
                          </p>
                        </div>
                      </div>
                      <div className={`w-4 h-4 rounded border ${
                        poolFormData.devices.includes(disk.path)
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-gray-300 dark:border-gray-500'
                      }`}>
                        {poolFormData.devices.includes(disk.path) && (
                          <div className="w-2 h-2 bg-white rounded-sm m-auto mt-0.5" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Selected {poolFormData.devices.length} disk(s)
            </p>
            {poolFormData.devices.length === 0 && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                Please select at least one disk
              </p>
            )}
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Warning:</strong> Creating a pool will erase all data on the selected disks. 
              This action cannot be undone.
            </p>
          </div>
        </form>
        
        {/* Fixed Button Section */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreatePoolModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              onClick={handleCreatePool}
              disabled={!isPoolFormValid() || !canEdit}
            >
              Create Pool
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Dataset Modal */}
      <Modal
        isOpen={createDatasetModalOpen}
        onClose={() => setCreateDatasetModalOpen(false)}
        title="Create ZFS Dataset"
      >
        <form onSubmit={handleCreateDataset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Dataset Name *
            </label>
            <input
              type="text"
              value={datasetFormData.name}
              onChange={(e) => setDatasetFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., documents, photos, backups"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pool *
            </label>
            {pools.length === 0 ? (
              <div className="text-center py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md">
                <p className="text-gray-500 dark:text-gray-400">No pools available</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Create a pool first
                </p>
              </div>
            ) : (
              <select
                value={datasetFormData.pool}
                onChange={(e) => setDatasetFormData(prev => ({ ...prev, pool: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                required
              >
                {pools.map((pool) => (
                  <option key={pool.name} value={pool.name}>
                    {pool.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Quota (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={datasetFormData.quota}
                onChange={(e) => setDatasetFormData(prev => ({ ...prev, quota: e.target.value }))}
                placeholder="e.g., 10"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <select
                value={datasetFormData.quota_unit}
                onChange={(e) => setDatasetFormData(prev => ({ ...prev, quota_unit: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="K">KB</option>
                <option value="M">MB</option>
                <option value="G">GB</option>
                <option value="T">TB</option>
              </select>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Leave empty for no quota
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Compression
            </label>
            <select
              value={datasetFormData.compression}
              onChange={(e) => setDatasetFormData(prev => ({ ...prev, compression: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              {compressionAlgorithms.map((algo) => (
                <option key={algo} value={algo}>
                  {algo}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateDatasetModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!isDatasetFormValid() || pools.length === 0 || !canEdit}
            >
              Create Dataset
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Volume Modal */}
      <Modal
        isOpen={createVolumeModalOpen}
        onClose={() => setCreateVolumeModalOpen(false)}
        title="Create ZFS Volume"
      >
        <form onSubmit={handleCreateVolume} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Volume Name *
            </label>
            <input
              type="text"
              value={volumeFormData.name}
              onChange={(e) => setVolumeFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., vm-disk, database, archive"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pool *
            </label>
            {pools.length === 0 ? (
              <div className="text-center py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md">
                <p className="text-gray-500 dark:text-gray-400">No pools available</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Create a pool first
                </p>
              </div>
            ) : (
              <select
                value={volumeFormData.pool}
                onChange={(e) => setVolumeFormData(prev => ({ ...prev, pool: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                required
              >
                {pools.map((pool) => (
                  <option key={pool.name} value={pool.name}>
                    {pool.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Size *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={volumeFormData.size}
                onChange={(e) => setVolumeFormData(prev => ({ ...prev, size: e.target.value }))}
                placeholder="e.g., 10"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
              <select
                value={volumeFormData.size_unit}
                onChange={(e) => setVolumeFormData(prev => ({ ...prev, size_unit: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="K">KB</option>
                <option value="M">MB</option>
                <option value="G">GB</option>
                <option value="T">TB</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Compression
            </label>
            <select
              value={volumeFormData.compression}
              onChange={(e) => setVolumeFormData(prev => ({ ...prev, compression: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              {compressionAlgorithms.map((algo) => (
                <option key={algo} value={algo}>
                  {algo}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateVolumeModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!isVolumeFormValid() || pools.length === 0 || !canEdit}
            >
              Create Volume
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Pool Modal */}
      <Modal
        isOpen={deletePoolModalOpen}
        onClose={() => setDeletePoolModalOpen(false)}
        title="Delete ZFS Pool"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete the pool <strong>{selectedPool?.name}</strong>?
          </p>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Warning:</strong> This action will:
            </p>
            <ul className="text-sm text-yellow-800 dark:text-yellow-300 mt-2 list-disc list-inside space-y-1">
              <li>Destroy the ZFS pool and all its data</li>
              <li>Wipe ZFS metadata from all disks in the pool</li>
              <li>Make the disks available for reuse</li>
              <li>This action cannot be undone!</li>
            </ul>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setDeletePoolModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeletePool}
              disabled={deletePoolLoading}
            >
              {deletePoolLoading ? 'Deleting...' : 'Delete Pool'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Resize Volume Modal */}
      <Modal
        isOpen={resizeVolumeModalOpen}
        onClose={() => setResizeVolumeModalOpen(false)}
        title="Resize ZFS Volume"
      >
        <form onSubmit={handleResizeVolume} className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Current size: <strong>{resizeVolumeData.current_size}</strong>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              New Size *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={resizeVolumeData.new_size}
                onChange={(e) => setResizeVolumeData(prev => ({ ...prev, new_size: e.target.value }))}
                placeholder="e.g., 20"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
              <select
                value={resizeVolumeData.new_size_unit}
                onChange={(e) => setResizeVolumeData(prev => ({ ...prev, new_size_unit: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="K">KB</option>
                <option value="M">MB</option>
                <option value="G">GB</option>
                <option value="T">TB</option>
              </select>
            </div>
            {resizeVolumeData.new_size && !isNewSizeValid(resizeVolumeData.new_size, resizeVolumeData.new_size_unit, resizeVolumeData.current_size) && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                New size must be larger than current size
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResizeVolumeModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!isNewSizeValid(resizeVolumeData.new_size, resizeVolumeData.new_size_unit, resizeVolumeData.current_size)}
            >
              Resize Volume
            </Button>
          </div>
        </form>
      </Modal>

      {/* Resize Dataset Modal */}
      <Modal
        isOpen={resizeDatasetModalOpen}
        onClose={() => setResizeDatasetModalOpen(false)}
        title="Resize ZFS Dataset"
      >
        <form onSubmit={handleResizeDataset} className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Current quota: <strong>{resizeDatasetData.current_quota}</strong>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              New Quota *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={resizeDatasetData.new_quota}
                onChange={(e) => setResizeDatasetData(prev => ({ ...prev, new_quota: e.target.value }))}
                placeholder="e.g., 20"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
              <select
                value={resizeDatasetData.new_quota_unit}
                onChange={(e) => setResizeDatasetData(prev => ({ ...prev, new_quota_unit: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="K">KB</option>
                <option value="M">MB</option>
                <option value="G">GB</option>
                <option value="T">TB</option>
              </select>
            </div>
            {resizeDatasetData.new_quota && !isNewSizeValid(resizeDatasetData.new_quota, resizeDatasetData.new_quota_unit, resizeDatasetData.current_quota) && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                New quota must be larger than current quota
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResizeDatasetModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!isNewSizeValid(resizeDatasetData.new_quota, resizeDatasetData.new_quota_unit, resizeDatasetData.current_quota)}
            >
              Resize Dataset
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Volume Modal */}
      <Modal
        isOpen={deleteVolumeModalOpen}
        onClose={() => {
          setDeleteVolumeModalOpen(false)
          setDeleteVolumeError(null)
        }}
        title="Delete ZFS Volume"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete the volume <strong>{selectedVolume?.name}</strong>?
          </p>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Warning:</strong> This action will:
            </p>
            <ul className="text-sm text-yellow-800 dark:text-yellow-300 mt-2 list-disc list-inside space-y-1">
              <li>Delete the ZFS volume and all its data</li>
              <li>Break any iSCSI targets using this volume</li>
              <li>This action cannot be undone!</li>
            </ul>
          </div>
          {deleteVolumeError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-300">
                <strong>Cannot Delete:</strong> {deleteVolumeError}
              </p>
            </div>
          )}
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteVolumeModalOpen(false)
                setDeleteVolumeError(null)
              }}
            >
              {deleteVolumeError ? 'Close' : 'Cancel'}
            </Button>
            {!deleteVolumeError && (
              <Button
                variant="danger"
                onClick={confirmDeleteVolume}
                disabled={deleteVolumeLoading}
              >
                {deleteVolumeLoading ? 'Deleting...' : 'Delete Volume'}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete Dataset Modal */}
      <Modal
        isOpen={deleteDatasetModalOpen}
        onClose={() => {
          setDeleteDatasetModalOpen(false)
          setDeleteDatasetError(null)
        }}
        title="Delete ZFS Dataset"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete the dataset <strong>{selectedDataset?.name}</strong>?
          </p>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Warning:</strong> This action will:
            </p>
            <ul className="text-sm text-yellow-800 dark:text-yellow-300 mt-2 list-disc list-inside space-y-1">
              <li>Delete the ZFS dataset and all its data</li>
              <li>Break any Samba shares using this dataset</li>
              <li>This action cannot be undone!</li>
            </ul>
          </div>
          {deleteDatasetError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-300">
                <strong>Cannot Delete:</strong> {deleteDatasetError}
              </p>
            </div>
          )}
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteDatasetModalOpen(false)
                setDeleteDatasetError(null)
              }}
            >
              {deleteDatasetError ? 'Close' : 'Cancel'}
            </Button>
            {!deleteDatasetError && (
              <Button
                variant="danger"
                onClick={confirmDeleteDataset}
                disabled={deleteDatasetLoading}
              >
                {deleteDatasetLoading ? 'Deleting...' : 'Delete Dataset'}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Import Pool Modal */}
      <Modal
        isOpen={importPoolModalOpen}
        onClose={() => setImportPoolModalOpen(false)}
        title="Import ZFS Pool"
        size="lg"
      >
        <div className="space-y-6">
          <div>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Select a ZFS pool to import. These pools were previously exported or are available for import after system reboot.
            </p>

            {importablePools.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                <Server className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No importable pools found</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Make sure there are ZFS pools available for import
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {importablePools.map((pool) => (
                  <div
                    key={pool.id || pool.name}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedImportPool?.id === pool.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-400'
                    }`}
                    onClick={() => setSelectedImportPool(pool)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Server className="h-5 w-5 text-blue-500" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {pool.name}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            ID: {pool.id} • State: {pool.state}
                          </p>
                          {pool.status && (
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                              Status: {pool.status}
                            </p>
                          )}
                          {pool.action && (
                            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                              Action: {pool.action}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className={`w-4 h-4 rounded border ${
                        selectedImportPool?.id === pool.id
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-gray-300 dark:border-gray-500'
                      }`}>
                        {selectedImportPool?.id === pool.id && (
                          <div className="w-2 h-2 bg-white rounded-sm m-auto mt-0.5" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Info:</strong> Importing a pool will make it available for use. The pool will be mounted at its configured mountpoint.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportPoolModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleImportPool}
              disabled={!selectedImportPool || importPoolLoading}
            >
              {importPoolLoading ? 'Importing...' : 'Import Pool'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}