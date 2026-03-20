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
