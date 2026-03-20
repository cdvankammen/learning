const { test, expect } = require('@playwright/test');

test('GET /api/health returns ok', async ({ request }) => {
  const resp = await request.get('/api/health');
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.status).toBe('ok');
  expect(body).toHaveProperty('version');
  expect(body).toHaveProperty('uptime');
});

test('GET /api/system returns host info', async ({ request }) => {
  const resp = await request.get('/api/system');
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty('hostname');
  expect(body).toHaveProperty('cpus');
  expect(body).toHaveProperty('mem');
  expect(body.mem).toHaveProperty('total');
  expect(body.mem).toHaveProperty('free');
  expect(body).toHaveProperty('loadavg');
  expect(body.loadavg).toHaveLength(3);
});

test('GET /api/lxc/list returns containers array', async ({ request }) => {
  const resp = await request.get('/api/lxc/list');
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty('containers');
  expect(Array.isArray(body.containers)).toBe(true);
  if (body.containers.length > 0) {
    expect(body.containers[0]).toHaveProperty('vmid');
    expect(body.containers[0]).toHaveProperty('status');
  }
});

test('GET /api/lxc/:id/status returns status', async ({ request }) => {
  const resp = await request.get('/api/lxc/500/status');
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty('vmid');
  expect(body.vmid).toBe('500');
});

test('GET /api/backups returns backup list', async ({ request }) => {
  const resp = await request.get('/api/backups');
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty('backups');
  expect(Array.isArray(body.backups)).toBe(true);
  if (body.backups.length > 0) {
    expect(body.backups[0]).toHaveProperty('file');
    expect(body.backups[0]).toHaveProperty('vmid');
    expect(body.backups[0]).toHaveProperty('size');
    expect(body.backups[0]).toHaveProperty('mtime');
  }
});

test('GET /api/usbip/devices returns device list', async ({ request }) => {
  const resp = await request.get('/api/usbip/devices');
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty('devices');
  expect(Array.isArray(body.devices)).toBe(true);
});

test('POST /api/usbip/bind rejects invalid busid', async ({ request }) => {
  const resp = await request.post('/api/usbip/bind', {
    data: { busid: '../etc/passwd' }
  });
  expect(resp.status()).toBe(400);
  const body = await resp.json();
  expect(body.error).toContain('invalid');
});

test('POST /api/usbip/unbind rejects missing busid', async ({ request }) => {
  const resp = await request.post('/api/usbip/unbind', { data: {} });
  expect(resp.status()).toBe(400);
});
