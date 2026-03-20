function parseAuthToken(req) {
  const bearer = req?.get?.('authorization') || req?.get?.('Authorization') || '';
  if (/^Bearer\s+/i.test(bearer)) return bearer.replace(/^Bearer\s+/i, '').trim() || null;

  const headerToken = req?.get?.('x-usbip-token') || req?.get?.('X-USBIP-Token') || req?.get?.('x-api-key') || req?.get?.('X-API-Key') || '';
  return headerToken.trim() || null;
}

function createAuthResolver({ adminToken = null, viewerToken = null, requireAuth = false } = {}) {
  const normalizedAdminToken = adminToken ? String(adminToken).trim() : null;
  const normalizedViewerToken = viewerToken ? String(viewerToken).trim() : null;
  const enabled = Boolean(requireAuth || normalizedAdminToken || normalizedViewerToken);

  function resolveRole(token) {
    if (!enabled) return 'public';
    if (!token) return null;
    if (normalizedAdminToken && token === normalizedAdminToken) return 'admin';
    if (normalizedViewerToken && token === normalizedViewerToken) return 'viewer';
    return null;
  }

  function authenticateRequest(req) {
    const token = parseAuthToken(req);
    const role = resolveRole(token);
    return {
      enabled,
      token,
      role,
      authenticated: Boolean(role)
    };
  }

  return {
    enabled,
    authenticateRequest,
    resolveRole
  };
}

function isMutationRequest(req) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req?.method || '').toUpperCase());
}

function requiresAdmin(pathname = '') {
  const path = String(pathname || '');
  return path !== '/api/settings/validate';
}

function createAuthMiddleware(options = {}) {
  const auth = createAuthResolver(options);

  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();

    const context = auth.authenticateRequest(req);
    req.auth = context;

    if (context.role) {
      res.setHeader('X-USBIP-Auth-Role', context.role);
    }

    if (!context.enabled) return next();

    if (req.method === 'GET' && req.path === '/api/health') {
      return next();
    }

    if (!context.role) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (isMutationRequest(req) && requiresAdmin(req.path) && context.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    return next();
  };
}

module.exports = {
  parseAuthToken,
  createAuthResolver,
  createAuthMiddleware,
  isMutationRequest,
  requiresAdmin
};
