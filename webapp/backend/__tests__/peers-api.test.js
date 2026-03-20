const fs = require('fs')
const os = require('os')
const path = require('path')
const request = require('supertest')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `usbip-peers-api-${process.pid}-`))
process.env.PORT = '0'
process.env.USBIP_CONFIG_DIR = tmpDir

let app, server

beforeAll(() => {
  jest.resetModules()
  const backend = require('../index.js')
  app = backend.app
  server = backend.server
})

afterAll(done => {
  if (server) {
    server.close(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      done()
    })
  } else {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    done()
  }
})

describe('peer persistence api', () => {
  test('starts with an empty persisted peer list', async () => {
    const res = await request(app).get('/api/peers')
    expect(res.status).toBe(200)
    expect(res.body.peers).toEqual([])
    expect(res.body.filePath).toContain('persistence.json')
  })

  test('persists a normalized peer list and audit snapshot', async () => {
    const res = await request(app)
      .put('/api/peers')
      .send({ peers: ['192.168.1.25', 'http://peer-a:3001', 'peer-a'] })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.peers).toEqual([
      'http://192.168.1.25:3001',
      'http://peer-a:3001'
    ])

    const snapshot = await request(app).get('/api/persistence')
    expect(snapshot.status).toBe(200)
    expect(snapshot.body.peers).toEqual([
      'http://192.168.1.25:3001',
      'http://peer-a:3001'
    ])
    expect(Array.isArray(snapshot.body.auditEvents)).toBe(true)
    expect(snapshot.body.auditEvents.some(event => event.type === 'peers.replaced')).toBe(true)
    expect(Array.isArray(snapshot.body.deviceHistory)).toBe(true)
  })
})
