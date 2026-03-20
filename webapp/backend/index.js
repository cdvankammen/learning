const express = require('express');
const path = require('path');
const { execSync, exec, execFile, execFileSync } = require('child_process');
const rateLimit = require('express-rate-limit');
const os = require('os');
const { discoverPeers } = require('./lib/discovery');
const { listVirtualBridges, runVirtualBridgeAction } = require('./lib/virtual-bridges');
const pkg = require('./package.json');
const app = express();
const fs = require('fs');

app.use(express.json());

const PORT = Number(process.env.PORT || 3001);
const LISTEN_HOST = process.env.USBIP_BIND_HOST || process.env.HOST || '0.0.0.0';
const ALLOW_ALL_CORS = process.env.USBIP_CORS_ALLOW_ALL === '1';
const ALLOWED_CORS_ORIGINS = new Set(
  (process.env.USBIP_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);

function resolveCorsOrigin(origin) {
  if (!origin) return null;
  if (ALLOW_ALL_CORS || ALLOWED_CORS_ORIGINS.has('*')) return '*';
  if (ALLOWED_CORS_ORIGINS.has(origin)) return origin;
  return null;
}

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();

  const origin = req.get('origin');
  const allowOrigin = resolveCorsOrigin(origin);

  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dry-Run');
  }

  if (req.method === 'OPTIONS') {
    if (allowOrigin) return res.sendStatus(204);
    return res.status(403).json({ error: 'CORS origin not allowed' });
  }

  next();
});

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

function formatNetworkUrl(address) {
  const value = String(address);
  return value.includes(':') ? `http://[${value}]:${PORT}` : `http://${value}:${PORT}`;
}

function getNetworkInterfaces() {
  const entries = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const addr of addresses || []) {
      entries.push({
        name,
        address: addr.address,
        family: addr.family,
        internal: addr.internal,
        mac: addr.mac || null,
        cidr: addr.cidr || null,
        netmask: addr.netmask || null,
        url: formatNetworkUrl(addr.address)
      });
    }
  }
  entries.sort((a, b) => {
    if (a.internal !== b.internal) return a.internal ? 1 : -1;
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.address.localeCompare(b.address);
  });
  return entries;
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

app.get('/api/network/interfaces', (_req, res) => {
  res.json({
    bindHost: LISTEN_HOST,
    port: PORT,
    hostname: os.hostname(),
    interfaces: getNetworkInterfaces()
  });
});

app.get('/api/discovery/peers', (req, res, next) => {
  const interfaces = getNetworkInterfaces();
  const timeoutMs = Number(req.query.timeout_ms || process.env.USBIP_DISCOVERY_TIMEOUT_MS || 500);
  const maxHostsPerInterface = Number(req.query.max_hosts_per_interface || process.env.USBIP_DISCOVERY_MAX_HOSTS_PER_INTERFACE || 254);
  const concurrency = Number(req.query.concurrency || process.env.USBIP_DISCOVERY_CONCURRENCY || 16);

  discoverPeers({
    interfaces,
    port: PORT,
    timeoutMs,
    maxHostsPerInterface,
    concurrency
  })
    .then(report => {
      res.json({
        bindHost: LISTEN_HOST,
        port: PORT,
        hostname: os.hostname(),
        interfaces,
        ...report
      });
    })
    .catch(next);
});

app.get('/api/virtual-bridges', (_req, res) => {
  res.json({
    platform: process.platform,
    bridges: listVirtualBridges()
  });
});

app.get('/api/virtual-bridges/:id', (req, res) => {
  const bridge = listVirtualBridges().find(item => item.id === req.params.id);
  if (!bridge) {
    return res.status(404).json({ error: `Unknown virtual bridge '${req.params.id}'` });
  }
  res.json({ bridge });
});

app.post('/api/virtual-bridges/:id/:action', mutationLimiter, (req, res) => {
  const timeoutMs = Number(req.body?.timeoutMs || req.query.timeout_ms || process.env.USBIP_VIRTUAL_BRIDGE_TIMEOUT_MS || 300000);
  const dryRun = isDryRun(req);

  runVirtualBridgeAction(req.params.id, req.params.action, { timeoutMs, dryRun })
    .then(result => {
      res.json(result);
    })
    .catch(err => {
      const statusCode = Number(err.statusCode) || 500;
      res.status(statusCode).json({
        error: err.message,
        command: err.command || null,
        stdout: err.stdout || '',
        stderr: err.stderr || ''
      });
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
  res.json({
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    mem: { total: os.totalmem(), free: os.freemem() },
    cpus: os.cpus().length
  });
});

// ── Settings ───────────────────────────────────────────────
// Config file lives at $USBIP_CONFIG_DIR/settings.json (defaults to ~/.config/usbip-web/settings.json)
const CONFIG_DIR = process.env.USBIP_CONFIG_DIR ||
  path.join(os.homedir(), '.config', 'usbip-web');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');

const SETTINGS_SCHEMA = {
  bindHost: { type: 'string', default: '0.0.0.0', description: 'Address the backend API binds to. Use 0.0.0.0 to listen on all interfaces.' },
  port: { type: 'number', default: 3001, description: 'TCP port for the backend API.' },
  corsAllowedOrigins: { type: 'string', default: '', description: 'Comma-separated list of allowed CORS origins. Leave blank to disable CORS.' },
  usbipBin: { type: 'string', default: 'usbip', description: 'Path or command name for the usbip binary.' },
  apiRateLimit: { type: 'number', default: 1000, description: 'Max API requests per minute per IP.' },
  mutationRateLimit: { type: 'number', default: 60, description: 'Max mutation (bind/unbind/connect/disconnect) requests per minute per IP.' },
  mdnsServiceType: { type: 'string', default: '_usbipcentral._tcp', description: 'mDNS service type used for peer discovery announcements.' },
  logRequests: { type: 'boolean', default: true, description: 'Log every incoming API request to stdout.' }
};

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch (_) { /* fall through to defaults */ }
  return Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([k, v]) => [k, v.default]));
}

function validateSettings(incoming) {
  const errors = {};
  for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
    const value = incoming[key];
    if (value === undefined || value === null || value === '') continue;
    if (schema.type === 'number' && (isNaN(Number(value)) || Number(value) <= 0)) {
      errors[key] = `Must be a positive number`;
    }
    if (schema.type === 'boolean' && typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
      errors[key] = `Must be true or false`;
    }
    if (key === 'bindHost' && value && !/^[\d.]+$|^::$|^::1$|^0\.0\.0\.0$/.test(value)) {
      errors[key] = `Must be a valid IP address or 0.0.0.0`;
    }
    if (key === 'port') {
      const p = Number(value);
      if (isNaN(p) || p < 1 || p > 65535) errors[key] = `Must be between 1 and 65535`;
    }
  }
  return errors;
}

// GET /api/settings – return current settings snapshot with schema
app.get('/api/settings', (_req, res) => {
  const current = readSettings();
  res.json({
    settings: current,
    schema: SETTINGS_SCHEMA,
    configFile: SETTINGS_FILE
  });
});

// POST /api/settings/validate – validate without saving
app.post('/api/settings/validate', (req, res) => {
  const errors = validateSettings(req.body || {});
  const valid = Object.keys(errors).length === 0;
  res.json({ valid, errors });
});

// POST /api/settings – save settings
app.post('/api/settings', (req, res) => {
  const incoming = req.body || {};
  const errors = validateSettings(incoming);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ valid: false, errors });
  }
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const merged = Object.assign(readSettings(), incoming);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
    res.json({ ok: true, saved: merged, configFile: SETTINGS_FILE });
  } catch (err) {
    res.status(500).json({ error: `Could not save settings: ${err.message}` });
  }
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
const server = app.listen(PORT, LISTEN_HOST, () => console.log(`usbip backend listening on ${LISTEN_HOST}:${PORT}`));

function shutdown(sig) {
  console.log(`${sig} received, shutting down gracefully...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };
