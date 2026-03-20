const fs = require('fs')
const os = require('os')
const path = require('path')
const request = require('supertest')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `usbip-openapi-${process.pid}-`))
process.env.PORT = '0'
process.env.USBIP_CONFIG_DIR = tmpDir

let app, server

beforeAll(() => {
  jest.resetModules()
  const backend = require('../index.js')
  app = backend.app
  server = backend.server
})

afterAll((done) => {
  const cleanup = () => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    done()
  }

  if (server) server.close(cleanup)
  else cleanup()
})

describe('GET /api/openapi.json', () => {
  test('returns an OpenAPI document', async () => {
    const res = await request(app).get('/api/openapi.json')
    expect(res.status).toBe(200)
    expect(res.body.openapi).toBe('3.1.0')
    expect(res.body.paths).toHaveProperty('/api/health')
    expect(res.body.paths).toHaveProperty('/api/usbip/bind')
    expect(res.body.tags.map(tag => tag.name)).toEqual(expect.arrayContaining([
      'Proxmox Integration',
      'USB/IP',
      'Media Bridges'
    ]))
    expect(res.body.paths['/api/lxc/list'].get.tags).toContain('Proxmox Integration')
    expect(res.body.paths['/api/backups'].get.tags).toContain('Proxmox Integration')
    expect(res.body.paths['/api/peers'].get.tags).toContain('Discovery')
    expect(res.body.paths['/api/persistence'].get.tags).toContain('Meta')
    expect(res.body.paths['/api/virtual-bridges'].get.tags).toContain('Media Bridges')
  })
})
