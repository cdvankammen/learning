import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { io } from 'socket.io-client'
import ClientList from './components/ClientList'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import Backups from './pages/Backups'
import Containers from './pages/Containers'
import Settings from './pages/Settings'

export default function App() {
  const [clients, setClients] = useState([])
  const [socket, setSocket] = useState(null)

  useEffect(() => {
    const s = io()
    setSocket(s)
    s.on('clients', data => setClients(data))
    return () => s.disconnect()
  }, [])

  return (
    <BrowserRouter>
      <div className="app">
        <header>
          <h1>USBIP Control</h1>
          <nav>
            <NavLink to="/">Dashboard</NavLink>
            <NavLink to="/containers">Containers</NavLink>
            <NavLink to="/devices">Devices</NavLink>
            <NavLink to="/backups">Backups</NavLink>
            <NavLink to="/clients">Clients</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/containers" element={<Containers />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/backups" element={<Backups />} />
            <Route path="/clients" element={<ClientList clients={clients} socket={socket} />} />
            <Route path="/settings" element={<Settings socket={socket} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

