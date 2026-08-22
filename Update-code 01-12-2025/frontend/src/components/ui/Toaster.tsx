import React from 'react'
import { useToast } from '../../hooks/useToast'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const bgColorMap = {
  success: 'bg-green-50 border-green-200 dark:bg-green-900 dark:border-green-800',
  error: 'bg-red-50 border-red-200 dark:bg-red-900 dark:border-red-800',
  warning: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900 dark:border-yellow-800',
  info: 'bg-blue-50 border-blue-200 dark:bg-blue-900 dark:border-blue-800',
}

const textColorMap = {
  success: 'text-green-800 dark:text-green-300',
  error: 'text-red-800 dark:text-red-300',
  warning: 'text-yellow-800 dark:text-yellow-300',
  info: 'text-blue-800 dark:text-blue-300',
}

export function Toaster() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type]
        return (
          <div
            key={toast.id}
            className={`flex items-start p-4 rounded-lg border shadow-sm max-w-md ${bgColorMap[toast.type]} ${textColorMap[toast.type]}`}
          >
            <Icon className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium break-words">{toast.title}</p>
              {toast.description && (
                <div className="text-sm mt-1 opacity-90 whitespace-pre-wrap break-words">
                  {toast.description}
                </div>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-4 hover:opacity-70 transition-opacity flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}