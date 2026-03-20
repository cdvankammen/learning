import React, { useEffect, useState } from 'react'
import { fetchJson } from '../lib/http'

function loadSavedHosts() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem('usbip.remoteHosts')
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

function saveSavedHosts(hosts) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('usbip.remoteHosts', JSON.stringify(hosts))
}

function renderCapability(value) {
  return value === null ? 'unbounded' : String(value)
}

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [ports, setPorts] = useState([])
  const [capabilities, setCapabilities] = useState(null)
  const [remoteHosts, setRemoteHosts] = useState(loadSavedHosts())
  const [remoteData, setRemoteData] = useState({})
  const [hostInput, setHostInput] = useState('')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    saveSavedHosts(remoteHosts)
  }, [remoteHosts])

  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  async function refreshLocalState(signal) {
    const requestOptions = signal ? { signal } : undefined
    const [capsResult, localResult, portsResult] = await Promise.allSettled([
      fetchJson('/api/usbip/capabilities', requestOptions),
      fetchJson('/api/usbip/devices', requestOptions),
      fetchJson('/api/usbip/ports', requestOptions)
    ])

    if (signal && signal.aborted) return

    if (capsResult.status === 'fulfilled') {
      setCapabilities(capsResult.value || null)
    }
    if (localResult.status === 'fulfilled') {
      setDevices(localResult.value.devices || [])
    }
    if (portsResult.status === 'fulfilled') {
      setPorts(portsResult.value.ports || [])
    }

    const errors = [capsResult, localResult, portsResult]
      .filter(result => result.status === 'rejected')
      .map(result => result.reason.message)

    setError(errors.length > 0 ? errors.join(' • ') : null)
    setLoading(false)
  }

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    async function refreshRemote(host, currentSignal = signal) {
      const data = await fetchJson(`/api/usbip/remote/${encodeURIComponent(host)}/devices`, { signal: currentSignal })
      if (currentSignal.aborted) return

      setRemoteData(prev => ({
        ...prev,
        [host]: {
          devices: data.devices || [],
          raw: data.raw || '',
          error: data.error || null
        }
      }))
    }

    refreshLocalState(signal).catch(err => {
      if (!signal.aborted) {
        setError(err.message)
        setLoading(false)
      }
    })
    remoteHosts.forEach(host => {
      refreshRemote(host, signal).catch(err => {
        if (!signal.aborted) {
          setRemoteData(prev => ({
            ...prev,
            [host]: { devices: [], raw: '', error: err.message }
          }))
        }
      })
    })

    const interval = setInterval(() => {
      refreshLocalState(signal).catch(err => {
        if (!signal.aborted) setError(err.message)
      })
      remoteHosts.forEach(host => {
        refreshRemote(host, signal).catch(err => {
          if (!signal.aborted) {
            setRemoteData(prev => ({
              ...prev,
              [host]: { devices: [], raw: '', error: err.message }
            }))
          }
        })
      })
    }, 15000)

    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [remoteHosts])

  async function addRemoteHost() {
    const host = hostInput.trim()
    if (!host) return
    if (remoteHosts.includes(host)) {
      setMessage(`Remote host ${host} is already tracked`)
      setHostInput('')
      return
    }

    setRemoteHosts(prev => [...prev, host])
    setHostInput('')
    setMessage(`Added remote host ${host}`)
  }

  function removeRemoteHost(host) {
    setRemoteHosts(prev => prev.filter(item => item !== host))
    setRemoteData(prev => {
      const next = { ...prev }
      delete next[host]
      return next
    })
    setMessage(`Removed remote host ${host}`)
  }

  async function refreshRemoteHost(host) {
    try {
      const data = await fetchJson(`/api/usbip/remote/${encodeURIComponent(host)}/devices`)
      setRemoteData(prev => ({
        ...prev,
        [host]: {
          devices: data.devices || [],
          raw: data.raw || '',
          error: data.error || null
        }
      }))
      setError(data.error || null)
    } catch (err) {
      setRemoteData(prev => ({
        ...prev,
        [host]: { devices: [], raw: '', error: err.message }
      }))
      setError(err.message)
    }
  }

  async function handleBind(busid) {
    setMessage(`Binding ${busid}...`)
    try {
      await fetchJson('/api/usbip/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ busid })
      })
      setMessage(`Bound ${busid}`)
      setError(null)
      await refreshLocalState()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleUnbind(busid) {
    setMessage(`Unbinding ${busid}...`)
    try {
      await fetchJson('/api/usbip/unbind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ busid })
      })
      setMessage(`Unbound ${busid}`)
      setError(null)
      await refreshLocalState()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleConnect(host, busid) {
    setMessage(`Connecting ${busid} from ${host}...`)
    try {
      await fetchJson('/api/usbip/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, busid })
      })
      setMessage(`Connected ${busid} from ${host}`)
      setError(null)
      await refreshLocalState()
      await refreshRemoteHost(host)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDisconnect(port) {
    setMessage(`Disconnecting port ${port}...`)
    try {
      await fetchJson('/api/usbip/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port })
      })
      setMessage(`Disconnected port ${port}`)
      setError(null)
      await refreshLocalState()
    } catch (err) {
      setError(err.message)
    }
  }

  const connected = ports.length

  return (
    <div className="page">
      <h2>USB/IP Devices <span className="refresh-dot">●</span></h2>
      {loading && <div className="card">Loading USB/IP state...</div>}
      {error && <div className="alert">{error}</div>}
      {message && <div className="alert info">{message}</div>}

      <div className="card">
        <h3>Capabilities</h3>
        {!capabilities && <p>Loading USB/IP capabilities...</p>}
        {capabilities && (
          <div className="capability-grid">
            <div><strong>Server:</strong> {String(capabilities.server)}</div>
            <div><strong>Client:</strong> {String(capabilities.client)}</div>
            <div><strong>Simultaneous roles:</strong> {String(capabilities.simultaneous)}</div>
            <div><strong>Peers:</strong> {renderCapability(capabilities.peerLimit)}</div>
            <div><strong>Devices per peer:</strong> {renderCapability(capabilities.deviceLimit)}</div>
            <div><strong>API rate limit:</strong> {renderCapability(capabilities.apiRateLimit)}</div>
          </div>
        )}
        <p style={{ marginTop: '8px' }}>
          The control plane does not impose an artificial cap on peers or devices; limits are driven by the host and the USB/IP daemon.
        </p>
      </div>

      <div className="card">
        <h3>Local Export</h3>
        <p>{devices.length} local device(s) detected</p>
        {devices.length === 0 ? (
          <p>No local USB devices were returned by the backend.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Bus ID</th><th>Description</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {devices.map(device => (
                <tr key={device.busid}>
                  <td><code>{device.busid}</code></td>
                  <td>{device.description}</td>
                  <td>
                    <button onClick={() => handleBind(device.busid)}>Bind</button>
                    <button className="btn-danger" onClick={() => handleUnbind(device.busid)}>Unbind</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Imported Devices</h3>
        <p>{connected} imported device(s) active</p>
        {ports.length === 0 ? (
          <p>No imported devices are currently attached.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Port</th><th>Description</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {ports.map(port => (
                <tr key={port.port}>
                  <td><code>{port.port}</code></td>
                  <td>{port.description}</td>
                  <td>
                    <button className="btn-danger" onClick={() => handleDisconnect(port.port)}>Disconnect</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Remote Hosts</h3>
        <div className="host-entry">
          <input
            type="text"
            placeholder="Remote USB/IP host (IP or hostname)"
            value={hostInput}
            onChange={e => setHostInput(e.target.value)}
          />
          <button onClick={addRemoteHost}>Add host</button>
          <span className="hint">Track as many peers as you need; each host is polled independently.</span>
        </div>

        {remoteHosts.length === 0 ? (
          <p>No remote hosts added yet.</p>
        ) : (
          <div className="remote-host-list">
            {remoteHosts.map(host => {
              const state = remoteData[host] || { devices: [], raw: '', error: null }
              return (
                <div className="host-card" key={host}>
                  <div className="host-card-header">
                    <strong>{host}</strong>
                    <div>
                      <button onClick={() => refreshRemoteHost(host)}>Refresh</button>
                      <button className="btn-danger" onClick={() => removeRemoteHost(host)}>Remove</button>
                    </div>
                  </div>

                  {state.error && <div className="alert">{state.error}</div>}

                  {state.devices.length === 0 ? (
                    <p>No exported devices reported by this host.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr><th>Bus ID</th><th>Description</th><th>Actions</th></tr>
                      </thead>
                      <tbody>
                        {state.devices.map(device => (
                          <tr key={`${host}-${device.busid}`}>
                            <td><code>{device.busid}</code></td>
                            <td>{device.description}</td>
                            <td>
                              <button onClick={() => handleConnect(host, device.busid)}>Connect</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {state.raw && <pre className="raw-output">{state.raw}</pre>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
