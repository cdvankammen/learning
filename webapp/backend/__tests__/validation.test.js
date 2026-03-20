const {
  parseConfiguredInteger,
  parsePositiveInteger,
  isValidHost,
  isValidBusid,
  isValidPort,
  normalizePort,
  isValidVmid,
  isValidBindHost
} = require('../lib/validation')

describe('validation helpers', () => {
  test('parseConfiguredInteger preserves zero and falls back for invalid values', () => {
    expect(parseConfiguredInteger('0', 3001)).toBe(0)
    expect(parseConfiguredInteger('1234', 3001)).toBe(1234)
    expect(parseConfiguredInteger('nope', 3001)).toBe(3001)
  })

  test('parsePositiveInteger only accepts positive values', () => {
    expect(parsePositiveInteger('60', 30)).toBe(60)
    expect(parsePositiveInteger('0', 30)).toBe(30)
    expect(parsePositiveInteger('-1', 30)).toBe(30)
  })

  test('validates usbip host, busid, port, and vmid values', () => {
    expect(isValidHost('192.168.1.25')).toBe(true)
    expect(isValidHost('bad host!')).toBe(false)
    expect(isValidBusid('1-1')).toBe(true)
    expect(isValidBusid('../etc/passwd')).toBe(false)
    expect(isValidPort(3001)).toBe(true)
    expect(isValidPort('65535')).toBe(true)
    expect(isValidPort('65536')).toBe(false)
    expect(normalizePort(3001)).toBe('3001')
    expect(isValidVmid('502')).toBe(true)
    expect(isValidVmid('abc')).toBe(false)
  })

  test('validates bind host values used by settings', () => {
    expect(isValidBindHost('0.0.0.0')).toBe(true)
    expect(isValidBindHost('::1')).toBe(true)
    expect(isValidBindHost('localhost')).toBe(false)
  })
})
