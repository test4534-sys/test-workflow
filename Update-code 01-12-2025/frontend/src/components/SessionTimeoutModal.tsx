import React, { useEffect, useState } from 'react'

interface SessionTimeoutModalProps {
    isOpen: boolean
    onClose: () => void
    onLogout: () => void
    countdownDuration: number
}

export function SessionTimeoutModal({ isOpen, onClose, onLogout, countdownDuration }: SessionTimeoutModalProps) {
    const [timeLeft, setTimeLeft] = useState(Math.ceil(countdownDuration / 1000))

    useEffect(() => {
        if (!isOpen) {
            setTimeLeft(Math.ceil(countdownDuration / 1000))
            return
        }

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer)
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(timer)
    }, [isOpen, countdownDuration])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700 transform transition-all scale-100">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Session Timeout Warning
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                    You have been idle for a while. You will be logged out in <span className="font-bold text-red-600 dark:text-red-400 text-lg">{timeLeft}</span> seconds.
                </p>
                <div className="flex justify-end space-x-4">
                    <button
                        onClick={onLogout}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    >
                        Logout Now
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Stay Logged In
                    </button>
                </div>
            </div>
        </div>
    )
}
