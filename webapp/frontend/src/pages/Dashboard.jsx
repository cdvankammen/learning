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
      <div className="card">
        <h3>How to use this console</h3>
        <ul>
          <li><code>npm run serve</code> starts the backend; <code>npm run build</code> builds the frontend bundle.</li>
          <li><code>npm run status</code> and <code>npm run discover</code> query the local node from the terminal.</li>
          <li><code>API_URL=http://peer:3001 bin/usbip-ctl status</code> or <code>discover</code> points the CLI at another node.</li>
          <li><code>bin/usbip-ctl up</code>, <code>down</code>, <code>restart</code>, and <code>service status</code> control the local service when it is installed under systemd.</li>
          <li>The Computers page now shows a Discovered peers section backed by <code>/api/discovery/peers</code>; subnet-scan and mDNS/Bonjour discovery are both live, and the same UI can target another node with <code>?peer=http://node:3001</code>.</li>
          <li>The Virtual Devices page inventories <code>/api/virtual-bridges</code> and can drive configured media bridges such as go2rtc, PipeWire, v4l2loopback, and ALSA loopback.</li>
          <li>Use <strong>Computers</strong> to discover LAN peers, <strong>Devices</strong> to export/import USB devices, and the optional Proxmox pages for LXC actions, backups, and restore work.</li>
        </ul>
      </div>
      <div className="card">
        <h3>What this is and is not</h3>
        <ul>
          <li>This platform manages real USB/IP devices and can export and import at the same time.</li>
          <li>Virtual audio/video endpoints should use a separate media layer such as PipeWire, go2rtc, v4l2loopback, or ALSA loopback instead of raw USB/IP.</li>
          <li><code>0.0.0.0</code> is only a bind address; use a real LAN IP or hostname to reach other devices.</li>
        </ul>
      </div>
    </div>
  )
}
