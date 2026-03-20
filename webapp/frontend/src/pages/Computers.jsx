import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchJson } from '../lib/http'
import { normalizePeerBaseUrl, peerApiUrl } from '../lib/peer'
import { useToast } from '../components/ToastProvider'

function loadSavedPeers() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem('usbip.peerNodes')
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

function saveSavedPeers(peers) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('usbip.peerNodes', JSON.stringify(peers))
}

function formatLabel(address) {
  return address.includes(':') ? `[${address}]` : address
}

function openPeerPage(baseUrl, path) {
  if (typeof window === 'undefined') return
  const target = new URL(path, window.location.origin)
  target.searchParams.set('peer', baseUrl)
  window.open(target.toString(), '_blank', 'noopener,noreferrer')
}

async function readPeerSnapshot(baseUrl, signal) {
  const requestOptions = signal ? { signal } : undefined
  const [healthResult, systemResult, networkResult, capabilitiesResult, devicesResult, portsResult] = await Promise.allSettled([
    fetchJson(peerApiUrl(baseUrl, '/api/health'), requestOptions),
    fetchJson(peerApiUrl(baseUrl, '/api/system'), requestOptions),
    fetchJson(peerApiUrl(baseUrl, '/api/network/interfaces'), requestOptions),
    fetchJson(peerApiUrl(baseUrl, '/api/usbip/capabilities'), requestOptions),
    fetchJson(peerApiUrl(baseUrl, '/api/usbip/devices'), requestOptions),
    fetchJson(peerApiUrl(baseUrl, '/api/usbip/ports'), requestOptions)
  ])

  const state = {
    loading: false,
    error: null,
    health: null,
    system: null,
    network: null,
    capabilities: null,
    devices: [] ,
    ports: []
  }

  if (healthResult.status === 'fulfilled') state.health = healthResult.value
  if (systemResult.status === 'fulfilled') state.system = systemResult.value
  if (networkResult.status === 'fulfilled') state.network = networkResult.value
  if (capabilitiesResult.status === 'fulfilled') state.capabilities = capabilitiesResult.value
  if (devicesResult.status === 'fulfilled') state.devices = devicesResult.value.devices || []
  if (portsResult.status === 'fulfilled') state.ports = portsResult.value.ports || []

  const errors = [healthResult, systemResult, networkResult, capabilitiesResult, devicesResult, portsResult]
    .filter(result => result.status === 'rejected')
    .map(result => result.reason.message)

  state.error = errors.length > 0 ? errors.join(' • ') : null
  return state
}

async function readDiscoverySnapshot(signal) {
  const requestOptions = signal ? { signal } : undefined
  return fetchJson('/api/discovery/peers', requestOptions)
}

export default function Computers({ socket }) {
  const [liveRefreshNonce, setLiveRefreshNonce] = useState(0)
  const [system, setSystem] = useState(null)
  const [network, setNetwork] = useState(null)
  const [capabilities, setCapabilities] = useState(null)
  const [peers, setPeers] = useState(loadSavedPeers())
  const [peerStates, setPeerStates] = useState({})
  const [discovery, setDiscovery] = useState(null)
  const [discoveryLoading, setDiscoveryLoading] = useState(true)
  const [discoveryError, setDiscoveryError] = useState(null)
  const [peerInput, setPeerInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const refreshTimer = useRef(null)
  const discoveryTimer = useRef(null)
  const { notify } = useToast()

  useEffect(() => {
    saveSavedPeers(peers)
  }, [peers])

  useEffect(() => {
    if (!socket) return undefined

    const handleDiscoveryChange = () => {
      setLiveRefreshNonce(nonce => nonce + 1)
    }

    socket.on('discovery-peers', handleDiscoveryChange)
    return () => socket.off('discovery-peers', handleDiscoveryChange)
  }, [socket])

  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  useEffect(() => {
    if (message) notify(message, 'info')
  }, [message, notify])

  useEffect(() => {
    if (error) notify(error, 'error')
  }, [error, notify])

  const refreshDiscovery = useCallback(async (signal) => {
    const requestSignal = signal || undefined
    setDiscoveryLoading(true)
    try {
      const snapshot = await readDiscoverySnapshot(requestSignal)
      if (requestSignal?.aborted) return null
      setDiscovery(snapshot)
      setDiscoveryError(null)
      return snapshot
    } catch (err) {
      if (!requestSignal?.aborted) {
        setDiscoveryError(err.message)
        setDiscovery(null)
      }
      return null
    } finally {
      if (!requestSignal?.aborted) setDiscoveryLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    async function refreshLocal() {
      const [systemResult, networkResult, capabilitiesResult] = await Promise.allSettled([
        fetchJson('/api/system', { signal }),
        fetchJson('/api/network/interfaces', { signal }),
        fetchJson('/api/usbip/capabilities', { signal })
      ])

      if (signal.aborted) return

      if (systemResult.status === 'fulfilled') setSystem(systemResult.value)
      if (networkResult.status === 'fulfilled') setNetwork(networkResult.value)
      if (capabilitiesResult.status === 'fulfilled') setCapabilities(capabilitiesResult.value)

      const errors = [systemResult, networkResult, capabilitiesResult]
        .filter(result => result.status === 'rejected')
        .map(result => result.reason.message)
      setError(errors.length > 0 ? errors.join(' • ') : null)
      setLoading(false)
    }

    async function refreshPeers() {
      const nextStates = await Promise.all(
        peers.map(async peer => {
          const snapshot = await readPeerSnapshot(peer, signal)
          return [peer, snapshot]
        })
      )

      if (signal.aborted) return

      setPeerStates(prev => {
        const merged = { ...prev }
        for (const [peer, snapshot] of nextStates) {
          merged[peer] = snapshot
        }
        return merged
      })
    }

    async function refreshAll() {
      await refreshLocal()
      if (peers.length > 0) {
        await refreshPeers()
      } else {
        setLoading(false)
      }
    }

    refreshAll().catch(err => {
      if (!signal.aborted) {
        setError(err.message)
        setLoading(false)
      }
    })

    refreshTimer.current = setInterval(() => {
      refreshAll().catch(err => {
        if (!signal.aborted) setError(err.message)
      })
    }, 15000)

    return () => {
      controller.abort()
      if (refreshTimer.current) clearInterval(refreshTimer.current)
    }
  }, [peers, liveRefreshNonce])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    refreshDiscovery(signal).catch(err => {
      if (!signal.aborted) {
        setDiscoveryError(err.message)
        setDiscoveryLoading(false)
      }
    })

    discoveryTimer.current = setInterval(() => {
      refreshDiscovery().catch(err => {
        setDiscoveryError(err.message)
      })
    }, 120000)

    return () => {
      controller.abort()
      if (discoveryTimer.current) clearInterval(discoveryTimer.current)
    }
  }, [refreshDiscovery])

  const localUrls = useMemo(() => {
    if (!network || !Array.isArray(network.interfaces)) return []
    return network.interfaces
      .filter(item => !item.internal && item.address)
      .map(item => item.url || `http://${formatLabel(item.address)}:${network.port || 3001}`)
  }, [network])

  const discoveryPeers = discovery?.peers || []
  const discoveryProviderSummary = Array.isArray(discovery?.providers) && discovery.providers.length > 0
    ? discovery.providers.map(provider => {
        const status = provider.available === false
          ? `unavailable${provider.reason ? ` (${provider.reason})` : ''}`
          : `${provider.peerCount}/${provider.candidateCount}`
        return `${provider.label}: ${status}`
      }).join(' · ')
    : 'No discovery providers reported yet'

  function savePeer(rawInput) {
    const normalized = normalizePeerBaseUrl(rawInput)
    if (!normalized) {
      setError('Enter a reachable hostname or LAN IP for the peer.')
      return ''
    }
    if (peers.includes(normalized)) {
      setMessage(`Peer ${normalized} is already tracked`)
      return ''
    }
    setPeers(prev => [...prev, normalized])
    setMessage(`Added peer ${normalized}`)
    return normalized
  }

  function addPeer() {
    const normalized = savePeer(peerInput)
    if (normalized) setPeerInput('')
  }

  function trackDiscoveryPeer(baseUrl) {
    const normalized = savePeer(baseUrl)
    if (normalized) {
      setMessage(`Tracked discovered peer ${normalized}`)
    }
  }

  function removePeer(baseUrl) {
    setPeers(prev => prev.filter(item => item !== baseUrl))
    setPeerStates(prev => {
      const next = { ...prev }
      delete next[baseUrl]
      return next
    })
    setMessage(`Removed peer ${baseUrl}`)
  }

  async function refreshPeer(baseUrl) {
    setPeerStates(prev => ({
      ...prev,
      [baseUrl]: {
        ...(prev[baseUrl] || {
          health: null,
          system: null,
          network: null,
          capabilities: null,
          devices: [],
          ports: []
        }),
        loading: true,
        error: null
      }
    }))
    const snapshot = await readPeerSnapshot(baseUrl)
    setPeerStates(prev => ({ ...prev, [baseUrl]: snapshot }))
  }

  async function copyPeerUrl(baseUrl) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setMessage(`Peer URL: ${baseUrl}`)
      return
    }
    try {
      await navigator.clipboard.writeText(baseUrl)
      setMessage(`Copied ${baseUrl}`)
    } catch {
      setMessage(`Peer URL: ${baseUrl}`)
    }
  }

  return (
    <div className="page">
      <h2>Computers <span className="refresh-dot">●</span></h2>
      <p className="page-note">
        This page lists computers on the LAN, their reachable URLs, and direct links to each node&apos;s own management UI.
        Use a real LAN IP or hostname here; <code>0.0.0.0</code> is only for binding the server.
      </p>

      {loading && <div className="card">Loading network inventory...</div>}
      {error && <div className="alert">{error}</div>}
      {message && <div className="alert info">{message}</div>}

      <div className="card">
        <h3>Local computer</h3>
        {system ? (
          <>
            <p><strong>Hostname:</strong> {system.hostname}</p>
            <p><strong>API bind host:</strong> {network ? network.bindHost : 'loading...'}</p>
            <p><strong>API port:</strong> {network ? network.port : 'loading...'}</p>
            <p><strong>Reachable URLs:</strong></p>
            {localUrls.length === 0 ? (
              <p>No external interfaces reported yet.</p>
            ) : (
              <ul className="url-list">
                {localUrls.map(url => <li key={url}><code>{url}</code></li>)}
              </ul>
            )}
          </>
        ) : (
          <p>Loading local host details...</p>
        )}

        {network && Array.isArray(network.interfaces) && network.interfaces.length > 0 && (
          <div className="network-grid">
            {network.interfaces.map(item => (
              <div className={`network-chip ${item.internal ? 'internal' : 'external'}`} key={`${item.name}-${item.address}`}>
                <strong>{item.name}</strong>
                <span>{item.address}</span>
                <small>{item.family}{item.internal ? ' · internal' : ''}</small>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="peer-card-header">
          <div>
            <h3>Discovered peers</h3>
            <p className="hint">
              The backend reports subnet-scan and mDNS/Bonjour providers. If a provider is unavailable, the reason appears in the summary below.
            </p>
          </div>
          <div className="peer-actions">
            <button onClick={() => refreshDiscovery()}>Refresh discovery</button>
          </div>
        </div>

        <p className="peer-summary">{discoveryProviderSummary}</p>
        {discoveryLoading && <p>Scanning local subnets for live nodes...</p>}
        {discoveryError && <div className="alert">{discoveryError}</div>}

        {!discoveryLoading && discoveryPeers.length === 0 && (
          <p>No discovered peers responded yet.</p>
        )}

        {discoveryPeers.length > 0 && (
          <div className="peer-grid">
            {discoveryPeers.map(peer => {
              const tracked = peers.includes(peer.baseUrl)
              return (
                <div className="peer-card" key={peer.baseUrl}>
                  <div className="peer-card-header">
                    <div>
                      <strong>{peer.hostname || peer.baseUrl}</strong>
                      <div className="peer-url"><code>{peer.baseUrl}</code></div>
                    </div>
                    <div className="peer-actions">
                      <button onClick={() => trackDiscoveryPeer(peer.baseUrl)} disabled={tracked}>
                        {tracked ? 'Tracked' : 'Track'}
                      </button>
                      <button onClick={() => copyPeerUrl(peer.baseUrl)}>Copy URL</button>
                      <button onClick={() => openPeerPage(peer.baseUrl, '/devices')}>Open Devices</button>
                    </div>
                  </div>

                  <div className="peer-meta">
                    <div><strong>Provider:</strong> {peer.source || 'subnet-scan'}</div>
                    <div><strong>API port:</strong> {peer.port || discovery.port || 'unknown'}</div>
                    <div><strong>Interfaces:</strong> {Array.isArray(peer.interfaces) ? peer.interfaces.length : 0}</div>
                    <div><strong>Subnet:</strong> {peer.subnet || 'unknown'}</div>
                  </div>

                  <p className="hint">
                    Discovered peers are live nodes. Tracking one saves it into the manual peer list so it stays available on reload.
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Peer computers</h3>
        <div className="peer-entry">
          <input
            type="text"
            placeholder="192.168.1.25, http://node.local:3001, or hostname"
            value={peerInput}
            onChange={e => setPeerInput(e.target.value)}
          />
          <button onClick={addPeer}>Add peer</button>
          <span className="hint">Each peer is queried directly, so the remote node must allow browser access to its API.</span>
        </div>

        {capabilities && (
          <p className="peer-summary">
            Local USB/IP roles: <strong>{capabilities.server ? 'server' : 'client'}</strong>
            {' · '}
            {capabilities.simultaneous ? 'simultaneous server/client' : 'single role'}
          </p>
        )}

        {peers.length === 0 ? (
          <p>No peers saved yet.</p>
        ) : (
          <div className="peer-grid">
            {peers.map(baseUrl => {
              const state = peerStates[baseUrl] || {
                loading: true,
                error: null,
                health: null,
                system: null,
                network: null,
                capabilities: null,
                devices: [],
                ports: []
              }
              const hostName = state.system?.hostname || baseUrl
              return (
                <div className="peer-card" key={baseUrl}>
                  <div className="peer-card-header">
                    <div>
                      <strong>{hostName}</strong>
                      <div className="peer-url"><code>{baseUrl}</code></div>
                    </div>
                    <div className="peer-actions">
                      <button onClick={() => refreshPeer(baseUrl)}>Refresh</button>
                      <button onClick={() => copyPeerUrl(baseUrl)}>Copy URL</button>
                      <button className="btn-danger" onClick={() => removePeer(baseUrl)}>Remove</button>
                    </div>
                  </div>

                  {state.loading && <p>Loading peer snapshot...</p>}
                  {state.error && <div className="alert">{state.error}</div>}

                  <div className="peer-meta">
                    <div><strong>Health:</strong> {state.health?.status || 'unknown'}</div>
                    <div><strong>Platform:</strong> {state.system?.platform || 'unknown'}</div>
                    <div><strong>Exports:</strong> {state.devices.length}</div>
                    <div><strong>Imports:</strong> {state.ports.length}</div>
                    <div><strong>USB/IP mode:</strong> {state.capabilities ? (state.capabilities.simultaneous ? 'bidirectional' : 'single role') : 'unknown'}</div>
                  </div>

                  {state.network?.interfaces?.length > 0 && (
                    <div className="network-grid compact">
                      {state.network.interfaces.map(item => (
                        <div className={`network-chip ${item.internal ? 'internal' : 'external'}`} key={`${baseUrl}-${item.name}-${item.address}`}>
                          <strong>{item.name}</strong>
                          <span>{item.address}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="peer-actions peer-links">
                    <button onClick={() => openPeerPage(baseUrl, '/devices')}>Open Devices</button>
                    <button onClick={() => openPeerPage(baseUrl, '/containers')}>Open Containers</button>
                    <button onClick={() => openPeerPage(baseUrl, '/backups')}>Open Backups</button>
                  </div>

                  <p className="hint">
                    Open the same frontend against the peer with the <code>?peer=</code> query param, or copy the URL if you want to open a separate tab.
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
