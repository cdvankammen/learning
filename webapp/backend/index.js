const express = require('express');
const path = require('path');
const { execSync, exec, execFile, execFileSync } = require('child_process');
const rateLimit = require('express-rate-limit');
const pkg = require('./package.json');
const app = express();
const fs = require('fs');

app.use(express.json());

// Rate limiting — 100 requests per minute per IP
const API_RATE_LIMIT = Number(process.env.USBIP_API_RATE_LIMIT || 1000);
const MUTATION_RATE_LIMIT = Number(process.env.USBIP_MUTATION_RATE_LIMIT || 60);
const USBIP_BIN = process.env.USBIP_BIN || (process.platform === 'win32' ? 'usbipd' : 'usbip');
const limiter = rateLimit({ windowMs: 60 * 1000, max: API_RATE_LIMIT, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

// Stricter limit on mutation endpoints
const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: MUTATION_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' }
});
app.use('/api/usbip/bind', mutationLimiter);
app.use('/api/usbip/unbind', mutationLimiter);
app.use('/api/usbip/connect', mutationLimiter);
app.use('/api/usbip/disconnect', mutationLimiter);

// Request logging middleware
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`${ts} ${req.method} ${req.url}`);
  next();
});

// Serve built frontend if available
function resolveFrontendDist() {
  const candidates = [];
  if (process.env.USBIP_FRONTEND_DIR) candidates.push(process.env.USBIP_FRONTEND_DIR);
  if (process.pkg) candidates.push(path.join(path.dirname(process.execPath), 'frontend', 'dist'));
  candidates.push(path.join(__dirname, '..', 'frontend', 'dist'));
  candidates.push(path.join(process.cwd(), 'frontend', 'dist'));
  candidates.push(path.join(process.cwd(), 'webapp', 'frontend', 'dist'));
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const frontendDist = resolveFrontendDist();
if (frontendDist) {
  app.use(express.static(frontendDist));
}

// ── Health ─────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: pkg.version, uptime: process.uptime() });
});

// ── LXC endpoints ──────────────────────────────────────────
function safeExecFile(bin, args) {
  try {
    return execFileSync(bin, args, { timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function runUsbipSync(args) {
  try {
    return execFileSync(USBIP_BIN, args, { timeout: 15000 }).toString().trim();
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    if (err && err.stdout && err.stdout.toString().trim()) return err.stdout.toString().trim();
    return null;
  }
}

function runUsbip(args, cb) {
  execFile(USBIP_BIN, args, { timeout: 10000 }, cb);
}

function isDryRun(req) {
  return req.get('x-dry-run') === '1' || req.query.dry_run === '1';
}

function validateHost(host) {
  return typeof host === 'string' && /^[A-Za-z0-9._:%\-\[\]]{1,255}$/.test(host);
}

function validateBusid(busid) {
  return typeof busid === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(busid);
}

function validatePort(port) {
  return typeof port === 'string' && /^\d{1,5}$/.test(port);
}

function parseUsbipDevices(raw) {
  const devices = [];
  const seen = new Set();
  const lines = (raw || '').split(/\r?\n/);
  for (const line of lines) {
    let match = line.match(/^\s*-\s*busid\s+([A-Za-z0-9._:-]+)\s+\((.+)\)\s*$/i);
    if (!match) {
      match = line.match(/^\s*([A-Za-z0-9._:-]+):\s*(.+)\s+\((.+)\)\s*$/);
    }
    if (!match) continue;
    const busid = match[1];
    if (seen.has(busid)) continue;
    seen.add(busid);
    devices.push({ busid, description: (match[2] || '').trim() });
  }
  return devices;
}

function parseUsbipPorts(raw) {
  const ports = [];
  const lines = (raw || '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*Port\s+(\d+):\s*(.+)$/i);
    if (!match) continue;
    ports.push({ port: match[1], description: match[2].trim() });
  }
  return ports;
}

function respondDryRun(res, payload) {
  res.json(Object.assign({ ok: true, dryRun: true }, payload));
}

app.get('/api/lxc/list', (_req, res) => {
  const raw = safeExecFile('pct', ['list']);
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
  const raw = safeExecFile('pct', ['status', id]);
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
  const raw = runUsbipSync(['list', '-l']);
  if (!raw) return res.json({ devices: [], raw: '', error: 'usbip not available' });
  res.json({ devices: parseUsbipDevices(raw), raw });
});

app.get('/api/usbip/capabilities', (_req, res) => {
  res.json({
    server: true,
    client: true,
    simultaneous: true,
    unlimitedPeers: true,
    unlimitedDevices: true,
    peerLimit: null,
    deviceLimit: null,
    apiRateLimit: API_RATE_LIMIT,
    mutationRateLimit: MUTATION_RATE_LIMIT
  });
});

app.get('/api/usbip/ports', (_req, res) => {
  const raw = runUsbipSync(['port']);
  if (!raw) return res.json({ ports: [], raw: '', error: 'usbip not available' });
  res.json({ ports: parseUsbipPorts(raw), raw });
});

app.get('/api/usbip/remote/:host/devices', (req, res) => {
  const host = req.params.host;
  if (!validateHost(host)) return res.status(400).json({ error: 'invalid host' });
  const raw = runUsbipSync(['list', '-r', host]);
  if (!raw) return res.json({ host, devices: [], raw: '', error: 'usbip not available or host unreachable' });
  res.json({ host, devices: parseUsbipDevices(raw), raw });
});

app.post('/api/usbip/bind', (req, res) => {
  const { busid } = req.body;
  if (!validateBusid(busid)) return res.status(400).json({ error: 'invalid busid' });
  if (isDryRun(req)) return respondDryRun(res, { busid, action: 'bind', command: `usbip bind -b ${busid}` });
  runUsbip(['bind', '-b', busid], (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true, output: stdout });
  });
});

app.post('/api/usbip/unbind', (req, res) => {
  const { busid } = req.body;
  if (!validateBusid(busid)) return res.status(400).json({ error: 'invalid busid' });
  if (isDryRun(req)) return respondDryRun(res, { busid, action: 'unbind', command: `usbip unbind -b ${busid}` });
  runUsbip(['unbind', '-b', busid], (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true, output: stdout });
  });
});

app.post('/api/usbip/connect', (req, res) => {
  const { host, busid } = req.body;
  if (!validateHost(host)) return res.status(400).json({ error: 'invalid host' });
  if (!validateBusid(busid)) return res.status(400).json({ error: 'invalid busid' });
  if (isDryRun(req)) {
    return respondDryRun(res, {
      host,
      busid,
      action: 'connect',
      command: `usbip attach -r ${host} -b ${busid}`
    });
  }
  runUsbip(['attach', '-r', host, '-b', busid], (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true, host, busid, output: stdout });
  });
});

app.post('/api/usbip/disconnect', (req, res) => {
  const { port } = req.body;
  if (!validatePort(port)) return res.status(400).json({ error: 'invalid port' });
  if (isDryRun(req)) {
    return respondDryRun(res, {
      port,
      action: 'disconnect',
      command: `usbip detach -p ${port}`
    });
  }
  runUsbip(['detach', '-p', port], (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true, port, output: stdout });
  });
});

// ── LXC actions ────────────────────────────────────────────
function validateVmid(id) {
  return /^\d{1,5}$/.test(id);
}

const DUMP_DIR = '/var/lib/vz/dump';
function isBackupRecent(vmid, hours = 4) {
  try {
    if (!fs.existsSync(DUMP_DIR)) return false;
    const files = fs.readdirSync(DUMP_DIR).filter(f => f.includes(`-${vmid}-`) || f.includes(`${vmid}`));
    let latest = null;
    for (const f of files) {
      const st = fs.statSync(path.join(DUMP_DIR, f));
      if (!latest || st.mtime > latest) latest = st.mtime;
    }
    if (!latest) return false;
    const ageMs = Date.now() - new Date(latest).getTime();
    return ageMs <= hours * 3600 * 1000;
  } catch (e) {
    return false;
  }
}

function triggerBackup(vmid, cb) {
  const snapshotCmd = `vzdump ${vmid} --dumpdir ${DUMP_DIR} --compress zstd --mode snapshot`;
  exec(snapshotCmd, { timeout: 600000 }, (err, stdout, stderr) => {
    if (err) {
      const stopCmd = `vzdump ${vmid} --dumpdir ${DUMP_DIR} --compress zstd --mode stop`;
      exec(stopCmd, { timeout: 600000 }, (err2, stdout2, stderr2) => {
        if (err2) return cb(err2, null);
        return cb(null, { mode: 'stop', output: stdout2 });
      });
      return;
    }
    cb(null, { mode: 'snapshot', output: stdout });
  });
}

app.post('/api/lxc/:id/start', (req, res) => {
  const id = req.params.id;
  if (!validateVmid(id)) return res.status(400).json({ error: 'invalid vmid' });
  const dryRun = (req.get('x-dry-run') === '1') || (req.query.dry_run === '1');
  if (dryRun) return res.json({ ok: true, vmid: id, action: 'start', dryRun: true, message: 'Simulated start' });
  exec(`pct start ${id}`, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ ok: true, vmid: id, action: 'started', output: stdout });
  });
});

app.post('/api/lxc/:id/stop', (req, res) => {
  const id = req.params.id;
  if (!validateVmid(id)) return res.status(400).json({ error: 'invalid vmid' });
  const dryRun = (req.get('x-dry-run') === '1') || (req.query.dry_run === '1');
  if (dryRun) {
    const recent = isBackupRecent(id, 4);
    return res.json({ ok: true, vmid: id, action: 'stop', dryRun: true, backupRecent: recent });
  }

  // ensure recent backup before destructive change
  if (!isBackupRecent(id, 4)) {
    triggerBackup(id, (err, result) => {
      if (err) return res.status(500).json({ error: 'backup failed before stop', details: err.message || String(err) });
      exec(`pct stop ${id}`, { timeout: 30000 }, (err2, stdout2, stderr2) => {
        if (err2) return res.status(500).json({ error: stderr2 || err2.message });
        res.json({ ok: true, vmid: id, action: 'stopped', backup: result, output: stdout2 });
      });
    });
  } else {
    exec(`pct stop ${id}`, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: stderr || err.message });
      res.json({ ok: true, vmid: id, action: 'stopped', output: stdout });
    });
  }
});

// ── Backup trigger ─────────────────────────────────────────
app.post('/api/backups/trigger/:vmid', (req, res) => {
  const vmid = req.params.vmid;
  if (!validateVmid(vmid)) return res.status(400).json({ error: 'invalid vmid' });
  const dryRun = (req.get('x-dry-run') === '1') || (req.query.dry_run === '1');
  if (dryRun) return res.json({ ok: true, vmid, dryRun: true, message: 'Would trigger backup (dry-run)' });
  triggerBackup(vmid, (err, result) => {
    if (err) return res.status(500).json({ error: 'backup failed', details: err.message || String(err) });
    res.json(Object.assign({ ok: true, vmid }, result));
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
