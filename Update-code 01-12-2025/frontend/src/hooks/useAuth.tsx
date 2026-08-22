import React, { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../lib/api'

interface User {
  username: string
  groups: string[]
  role?: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (token: string, user: User) => void
  logout: () => void
  loading: boolean
  isAdmin: boolean
  isReadOnly: boolean
  canEdit: boolean
}

interface AuthProviderProps {
  children: React.ReactNode
  addToast?: (toast: any) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children, addToast }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true) // Start with loading true to prevent flash


  const login = (newToken: string, userData: User) => {
    setToken(newToken)
    setUser(userData)
    localStorage.setItem('auth_token', newToken)
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('auth_token')
  }

  const verifyToken = async (storedToken: string) => {
    try {
      const response = await api.post('/api/auth/verify', storedToken)
      if (response.data.success) {
        return response.data.user
      }
    } catch (error) {
      console.error('Token verification failed:', error)
    }
    return null
  }

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('auth_token')
      if (storedToken) {
        // Only show loading if we have a token to verify
        setLoading(true)
        const userInfo = await verifyToken(storedToken)
        if (userInfo) {
          setUser(userInfo)
          setToken(storedToken)
        } else {
          localStorage.removeItem('auth_token')
        }
      }
      setLoading(false)
    }

    initAuth()
  }, [])

  const value = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    login,
    logout,
    loading,
    isAdmin: user?.role === 'admin',
    isReadOnly: user?.role === 'readonly',
    canEdit: user?.role === 'admin' // Only admin users can edit
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}