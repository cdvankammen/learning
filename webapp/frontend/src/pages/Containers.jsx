import React, { useEffect, useState } from 'react'

export default function Containers() {
  const [containers, setContainers] = useState([])
  const [error, setError] = useState(null)
  const [actionMsg, setActionMsg] = useState(null)

  function fetchContainers() {
    fetch('/api/lxc/list')
      .then(r => r.json())
      .then(d => { setContainers(d.containers || []); if (d.error) setError(d.error) })
      .catch(e => setError(e.message))
  }

  useEffect(() => {
    fetchContainers()
    const interval = setInterval(fetchContainers, 10000)
    return () => clearInterval(interval)
  }, [])

  async function handleAction(vmid, action) {
    setActionMsg(`${action}ing ${vmid}...`)
    try {
      const res = await fetch(`/api/lxc/${vmid}/${action}`, { method: 'POST' })
      const data = await res.json()
      setActionMsg(data.ok ? `${vmid} ${data.action}` : `Error: ${data.error}`)
      setTimeout(fetchContainers, 2000)
    } catch (e) {
      setActionMsg(`Error: ${e.message}`)
    }
  }

  const running = containers.filter(c => c.status === 'running').length
  const stopped = containers.length - running

  return (
    <div className="page">
      <h2>LXC Containers <span className="refresh-dot">●</span></h2>
      {error && <div className="alert">{error}</div>}
      {actionMsg && <div className="alert info">{actionMsg}</div>}
      <p>{containers.length} container(s) — <span style={{color:'var(--green)'}}>{running} running</span>, <span style={{color:'var(--red)'}}>{stopped} stopped</span></p>
      <table>
        <thead><tr><th>VMID</th><th>Status</th><th>Name</th><th>Actions</th></tr></thead>
        <tbody>
          {containers.map(c => (
            <tr key={c.vmid}>
              <td>{c.vmid}</td>
              <td><span className={`badge ${c.status}`}>{c.status}</span></td>
              <td>{c.name}</td>
              <td>
                {c.status === 'stopped' && <button onClick={() => handleAction(c.vmid, 'start')}>Start</button>}
                {c.status === 'running' && <button className="btn-danger" onClick={() => handleAction(c.vmid, 'stop')}>Stop</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
