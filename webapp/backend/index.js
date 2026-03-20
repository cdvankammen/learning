const express = require('express');
const path = require('path');
const { execSync, exec } = require('child_process');
const pkg = require('./package.json');
const app = express();

app.use(express.json());

// Request logging middleware
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`${ts} ${req.method} ${req.url}`);
  next();
});

// Serve built frontend if available
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// ── Health ─────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: pkg.version, uptime: process.uptime() });
});

// ── LXC endpoints ──────────────────────────────────────────
function safeExec(cmd) {
  try { return execSync(cmd, { timeout: 15000 }).toString().trim(); }
  catch { return null; }
}

app.get('/api/lxc/list', (_req, res) => {
  const raw = safeExec('pct list 2>/dev/null');
  if (!raw) return res.json({ containers: [], error: 'pct not available' });
  const lines = raw.split('\n').slice(1);
  const containers = lines.map(l => {
    const parts = l.trim().split(/\s+/);
    return { vmid: parts[0], status: parts[1], name: parts[2] || '' };
  }).filter(c => c.vmid);
  res.json({ containers });
});

app.get('/api/lxc/:id/status', (req, res) => {
  const id = req.params.id.replace(/[^0-9]/g, '');
  const raw = safeExec(`pct status ${id} 2>/dev/null`);
  if (!raw) return res.json({ vmid: id, error: 'not found or pct unavailable' });
  res.json({ vmid: id, raw });
});

// ── Backup endpoints ───────────────────────────────────────
app.get('/api/backups', (_req, res) => {
  const dumpDir = '/var/lib/vz/dump';
  try {
    const files = fs.readdirSync(dumpDir)
      .filter(f => f.startsWith('vzdump-lxc-') && /\.tar\./.test(f))
      .map(f => {
        const st = fs.statSync(path.join(dumpDir, f));
        const match = f.match(/vzdump-lxc-(\d+)-/);
        return { file: f, vmid: match ? match[1] : '?', size: st.size, mtime: st.mtime };
      })
      .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    res.json({ backups: files });
  } catch {
    res.json({ backups: [], error: 'dump dir not accessible' });
  }
});

// ── USB/IP endpoints ───────────────────────────────────────
app.get('/api/usbip/devices', (_req, res) => {
  const raw = safeExec('usbip list -l 2>/dev/null');
  if (!raw) return res.json({ devices: [], error: 'usbip not available' });
  const devices = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const m = line.match(/busid\s+(\S+)\s+\((.+)\)/);
    if (m) devices.push({ busid: m[1], description: m[2] });
  }
  res.json({ devices });
});

app.post('/api/usbip/bind', (req, res) => {
  const { busid } = req.body;
  if (!busid || !/^[0-9a-f:.-]+$/i.test(busid)) return res.status(400).json({ error: 'invalid busid' });
  exec(`usbip bind -b ${busid}`, { timeout: 10000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true, output: stdout });
  });
});

app.post('/api/usbip/unbind', (req, res) => {
  const { busid } = req.body;
  if (!busid || !/^[0-9a-f:.-]+$/i.test(busid)) return res.status(400).json({ error: 'invalid busid' });
  exec(`usbip unbind -b ${busid}`, { timeout: 10000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true, output: stdout });
  });
});

// ── System info endpoint ───────────────────────────────────
app.get('/api/system', (_req, res) => {
  const os = require('os');
  res.json({
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    mem: { total: os.totalmem(), free: os.freemem() },
    cpus: os.cpus().length
  });
});

// ── SPA fallback (must be after API routes) ────────────────
if (fs.existsSync(frontendDist)) {
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

// ── Error handling middleware ───────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(`[ERROR] ${err.stack || err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Graceful shutdown ──────────────────────────────────────
const port = process.env.PORT || 3001;
const server = app.listen(port, () => console.log(`usbip backend listening on ${port}`));

function shutdown(sig) {
  console.log(`${sig} received, shutting down gracefully...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };

