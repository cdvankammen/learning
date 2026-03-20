import React, { useEffect, useRef, useState } from 'react'
import { fetchJson } from '../lib/http'

function formatSize(bytes) {
  if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  return bytes + ' B'
}

function timeAgo(d) {
  const sec = Math.round((Date.now() - new Date(d).getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`
  return `${Math.round(sec / 86400)}d ago`
}

export default function Backups() {
  const [backups, setBackups] = useState([])
  const [error, setError] = useState(null)
  const [triggerMsg, setTriggerMsg] = useState(null)
  const [triggerVmid, setTriggerVmid] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyVmid, setBusyVmid] = useState(null)
  const refreshTimeoutRef = useRef(null)

  async function fetchBackups() {
    try {
      const data = await fetchJson('/api/backups')
      setBackups(data.backups || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBackups()
    const interval = setInterval(fetchBackups, 30000)
    return () => {
      clearInterval(interval)
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    }
  }, [])

  async function triggerBackup(vmid) {
    if (!vmid) return
    setTriggerMsg(`Backing up CT ${vmid}...`)
    setBusyVmid(vmid)
    try {
      const data = await fetchJson(`/api/backups/trigger/${vmid}`, { method: 'POST' })
      setTriggerMsg(data.message || `Backup of CT ${vmid} complete (${data.mode} mode)`)
      setError(null)
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = setTimeout(fetchBackups, 3000)
    } catch (e) {
      setTriggerMsg(`Error: ${e.message}`)
    } finally {
      setBusyVmid(null)
    }
  }

  useEffect(() => {
    if (!triggerMsg) return undefined
    const timer = setTimeout(() => setTriggerMsg(null), 4000)
    return () => clearTimeout(timer)
  }, [triggerMsg])

  // Get unique VMIDs from backup list for the trigger dropdown
  const vmids = [...new Set(backups.map(b => b.vmid))].sort()

  return (
    <div className="page">
      <h2>Backups <span className="refresh-dot">●</span></h2>
      {loading && backups.length === 0 && <div className="card">Loading backups...</div>}
      {error && <div className="alert">{error}</div>}
      {triggerMsg && <div className="alert info">{triggerMsg}</div>}

      <div className="card">
        <h3>Trigger Backup</h3>
        <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
          <input
            type="text"
            placeholder="VMID (e.g. 500)"
            value={triggerVmid}
            onChange={e => setTriggerVmid(e.target.value.replace(/[^0-9]/g, ''))}
            style={{background:'var(--bg)', color:'var(--text)', border:'1px solid var(--border)', padding:'6px 12px', borderRadius:'6px', width:'140px'}}
          />
          <button disabled={busyVmid !== null} onClick={() => triggerBackup(triggerVmid)}>Backup Now</button>
          {vmids.length > 0 && (
            <>
              <span style={{color:'var(--text)', opacity:0.5}}>or quick:</span>
              {vmids.slice(0, 5).map(v => (
                <button key={v} disabled={busyVmid !== null} onClick={() => triggerBackup(v)} style={{background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)'}}>{v}</button>
              ))}
            </>
          )}
        </div>
      </div>

      <p>{backups.length} backup archive(s) found</p>
      <table>
        <thead><tr><th>VMID</th><th>File</th><th>Size</th><th>Age</th></tr></thead>
        <tbody>
          {backups.map(b => (
            <tr key={b.file}>
              <td>{b.vmid}</td>
              <td><code>{b.file}</code></td>
              <td>{formatSize(b.size)}</td>
              <td>{timeAgo(b.mtime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
