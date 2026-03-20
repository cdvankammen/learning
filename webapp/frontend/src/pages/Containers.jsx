import React, { useEffect, useState } from 'react'

export default function Containers() {
  const [containers, setContainers] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    function fetchContainers() {
      fetch('/api/lxc/list')
        .then(r => r.json())
        .then(d => { setContainers(d.containers || []); if (d.error) setError(d.error) })
        .catch(e => setError(e.message))
    }
    fetchContainers()
    const interval = setInterval(fetchContainers, 10000)
    return () => clearInterval(interval)
  }, [])

  const running = containers.filter(c => c.status === 'running').length
  const stopped = containers.length - running

  return (
    <div className="page">
      <h2>LXC Containers <span className="refresh-dot">●</span></h2>
      {error && <div className="alert">{error}</div>}
      <p>{containers.length} container(s) — <span style={{color:'var(--green)'}}>{running} running</span>, <span style={{color:'var(--red)'}}>{stopped} stopped</span></p>
      <table>
        <thead><tr><th>VMID</th><th>Status</th><th>Name</th></tr></thead>
        <tbody>
          {containers.map(c => (
            <tr key={c.vmid}>
              <td>{c.vmid}</td>
              <td><span className={`badge ${c.status}`}>{c.status}</span></td>
              <td>{c.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
