import React from 'react'

export default function Settings({ socketStatus }) {
  return (
    <div className="page">
      <h2>Settings</h2>
      <div className="card">
        <h3>Connection</h3>
        <p>Socket status: <strong>{socketStatus}</strong></p>
        {socketStatus !== 'connected' && <p>The socket backend is not available, so live client actions stay disabled.</p>}
      </div>
      <div className="card">
        <h3>Backup Policy</h3>
        <ul>
          <li>Max backup age: 4 hours</li>
          <li>Prune retention: keep 10 per pattern</li>
          <li>Compression: lzo (default)</li>
        </ul>
      </div>
      <div className="card">
        <h3>About</h3>
        <p>USB/IP Management Console v0.1.0</p>
        <p>Manages Proxmox LXC containers and USB/IP device sharing.</p>
      </div>
    </div>
  )
}
