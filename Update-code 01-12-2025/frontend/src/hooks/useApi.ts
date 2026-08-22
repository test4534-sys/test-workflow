import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await api.get(url)
        setData(response.data)
        setError(null)
      } catch (err: any) {
        setError(err.response?.data?.detail || err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [url])

  const refetch = async () => {
    try {
      setLoading(true)
      const response = await api.get(url)
      setData(response.data)
      setError(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  return { data, loading, error, refetch }
}