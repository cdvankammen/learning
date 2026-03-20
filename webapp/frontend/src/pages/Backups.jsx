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

  useEffect(() => {
    fetch('/api/backups')
      .then(r => r.json())
      .then(d => { setBackups(d.backups || []); if (d.error) setError(d.error) })
      .catch(e => setError(e.message))
  }, [])

  return (
    <div className="page">
      <h2>Backups</h2>
      {error && <div className="alert">{error}</div>}
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
