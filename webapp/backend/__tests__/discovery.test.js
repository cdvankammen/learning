const {
  buildSubnetCandidates,
  parseMdnsBrowseLine,
  scanMdnsProvider,
  scanSubnetProvider,
  discoverPeers
} = require('../lib/discovery')

describe('discovery helpers', () => {
  test('buildSubnetCandidates scans the local /24 from an external IPv4 interface', () => {
    const candidates = buildSubnetCandidates([
      { name: 'eth0', address: '192.168.1.23', family: 'IPv4', internal: false, cidr: '192.168.1.23/16' }
    ], 3001, { maxHostsPerInterface: 3 })

    expect(candidates.map(candidate => candidate.baseUrl)).toEqual([
      'http://192.168.1.1:3001',
      'http://192.168.1.2:3001',
      'http://192.168.1.3:3001'
    ])
  })

  test('scanSubnetProvider probes candidates and returns responsive peers', async () => {
    const fetchImpl = jest.fn(async url => {
      if (url.includes('192.168.1.2')) {
        return {
          ok: true,
          json: async () => ({
            hostname: 'node-2',
            bindHost: '0.0.0.0',
            port: 3001,
            interfaces: []
          })
        }
      }

      return { ok: false, json: async () => ({}) }
    })

    const report = await scanSubnetProvider({
      interfaces: [
        { name: 'eth0', address: '192.168.1.23', family: 'IPv4', internal: false, cidr: '192.168.1.23/24' }
      ],
      port: 3001,
      maxHostsPerInterface: 3,
      timeoutMs: 100,
      concurrency: 2,
      fetchImpl
    })

    expect(report.id).toBe('subnet-scan')
    expect(report.candidateCount).toBe(3)
    expect(report.peerCount).toBe(1)
    expect(report.peers[0]).toMatchObject({
      baseUrl: 'http://192.168.1.2:3001',
      hostname: 'node-2'
    })
  })

  test('parseMdnsBrowseLine extracts an mDNS peer', () => {
    const peer = parseMdnsBrowseLine('=;eth0;IPv4;usbip-node;_usbipcentral._tcp;local;node-a.local;192.168.1.25;3001;path=/', 3001)

    expect(peer).toMatchObject({
      baseUrl: 'http://192.168.1.25:3001',
      hostname: 'node-a.local',
      serviceName: 'usbip-node',
      serviceType: '_usbipcentral._tcp'
    })
  })

  test('scanMdnsProvider parses browse output and dedupes peers', async () => {
    const report = await scanMdnsProvider({
      interfaces: [
        { name: 'eth0', address: '192.168.1.23', family: 'IPv4', internal: false, cidr: '192.168.1.23/24' }
      ],
      port: 3001,
      browseOutput: [
        '=;eth0;IPv4;usbip-node;_usbipcentral._tcp;local;node-a.local;192.168.1.25;3001;path=/',
        '=;eth0;IPv4;usbip-node;_usbipcentral._tcp;local;node-a.local;192.168.1.25;3001;path=/'
      ].join('\n')
    })

    expect(report.id).toBe('mdns')
    expect(report.peerCount).toBe(1)
    expect(report.peers[0]).toMatchObject({
      baseUrl: 'http://192.168.1.25:3001',
      hostname: 'node-a.local'
    })
  })

  test('discoverPeers merges provider results and dedupes peers by baseUrl', async () => {
    const report = await discoverPeers({
      providers: [
        async () => ({
          id: 'manual',
          label: 'Manual',
          candidateCount: 0,
          peerCount: 1,
          rejectedCount: 0,
          peers: [{ baseUrl: 'http://peer-a:3001', hostname: 'peer-a' }]
        }),
        async () => ({
          id: 'mdns',
          label: 'mDNS',
          candidateCount: 0,
          peerCount: 2,
          rejectedCount: 0,
          peers: [
            { baseUrl: 'http://peer-a:3001', hostname: 'dup' },
            { baseUrl: 'http://peer-b:3001', hostname: 'peer-b' }
          ]
        })
      ]
    })

    expect(report.providerCount).toBe(2)
    expect(report.peerCount).toBe(2)
    expect(report.peers.map(peer => peer.baseUrl)).toEqual([
      'http://peer-a:3001',
      'http://peer-b:3001'
    ])
  })
})
