const { buildBridgeSummary, runVirtualBridgeAction } = require('../lib/virtual-bridges')

describe('virtual bridge helpers', () => {
  test('buildBridgeSummary reports env names and tool availability', () => {
    const summary = buildBridgeSummary({
      id: 'go2rtc',
      label: 'go2rtc media bridge',
      kind: 'video',
      description: 'Codec-aware bridge for cameras and two-way audio.',
      tools: ['go2rtc'],
      docs: 'https://github.com/AlexxIT/go2rtc'
    })

    expect(summary.id).toBe('go2rtc')
    expect(summary.env.start).toBe('USBIP_VIRTUAL_GO2RTC_START_COMMAND')
    expect(summary.env.stop).toBe('USBIP_VIRTUAL_GO2RTC_STOP_COMMAND')
    expect(Array.isArray(summary.tools)).toBe(true)
  })

  test('runVirtualBridgeAction supports dry-run previews', async () => {
    const previous = process.env.USBIP_VIRTUAL_GO2RTC_START_COMMAND
    process.env.USBIP_VIRTUAL_GO2RTC_START_COMMAND = 'echo go2rtc-start'
    try {
      const result = await runVirtualBridgeAction('go2rtc', 'start', { dryRun: true })
      expect(result.dryRun).toBe(true)
      expect(result.command).toBe('echo go2rtc-start')
      expect(result.mode).toBe('dry-run')
    } finally {
      if (previous === undefined) delete process.env.USBIP_VIRTUAL_GO2RTC_START_COMMAND
      else process.env.USBIP_VIRTUAL_GO2RTC_START_COMMAND = previous
    }
  })

  test('runVirtualBridgeAction executes a restart split when only start and stop are configured', async () => {
    const previousStart = process.env.USBIP_VIRTUAL_GO2RTC_START_COMMAND
    const previousStop = process.env.USBIP_VIRTUAL_GO2RTC_STOP_COMMAND
    process.env.USBIP_VIRTUAL_GO2RTC_START_COMMAND = 'echo go2rtc-start'
    process.env.USBIP_VIRTUAL_GO2RTC_STOP_COMMAND = 'echo go2rtc-stop'
    try {
      const result = await runVirtualBridgeAction('go2rtc', 'restart')
      expect(result.mode).toBe('split')
      expect(result.stop.stdout).toBe('go2rtc-stop')
      expect(result.start.stdout).toBe('go2rtc-start')
    } finally {
      if (previousStart === undefined) delete process.env.USBIP_VIRTUAL_GO2RTC_START_COMMAND
      else process.env.USBIP_VIRTUAL_GO2RTC_START_COMMAND = previousStart
      if (previousStop === undefined) delete process.env.USBIP_VIRTUAL_GO2RTC_STOP_COMMAND
      else process.env.USBIP_VIRTUAL_GO2RTC_STOP_COMMAND = previousStop
    }
  })
})
