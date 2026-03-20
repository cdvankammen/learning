const fs = require('fs')
const os = require('os')
const path = require('path')
const { createPersistenceStore } = require('../lib/persistence')

describe('createPersistenceStore', () => {
  test('persists normalized peers, audit events, and device snapshots', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `usbip-persistence-${process.pid}-`))

    try {
      const store = createPersistenceStore({ configDir: tmpDir, maxAuditEvents: 10, maxDeviceHistory: 10 })

      expect(store.getSnapshot().peers).toEqual([])

      const snapshot = await store.replacePeers(['192.168.1.25', 'http://peer-a:3001', 'peer-a'], {
        actor: 'test-suite'
      })

      expect(snapshot.peers).toEqual([
        'http://192.168.1.25:3001',
        'http://peer-a:3001'
      ])

      const persisted = JSON.parse(fs.readFileSync(path.join(tmpDir, 'persistence.json'), 'utf8'))
      expect(persisted.peers).toEqual([
        'http://192.168.1.25:3001',
        'http://peer-a:3001'
      ])
      expect(persisted.auditEvents.some(event => event.type === 'peers.replaced')).toBe(true)

      await store.recordDeviceSnapshot({
        kind: 'usbip-devices',
        source: 'local',
        deviceCount: 1,
        devices: [{ busid: '1-1', description: 'Test device' }]
      })

      const afterDeviceSnapshot = store.getSnapshot()
      expect(afterDeviceSnapshot.deviceHistory).toHaveLength(1)
      expect(afterDeviceSnapshot.deviceHistory[0].kind).toBe('usbip-devices')
      expect(afterDeviceSnapshot.metadata.lastDeviceSnapshotAt).toBeTruthy()
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
