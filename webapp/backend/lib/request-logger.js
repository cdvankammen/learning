const { randomUUID } = require('crypto');

function createRequestLogger({ enabled = true, logger = console, onFinish = null } = {}) {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();

    const requestId = req.get('x-request-id') || randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const record = typeof onFinish === 'function' ? onFinish : logger.recordRequest;
      if (typeof record === 'function') {
        record({
          method: req.method,
          path: req.route?.path || req.originalUrl || req.path,
          status: res.statusCode,
          durationMs
        });
      }
      if (!enabled) return;
      logger.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs)
      }));
    });

    next();
  };
}

function logRequestError(err, req, res, logger = console) {
  logger.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'error',
    requestId: req?.requestId || null,
    method: req?.method || null,
    path: req?.originalUrl || null,
    status: res?.statusCode || 500,
    message: err?.message || 'Unknown error',
    stack: err?.stack || null
  }));
}

module.exports = {
  createRequestLogger,
  logRequestError
};
