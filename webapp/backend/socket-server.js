// WebSocket adapter for backend real-time updates.
const { execSync } = require('child_process');
const { WebSocketServer } = require('ws');

function send(socket, event, data) {
  if (socket.readyState !== 1) return;
  socket.send(JSON.stringify({ event, data }));
}

module.exports = function setupSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Map();

  let lxcInterval = null;
  let stateInterval = null;

  function broadcast(event, data) {
    for (const client of wss.clients) {
      send(client, event, data);
    }
  }

  function broadcastClients() {
    broadcast('clients', Array.from(clients.values()));
  }

  function broadcastLxcStatus() {
    try {
      const raw = execSync('pct list 2>/dev/null', { timeout: 10000 }).toString().trim();
      const lines = raw.split('\n').slice(1);
      const containers = lines
        .map(line => {
          const parts = line.trim().split(/\s+/);
          return { vmid: parts[0], status: parts[1], name: parts[2] || '' };
        })
        .filter(container => container.vmid);
      broadcast('lxc-status', containers);
    } catch {
      broadcast('lxc-status', []);
    }
  }

  function broadcastRefreshTicks() {
    broadcast('usbip-changed');
    broadcast('backups-changed');
    broadcast('discovery-peers');
  }

  function startIntervals() {
    if (!lxcInterval) {
      broadcastLxcStatus();
      lxcInterval = setInterval(broadcastLxcStatus, 10000);
    }
    if (!stateInterval) {
      broadcastRefreshTicks();
      stateInterval = setInterval(broadcastRefreshTicks, 15000);
    }
  }

  function stopIntervals() {
    if (lxcInterval) {
      clearInterval(lxcInterval);
      lxcInterval = null;
    }
    if (stateInterval) {
      clearInterval(stateInterval);
      stateInterval = null;
    }
  }

  wss.on('connection', socket => {
    let clientId = null;

    if (wss.clients.size > 0) startIntervals();
    broadcastClients();

    socket.on('message', raw => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const event = message && message.event;
      const data = message && message.data ? message.data : {};

      switch (event) {
        case 'identify': {
          const id = data.id || clientId;
          clientId = id;
          clients.set(id, {
            id,
            name: data.name || 'Web UI',
            status: 'connected'
          });
          broadcastClients();
          break;
        }
        case 'command':
          send(socket, 'command_ack', { ok: true, cmd: data.cmd });
          break;
        case 'refresh-lxc':
          broadcastLxcStatus();
          break;
        case 'refresh-usbip':
          broadcast('usbip-changed');
          break;
        case 'refresh-backups':
          broadcast('backups-changed');
          break;
        case 'refresh-discovery':
          broadcast('discovery-peers');
          break;
        default:
          break;
      }
    });

    socket.on('close', () => {
      if (clientId) clients.delete(clientId);
      if (wss.clients.size === 0) stopIntervals();
      broadcastClients();
    });
  });

  return {
    emit: broadcast,
    refreshLxc: broadcastLxcStatus,
    refreshUsbip: () => broadcast('usbip-changed'),
    refreshBackups: () => broadcast('backups-changed'),
    refreshDiscovery: () => broadcast('discovery-peers'),
    close: () => {
      stopIntervals();
      wss.close();
    }
  };
};
