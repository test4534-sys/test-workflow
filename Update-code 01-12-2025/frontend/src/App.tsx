import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { Toaster } from './components/ui/Toaster'
import { ToastProvider, useToast } from './hooks/useToast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { useIdleTimer } from './hooks/useIdleTimer'
import { SessionTimeoutModal } from './components/SessionTimeoutModal'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ZFSManagement from './pages/ZFSManagement'
import Targets from './pages/Targets'
import SambaShares from './pages/SambaShares'
import SambaAuditLogs from './pages/SambaAuditLogs'
import AvailableDisks from './pages/AvailableDisks'
import UsersGroups from './pages/UsersGroups'
import Snapshots from './pages/Snapshots'
import ScheduledSnapshots from './pages/ScheduledSnapshots'
import Services from './pages/Services' // Import the Services component
import SystemLogs from './pages/SystemLogs' // Import the SystemLogs component
import NetworkInterfaces from './pages/NetworkInterfaces' // Import the NetworkInterfaces component
import DelegatedAdministrators from './pages/DelegatedAdministrators' // Import the DelegatedAdministrators component

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function AppContent() {
  const { isAuthenticated, login, logout, loading, isAdmin } = useAuth()
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)

  const TIMEOUT_DURATION = 5 * 60 * 1000 // 5 minutes
  const WARNING_DURATION = 20 * 1000 // 20 seconds

  // Auto logout after 5 minutes of inactivity, with a warning 20s before
  useIdleTimer({
    timeout: TIMEOUT_DURATION,
    promptBeforeIdle: WARNING_DURATION,
    onIdle: logout,
    onPrompt: () => setShowTimeoutWarning(true),
    onActive: () => setShowTimeoutWarning(false),
    isActive: isAuthenticated
  })

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (isAuthenticated) {
    return (
      <Layout onLogout={logout}>
        <SessionTimeoutModal
          isOpen={showTimeoutWarning}
          onClose={() => setShowTimeoutWarning(false)}
          onLogout={logout}
          countdownDuration={WARNING_DURATION}
        />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/zfs" element={<ZFSManagement />} />
          <Route path="/zfs/disks" element={<AvailableDisks />} />
          <Route path="/targets" element={<Targets />} />
          <Route path="/samba" element={<SambaShares />} />
          <Route path="/samba/audit" element={<SambaAuditLogs />} />
          <Route path="/users" element={<UsersGroups />} />
          <Route path="/users/delegated" element={
            <ProtectedAdminRoute>
              <DelegatedAdministrators />
            </ProtectedAdminRoute>
          } />
          <Route path="/snapshots" element={<Snapshots />} />
          <Route path="/scheduled-snapshots" element={<ScheduledSnapshots />} />
          <Route path="/services" element={<Services />} />
          <Route path="/logs" element={<SystemLogs />} />
          <Route path="/network" element={<NetworkInterfaces />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    )
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login onLogin={login} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}

function App() {
  return (
    <ToastProvider>
      <Router>
        <AuthProviderWithToast>
          <AppContent />
          <Toaster />
        </AuthProviderWithToast>
      </Router>
    </ToastProvider>
  )
}

function AuthProviderWithToast({ children }: { children: React.ReactNode }) {
  const { addToast } = useToast()

  return (
    <AuthProvider addToast={addToast}>
      {children}
    </AuthProvider>
  )
}

export default App