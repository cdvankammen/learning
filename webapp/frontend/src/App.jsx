import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { io } from 'socket.io-client'
import ClientList from './components/ClientList'
import Dashboard from './pages/Dashboard'
import Computers from './pages/Computers'
import Devices from './pages/Devices'
import VirtualDevices from './pages/VirtualDevices'
import Backups from './pages/Backups'
import Containers from './pages/Containers'
import Settings from './pages/Settings'
import { getPeerBaseUrlFromLocation } from './lib/peer'

export default function App() {
  const [clients, setClients] = useState([])
  const [lxcContainers, setLxcContainers] = useState([])
  const [hasLxcSnapshot, setHasLxcSnapshot] = useState(false)
  const [socket, setSocket] = useState(null)
  const [socketStatus, setSocketStatus] = useState('connecting')
  const currentSearch = useMemo(() => (typeof window !== 'undefined' ? window.location.search : ''), [])
  const peerBaseUrl = useMemo(() => getPeerBaseUrlFromLocation(), [currentSearch])

  const routeTo = path => ({ pathname: path, search: currentSearch })

  useEffect(() => {
    const s = io()
    setSocket(s)
    const handleConnect = () => setSocketStatus('connected')
    const handleDisconnect = () => {
      setSocketStatus('disconnected')
      setClients([])
      setHasLxcSnapshot(false)
    }
    const handleConnectError = () => setSocketStatus('error')
    const handleClients = data => setClients(Array.isArray(data) ? data : [])
    const handleLxcStatus = data => {
      setLxcContainers(Array.isArray(data) ? data : [])
      setHasLxcSnapshot(true)
    }

    s.on('connect', handleConnect)
    s.on('disconnect', handleDisconnect)
    s.on('connect_error', handleConnectError)
    s.on('clients', handleClients)
    s.on('lxc-status', handleLxcStatus)
    if (s.connected) {
      setSocketStatus('connected')
    }

    return () => {
      s.off('connect', handleConnect)
      s.off('disconnect', handleDisconnect)
      s.off('connect_error', handleConnectError)
      s.off('clients', handleClients)
      s.off('lxc-status', handleLxcStatus)
      s.disconnect()
    }
  }, [])

  return (
    <BrowserRouter>
      <div className="app">
        <header>
          <h1>USBIP Control</h1>
          <p className="socket-status">Live socket: <strong>{socketStatus}</strong></p>
          {peerBaseUrl && <p className="socket-status">Peer mode: <strong>{peerBaseUrl}</strong></p>}
          <nav>
            <NavLink to={routeTo('/')}>Dashboard</NavLink>
            <NavLink to={routeTo('/computers')}>Computers</NavLink>
            <NavLink to={routeTo('/containers')}>Containers</NavLink>
            <NavLink to={routeTo('/devices')}>Devices</NavLink>
            <NavLink to={routeTo('/virtual-devices')}>Virtual Devices</NavLink>
            <NavLink to={routeTo('/backups')}>Backups</NavLink>
            <NavLink to={routeTo('/clients')}>Clients</NavLink>
            <NavLink to={routeTo('/settings')}>Settings</NavLink>
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/computers" element={<Computers />} />
            <Route path="/containers" element={<Containers socket={socket} socketStatus={socketStatus} socketContainers={lxcContainers} hasSocketSnapshot={hasLxcSnapshot} />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/virtual-devices" element={<VirtualDevices />} />
            <Route path="/backups" element={<Backups />} />
            <Route path="/clients" element={<ClientList clients={clients} socket={socket} socketStatus={socketStatus} />} />
            <Route path="/settings" element={<Settings socketStatus={socketStatus} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
