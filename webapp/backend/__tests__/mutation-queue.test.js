const { createMutationQueue } = require('../lib/mutation-queue')

describe('mutation queue', () => {
  test('serializes queued tasks in order', async () => {
    const queue = createMutationQueue()
    const events = []

    const first = queue.run(async () => {
      events.push('first-start')
      await new Promise(resolve => setTimeout(resolve, 10))
      events.push('first-end')
      return 'one'
    })

    const second = queue.run(async () => {
      events.push('second-start')
      events.push('second-end')
      return 'two'
    })

    await expect(first).resolves.toBe('one')
    await expect(second).resolves.toBe('two')
    expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end'])
  })
})
