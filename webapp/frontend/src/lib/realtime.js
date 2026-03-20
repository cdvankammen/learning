function buildWsUrl(baseUrl) {
  const fallback = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3001';
  const origin = baseUrl || fallback;
  const url = new URL(origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function connectRealtime({ baseUrl } = {}) {
  const ws = new WebSocket(buildWsUrl(baseUrl));
  const listeners = new Map();

  function emitLocal(event, payload) {
    const handlers = listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(payload);
    }
  }

  ws.onopen = () => emitLocal('connect');
  ws.onclose = () => emitLocal('disconnect');
  ws.onerror = err => emitLocal('connect_error', err);
  ws.onmessage = evt => {
    try {
      const message = JSON.parse(evt.data);
      if (message && message.event) {
        emitLocal(message.event, message.data);
      }
    } catch {
      // ignore malformed payloads
    }
  };

  return {
    on(event, handler) {
      const set = listeners.get(event) || new Set();
      set.add(handler);
      listeners.set(event, set);
    },
    off(event, handler) {
      const set = listeners.get(event);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) listeners.delete(event);
    },
    emit(event, payload) {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ event, data: payload }));
    },
    disconnect() {
      ws.close();
    },
    get connected() {
      return ws.readyState === WebSocket.OPEN;
    }
  };
}
