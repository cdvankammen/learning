const express = require('express');
const path = require('path');
const fs = require('fs');
const { execSync, exec, execFile, execFileSync } = require('child_process');
const rateLimit = require('express-rate-limit');
const os = require('os');
const { discoverPeers } = require('./lib/discovery');
const { listVirtualBridges, runVirtualBridgeAction } = require('./lib/virtual-bridges');
const { createRequestLogger, logRequestError } = require('./lib/request-logger');
const { createAuthMiddleware } = require('./lib/auth');
const { recordHttpRequest, renderPrometheusMetrics } = require('./lib/metrics');
const setupSocket = require('./socket-server');
const { createMutationQueue } = require('./lib/mutation-queue');
const { createPersistenceStore } = require('./lib/persistence');
const { normalizePeerBaseUrl } = require('./lib/peers');
const { OPENAPI_SPEC } = require('./lib/openapi');
const {
  parseConfiguredInteger,
  parsePositiveInteger,
  isValidHost,
  isValidBusid,
  isValidPort,
  normalizePort,
  isValidVmid,
  isValidBindHost
} = require('./lib/validation');
const { parseUsbipDevices, parseUsbipPorts } = require('./lib/usbip-parsers');
const pkg = require('./package.json');

const CONFIG_DIR = process.env.USBIP_CONFIG_DIR ||
  path.join(os.homedir(), '.config', 'usbip-web');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const persistence = createPersistenceStore({ configDir: CONFIG_DIR });

function loadSettingsFileRaw() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const contents = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return JSON.parse(contents);
    }
  } catch (err) {
    console.warn(`Failed to read settings from ${SETTINGS_FILE}: ${err.message}`);
  }
  return {};
}

const BOOT_SETTINGS = loadSettingsFileRaw();
const PORT = parseConfiguredInteger(process.env.PORT ?? BOOT_SETTINGS.port, 3001);
const LISTEN_HOST = process.env.USBIP_BIND_HOST || process.env.HOST || BOOT_SETTINGS.bindHost || '0.0.0.0';
const DEFAULT_USBIP_BIN = process.platform === 'win32' ? 'usbipd' : 'usbip';
const USBIP_BIN = process.env.USBIP_BIN || BOOT_SETTINGS.usbipBin || DEFAULT_USBIP_BIN;
const ALLOW_ALL_CORS = process.env.USBIP_CORS_ALLOW_ALL === '1' || BOOT_SETTINGS.corsAllowedOrigins === '*';
const ALLOWED_CORS_ORIGINS = new Set(
  String(process.env.USBIP_ALLOWED_ORIGINS || BOOT_SETTINGS.corsAllowedOrigins || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);
const API_RATE_LIMIT = parsePositiveInteger(process.env.USBIP_API_RATE_LIMIT ?? BOOT_SETTINGS.apiRateLimit, 1000);
const MUTATION_RATE_LIMIT = parsePositiveInteger(process.env.USBIP_MUTATION_RATE_LIMIT ?? BOOT_SETTINGS.mutationRateLimit, 60);
const LOG_REQUESTS = process.env.USBIP_LOG_REQUESTS
  ? process.env.USBIP_LOG_REQUESTS !== '0'
  : BOOT_SETTINGS.logRequests !== false;
const MDNS_SERVICE_TYPE = process.env.USBIP_MDNS_SERVICE_TYPE || BOOT_SETTINGS.mdnsServiceType || '_usbipcentral._tcp';

const app = express();
let realtime = null;
const usbipMutationQueue = createMutationQueue();

app.use(express.json());

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

app.use(createRequestLogger({ enabled: LOG_REQUESTS, onFinish: recordHttpRequest }));
app.use(createAuthMiddleware({
  adminToken: process.env.USBIP_AUTH_ADMIN_TOKEN,
  viewerToken: process.env.USBIP_AUTH_VIEWER_TOKEN,
  requireAuth: process.env.USBIP_AUTH_REQUIRED === '1'
}));

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
  const components = buildHealthComponents();
  res.json({ status: 'ok', version: pkg.version, uptime: process.uptime(), components });
});

// ── LXC endpoints ──────────────────────────────────────────
function safeExecFile(bin, args) {
  try {
    return execFileSync(bin, args, { timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function buildHealthComponents() {
  return {
    usbip: {
      available: runUsbipSync(['list', '-l']) !== null,
      binary: USBIP_BIN
    },
    proxmox: {
      available: safeExecFile('pct', ['list']) !== null,
      binary: 'pct'
    },
    backupDir: {
      available: fs.existsSync('/var/lib/vz/dump')
    },
    settingsDir: {
      available: fs.existsSync(CONFIG_DIR)
    },
    persistence: {
      available: true,
      file: persistence.filePath,
      peerCount: persistence.listPeers().length
    }
  };
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

function runUsbipAsync(args) {
  return new Promise((resolve, reject) => {
    runUsbip(args, (err, stdout, stderr) => {
      if (err) {
        const error = new Error(stderr || err.message);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function isDryRun(req) {
  return req.get('x-dry-run') === '1' || req.query.dry_run === '1';
}

function respondDryRun(res, payload) {
  res.json(Object.assign({ ok: true, dryRun: true }, payload));
}

function persistAuditEvent(event) {
  persistence.recordAuditEvent(event).catch(err => {
    console.warn(`Failed to persist audit event: ${err.message}`);
  });
}

function persistDeviceSnapshot(snapshot) {
  persistence.recordDeviceSnapshot(snapshot).catch(err => {
    console.warn(`Failed to persist device snapshot: ${err.message}`);
  });
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
  if (!raw) {
    persistDeviceSnapshot({
      kind: 'usbip-devices',
      source: 'local',
      error: 'usbip not available',
      deviceCount: 0,
      devices: []
    });
    return res.json({ devices: [], raw: '', error: 'usbip not available' });
  }
  const parsed = parseUsbipDevices(raw);
  persistDeviceSnapshot({
    kind: 'usbip-devices',
    source: 'local',
    deviceCount: parsed.devices.length,
    devices: parsed.devices,
    warning: parsed.warning
  });
  res.json({ devices: parsed.devices, raw, warning: parsed.warning });
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
  if (!raw) {
    persistDeviceSnapshot({
      kind: 'usbip-ports',
      source: 'local',
      error: 'usbip not available',
      portCount: 0,
      ports: []
    });
    return res.json({ ports: [], raw: '', error: 'usbip not available' });
  }
  const parsed = parseUsbipPorts(raw);
  persistDeviceSnapshot({
    kind: 'usbip-ports',
    source: 'local',
    portCount: parsed.ports.length,
    ports: parsed.ports,
    warning: parsed.warning
  });
  res.json({ ports: parsed.ports, raw, warning: parsed.warning });
});

app.get('/api/usbip/remote/:host/devices', (req, res) => {
  const host = req.params.host;
  if (!isValidHost(host)) return res.status(400).json({ error: 'invalid host' });
  const raw = runUsbipSync(['list', '-r', host]);
  if (!raw) {
    persistDeviceSnapshot({
      kind: 'usbip-remote-devices',
      source: host,
      error: 'usbip not available or host unreachable',
      deviceCount: 0,
      devices: []
    });
    return res.json({ host, devices: [], raw: '', error: 'usbip not available or host unreachable' });
  }
  const parsed = parseUsbipDevices(raw);
  persistDeviceSnapshot({
    kind: 'usbip-remote-devices',
    source: host,
    deviceCount: parsed.devices.length,
    devices: parsed.devices,
    warning: parsed.warning
  });
  res.json({ host, devices: parsed.devices, raw, warning: parsed.warning });
});

app.get('/api/peers', (_req, res) => {
  const snapshot = persistence.getSnapshot();
  res.json({
    peers: snapshot.peers,
    metadata: snapshot.metadata,
    filePath: persistence.filePath
  });
});

app.put('/api/peers', (req, res) => {
  const incomingPeers = Array.isArray(req.body?.peers) ? req.body.peers : [];
  const invalidPeers = [];
  const normalizedPeers = [];

  for (const peer of incomingPeers) {
    const normalized = normalizePeerBaseUrl(peer);
    if (!normalized) {
      invalidPeers.push(peer);
      continue;
    }

    if (!normalizedPeers.includes(normalized)) {
      normalizedPeers.push(normalized);
    }
  }

  persistence.replacePeers(normalizedPeers, {
    actor: 'api',
    source: req.get('user-agent') || 'unknown'
  }).then(snapshot => {
    res.json({
      ok: true,
      peers: snapshot.peers,
      metadata: snapshot.metadata,
      invalidPeers,
      filePath: persistence.filePath
    });
  }).catch(err => {
    res.status(500).json({ error: `Could not save peers: ${err.message}` });
  });
});

app.get('/api/persistence', (_req, res) => {
  const snapshot = persistence.getSnapshot();
  res.json(Object.assign({ filePath: persistence.filePath }, snapshot));
});

app.post('/api/usbip/bind', async (req, res) => {
  const { busid } = req.body;
  if (!isValidBusid(busid)) return res.status(400).json({ error: 'invalid busid' });
  if (isDryRun(req)) {
    persistAuditEvent({ type: 'usbip.bind', status: 'dry-run', busid, actor: 'api' });
    return respondDryRun(res, { busid, action: 'bind', command: `usbip bind -b ${busid}` });
  }
  try {
    const result = await usbipMutationQueue.run(() => runUsbipAsync(['bind', '-b', busid]));
    if (realtime) realtime.refreshUsbip();
    persistAuditEvent({ type: 'usbip.bind', status: 'success', busid, actor: 'api' });
    res.json({ ok: true, output: result.stdout });
  } catch (err) {
    persistAuditEvent({ type: 'usbip.bind', status: 'error', busid, actor: 'api', error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usbip/unbind', async (req, res) => {
  const { busid } = req.body;
  if (!isValidBusid(busid)) return res.status(400).json({ error: 'invalid busid' });
  if (isDryRun(req)) {
    persistAuditEvent({ type: 'usbip.unbind', status: 'dry-run', busid, actor: 'api' });
    return respondDryRun(res, { busid, action: 'unbind', command: `usbip unbind -b ${busid}` });
  }
  try {
    const result = await usbipMutationQueue.run(() => runUsbipAsync(['unbind', '-b', busid]));
    if (realtime) realtime.refreshUsbip();
    persistAuditEvent({ type: 'usbip.unbind', status: 'success', busid, actor: 'api' });
    res.json({ ok: true, output: result.stdout });
  } catch (err) {
    persistAuditEvent({ type: 'usbip.unbind', status: 'error', busid, actor: 'api', error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usbip/connect', async (req, res) => {
  const { host, busid } = req.body;
  if (!isValidHost(host)) return res.status(400).json({ error: 'invalid host' });
  if (!isValidBusid(busid)) return res.status(400).json({ error: 'invalid busid' });
  if (isDryRun(req)) {
    persistAuditEvent({ type: 'usbip.connect', status: 'dry-run', host, busid, actor: 'api' });
    return respondDryRun(res, {
      host,
      busid,
      action: 'connect',
      command: `usbip attach -r ${host} -b ${busid}`
    });
  }
  try {
    const result = await usbipMutationQueue.run(() => runUsbipAsync(['attach', '-r', host, '-b', busid]));
    if (realtime) realtime.refreshUsbip();
    persistAuditEvent({ type: 'usbip.connect', status: 'success', host, busid, actor: 'api' });
    res.json({ ok: true, host, busid, output: result.stdout });
  } catch (err) {
    persistAuditEvent({ type: 'usbip.connect', status: 'error', host, busid, actor: 'api', error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usbip/disconnect', async (req, res) => {
  const { port } = req.body;
  if (!isValidPort(port)) return res.status(400).json({ error: 'invalid port' });
  const normalizedPort = normalizePort(port);
  if (isDryRun(req)) {
    persistAuditEvent({ type: 'usbip.disconnect', status: 'dry-run', port: normalizedPort, actor: 'api' });
    return respondDryRun(res, {
      port: normalizedPort,
      action: 'disconnect',
      command: `usbip detach -p ${normalizedPort}`
    });
  }
  try {
    const result = await usbipMutationQueue.run(() => runUsbipAsync(['detach', '-p', normalizedPort]));
    if (realtime) realtime.refreshUsbip();
    persistAuditEvent({ type: 'usbip.disconnect', status: 'success', port: normalizedPort, actor: 'api' });
    res.json({ ok: true, port: normalizedPort, output: result.stdout });
  } catch (err) {
    persistAuditEvent({ type: 'usbip.disconnect', status: 'error', port: normalizedPort, actor: 'api', error: err.message });
    res.status(500).json({ error: err.message });
  }
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
    serviceType: MDNS_SERVICE_TYPE,
    timeoutMs,
    maxHostsPerInterface,
    concurrency
  })
    .then(report => {
      persistAuditEvent({
        type: 'discovery.refresh',
        status: 'success',
        peerCount: report.peerCount,
        providerCount: report.providerCount,
        actor: 'api'
      });
      res.json({
        bindHost: LISTEN_HOST,
        port: PORT,
        hostname: os.hostname(),
        interfaces,
        ...report
      });
    })
    .catch(err => {
      persistAuditEvent({ type: 'discovery.refresh', status: 'error', actor: 'api', error: err.message });
      next(err);
    });
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
      persistAuditEvent({
        type: 'virtual-bridge.action',
        status: dryRun ? 'dry-run' : 'success',
        bridgeId: req.params.id,
        action: req.params.action,
        actor: 'api'
      });
      res.json(result);
    })
    .catch(err => {
      persistAuditEvent({
        type: 'virtual-bridge.action',
        status: 'error',
        bridgeId: req.params.id,
        action: req.params.action,
        actor: 'api',
        error: err.message
      });
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
  if (!isValidVmid(id)) return res.status(400).json({ error: 'invalid vmid' });
  const dryRun = (req.get('x-dry-run') === '1') || (req.query.dry_run === '1');
  if (dryRun) {
    persistAuditEvent({ type: 'lxc.start', status: 'dry-run', vmid: id, actor: 'api' });
    return res.json({ ok: true, vmid: id, action: 'start', dryRun: true, message: 'Simulated start' });
  }
  exec(`pct start ${id}`, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      persistAuditEvent({ type: 'lxc.start', status: 'error', vmid: id, actor: 'api', error: stderr || err.message });
      return res.status(500).json({ error: stderr || err.message });
    }
    persistAuditEvent({ type: 'lxc.start', status: 'success', vmid: id, actor: 'api' });
    res.json({ ok: true, vmid: id, action: 'started', output: stdout });
  });
});

app.post('/api/lxc/:id/stop', (req, res) => {
  const id = req.params.id;
  if (!isValidVmid(id)) return res.status(400).json({ error: 'invalid vmid' });
  const dryRun = (req.get('x-dry-run') === '1') || (req.query.dry_run === '1');
  if (dryRun) {
    const recent = isBackupRecent(id, 4);
    persistAuditEvent({ type: 'lxc.stop', status: 'dry-run', vmid: id, actor: 'api', backupRecent: recent });
    return res.json({ ok: true, vmid: id, action: 'stop', dryRun: true, backupRecent: recent });
  }

  // ensure recent backup before destructive change
  if (!isBackupRecent(id, 4)) {
    triggerBackup(id, (err, result) => {
      if (err) {
        persistAuditEvent({ type: 'lxc.stop', status: 'error', vmid: id, actor: 'api', error: `backup failed before stop: ${err.message || String(err)}` });
        return res.status(500).json({ error: 'backup failed before stop', details: err.message || String(err) });
      }
      exec(`pct stop ${id}`, { timeout: 30000 }, (err2, stdout2, stderr2) => {
        if (err2) {
          persistAuditEvent({ type: 'lxc.stop', status: 'error', vmid: id, actor: 'api', error: stderr2 || err2.message });
          return res.status(500).json({ error: stderr2 || err2.message });
        }
        persistAuditEvent({ type: 'lxc.stop', status: 'success', vmid: id, actor: 'api', backupMode: result.mode });
        res.json({ ok: true, vmid: id, action: 'stopped', backup: result, output: stdout2 });
      });
    });
  } else {
    exec(`pct stop ${id}`, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        persistAuditEvent({ type: 'lxc.stop', status: 'error', vmid: id, actor: 'api', error: stderr || err.message });
        return res.status(500).json({ error: stderr || err.message });
      }
      persistAuditEvent({ type: 'lxc.stop', status: 'success', vmid: id, actor: 'api' });
      res.json({ ok: true, vmid: id, action: 'stopped', output: stdout });
    });
  }
});

// ── Backup trigger ─────────────────────────────────────────
app.post('/api/backups/trigger/:vmid', (req, res) => {
  const vmid = req.params.vmid;
  if (!isValidVmid(vmid)) return res.status(400).json({ error: 'invalid vmid' });
  const dryRun = (req.get('x-dry-run') === '1') || (req.query.dry_run === '1');
  if (dryRun) {
    persistAuditEvent({ type: 'backup.trigger', status: 'dry-run', vmid, actor: 'api' });
    return res.json({ ok: true, vmid, dryRun: true, message: 'Would trigger backup (dry-run)' });
  }
  triggerBackup(vmid, (err, result) => {
    if (err) {
      persistAuditEvent({ type: 'backup.trigger', status: 'error', vmid, actor: 'api', error: err.message || String(err) });
      return res.status(500).json({ error: 'backup failed', details: err.message || String(err) });
    }
    if (realtime) realtime.refreshBackups();
    persistAuditEvent({ type: 'backup.trigger', status: 'success', vmid, actor: 'api', backupMode: result.mode });
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

app.get('/api/metrics', (_req, res) => {
  const components = buildHealthComponents();
  const usbipDevices = runUsbipSync(['list', '-l']);
  const usbipPorts = runUsbipSync(['port']);
  const backupDir = '/var/lib/vz/dump';
  const backupCount = (() => {
    try {
      return fs.existsSync(backupDir)
        ? fs.readdirSync(backupDir).filter(f => f.startsWith('vzdump-lxc-') && /\.tar\./.test(f)).length
        : 0;
    } catch {
      return 0;
    }
  })();

  const deviceCount = usbipDevices ? parseUsbipDevices(usbipDevices).devices.length : 0;
  const portCount = usbipPorts ? parseUsbipPorts(usbipPorts).ports.length : 0;

  res.type('text/plain; version=0.0.4');
  res.send(renderPrometheusMetrics({
    version: pkg.version,
    bindHost: LISTEN_HOST,
    port: PORT,
    components,
    deviceCount,
    portCount,
    backupCount
  }));
});

app.get('/api/openapi.json', (_req, res) => {
  res.json(OPENAPI_SPEC);
});

// ── Settings ───────────────────────────────────────────────
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
  const raw = loadSettingsFileRaw();
  return Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([k, v]) => [k, raw[k] ?? v.default]));
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
    if (key === 'bindHost' && value && !isValidBindHost(value)) {
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
    persistAuditEvent({ type: 'settings.save', status: 'success', actor: 'api', keys: Object.keys(incoming) });
    res.json({ ok: true, saved: merged, configFile: SETTINGS_FILE });
  } catch (err) {
    persistAuditEvent({ type: 'settings.save', status: 'error', actor: 'api', error: err.message });
    res.status(500).json({ error: `Could not save settings: ${err.message}` });
  }
});

// ── SPA fallback (must be after API routes) ────────────────
if (fs.existsSync(frontendDist)) {
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

// ── Error handling middleware ───────────────────────────────
app.use((err, _req, res, _next) => {
  logRequestError(err, _req, res);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Graceful shutdown ──────────────────────────────────────
const server = app.listen(PORT, LISTEN_HOST, () => console.log(`usbip backend listening on ${LISTEN_HOST}:${PORT}`));
realtime = setupSocket(server);

function shutdown(sig) {
  console.log(`${sig} received, shutting down gracefully...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };
