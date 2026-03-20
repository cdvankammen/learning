const { createAuthResolver, parseAuthToken, isMutationRequest, requiresAdmin } = require('../lib/auth');

describe('auth helpers', () => {
  test('parses bearer and header tokens', () => {
    const req = {
      get(name) {
        const headers = {
          authorization: 'Bearer secret-token',
          'x-usbip-token': 'backup-token'
        };
        return headers[name.toLowerCase()] || null;
      }
    };

    expect(parseAuthToken(req)).toBe('secret-token');
  });

  test('resolves viewer and admin roles', () => {
    const auth = createAuthResolver({ adminToken: 'admin', viewerToken: 'viewer', requireAuth: true });
    expect(auth.resolveRole('admin')).toBe('admin');
    expect(auth.resolveRole('viewer')).toBe('viewer');
    expect(auth.resolveRole('unknown')).toBeNull();
  });

  test('tracks mutation routes and settings validation exception', () => {
    expect(isMutationRequest({ method: 'POST' })).toBe(true);
    expect(isMutationRequest({ method: 'GET' })).toBe(false);
    expect(requiresAdmin('/api/settings/validate')).toBe(false);
    expect(requiresAdmin('/api/settings')).toBe(true);
  });
});
