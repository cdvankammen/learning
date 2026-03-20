import React, { useCallback, useEffect, useState } from 'react'
import { fetchJson } from '../lib/http'

export default function VirtualDevices() {
  const [bridges, setBridges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [outputs, setOutputs] = useState({})

  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [message])

  const refreshBridges = useCallback(async (signal) => {
    const requestOptions = signal ? { signal } : undefined
    setLoading(true)
    try {
      const result = await fetchJson('/api/virtual-bridges', requestOptions)
      if (signal?.aborted) return null
      setBridges(Array.isArray(result.bridges) ? result.bridges : [])
      setError(null)
      return result
    } catch (err) {
      if (!signal?.aborted) {
        setError(err.message)
        setBridges([])
      }
      return null
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    refreshBridges(signal).catch(err => {
      if (!signal.aborted) {
        setError(err.message)
        setLoading(false)
      }
    })

    const interval = setInterval(() => {
      refreshBridges().catch(err => {
        setError(err.message)
      })
    }, 30000)

    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [refreshBridges])

  async function runAction(bridgeId, action) {
    try {
      const result = await fetchJson(`/api/virtual-bridges/${bridgeId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      setOutputs(prev => ({ ...prev, [bridgeId]: result }))
      setMessage(`${bridgeId} ${action} completed`)
      await refreshBridges()
    } catch (err) {
      setError(err.message)
    }
  }

  function renderToolList(bridge) {
    if (!Array.isArray(bridge.tools) || bridge.tools.length === 0) {
      return <li>No tool inventory available.</li>
    }
    return bridge.tools.map(tool => (
      <li key={`${bridge.id}-${tool.name}`}>
        <code>{tool.name}</code> {tool.available ? 'available' : 'missing'}
      </li>
    ))
  }

  function renderCommandState(bridge, action) {
    const envName = bridge.env?.[action]
    const configured = Boolean(bridge.commands?.[action])
    return (
      <div>
        <strong>{action}:</strong> {configured ? 'configured' : 'not configured'}
        {envName && <div className="hint"><code>{envName}</code></div>}
      </div>
    )
  }

  return (
    <div className="page">
      <h2>Virtual Devices</h2>
      <p className="page-note">
        This is the separate media/driver layer. It does not tunnel USB/IP traffic; it inventories and controls virtual audio/video
        bridges such as go2rtc, PipeWire, v4l2loopback, and ALSA loopback.
      </p>

      {error && <div className="alert">{error}</div>}
      {message && <div className="alert info">{message}</div>}
      {loading && <div className="card">Loading virtual bridge inventory...</div>}

      <div className="card">
        <div className="peer-card-header">
          <div>
            <h3>Bridge inventory</h3>
            <p className="hint">Set command templates with env vars like <code>USBIP_VIRTUAL_GO2RTC_START_COMMAND</code> before using start/stop actions.</p>
          </div>
          <div className="peer-actions">
            <button onClick={() => refreshBridges()}>Refresh inventory</button>
          </div>
        </div>

        {bridges.length === 0 && !loading ? (
          <p>No virtual bridge definitions were returned.</p>
        ) : (
          <div className="peer-grid">
            {bridges.map(bridge => {
              const output = outputs[bridge.id]
              const canStart = Boolean(bridge.commands?.start)
              const canStop = Boolean(bridge.commands?.stop)
              const canRestart = Boolean(bridge.commands?.restart || (bridge.commands?.start && bridge.commands?.stop))
              return (
                <div className="peer-card" key={bridge.id}>
                  <div className="peer-card-header">
                    <div>
                      <strong>{bridge.label}</strong>
                      <div className="peer-url"><code>{bridge.id}</code></div>
                    </div>
                    <div className="peer-actions">
                      <button onClick={() => runAction(bridge.id, 'start')} disabled={!canStart}>Start</button>
                      <button onClick={() => runAction(bridge.id, 'stop')} disabled={!canStop}>Stop</button>
                      <button onClick={() => runAction(bridge.id, 'restart')} disabled={!canRestart}>Restart</button>
                    </div>
                  </div>

                  <p>{bridge.description}</p>

                  <div className="peer-meta">
                    <div><strong>Kind:</strong> {bridge.kind}</div>
                    <div><strong>Status mode:</strong> {bridge.ready ? 'commands configured' : 'awaiting command templates'}</div>
                    <div><strong>Tools available:</strong> {bridge.availableTools ? 'yes' : 'partial or missing'}</div>
                    <div><strong>Docs:</strong> <a href={bridge.docs} target="_blank" rel="noreferrer">{bridge.docs}</a></div>
                  </div>

                  <div className="peer-meta">
                    {renderCommandState(bridge, 'start')}
                    {renderCommandState(bridge, 'stop')}
                    {renderCommandState(bridge, 'restart')}
                    {renderCommandState(bridge, 'status')}
                  </div>

                  <ul className="url-list">
                    {renderToolList(bridge)}
                  </ul>

                  {output && (
                    <pre className="hint" style={{ whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(output, null, 2)}
                    </pre>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
