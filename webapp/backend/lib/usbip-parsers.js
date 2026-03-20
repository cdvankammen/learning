function parseUsbipDevices(raw) {
  const devices = [];
  const seen = new Set();
  const lines = String(raw || '').split(/\r?\n/);
  let sawContent = false;

  for (const line of lines) {
    if (line.trim()) sawContent = true;

    let match = line.match(/^\s*-\s*busid\s+([A-Za-z0-9._:-]+)\s+\((.+)\)\s*$/i);
    if (!match) {
      match = line.match(/^\s*([A-Za-z0-9._:-]+):\s*(.+)\s+\((.+)\)\s*$/);
    }
    if (!match) continue;

    const busid = match[1];
    if (seen.has(busid)) continue;
    seen.add(busid);
    devices.push({ busid, description: (match[2] || '').trim() });
  }

  return {
    devices,
    warning: sawContent && devices.length === 0 ? 'usbip list output did not match the expected device format' : null
  };
}

function parseUsbipPorts(raw) {
  const ports = [];
  const lines = String(raw || '').split(/\r?\n/);
  let sawContent = false;

  for (const line of lines) {
    if (line.trim()) sawContent = true;

    const match = line.match(/^\s*Port\s+(\d+):\s*(.+)$/i);
    if (!match) continue;
    ports.push({ port: match[1], description: match[2].trim() });
  }

  return {
    ports,
    warning: sawContent && ports.length === 0 ? 'usbip port output did not match the expected port format' : null
  };
}

module.exports = {
  parseUsbipDevices,
  parseUsbipPorts
};
