const { test, expect } = require('../playwright');

test('websocket identify and command ack work', async ({ page }) => {
  await page.goto('/');

  const events = await page.evaluate(() => new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${location.host}/ws`);
    const seen = [];
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out waiting for websocket events'));
    }, 5000);

    function finish(value) {
      clearTimeout(timer);
      socket.close();
      resolve(value);
    }

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ event: 'identify', data: { id: `e2e-${Date.now()}`, name: 'E2E WebSocket Test' } }));
      socket.send(JSON.stringify({ event: 'command', data: { cmd: 'status' } }));
    });

    socket.addEventListener('message', event => {
      const payload = JSON.parse(event.data);
      seen.push(payload);
      const hasClients = seen.some(item => item.event === 'clients' && Array.isArray(item.data) && item.data.some(client => client.name === 'E2E WebSocket Test'));
      const hasAck = seen.some(item => item.event === 'command_ack' && item.data && item.data.ok === true && item.data.cmd === 'status');
      if (hasClients && hasAck) {
        finish(seen);
      }
    });

    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Websocket connection failed'));
    });
  }));

  expect(events.some(event => event.event === 'clients')).toBe(true);
  expect(events.some(event => event.event === 'command_ack')).toBe(true);
});
