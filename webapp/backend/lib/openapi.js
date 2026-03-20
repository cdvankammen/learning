const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'USB/IP Management API',
    version: '0.1.0',
    description: 'Backend API for system status, LXC management, USB/IP device control, discovery, and virtual media bridges.'
  },
  tags: [
    { name: 'Meta' },
    { name: 'Health' },
    { name: 'System' },
    { name: 'Settings' },
    { name: 'LXC' },
    { name: 'Backups' },
    { name: 'USB/IP' },
    { name: 'Discovery' },
    { name: 'Virtual Bridges' }
  ],
  paths: {
    '/api/openapi.json': {
      get: {
        tags: ['Meta'],
        summary: 'Get this OpenAPI document',
        responses: {
          200: {
            description: 'OpenAPI document',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true }
              }
            }
          }
        }
      }
    },
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Get service health',
        responses: { 200: { description: 'Health snapshot', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } } }
      }
    },
    '/api/metrics': {
      get: {
        tags: ['Meta'],
        summary: 'Get Prometheus-style metrics',
        responses: {
          200: {
            description: 'Metrics text',
            content: { 'text/plain': { schema: { type: 'string' } } }
          }
        }
      }
    },
    '/api/system': {
      get: {
        tags: ['System'],
        summary: 'Get host system information',
        responses: { 200: { description: 'System snapshot', content: { 'application/json': { schema: { $ref: '#/components/schemas/SystemResponse' } } } } }
      }
    },
    '/api/network/interfaces': {
      get: {
        tags: ['System'],
        summary: 'Get local interface inventory',
        responses: { 200: { description: 'Network snapshot', content: { 'application/json': { schema: { $ref: '#/components/schemas/NetworkResponse' } } } } }
      }
    },
    '/api/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Get current settings and schema',
        responses: { 200: { description: 'Settings snapshot', content: { 'application/json': { schema: { $ref: '#/components/schemas/SettingsSnapshot' } } } } }
      },
      post: {
        tags: ['Settings'],
        summary: 'Save settings',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Settings' } } }
        },
        responses: { 200: { description: 'Saved settings', content: { 'application/json': { schema: { $ref: '#/components/schemas/SettingsSaveResponse' } } } } }
      }
    },
    '/api/settings/validate': {
      post: {
        tags: ['Settings'],
        summary: 'Validate a settings payload',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Settings' } } }
        },
        responses: { 200: { description: 'Validation result', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationResponse' } } } } }
      }
    },
    '/api/lxc/list': {
      get: {
        tags: ['LXC'],
        summary: 'List LXC containers',
        responses: { 200: { description: 'Container list', content: { 'application/json': { schema: { $ref: '#/components/schemas/LxcListResponse' } } } } }
      }
    },
    '/api/lxc/{id}/status': {
      get: {
        tags: ['LXC'],
        summary: 'Get one container status',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Container status', content: { 'application/json': { schema: { $ref: '#/components/schemas/LxcStatusResponse' } } } } }
      }
    },
    '/api/lxc/{id}/start': {
      post: {
        tags: ['LXC'],
        summary: 'Start one container',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Start result', content: { 'application/json': { schema: { $ref: '#/components/schemas/LxcActionResponse' } } } } }
      }
    },
    '/api/lxc/{id}/stop': {
      post: {
        tags: ['LXC'],
        summary: 'Stop one container',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Stop result', content: { 'application/json': { schema: { $ref: '#/components/schemas/LxcActionResponse' } } } } }
      }
    },
    '/api/backups': {
      get: {
        tags: ['Backups'],
        summary: 'List backup archives',
        responses: { 200: { description: 'Backup list', content: { 'application/json': { schema: { $ref: '#/components/schemas/BackupListResponse' } } } } }
      }
    },
    '/api/backups/trigger/{vmid}': {
      post: {
        tags: ['Backups'],
        summary: 'Trigger a backup',
        parameters: [{ name: 'vmid', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Backup result', content: { 'application/json': { schema: { $ref: '#/components/schemas/BackupTriggerResponse' } } } } }
      }
    },
    '/api/usbip/devices': {
      get: {
        tags: ['USB/IP'],
        summary: 'List local USB/IP devices',
        responses: { 200: { description: 'USB/IP device list', content: { 'application/json': { schema: { $ref: '#/components/schemas/UsbipDevicesResponse' } } } } }
      }
    },
    '/api/usbip/capabilities': {
      get: {
        tags: ['USB/IP'],
        summary: 'Get USB/IP capability flags',
        responses: { 200: { description: 'USB/IP capabilities', content: { 'application/json': { schema: { $ref: '#/components/schemas/UsbipCapabilitiesResponse' } } } } }
      }
    },
    '/api/usbip/ports': {
      get: {
        tags: ['USB/IP'],
        summary: 'List imported USB/IP ports',
        responses: { 200: { description: 'USB/IP port list', content: { 'application/json': { schema: { $ref: '#/components/schemas/UsbipPortsResponse' } } } } }
      }
    },
    '/api/usbip/remote/{host}/devices': {
      get: {
        tags: ['USB/IP'],
        summary: 'List devices exported by a remote host',
        parameters: [{ name: 'host', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Remote USB/IP device list', content: { 'application/json': { schema: { $ref: '#/components/schemas/UsbipRemoteDevicesResponse' } } } } }
      }
    },
    '/api/usbip/bind': {
      post: {
        tags: ['USB/IP'],
        summary: 'Bind a local USB device',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BusidRequest' } } } },
        responses: { 200: { description: 'Bind result', content: { 'application/json': { schema: { $ref: '#/components/schemas/OperationResult' } } } } }
      }
    },
    '/api/usbip/unbind': {
      post: {
        tags: ['USB/IP'],
        summary: 'Unbind a local USB device',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BusidRequest' } } } },
        responses: { 200: { description: 'Unbind result', content: { 'application/json': { schema: { $ref: '#/components/schemas/OperationResult' } } } } }
      }
    },
    '/api/usbip/connect': {
      post: {
        tags: ['USB/IP'],
        summary: 'Attach a remote USB/IP device',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ConnectRequest' } } }
        },
        responses: { 200: { description: 'Connect result', content: { 'application/json': { schema: { $ref: '#/components/schemas/OperationResult' } } } } }
      }
    },
    '/api/usbip/disconnect': {
      post: {
        tags: ['USB/IP'],
        summary: 'Detach an imported USB/IP device',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PortRequest' } } } },
        responses: { 200: { description: 'Disconnect result', content: { 'application/json': { schema: { $ref: '#/components/schemas/OperationResult' } } } } }
      }
    },
    '/api/discovery/peers': {
      get: {
        tags: ['Discovery'],
        summary: 'Discover peers on the LAN',
        responses: { 200: { description: 'Discovery snapshot', content: { 'application/json': { schema: { $ref: '#/components/schemas/DiscoveryResponse' } } } } }
      }
    },
    '/api/virtual-bridges': {
      get: {
        tags: ['Virtual Bridges'],
        summary: 'List virtual media bridge profiles',
        responses: { 200: { description: 'Bridge catalog', content: { 'application/json': { schema: { $ref: '#/components/schemas/VirtualBridgesResponse' } } } } }
      }
    },
    '/api/virtual-bridges/{id}': {
      get: {
        tags: ['Virtual Bridges'],
        summary: 'Inspect a virtual bridge profile',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Bridge profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/VirtualBridgeResponse' } } } } }
      }
    },
    '/api/virtual-bridges/{id}/{action}': {
      post: {
        tags: ['Virtual Bridges'],
        summary: 'Run a bridge action',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'action', in: 'path', required: true, schema: { type: 'string', enum: ['start', 'stop', 'restart', 'status'] } }
        ],
        responses: { 200: { description: 'Bridge action result', content: { 'application/json': { schema: { $ref: '#/components/schemas/BridgeActionResponse' } } } } }
      }
    }
  },
  components: {
    schemas: {
      HealthResponse: {
        type: 'object',
        required: ['status', 'version', 'uptime', 'components'],
        properties: {
          status: { type: 'string', example: 'ok' },
          version: { type: 'string' },
          uptime: { type: 'number' },
          components: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                available: { type: 'boolean' },
                binary: { type: 'string' }
              }
            }
          }
        }
      },
      SystemResponse: {
        type: 'object',
        properties: {
          hostname: { type: 'string' },
          platform: { type: 'string' },
          uptime: { type: 'number' },
          loadavg: { type: 'array', items: { type: 'number' } },
          mem: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              free: { type: 'number' }
            }
          },
          cpus: { type: 'number' }
        }
      },
      NetworkResponse: {
        type: 'object',
        properties: {
          bindHost: { type: 'string' },
          port: { type: 'number' },
          hostname: { type: 'string' },
          interfaces: { type: 'array', items: { type: 'object', additionalProperties: true } }
        }
      },
      Settings: {
        type: 'object',
        properties: {
          bindHost: { type: 'string' },
          port: { type: 'number' },
          corsAllowedOrigins: { type: 'string' },
          usbipBin: { type: 'string' },
          apiRateLimit: { type: 'number' },
          mutationRateLimit: { type: 'number' },
          mdnsServiceType: { type: 'string' },
          logRequests: { type: 'boolean' }
        }
      },
      SettingsSnapshot: {
        type: 'object',
        properties: {
          settings: { $ref: '#/components/schemas/Settings' },
          schema: { type: 'object', additionalProperties: true },
          configFile: { type: 'string' }
        }
      },
      SettingsSaveResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          saved: { $ref: '#/components/schemas/Settings' },
          configFile: { type: 'string' }
        }
      },
      ValidationResponse: {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          errors: { type: 'object', additionalProperties: { type: 'string' } }
        }
      },
      LxcListResponse: {
        type: 'object',
        properties: {
          containers: { type: 'array', items: { type: 'object', additionalProperties: true } }
        }
      },
      LxcStatusResponse: {
        type: 'object',
        properties: {
          vmid: { type: 'string' },
          status: { type: 'string' },
          name: { type: 'string' }
        }
      },
      LxcActionResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          vmid: { type: 'string' },
          action: { type: 'string' },
          output: { type: 'string' }
        }
      },
      BackupListResponse: {
        type: 'object',
        properties: {
          backups: { type: 'array', items: { type: 'object', additionalProperties: true } }
        }
      },
      BackupTriggerResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          vmid: { type: 'string' },
          mode: { type: 'string' },
          output: { type: 'string' }
        }
      },
      UsbipDevicesResponse: {
        type: 'object',
        properties: {
          devices: { type: 'array', items: { type: 'object', additionalProperties: true } },
          raw: { type: 'string' },
          warning: { type: 'string', nullable: true }
        }
      },
      UsbipCapabilitiesResponse: {
        type: 'object',
        properties: {
          server: { type: 'boolean' },
          client: { type: 'boolean' },
          simultaneous: { type: 'boolean' },
          unlimitedPeers: { type: 'boolean' },
          unlimitedDevices: { type: 'boolean' },
          peerLimit: { type: ['integer', 'null'] },
          deviceLimit: { type: ['integer', 'null'] },
          apiRateLimit: { type: 'integer' },
          mutationRateLimit: { type: 'integer' }
        }
      },
      UsbipPortsResponse: {
        type: 'object',
        properties: {
          ports: { type: 'array', items: { type: 'object', additionalProperties: true } },
          raw: { type: 'string' },
          warning: { type: 'string', nullable: true }
        }
      },
      UsbipRemoteDevicesResponse: {
        type: 'object',
        properties: {
          host: { type: 'string' },
          devices: { type: 'array', items: { type: 'object', additionalProperties: true } },
          raw: { type: 'string' },
          warning: { type: 'string', nullable: true }
        }
      },
      BusidRequest: {
        type: 'object',
        required: ['busid'],
        properties: {
          busid: { type: 'string' }
        }
      },
      PortRequest: {
        type: 'object',
        required: ['port'],
        properties: {
          port: { type: 'string' }
        }
      },
      ConnectRequest: {
        type: 'object',
        required: ['host', 'busid'],
        properties: {
          host: { type: 'string' },
          busid: { type: 'string' }
        }
      },
      OperationResult: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          output: { type: 'string' },
          host: { type: 'string' },
          busid: { type: 'string' },
          port: { type: 'string' }
        }
      },
      DiscoveryResponse: {
        type: 'object',
        properties: {
          bindHost: { type: 'string' },
          port: { type: 'integer' },
          hostname: { type: 'string' },
          peerCount: { type: 'integer' },
          providers: { type: 'array', items: { type: 'object', additionalProperties: true } },
          peers: { type: 'array', items: { type: 'object', additionalProperties: true } }
        }
      },
      VirtualBridgesResponse: {
        type: 'object',
        properties: {
          platform: { type: 'string' },
          bridges: { type: 'array', items: { type: 'object', additionalProperties: true } }
        }
      },
      VirtualBridgeResponse: {
        type: 'object',
        properties: {
          bridge: { type: 'object', additionalProperties: true }
        }
      },
      BridgeActionResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          id: { type: 'string' },
          action: { type: 'string' },
          output: { type: 'string' },
          command: { type: 'string' }
        }
      }
    }
  }
};

module.exports = {
  OPENAPI_SPEC
};
