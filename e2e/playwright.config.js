const { defineConfig } = require('./playwright');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:4199'
  },
  webServer: process.env.BASE_URL ? undefined : {
    command: 'cd .. && npm run build && PORT=4199 npm run serve',
    port: 4199,
    reuseExistingServer: false,
    timeout: 120000
  }
});
