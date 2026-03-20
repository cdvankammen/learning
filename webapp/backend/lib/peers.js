function normalizePeerBaseUrl(input, defaultPort = 3001) {
  const raw = typeof input === 'string'
    ? input
    : input && typeof input === 'object'
      ? input.baseUrl || input.url || input.peer || input.host || ''
      : '';

  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  try {
    const hasScheme = /^https?:\/\//i.test(trimmed);
    const url = new URL(hasScheme ? trimmed : `http://${trimmed}`);

    if (!hasScheme && !url.port) {
      url.port = String(defaultPort);
    }

    url.pathname = '';
    url.search = '';
    url.hash = '';

    return url.origin;
  } catch {
    return '';
  }
}

function normalizePeerList(peers, defaultPort = 3001) {
  const seen = new Set();
  const normalized = [];

  for (const peer of Array.isArray(peers) ? peers : []) {
    const baseUrl = normalizePeerBaseUrl(peer, defaultPort);
    if (!baseUrl || seen.has(baseUrl)) continue;
    seen.add(baseUrl);
    normalized.push(baseUrl);
  }

  return normalized;
}

module.exports = {
  normalizePeerBaseUrl,
  normalizePeerList
};
