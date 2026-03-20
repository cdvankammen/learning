function parseConfiguredInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function isValidHost(host) {
  return typeof host === 'string' && /^[A-Za-z0-9._:%\-\[\]]{1,255}$/.test(host);
}

function isValidBusid(busid) {
  return typeof busid === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(busid);
}

function normalizePort(port) {
  if (typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535) {
    return String(port);
  }

  if (typeof port === 'string' && /^\d{1,5}$/.test(port)) {
    const parsed = Number(port);
    if (parsed >= 1 && parsed <= 65535) {
      return String(parsed);
    }
  }

  return null;
}

function isValidPort(port) {
  return normalizePort(port) !== null;
}

function normalizeVmid(vmid) {
  if (typeof vmid === 'number' && Number.isInteger(vmid) && vmid >= 1 && vmid <= 99999) {
    return String(vmid);
  }

  if (typeof vmid === 'string' && /^\d{1,5}$/.test(vmid)) {
    return vmid;
  }

  return null;
}

function isValidVmid(vmid) {
  return normalizeVmid(vmid) !== null;
}

function isValidBindHost(value) {
  return typeof value === 'string' && (/^[\d.]+$/.test(value) || value === '::' || value === '::1' || value === '0.0.0.0');
}

module.exports = {
  parseConfiguredInteger,
  parsePositiveInteger,
  isValidHost,
  isValidBusid,
  isValidPort,
  normalizePort,
  isValidVmid,
  normalizeVmid,
  isValidBindHost
};
