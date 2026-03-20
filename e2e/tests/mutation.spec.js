const { test, expect } = require('@playwright/test');

test('POST /api/lxc/:id/stop dry-run', async ({ request }) => {
  const resp = await request.post('/api/lxc/123/stop', {
    headers: { 'x-dry-run': '1' }
  });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.dryRun).toBeTruthy();
  expect(body).toHaveProperty('backupRecent');
});

test('POST /api/lxc/:id/start dry-run', async ({ request }) => {
  const resp = await request.post('/api/lxc/123/start', {
    headers: { 'x-dry-run': '1' }
  });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.dryRun).toBeTruthy();
  expect(body.action).toBe('start');
});

test('POST /api/backups/trigger/:vmid dry-run', async ({ request }) => {
  const resp = await request.post('/api/backups/trigger/123', {
    headers: { 'x-dry-run': '1' }
  });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.dryRun).toBeTruthy();
  expect(body.message).toContain('Would trigger backup');
});
