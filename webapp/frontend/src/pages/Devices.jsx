import React, { useEffect, useState } from 'react'

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

async function readJson(url) {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

async function requestJson(url, options) {
  const res = await fetch(url, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'Request failed')
  }
  return data
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

  useEffect(() => {
    saveSavedHosts(remoteHosts)
  }, [remoteHosts])

  async function refreshLocalState(cancelled = { current: false }) {
    const [capsRes, localRes, portsRes] = await Promise.all([
      readJson('/api/usbip/capabilities'),
      readJson('/api/usbip/devices'),
      readJson('/api/usbip/ports')
    ])

    if (cancelled.current) return

    setCapabilities(capsRes.data || null)
    setDevices(localRes.data.devices || [])
    setPorts(portsRes.data.ports || [])

    const errors = [capsRes, localRes, portsRes]
      .map(result => result.data && result.data.error)
      .filter(Boolean)

    setError(errors.length > 0 ? errors.join(' • ') : null)
  }

  useEffect(() => {
    const cancelled = { current: false }

    async function refreshRemote(host) {
      const { data } = await readJson(`/api/usbip/remote/${encodeURIComponent(host)}/devices`)
      if (cancelled.current) return

      setRemoteData(prev => ({
        ...prev,
        [host]: {
          devices: data.devices || [],
          raw: data.raw || '',
          error: data.error || null
        }
      }))
    }

    refreshLocalState(cancelled).catch(err => {
      if (!cancelled.current) setError(err.message)
    })
    remoteHosts.forEach(host => {
      refreshRemote(host).catch(err => {
        if (!cancelled.current) {
          setRemoteData(prev => ({
            ...prev,
            [host]: { devices: [], raw: '', error: err.message }
          }))
        }
      })
    })

    const interval = setInterval(() => {
      refreshLocalState(cancelled).catch(err => {
        if (!cancelled.current) setError(err.message)
      })
      remoteHosts.forEach(host => {
        refreshRemote(host).catch(err => {
          if (!cancelled.current) {
            setRemoteData(prev => ({
              ...prev,
              [host]: { devices: [], raw: '', error: err.message }
            }))
          }
        })
      })
    }, 15000)

    return () => {
      cancelled.current = true
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
    const { data } = await readJson(`/api/usbip/remote/${encodeURIComponent(host)}/devices`)
    setRemoteData(prev => ({
      ...prev,
      [host]: {
        devices: data.devices || [],
        raw: data.raw || '',
        error: data.error || null
      }
    }))
    setError(data.error || null)
  }

  async function handleBind(busid) {
    setMessage(`Binding ${busid}...`)
    try {
      await requestJson('/api/usbip/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ busid })
      })
      setMessage(`Bound ${busid}`)
      await refreshLocalState()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleUnbind(busid) {
    setMessage(`Unbinding ${busid}...`)
    try {
      await requestJson('/api/usbip/unbind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ busid })
      })
      setMessage(`Unbound ${busid}`)
      await refreshLocalState()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleConnect(host, busid) {
    setMessage(`Connecting ${busid} from ${host}...`)
    try {
      await requestJson('/api/usbip/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, busid })
      })
      setMessage(`Connected ${busid} from ${host}`)
      await refreshLocalState()
      await refreshRemoteHost(host)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDisconnect(port) {
    setMessage(`Disconnecting port ${port}...`)
    try {
      await requestJson('/api/usbip/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port })
      })
      setMessage(`Disconnected port ${port}`)
      await refreshLocalState()
    } catch (err) {
      setError(err.message)
    }
  }

  const connected = ports.length

  return (
    <div className="page">
      <h2>USB/IP Devices <span className="refresh-dot">●</span></h2>
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
