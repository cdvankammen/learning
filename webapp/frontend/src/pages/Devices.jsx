import React, { useEffect, useState } from 'react'

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [error, setError] = useState(null)
  const [bindResult, setBindResult] = useState(null)

  useEffect(() => {
    fetch('/api/usbip/devices')
      .then(r => r.json())
      .then(d => { setDevices(d.devices || []); if (d.error) setError(d.error) })
      .catch(e => setError(e.message))
  }, [])

  async function handleBind(busid) {
    const res = await fetch('/api/usbip/bind', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ busid })
    })
    const data = await res.json()
    setBindResult(data.ok ? `Bound ${busid}` : `Error: ${data.error}`)
  }

  async function handleUnbind(busid) {
    const res = await fetch('/api/usbip/unbind', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ busid })
    })
    const data = await res.json()
    setBindResult(data.ok ? `Unbound ${busid}` : `Error: ${data.error}`)
  }

  return (
    <div className="page">
      <h2>USB/IP Devices</h2>
      {error && <div className="alert">{error}</div>}
      {bindResult && <div className="alert info">{bindResult}</div>}
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
                <button onClick={() => handleUnbind(d.busid)}>Unbind</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
