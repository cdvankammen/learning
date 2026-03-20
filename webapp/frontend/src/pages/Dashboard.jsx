import React, { useEffect, useState } from 'react'
import { fetchJson } from '../lib/http'

export default function Dashboard() {
  const [system, setSystem] = useState(null)
  const [health, setHealth] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    async function fetchAll() {
      const [systemResult, healthResult] = await Promise.allSettled([
        fetchJson('/api/system'),
        fetchJson('/api/health')
      ])

      if (!alive) return

      if (systemResult.status === 'fulfilled') {
        setSystem(systemResult.value)
      }
      if (healthResult.status === 'fulfilled') {
        setHealth(healthResult.value)
      }

      const errors = [systemResult, healthResult]
        .filter(result => result.status === 'rejected')
        .map(result => result.reason.message)
      setError(errors.length > 0 ? errors.join(' • ') : null)
      setLoading(false)
    }

    fetchAll()
    const interval = setInterval(fetchAll, 5000)
    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="page">
      <h2>Dashboard <span className="refresh-dot">●</span></h2>
      {loading && !system && !health && <div className="card">Loading dashboard data...</div>}
      {error && <div className="alert">{error}</div>}
      {health && (
        <div className="card">
          <h3>Service Health</h3>
          <p>Status: <strong>{health.status}</strong></p>
          <p>Version: {health.version}</p>
          <p>Uptime: {Math.round(health.uptime)}s</p>
        </div>
      )}
      {system && (
        <div className="card">
          <h3>System Info</h3>
          <p>Hostname: <strong>{system.hostname}</strong></p>
          <p>CPUs: {system.cpus} | Load: {system.loadavg.map(l => l.toFixed(2)).join(', ')}</p>
          <p>Memory: {Math.round(system.mem.free / 1024 / 1024)}MB free / {Math.round(system.mem.total / 1024 / 1024)}MB total</p>
          <p>OS uptime: {Math.round(system.uptime / 3600)}h</p>
        </div>
      )}
    </div>
  )
}
