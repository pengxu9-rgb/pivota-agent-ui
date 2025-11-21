'use client'

import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastProps {
  type: ToastType
  message: string
  onClose: () => void
  duration?: number
}

export default function Toast({ type, message, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const config = {
    success: {
      icon: CheckCircle,
      className: 'bg-green-50 border-green-500 text-green-800',
      iconClassName: 'text-green-500'
    },
    error: {
      icon: AlertCircle,
      className: 'bg-red-50 border-red-500 text-red-800',
      iconClassName: 'text-red-500'
    },
    warning: {
      icon: AlertTriangle,
      className: 'bg-yellow-50 border-yellow-500 text-yellow-800',
      iconClassName: 'text-yellow-500'
    },
    info: {
      icon: Info,
      className: 'bg-blue-50 border-blue-500 text-blue-800',
      iconClassName: 'text-blue-500'
    }
  }

  const { icon: Icon, className, iconClassName } = config[type]

  return (
    <div className={`fixed top-4 right-4 z-50 animate-slide-up`}>
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 shadow-lg max-w-md ${className}`}>
        <Icon className={`w-5 h-5 flex-shrink-0 ${iconClassName}`} />
        <p className="flex-1 text-sm font-medium">{message}</p>
        <button
          onClick={onClose}
          className="p-1 hover:bg-black/10 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
