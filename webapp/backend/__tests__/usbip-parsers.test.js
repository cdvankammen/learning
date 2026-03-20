const { parseUsbipDevices, parseUsbipPorts } = require('../lib/usbip-parsers')

describe('usbip parsers', () => {
  test('parses the common device list formats and dedupes busids', () => {
    const parsed = parseUsbipDevices([
      ' - busid 1-1 (Logitech USB Camera)',
      '1-2: USB Keyboard (046d:c31c)',
      '1-2: USB Keyboard duplicate (046d:c31c)'
    ].join('\n'))

    expect(parsed.devices).toEqual([
      { busid: '1-1', description: 'Logitech USB Camera' },
      { busid: '1-2', description: 'USB Keyboard' }
    ])
    expect(parsed.warning).toBeNull()
  })

  test('warns when list output does not match the expected device format', () => {
    const parsed = parseUsbipDevices('usbip: unexpected output line')
    expect(parsed.devices).toEqual([])
    expect(parsed.warning).toMatch(/did not match/)
  })

  test('parses port output and warns on malformed text', () => {
    const parsed = parseUsbipPorts([
      'Port 4: 1-1 -> Imported USB device',
      'Port 5: 2-2 -> Another device'
    ].join('\n'))

    expect(parsed.ports).toEqual([
      { port: '4', description: '1-1 -> Imported USB device' },
      { port: '5', description: '2-2 -> Another device' }
    ])
    expect(parsed.warning).toBeNull()

    const malformed = parseUsbipPorts('usbip: bad port output')
    expect(malformed.ports).toEqual([])
    expect(malformed.warning).toMatch(/did not match/)
  })
})
