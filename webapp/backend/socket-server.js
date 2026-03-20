// Socket adapter for backend to manage real-time client control and LXC monitoring
const { Server } = require('socket.io')
const { execSync } = require('child_process')

module.exports = function setupSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: '*' } })
  const clients = new Map()

  // Periodic LXC status broadcast (every 10s)
  let lxcInterval = null
  function broadcastLxcStatus() {
    try {
      const raw = execSync('pct list 2>/dev/null', { timeout: 10000 }).toString().trim()
      const lines = raw.split('\n').slice(1)
      const containers = lines.map(l => {
        const parts = l.trim().split(/\s+/)
        return { vmid: parts[0], status: parts[1], name: parts[2] || '' }
      }).filter(c => c.vmid)
      io.emit('lxc-status', containers)
    } catch {
      // pct not available or errored; emit empty
      io.emit('lxc-status', [])
    }
  }

  io.on('connection', socket => {
    // Start broadcasting when first client connects
    if (!lxcInterval && io.engine.clientsCount > 0) {
      broadcastLxcStatus()
      lxcInterval = setInterval(broadcastLxcStatus, 10000)
    }

    socket.on('identify', data => {
      const id = data.id || socket.id
      clients.set(id, { id, name: data.name || id, status: 'connected', socketId: socket.id })
      io.emit('clients', Array.from(clients.values()))
    })

    socket.on('disconnect', () => {
      for (const [id, info] of clients) {
        if (info.socketId === socket.id) clients.delete(id)
      }
      io.emit('clients', Array.from(clients.values()))

      // Stop broadcasting when no clients
      if (io.engine.clientsCount === 0 && lxcInterval) {
        clearInterval(lxcInterval)
        lxcInterval = null
      }
    })

    socket.on('command', msg => {
      io.to(socket.id).emit('command_ack', { ok: true, cmd: msg.cmd })
    })

    // Allow clients to request immediate LXC refresh
    socket.on('refresh-lxc', () => {
      broadcastLxcStatus()
    })
  })

  return io
}

