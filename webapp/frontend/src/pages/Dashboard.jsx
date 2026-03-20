import React, { useEffect, useState } from 'react'

export default function Dashboard() {
  const [system, setSystem] = useState(null)
  const [health, setHealth] = useState(null)

  useEffect(() => {
    function fetchAll() {
      fetch('/api/system').then(r => r.json()).then(setSystem).catch(() => {})
      fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {})
    }
    fetchAll()
    const interval = setInterval(fetchAll, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="page">
      <h2>Dashboard <span className="refresh-dot">●</span></h2>
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
