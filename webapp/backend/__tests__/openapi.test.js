const request = require('supertest')

let app, server

beforeAll(() => {
  process.env.PORT = '0'
  const backend = require('../index.js')
  app = backend.app
  server = backend.server
})

afterAll((done) => {
  if (server) server.close(done)
  else done()
})

describe('GET /api/openapi.json', () => {
  test('returns an OpenAPI document', async () => {
    const res = await request(app).get('/api/openapi.json')
    expect(res.status).toBe(200)
    expect(res.body.openapi).toBe('3.1.0')
    expect(res.body.paths).toHaveProperty('/api/health')
    expect(res.body.paths).toHaveProperty('/api/usbip/bind')
  })
})
