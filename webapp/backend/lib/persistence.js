const fs = require('fs');
const path = require('path');
const { createMutationQueue } = require('./mutation-queue');
const { normalizePeerBaseUrl, normalizePeerList } = require('./peers');

const DEFAULT_MAX_AUDIT_EVENTS = 200;
const DEFAULT_MAX_DEVICE_HISTORY = 100;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function createDefaultState() {
  const timestamp = nowIso();
  return {
    schemaVersion: 1,
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      bootCount: 1,
      lastBootAt: timestamp,
      lastPeerUpdateAt: null,
      lastAuditEventAt: null,
      lastDeviceSnapshotAt: null
    },
    peers: [],
    deviceHistory: [],
    auditEvents: []
  };
}

function sanitizeEntries(entries, limit) {
  if (!Array.isArray(entries)) return [];
  const slice = limit > 0 ? entries.slice(-limit) : entries.slice();
  return slice
    .filter(Boolean)
    .map(entry => clone(entry));
}

function sanitizeState(raw, { maxAuditEvents, maxDeviceHistory } = {}) {
  const state = createDefaultState();

  if (raw && typeof raw === 'object') {
    if (Number.isFinite(Number(raw.schemaVersion))) {
      state.schemaVersion = Number(raw.schemaVersion);
    }

    if (raw.metadata && typeof raw.metadata === 'object') {
      state.metadata = Object.assign({}, state.metadata, clone(raw.metadata));
    }

    state.peers = normalizePeerList(raw.peers);
    state.deviceHistory = sanitizeEntries(raw.deviceHistory, maxDeviceHistory || DEFAULT_MAX_DEVICE_HISTORY);
    state.auditEvents = sanitizeEntries(raw.auditEvents, maxAuditEvents || DEFAULT_MAX_AUDIT_EVENTS);
  }

  return state;
}

function createPersistenceStore({
  configDir,
  fileName = 'persistence.json',
  maxAuditEvents = DEFAULT_MAX_AUDIT_EVENTS,
  maxDeviceHistory = DEFAULT_MAX_DEVICE_HISTORY
} = {}) {
  if (!configDir) {
    throw new Error('configDir is required');
  }

  const filePath = path.join(configDir, fileName);
  const queue = createMutationQueue();

  function ensureDir() {
    fs.mkdirSync(configDir, { recursive: true });
  }

  function loadState() {
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const next = sanitizeState(raw, { maxAuditEvents, maxDeviceHistory });
        const timestamp = nowIso();
        next.metadata.bootCount = Number(next.metadata.bootCount || 0) + 1;
        next.metadata.updatedAt = timestamp;
        next.metadata.lastBootAt = timestamp;
        return next;
      }
    } catch (err) {
      console.warn(`Failed to read persistence from ${filePath}: ${err.message}`);
    }

    return createDefaultState();
  }

  function writeState(nextState) {
    ensureDir();
    const tmpFile = `${filePath}.tmp-${process.pid}`;
    fs.writeFileSync(tmpFile, JSON.stringify(nextState, null, 2), 'utf8');
    fs.renameSync(tmpFile, filePath);
  }

  let state = loadState();

  function snapshot() {
    return clone(state);
  }

  function update(mutator) {
    return queue.run(() => {
      const draft = clone(state);
      const mutated = mutator(draft) || draft;
      const nextState = sanitizeState(mutated, { maxAuditEvents, maxDeviceHistory });
      nextState.metadata.updatedAt = nowIso();
      state = nextState;
      writeState(state);
      return snapshot();
    });
  }

  function recordAuditEvent(event) {
    const safeEvent = event && typeof event === 'object' ? clone(event) : { value: event };
    return update(current => {
      const timestamp = nowIso();
      current.auditEvents = [...current.auditEvents, { recordedAt: timestamp, ...safeEvent }].slice(-maxAuditEvents);
      current.metadata.lastAuditEventAt = timestamp;
      return current;
    });
  }

  function recordDeviceSnapshot(snapshotEntry) {
    const safeEntry = snapshotEntry && typeof snapshotEntry === 'object' ? clone(snapshotEntry) : { value: snapshotEntry };
    return update(current => {
      const timestamp = nowIso();
      current.deviceHistory = [...current.deviceHistory, { recordedAt: timestamp, ...safeEntry }].slice(-maxDeviceHistory);
      current.metadata.lastDeviceSnapshotAt = timestamp;
      return current;
    });
  }

  function replacePeers(peers, details = {}) {
    const normalizedPeers = normalizePeerList(peers);
    const safeDetails = details && typeof details === 'object' ? clone(details) : { value: details };

    return update(current => {
      const previousPeers = current.peers;
      const previousSet = new Set(previousPeers);
      const nextSet = new Set(normalizedPeers);
      const added = normalizedPeers.filter(peer => !previousSet.has(peer));
      const removed = previousPeers.filter(peer => !nextSet.has(peer));

      current.peers = normalizedPeers;
      current.metadata.lastPeerUpdateAt = nowIso();

      if (added.length || removed.length) {
        const timestamp = nowIso();
        current.auditEvents = [...current.auditEvents, {
          recordedAt: timestamp,
          type: 'peers.replaced',
          added,
          removed,
          ...safeDetails
        }].slice(-maxAuditEvents);
        current.metadata.lastAuditEventAt = timestamp;
      }

      return current;
    });
  }

  function listPeers() {
    return snapshot().peers;
  }

  return {
    filePath,
    getSnapshot: snapshot,
    listPeers,
    replacePeers,
    recordAuditEvent,
    recordDeviceSnapshot,
    normalizePeerBaseUrl
  };
}

module.exports = {
  createPersistenceStore
};
