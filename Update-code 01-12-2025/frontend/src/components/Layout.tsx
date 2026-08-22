import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import {
  LayoutDashboard,
  Target,
  Database,
  Camera,
  Menu,
  Server,
  Moon,
  Sun,
  Users,
  Share2,
  FileText,
  LogOut,
  User
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'ZFS Storage', href: '/zfs', icon: Database },
  { name: 'iSCSI Targets', href: '/targets', icon: Target },
  { name: 'Samba Shares', href: '/samba', icon: Share2 },
  { name: 'Users & Groups', href: '/users', icon: Users },
  { name: 'Snapshots', href: '/snapshots', icon: Camera },
  { name: 'Services', href: '/services', icon: Server },
  { name: 'System Logs', href: '/logs', icon: FileText },
]

export default function Layout({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    // Check for saved theme preference or default to light mode
    const saved = localStorage.getItem('darkMode')
    return saved ? JSON.parse(saved) : false
  })
  const location = useLocation()

  // Save theme preference to localStorage
  const toggleDarkMode = () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)
    localStorage.setItem('darkMode', JSON.stringify(newDarkMode))
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark' : ''}`}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        {/* Sidebar */}
        <div className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-100'
        } fixed inset-y-0 left-0 z-50 w-48 sm:w-56 md:w-64 bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:w-64`}>
          <div className="flex items-center justify-between h-14 sm:h-16 px-3 sm:px-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <Server className="h-8 w-8 text-blue-600" />
              <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                Storage Manager
              </span>
            </div>
          </div>

          <nav className="mt-6 sm:mt-8 px-3 sm:px-4 space-y-1 sm:space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center space-x-2 sm:space-x-3 px-2 sm:px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="bg-white dark:bg-gray-800 shadow-sm z-40">
            <div className="flex items-center justify-between h-14 sm:h-16 px-3 sm:px-4">
              <div className="flex items-center">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700"
                >
                  <Menu className="h-6 w-6" />
                </button>
              </div>

              <div className="flex items-center space-x-2 sm:space-x-4">
                {/* User info */}
                <div className="flex items-center space-x-1 sm:space-x-2 text-sm text-gray-700 dark:text-gray-300">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline truncate max-w-20">{user?.username}</span>
                </div>

                {/* Logout button */}
                <button
                  onClick={() => {
                    onLogout()
                    addToast({
                      title: 'Logged out',
                      description: 'You have been logged out successfully',
                      type: 'info'
                    })
                  }}
                  className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>

                <button
                  onClick={toggleDarkMode}
                  className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
                  title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 md:p-6">
            {children}
          </main>
        </div>

        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </div>
    </div>
  )
}