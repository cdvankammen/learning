import React, { useEffect, useRef, useState } from 'react'
import { fetchJson } from '../lib/http'
import { useToast } from '../components/ToastProvider'

export default function Containers({ socket, socketStatus, socketContainers, hasSocketSnapshot }) {
  const [containers, setContainers] = useState([])
  const [error, setError] = useState(null)
  const [actionMsg, setActionMsg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState(null)
  const refreshTimeoutRef = useRef(null)
  const { notify } = useToast()

  async function fetchContainers() {
    try {
      const data = await fetchJson('/api/lxc/list')
      setContainers(data.containers || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContainers()
    const interval = setInterval(fetchContainers, 10000)
    return () => {
      clearInterval(interval)
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!actionMsg) return undefined
    const timer = setTimeout(() => setActionMsg(null), 4000)
    return () => clearTimeout(timer)
  }, [actionMsg])

  useEffect(() => {
    if (actionMsg) notify(actionMsg, 'info')
  }, [actionMsg, notify])

  useEffect(() => {
    if (error) notify(error, 'error')
  }, [error, notify])

  useEffect(() => {
    if (socketStatus === 'connected' && hasSocketSnapshot) {
      setContainers(Array.isArray(socketContainers) ? socketContainers : [])
      setLoading(false)
    }
  }, [hasSocketSnapshot, socketContainers, socketStatus])

  async function handleAction(vmid, action) {
    setActionMsg(`${action === 'start' ? 'Starting' : 'Stopping'} ${vmid}...`)
    setBusyAction(`${vmid}:${action}`)
    try {
      const data = await fetchJson(`/api/lxc/${vmid}/${action}`, { method: 'POST' })
      setActionMsg(data.message || `${vmid} ${data.action || action}`)
      setError(null)
      if (socketStatus === 'connected' && socket) {
        socket.emit('refresh-lxc')
      }
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = setTimeout(fetchContainers, 2000)
    } catch (e) {
      setActionMsg(`Error: ${e.message}`)
    } finally {
      setBusyAction(null)
    }
  }

  const running = containers.filter(c => c.status === 'running').length
  const stopped = containers.length - running

  return (
    <div className="page">
      <h2>LXC Containers <span className="refresh-dot">●</span></h2>
      {socketStatus === 'connected' && hasSocketSnapshot && <div className="alert info">Live LXC updates are being received from the socket backend.</div>}
      {loading && containers.length === 0 && <div className="card">Loading containers...</div>}
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
                {c.status === 'stopped' && <button disabled={busyAction === `${c.vmid}:start`} onClick={() => handleAction(c.vmid, 'start')}>Start</button>}
                {c.status === 'running' && <button className="btn-danger" disabled={busyAction === `${c.vmid}:stop`} onClick={() => handleAction(c.vmid, 'stop')}>Stop</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
