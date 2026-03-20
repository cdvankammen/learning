const requestCounts = new Map();
const requestDurations = new Map();

function escapeLabel(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

function recordHttpRequest({ method = 'UNKNOWN', path = 'unknown', status = 0, durationMs = 0 } = {}) {
  const requestKey = `${method}||${path}||${status}`;
  requestCounts.set(requestKey, (requestCounts.get(requestKey) || 0) + 1);

  const durationKey = `${method}||${path}`;
  const bucket = requestDurations.get(durationKey) || { sum: 0, count: 0 };
  bucket.sum += Number(durationMs) || 0;
  bucket.count += 1;
  requestDurations.set(durationKey, bucket);
}

function renderPrometheusMetrics({
  version = 'unknown',
  bindHost = '0.0.0.0',
  port = 3001,
  components = {},
  deviceCount = null,
  portCount = null,
  backupCount = null
} = {}) {
  const lines = [];
  lines.push('# HELP usbip_backend_info Build and runtime metadata.');
  lines.push('# TYPE usbip_backend_info gauge');
  lines.push(`usbip_backend_info{version="${escapeLabel(version)}",bind_host="${escapeLabel(bindHost)}",port="${escapeLabel(port)}"} 1`);

  lines.push('# HELP usbip_http_requests_total Total HTTP requests by method, path, and status.');
  lines.push('# TYPE usbip_http_requests_total counter');
  for (const [key, count] of requestCounts.entries()) {
    const [method, path, status] = key.split('||');
    lines.push(`usbip_http_requests_total{method="${escapeLabel(method)}",path="${escapeLabel(path)}",status="${escapeLabel(status)}"} ${count}`);
  }

  lines.push('# HELP usbip_http_request_duration_ms Request duration by method and path.');
  lines.push('# TYPE usbip_http_request_duration_ms summary');
  for (const [key, bucket] of requestDurations.entries()) {
    const [method, path] = key.split('||');
    lines.push(`usbip_http_request_duration_ms_sum{method="${escapeLabel(method)}",path="${escapeLabel(path)}"} ${bucket.sum}`);
    lines.push(`usbip_http_request_duration_ms_count{method="${escapeLabel(method)}",path="${escapeLabel(path)}"} ${bucket.count}`);
  }

  lines.push('# HELP usbip_component_status Component availability (1 = available, 0 = unavailable).');
  lines.push('# TYPE usbip_component_status gauge');
  for (const [name, info] of Object.entries(components || {})) {
    lines.push(`usbip_component_status{component="${escapeLabel(name)}"} ${info && info.available ? 1 : 0}`);
  }

  if (Number.isFinite(Number(deviceCount))) {
    lines.push('# HELP usbip_usbip_devices_total Number of local USB/IP devices reported by the host.');
    lines.push('# TYPE usbip_usbip_devices_total gauge');
    lines.push(`usbip_usbip_devices_total ${Number(deviceCount)}`);
  }

  if (Number.isFinite(Number(portCount))) {
    lines.push('# HELP usbip_usbip_ports_total Number of imported USB/IP ports reported by the host.');
    lines.push('# TYPE usbip_usbip_ports_total gauge');
    lines.push(`usbip_usbip_ports_total ${Number(portCount)}`);
  }

  if (Number.isFinite(Number(backupCount))) {
    lines.push('# HELP usbip_backup_archives_total Number of local backup archives found on disk.');
    lines.push('# TYPE usbip_backup_archives_total gauge');
    lines.push(`usbip_backup_archives_total ${Number(backupCount)}`);
  }

  return `${lines.join('\n')}\n`;
}

module.exports = {
  recordHttpRequest,
  renderPrometheusMetrics
};
