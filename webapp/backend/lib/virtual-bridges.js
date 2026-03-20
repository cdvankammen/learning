const { execSync, exec } = require('child_process');

const DEFAULT_BRIDGES = [
  {
    id: 'go2rtc',
    label: 'go2rtc media bridge',
    kind: 'video',
    description: 'Codec-aware bridge for cameras and two-way audio when raw USB/IP is not the right fit.',
    tools: ['go2rtc', 'ffmpeg'],
    docs: 'https://github.com/AlexxIT/go2rtc'
  },
  {
    id: 'pipewire-audio',
    label: 'PipeWire audio bridge',
    kind: 'audio',
    description: 'Audio and microphone routing layer for Linux, useful for usb-audio-ip-client style flows.',
    tools: ['pipewire', 'pw-cli', 'pactl'],
    docs: 'https://github.com/seastwood/usb-audio-ip-client'
  },
  {
    id: 'v4l2loopback',
    label: 'v4l2loopback virtual camera',
    kind: 'video',
    description: 'Virtual camera sink for browsers, conferencing apps, and synthetic video sources.',
    tools: ['modprobe', 'v4l2-ctl'],
    docs: 'https://github.com/umlaeute/v4l2loopback'
  },
  {
    id: 'alsa-loopback',
    label: 'ALSA loopback audio bridge',
    kind: 'audio',
    description: 'Loopback ALSA device for virtual audio routing and software capture/playback.',
    tools: ['modprobe', 'arecord', 'aplay'],
    docs: 'https://www.alsa-project.org/wiki/Matrix:Module-loopback'
  }
];

function bridgeKey(id) {
  return String(id || '').trim().toLowerCase();
}

function bridgeEnvPrefix(id) {
  return `USBIP_VIRTUAL_${bridgeKey(id).replace(/[^a-z0-9]+/g, '_').toUpperCase()}`;
}

function bridgeEnvName(id, action) {
  return `${bridgeEnvPrefix(id)}_${String(action || '').trim().toUpperCase()}_COMMAND`;
}

function commandAvailable(binary) {
  try {
    execSync(`command -v ${binary}`, { stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

function buildBridgeSummary(bridge) {
  const tools = bridge.tools.map(tool => ({
    name: tool,
    available: commandAvailable(tool)
  }));

  const env = {
    start: bridgeEnvName(bridge.id, 'start'),
    stop: bridgeEnvName(bridge.id, 'stop'),
    restart: bridgeEnvName(bridge.id, 'restart'),
    status: bridgeEnvName(bridge.id, 'status')
  };

  const commands = {
    start: Boolean(process.env[env.start]?.trim()),
    stop: Boolean(process.env[env.stop]?.trim()),
    restart: Boolean(process.env[env.restart]?.trim()),
    status: Boolean(process.env[env.status]?.trim())
  };

  return {
    id: bridge.id,
    label: bridge.label,
    kind: bridge.kind,
    description: bridge.description,
    docs: bridge.docs,
    tools,
    env,
    commands,
    ready: commands.start && commands.stop,
    availableTools: tools.every(tool => tool.available)
  };
}

function listVirtualBridges() {
  return DEFAULT_BRIDGES.map(buildBridgeSummary);
}

function findBridge(id) {
  const normalized = bridgeKey(id);
  return DEFAULT_BRIDGES.find(bridge => bridge.id === normalized);
}

function runCommand(command, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const err = new Error(error.message);
        err.code = error.code;
        err.stdout = stdout ? stdout.toString().trim() : '';
        err.stderr = stderr ? stderr.toString().trim() : '';
        err.command = command;
        reject(err);
        return;
      }

      resolve({
        command,
        stdout: stdout ? stdout.toString().trim() : '',
        stderr: stderr ? stderr.toString().trim() : ''
      });
    });
  });
}

function makeBridgeError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function resolveActionCommand(bridge, action) {
  const envName = bridgeEnvName(bridge.id, action);
  const command = process.env[envName];
  return command ? command.trim() : '';
}

async function runVirtualBridgeAction(id, action, options = {}) {
  const bridge = findBridge(id);
  if (!bridge) {
    throw makeBridgeError(404, `Unknown virtual bridge '${id}'`);
  }

  const summary = buildBridgeSummary(bridge);
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : 300000;
  const dryRun = Boolean(options.dryRun);
  const requestedAction = String(action || '').trim().toLowerCase();

  if (requestedAction === 'status') {
    const statusCommand = resolveActionCommand(bridge, 'status');
    if (!statusCommand) {
      return {
        ok: true,
        action: 'status',
        mode: 'report',
        bridge: summary,
        dryRun
      };
    }

    const result = await runCommand(statusCommand, timeoutMs);
    return {
      ok: true,
      action: 'status',
      mode: 'command',
      bridge: summary,
      dryRun,
      ...result
    };
  }

  if (requestedAction === 'restart') {
    const restartCommand = resolveActionCommand(bridge, 'restart');
    if (restartCommand) {
      if (dryRun) {
        return {
          ok: true,
          action: 'restart',
          mode: 'dry-run',
          bridge: summary,
          dryRun: true,
          command: restartCommand
        };
      }
      const result = await runCommand(restartCommand, timeoutMs);
      return {
        ok: true,
        action: 'restart',
        mode: 'command',
        bridge: summary,
        dryRun,
        ...result
      };
    }

    const stopCommand = resolveActionCommand(bridge, 'stop');
    const startCommand = resolveActionCommand(bridge, 'start');
    if (!stopCommand || !startCommand) {
      throw makeBridgeError(
        400,
        `Bridge '${bridge.id}' needs a restart command or both start and stop commands.`
      );
    }

    if (dryRun) {
      return {
        ok: true,
        action: 'restart',
        mode: 'dry-run',
        bridge: summary,
        dryRun: true,
        commands: {
          stop: stopCommand,
          start: startCommand
        }
      };
    }

    const stop = await runCommand(stopCommand, timeoutMs);
    const start = await runCommand(startCommand, timeoutMs);
    return {
      ok: true,
      action: 'restart',
      mode: 'split',
      bridge: summary,
      dryRun,
      stop,
      start
    };
  }

  if (requestedAction !== 'start' && requestedAction !== 'stop') {
    throw makeBridgeError(400, `Unsupported virtual bridge action '${action}'`);
  }

  const command = resolveActionCommand(bridge, requestedAction);
  if (!command) {
    throw makeBridgeError(
      400,
      `Bridge '${bridge.id}' has no ${requestedAction} command configured. Set ${bridgeEnvName(bridge.id, requestedAction)}.`
    );
  }

  if (dryRun) {
    return {
      ok: true,
      action: requestedAction,
      mode: 'dry-run',
      bridge: summary,
      dryRun: true,
      command
    };
  }

  const result = await runCommand(command, timeoutMs);
  return {
    ok: true,
    action: requestedAction,
    mode: 'command',
    bridge: summary,
    dryRun,
    ...result
  };
}

module.exports = {
  bridgeEnvName,
  buildBridgeSummary,
  findBridge,
  listVirtualBridges,
  runVirtualBridgeAction
};
