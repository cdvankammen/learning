import React, { useEffect, useState } from 'react'

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [error, setError] = useState(null)
  const [actionResult, setActionResult] = useState(null)
  const [remoteHost, setRemoteHost] = useState('')

  useEffect(() => {
    fetchDevices()
    const interval = setInterval(fetchDevices, 15000)
    return () => clearInterval(interval)
  }, [])

  function fetchDevices() {
    fetch('/api/usbip/devices')
      .then(r => r.json())
      .then(d => { setDevices(d.devices || []); if (d.error) setError(d.error) })
      .catch(e => setError(e.message))
  }

  async function handleBind(busid) {
    setActionResult(`Binding ${busid}...`)
    const res = await fetch('/api/usbip/bind', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ busid })
    })
    const data = await res.json()
    setActionResult(data.ok ? `Bound ${busid}` : `Error: ${data.error}`)
    fetchDevices()
  }

  async function handleUnbind(busid) {
    setActionResult(`Unbinding ${busid}...`)
    const res = await fetch('/api/usbip/unbind', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ busid })
    })
    const data = await res.json()
    setActionResult(data.ok ? `Unbound ${busid}` : `Error: ${data.error}`)
    fetchDevices()
  }

  return (
    <div className="page">
      <h2>USB/IP Devices <span className="refresh-dot">●</span></h2>
      {error && <div className="alert">{error}</div>}
      {actionResult && <div className="alert info">{actionResult}</div>}

      <div className="card">
        <h3>Remote Connection</h3>
        <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
          <input
            type="text"
            placeholder="Remote host IP"
            value={remoteHost}
            onChange={e => setRemoteHost(e.target.value)}
            style={{background:'var(--bg)', color:'var(--text)', border:'1px solid var(--border)', padding:'6px 12px', borderRadius:'6px', width:'200px'}}
          />
          <span style={{opacity:0.5, fontSize:'0.85rem'}}>Enter a remote USB/IP server to list its exported devices</span>
        </div>
      </div>

      <h3>Local Devices</h3>
      {devices.length === 0 && !error && <p>No USB devices detected.</p>}
      <table>
        <thead><tr><th>Bus ID</th><th>Description</th><th>Actions</th></tr></thead>
        <tbody>
          {devices.map(d => (
            <tr key={d.busid}>
              <td><code>{d.busid}</code></td>
              <td>{d.description}</td>
              <td>
                <button onClick={() => handleBind(d.busid)}>Bind</button>
                <button className="btn-danger" onClick={() => handleUnbind(d.busid)}>Unbind</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
