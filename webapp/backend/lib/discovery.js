const { execSync, execFileSync } = require('child_process');

const DEFAULT_TIMEOUT_MS = Number(process.env.USBIP_DISCOVERY_TIMEOUT_MS || 500);
const DEFAULT_MAX_HOSTS_PER_INTERFACE = Number(process.env.USBIP_DISCOVERY_MAX_HOSTS_PER_INTERFACE || 254);
const DEFAULT_CONCURRENCY = Number(process.env.USBIP_DISCOVERY_CONCURRENCY || 16);
const DEFAULT_MDNS_SERVICE_TYPE = process.env.USBIP_MDNS_SERVICE_TYPE || '_usbipcentral._tcp';

function isValidIpv4(address) {
  if (typeof address !== 'string') return false;
  const parts = address.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function ipv4ToInt(address) {
  return address.split('.').reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}

function intToIpv4(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  ].join('.');
}

function formatHttpBaseUrl(address, port) {
  const value = String(address);
  if (value.includes(':') && !value.startsWith('[')) {
    return `http://[${value}]:${port}`;
  }
  return `http://${value}:${port}`;
}

function commandAvailable(binary) {
  try {
    execSync(`command -v ${binary}`, { stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

function parsePrefixLength(cidr) {
  if (typeof cidr !== 'string') return 24;
  const match = cidr.match(/\/(\d{1,2})$/);
  if (!match) return 24;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 24;
  return Math.max(0, Math.min(32, value));
}

function maskFromPrefix(prefixLength) {
  if (prefixLength <= 0) return 0;
  return (0xffffffff << (32 - prefixLength)) >>> 0;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function buildSubnetCandidates(interfaces, port, options = {}) {
  const requestedMaxHosts = Number(options.maxHostsPerInterface);
  if (Number.isFinite(requestedMaxHosts) && requestedMaxHosts <= 0) return [];

  const maxHostsPerInterface = normalizePositiveInteger(options.maxHostsPerInterface, DEFAULT_MAX_HOSTS_PER_INTERFACE);
  const candidates = [];
  const seen = new Set();

  for (const iface of interfaces || []) {
    if (!iface || iface.internal || iface.family !== 'IPv4' || !isValidIpv4(iface.address)) continue;

    const prefixLength = Math.max(parsePrefixLength(iface.cidr), 24);
    const mask = maskFromPrefix(prefixLength);
    const network = ipv4ToInt(iface.address) & mask;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const firstHost = network + 1;
    const lastHost = broadcast - 1;
    if (lastHost < firstHost) continue;

    const totalHosts = lastHost - firstHost + 1;
    const limit = Math.min(totalHosts, maxHostsPerInterface);

    for (let offset = 0; offset < limit; offset += 1) {
      const address = intToIpv4(firstHost + offset);
      if (address === iface.address) continue;

      const baseUrl = formatHttpBaseUrl(address, port);
      if (seen.has(baseUrl)) continue;
      seen.add(baseUrl);
      candidates.push({
        baseUrl,
        address,
        subnet: `${intToIpv4(network)}/${prefixLength}`,
        interfaceName: iface.name,
        source: 'subnet-scan'
      });
    }
  }

  return candidates;
}

function buildLocalBaseUrls(interfaces, port) {
  const urls = new Set();
  for (const iface of interfaces || []) {
    if (!iface || iface.internal || !iface.address) continue;
    if (iface.family !== 'IPv4' && iface.family !== 'IPv6') continue;
    urls.add(formatHttpBaseUrl(iface.address, port));
  }
  return urls;
}

function parseMdnsBrowseLine(line, fallbackPort) {
  if (typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed.startsWith('=;')) return null;

  const parts = trimmed.split(';');
  if (parts.length < 9) return null;

  const [, interfaceName, protocol, serviceName, serviceType, domain, hostName, address, port, ...txtParts] = parts;
  const resolvedPort = Number(port);
  const baseUrl = formatHttpBaseUrl(address, Number.isFinite(resolvedPort) ? resolvedPort : fallbackPort);

  return {
    baseUrl,
    hostname: hostName || null,
    serviceName: serviceName || null,
    serviceType: serviceType || null,
    domain: domain || null,
    interfaceName: interfaceName || null,
    protocol: protocol || null,
    address: address || null,
    port: Number.isFinite(resolvedPort) ? resolvedPort : fallbackPort,
    txt: txtParts.join(';').trim(),
    source: 'mdns'
  };
}

function parseMdnsBrowseOutput(output, fallbackPort) {
  const peers = [];
  const seen = new Set();
  const lines = String(output || '').split(/\r?\n/);

  for (const line of lines) {
    const peer = parseMdnsBrowseLine(line, fallbackPort);
    if (!peer) continue;
    if (seen.has(peer.baseUrl)) continue;
    seen.add(peer.baseUrl);
    peers.push(peer);
  }

  return peers;
}

async function scanMdnsProvider({
  interfaces,
  port,
  serviceType = DEFAULT_MDNS_SERVICE_TYPE,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  browseOutput = null
} = {}) {
  const fallback = {
    id: 'mdns',
    label: 'mDNS / Bonjour',
    serviceType,
    candidateCount: 0,
    peerCount: 0,
    rejectedCount: 0,
    available: false,
    peers: []
  };

  if (!browseOutput && !commandAvailable('avahi-browse')) {
    return { ...fallback, reason: 'avahi-browse is not available on this host' };
  }

  try {
    const raw = browseOutput || execFileSync('avahi-browse', ['-r', '-t', '-p', '-f', serviceType], {
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe']
    }).toString();

    const localUrls = buildLocalBaseUrls(interfaces, port);
    const peers = parseMdnsBrowseOutput(raw, port)
      .filter(peer => !localUrls.has(peer.baseUrl));

    peers.sort((a, b) => {
      const left = (a.hostname || a.baseUrl).toLowerCase();
      const right = (b.hostname || b.baseUrl).toLowerCase();
      return left.localeCompare(right) || a.baseUrl.localeCompare(b.baseUrl);
    });

    return {
      id: 'mdns',
      label: 'mDNS / Bonjour',
      serviceType,
      candidateCount: peers.length,
      peerCount: peers.length,
      rejectedCount: 0,
      available: true,
      peers
    };
  } catch (error) {
    return {
      ...fallback,
      reason: error.message || 'Failed to browse mDNS services'
    };
  }
}

async function probeCandidate(candidate, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  if (!candidate || typeof candidate.baseUrl !== 'string') return null;
  if (typeof fetchImpl !== 'function') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), normalizePositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS));

  try {
    const response = await fetchImpl(`${candidate.baseUrl}/api/network/interfaces`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (!response.ok) return null;

    const body = await response.json();
    const interfaces = Array.isArray(body.interfaces) ? body.interfaces : [];
    return {
      baseUrl: candidate.baseUrl,
      hostname: body.hostname || null,
      bindHost: body.bindHost || null,
      port: body.port || null,
      interfaces,
      source: candidate.source,
      interfaceName: candidate.interfaceName,
      subnet: candidate.subnet
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function scanSubnetProvider({
  interfaces,
  port,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxHostsPerInterface = DEFAULT_MAX_HOSTS_PER_INTERFACE,
  concurrency = DEFAULT_CONCURRENCY,
  fetchImpl = globalThis.fetch
} = {}) {
  const candidates = buildSubnetCandidates(interfaces, port, { maxHostsPerInterface });
  const limit = Math.max(1, Math.min(normalizePositiveInteger(concurrency, DEFAULT_CONCURRENCY), candidates.length || 1));
  const peers = [];
  const rejected = [];
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const index = cursor;
      cursor += 1;
      const candidate = candidates[index];
      const snapshot = await probeCandidate(candidate, { timeoutMs, fetchImpl });
      if (snapshot) {
        peers.push(snapshot);
      } else {
        rejected.push(candidate.baseUrl);
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));

  peers.sort((a, b) => {
    const left = (a.hostname || a.baseUrl).toLowerCase();
    const right = (b.hostname || b.baseUrl).toLowerCase();
    return left.localeCompare(right) || a.baseUrl.localeCompare(b.baseUrl);
  });

  return {
    id: 'subnet-scan',
    label: 'Subnet scan',
    candidateCount: candidates.length,
    peerCount: peers.length,
    rejectedCount: rejected.length,
    peers
  };
}

async function discoverPeers({
  interfaces,
  port,
  providers = [scanMdnsProvider, scanSubnetProvider],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxHostsPerInterface = DEFAULT_MAX_HOSTS_PER_INTERFACE,
  concurrency = DEFAULT_CONCURRENCY,
  fetchImpl = globalThis.fetch
} = {}) {
  const providerResults = [];
  const mergedPeers = new Map();

  for (const provider of providers) {
    if (typeof provider !== 'function') continue;
    const result = await provider({
      interfaces,
      port,
      timeoutMs,
      maxHostsPerInterface,
      concurrency,
      fetchImpl
    });

    if (!result) continue;

    providerResults.push(result);
    for (const peer of result.peers || []) {
      if (peer && peer.baseUrl && !mergedPeers.has(peer.baseUrl)) {
        mergedPeers.set(peer.baseUrl, peer);
      }
    }
  }

  const peers = Array.from(mergedPeers.values()).sort((a, b) => {
    const left = (a.hostname || a.baseUrl).toLowerCase();
    const right = (b.hostname || b.baseUrl).toLowerCase();
    return left.localeCompare(right) || a.baseUrl.localeCompare(b.baseUrl);
  });

  return {
    scannedAt: new Date().toISOString(),
    providerCount: providerResults.length,
    providers: providerResults.map(result => ({
      id: result.id,
      label: result.label,
      candidateCount: result.candidateCount || 0,
      peerCount: result.peerCount || 0,
      rejectedCount: result.rejectedCount || 0,
      available: result.available !== false,
      reason: result.reason || null
    })),
    peerCount: peers.length,
    peers
  };
}

module.exports = {
  buildLocalBaseUrls,
  buildSubnetCandidates,
  parseMdnsBrowseLine,
  parseMdnsBrowseOutput,
  probeCandidate,
  scanMdnsProvider,
  scanSubnetProvider,
  discoverPeers
};
