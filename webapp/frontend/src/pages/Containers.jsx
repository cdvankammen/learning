import React, { useEffect, useState } from 'react'

export default function Containers() {
  const [containers, setContainers] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/lxc/list')
      .then(r => r.json())
      .then(d => { setContainers(d.containers || []); if (d.error) setError(d.error) })
      .catch(e => setError(e.message))
  }, [])

  return (
    <div className="page">
      <h2>LXC Containers</h2>
      {error && <div className="alert">{error}</div>}
      <p>{containers.length} container(s)</p>
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
