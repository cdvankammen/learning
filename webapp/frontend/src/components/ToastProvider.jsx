import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

function makeToastId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback(id => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const notify = useCallback((message, type = 'info', durationMs = 4000) => {
    const id = makeToastId()
    const toast = { id, message, type }
    setToasts(prev => [...prev, toast])
    const timer = setTimeout(() => dismiss(id), durationMs)
    timers.current.set(id, timer)
    return id
  }, [dismiss])

  useEffect(() => () => {
    for (const timer of timers.current.values()) {
      clearTimeout(timer)
    }
    timers.current.clear()
  }, [])

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <div className="toast-message">{toast.message}</div>
            <button className="toast-dismiss" type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider')
  }
  return context
}
