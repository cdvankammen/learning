const request = require('supertest')

// We need to import app without starting the server on port 3001
// The backend exports { app, server }. We'll use supertest against app directly.
let app, server

beforeAll(() => {
  // Override PORT to avoid conflict with running instance
  process.env.PORT = '0'
  const backend = require('../index.js')
  app = backend.app
  server = backend.server
})

afterAll((done) => {
  if (server) server.close(done)
  else done()
})

describe('GET /api/health', () => {
  test('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body).toHaveProperty('version')
    expect(res.body).toHaveProperty('uptime')
  })
})

describe('GET /api/system', () => {
  test('returns host info', async () => {
    const res = await request(app).get('/api/system')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('hostname')
    expect(res.body).toHaveProperty('cpus')
    expect(res.body.mem).toHaveProperty('total')
    expect(res.body.loadavg).toHaveLength(3)
  })
})

describe('GET /api/lxc/list', () => {
  test('returns containers array', async () => {
    const res = await request(app).get('/api/lxc/list')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.containers)).toBe(true)
  })
})

describe('GET /api/backups', () => {
  test('returns backups array', async () => {
    const res = await request(app).get('/api/backups')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.backups)).toBe(true)
  })
})

describe('GET /api/usbip/devices', () => {
  test('returns devices array', async () => {
    const res = await request(app).get('/api/usbip/devices')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.devices)).toBe(true)
  })
})

describe('GET /api/usbip/capabilities', () => {
  test('reports simultaneous server and client support', async () => {
    const res = await request(app).get('/api/usbip/capabilities')
    expect(res.status).toBe(200)
    expect(res.body.server).toBe(true)
    expect(res.body.client).toBe(true)
    expect(res.body.simultaneous).toBe(true)
    expect(res.body.unlimitedPeers).toBe(true)
    expect(res.body.unlimitedDevices).toBe(true)
  })
})

describe('GET /api/network/interfaces', () => {
  test('returns interface inventory', async () => {
    const res = await request(app).get('/api/network/interfaces')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('bindHost')
    expect(res.body).toHaveProperty('port')
    expect(res.body).toHaveProperty('hostname')
    expect(Array.isArray(res.body.interfaces)).toBe(true)
  })
})

describe('GET /api/discovery/peers', () => {
  test('returns a discovery report shape', async () => {
    const previousLimit = process.env.USBIP_DISCOVERY_MAX_HOSTS_PER_INTERFACE
    process.env.USBIP_DISCOVERY_MAX_HOSTS_PER_INTERFACE = '0'
    try {
      const res = await request(app).get('/api/discovery/peers')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('providerCount')
      expect(Array.isArray(res.body.providers)).toBe(true)
      expect(Array.isArray(res.body.peers)).toBe(true)
    } finally {
      if (previousLimit === undefined) delete process.env.USBIP_DISCOVERY_MAX_HOSTS_PER_INTERFACE
      else process.env.USBIP_DISCOVERY_MAX_HOSTS_PER_INTERFACE = previousLimit
    }
  })
})

describe('GET /api/virtual-bridges', () => {
  test('returns virtual bridge inventory', async () => {
    const res = await request(app).get('/api/virtual-bridges')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('platform')
    expect(Array.isArray(res.body.bridges)).toBe(true)
    expect(res.body.bridges.length).toBeGreaterThan(0)
  })
})

describe('GET /api/usbip/ports', () => {
  test('returns ports array', async () => {
    const res = await request(app).get('/api/usbip/ports')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.ports)).toBe(true)
  })
})

describe('GET /api/usbip/remote/:host/devices', () => {
  test('rejects invalid host', async () => {
    const res = await request(app).get('/api/usbip/remote/bad!host/devices')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid/)
  })
})

describe('POST /api/usbip/bind', () => {
  test('rejects invalid busid', async () => {
    const res = await request(app)
      .post('/api/usbip/bind')
      .send({ busid: '../etc/passwd' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid/)
  })

  test('rejects missing busid', async () => {
    const res = await request(app)
      .post('/api/usbip/bind')
      .send({})
    expect(res.status).toBe(400)
  })
})

describe('POST /api/usbip/unbind', () => {
  test('rejects missing busid', async () => {
    const res = await request(app)
      .post('/api/usbip/unbind')
      .send({})
    expect(res.status).toBe(400)
  })
})

describe('POST /api/usbip/connect', () => {
  test('dry-run connect returns simulated response', async () => {
    const res = await request(app)
      .post('/api/usbip/connect')
      .set('x-dry-run', '1')
      .send({ host: '192.168.1.10', busid: '1-1' })
    expect(res.status).toBe(200)
    expect(res.body.dryRun).toBe(true)
    expect(res.body.command).toMatch(/usbip attach/)
  })

  test('rejects invalid host', async () => {
    const res = await request(app)
      .post('/api/usbip/connect')
      .send({ host: '../bad', busid: '1-1' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/usbip/disconnect', () => {
  test('dry-run disconnect returns simulated response', async () => {
    const res = await request(app)
      .post('/api/usbip/disconnect')
      .set('x-dry-run', '1')
      .send({ port: '4' })
    expect(res.status).toBe(200)
    expect(res.body.dryRun).toBe(true)
    expect(res.body.command).toMatch(/usbip detach/)
  })

  test('rejects invalid port', async () => {
    const res = await request(app)
      .post('/api/usbip/disconnect')
      .send({ port: 'abc' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/lxc/:id/start', () => {
  test('rejects invalid vmid', async () => {
    const res = await request(app).post('/api/lxc/abc/start')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid/)
  })
})

describe('POST /api/lxc/:id/stop', () => {
  test('rejects invalid vmid', async () => {
    const res = await request(app).post('/api/lxc/abc/stop')
    expect(res.status).toBe(400)
  })
})

describe('POST /api/backups/trigger/:vmid', () => {
  test('rejects invalid vmid', async () => {
    const res = await request(app).post('/api/backups/trigger/abc')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid/)
  })
})

describe('GET /api/settings', () => {
  test('returns settings snapshot with schema and configFile', async () => {
    const res = await request(app).get('/api/settings')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('settings')
    expect(res.body).toHaveProperty('schema')
    expect(res.body).toHaveProperty('configFile')
    expect(typeof res.body.settings).toBe('object')
    expect(typeof res.body.schema).toBe('object')
    // schema must include at least bindHost and port
    expect(res.body.schema).toHaveProperty('bindHost')
    expect(res.body.schema).toHaveProperty('port')
  })
})

describe('POST /api/settings/validate', () => {
  test('accepts valid settings', async () => {
    const res = await request(app)
      .post('/api/settings/validate')
      .send({ port: 3001, bindHost: '0.0.0.0' })
    expect(res.status).toBe(200)
    expect(res.body.valid).toBe(true)
    expect(Object.keys(res.body.errors || {})).toHaveLength(0)
  })

  test('rejects invalid port', async () => {
    const res = await request(app)
      .post('/api/settings/validate')
      .send({ port: 99999 })
    expect(res.status).toBe(200)
    expect(res.body.valid).toBe(false)
    expect(res.body.errors).toHaveProperty('port')
  })

  test('rejects invalid bindHost', async () => {
    const res = await request(app)
      .post('/api/settings/validate')
      .send({ bindHost: 'not-an-ip' })
    expect(res.status).toBe(200)
    expect(res.body.valid).toBe(false)
    expect(res.body.errors).toHaveProperty('bindHost')
  })
})

describe('POST /api/settings', () => {
  const os = require('os')
  const path = require('path')
  const fs = require('fs')

  test('saves valid settings and returns ok', async () => {
    // Use a temp config dir so we do not pollute the host
    const tmpDir = path.join(os.tmpdir(), `usbip-test-settings-${process.pid}`)
    process.env.USBIP_CONFIG_DIR = tmpDir
    try {
      const res = await request(app)
        .post('/api/settings')
        .send({ port: 3002, bindHost: '0.0.0.0', logRequests: true })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.saved).toHaveProperty('port', 3002)
    } finally {
      delete process.env.USBIP_CONFIG_DIR
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('rejects and returns 400 on invalid settings', async () => {
    const res = await request(app)
      .post('/api/settings')
      .send({ port: 99999 })
    expect(res.status).toBe(400)
    expect(res.body.valid).toBe(false)
    expect(res.body.errors).toHaveProperty('port')
  })
})
