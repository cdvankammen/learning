const express = require('express');
const path = require('path');
const { execSync, exec } = require('child_process');
const rateLimit = require('express-rate-limit');
const pkg = require('./package.json');
const app = express();

app.use(express.json());

// Rate limiting — 100 requests per minute per IP
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

// Stricter limit on mutation endpoints
const mutationLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Too many requests' } });
app.use('/api/usbip/bind', mutationLimiter);
app.use('/api/usbip/unbind', mutationLimiter);

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

// ── LXC actions ────────────────────────────────────────────
function validateVmid(id) {
  return /^\d{1,5}$/.test(id);
}

app.post('/api/lxc/:id/start', (req, res) => {
  const id = req.params.id;
  if (!validateVmid(id)) return res.status(400).json({ error: 'invalid vmid' });
  exec(`pct start ${id}`, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true, vmid: id, action: 'started', output: stdout });
  });
});

app.post('/api/lxc/:id/stop', (req, res) => {
  const id = req.params.id;
  if (!validateVmid(id)) return res.status(400).json({ error: 'invalid vmid' });
  exec(`pct stop ${id}`, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true, vmid: id, action: 'stopped', output: stdout });
  });
});

// ── Backup trigger ─────────────────────────────────────────
app.post('/api/backups/trigger/:vmid', (req, res) => {
  const vmid = req.params.vmid;
  if (!validateVmid(vmid)) return res.status(400).json({ error: 'invalid vmid' });
  exec(`vzdump ${vmid} --dumpdir /var/lib/vz/dump --compress zstd --mode snapshot`, { timeout: 600000 }, (err, stdout, stderr) => {
    if (err) {
      // Fallback to stop mode
      exec(`vzdump ${vmid} --dumpdir /var/lib/vz/dump --compress zstd --mode stop`, { timeout: 600000 }, (err2, stdout2, stderr2) => {
        if (err2) return res.status(500).json({ error: stderr2 || err2.message });
        res.json({ ok: true, vmid, mode: 'stop', output: stdout2 });
      });
      return;
    }
    res.json({ ok: true, vmid, mode: 'snapshot', output: stdout });
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

