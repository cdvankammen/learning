const { test, expect } = require('../playwright');

async function assertShell(page) {
  await expect(page.getByRole('heading', { name: 'USBIP Control' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Computers', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Devices', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
}

test.describe('desktop browser shell', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('renders the dashboard and device management entry points', async ({ page }) => {
    await page.goto('/');
    await assertShell(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('How to use this console')).toBeVisible();

    await page.goto('/devices');
    await expect(page.getByRole('heading', { name: 'USB/IP Devices' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Local Export' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Imported Devices' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Remote Hosts' })).toBeVisible();
  });
});

test.describe('mobile browser shell', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps the settings workflow reachable on narrow screens', async ({ page }) => {
    await page.goto('/settings');
    await assertShell(page);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connection' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Backup Policy' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  });
});

test('virtual devices keep codec guidance separate from USB/IP transport', async ({ page }) => {
  await page.goto('/virtual-devices');
  const note = page.locator('p.page-note');
  await expect(page.getByRole('heading', { name: 'Virtual Devices' })).toBeVisible();
  await expect(note).toContainText('separate media/driver layer');
  await expect(note).toContainText('go2rtc, PipeWire, v4l2loopback, and ALSA loopback');
  await expect(page.getByRole('heading', { name: 'Bridge inventory' })).toBeVisible();
});

test('computers page restores persisted peers from the backend store', async ({ page, request }) => {
  try {
    const seedResponse = await request.put('/api/peers', {
      data: { peers: ['http://peer-a:3001'] }
    });
    expect(seedResponse.ok()).toBe(true);

    await page.goto('/computers');
    const peerCard = page.locator('.peer-card').filter({ hasText: 'http://peer-a:3001' }).first();
    await expect(peerCard).toBeVisible();

    await page.reload();
    await expect(page.locator('.peer-card').filter({ hasText: 'http://peer-a:3001' }).first()).toBeVisible();
  } finally {
    await request.put('/api/peers', {
      data: { peers: [] }
    });
  }
});
