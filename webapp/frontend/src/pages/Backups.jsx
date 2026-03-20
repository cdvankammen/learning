import React, { useEffect, useState } from 'react'

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

  function fetchBackups() {
    fetch('/api/backups')
      .then(r => r.json())
      .then(d => { setBackups(d.backups || []); if (d.error) setError(d.error) })
      .catch(e => setError(e.message))
  }

  useEffect(() => {
    fetchBackups()
    const interval = setInterval(fetchBackups, 30000)
    return () => clearInterval(interval)
  }, [])

  async function triggerBackup(vmid) {
    if (!vmid) return
    setTriggerMsg(`Backing up CT ${vmid}...`)
    try {
      const res = await fetch(`/api/backups/trigger/${vmid}`, { method: 'POST' })
      const data = await res.json()
      setTriggerMsg(data.ok ? `Backup of CT ${vmid} complete (${data.mode} mode)` : `Error: ${data.error}`)
      setTimeout(fetchBackups, 3000)
    } catch (e) {
      setTriggerMsg(`Error: ${e.message}`)
    }
  }

  // Get unique VMIDs from backup list for the trigger dropdown
  const vmids = [...new Set(backups.map(b => b.vmid))].sort()

  return (
    <div className="page">
      <h2>Backups <span className="refresh-dot">●</span></h2>
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
          <button onClick={() => triggerBackup(triggerVmid)}>Backup Now</button>
          {vmids.length > 0 && (
            <>
              <span style={{color:'var(--text)', opacity:0.5}}>or quick:</span>
              {vmids.slice(0, 5).map(v => (
                <button key={v} onClick={() => triggerBackup(v)} style={{background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)'}}>{v}</button>
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
