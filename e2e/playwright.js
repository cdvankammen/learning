const { execSync } = require('child_process');
const path = require('path');

function resolvePlaywrightModule() {
  try {
    return require('@playwright/test');
  } catch (err) {
    const globalNodeModules = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(globalNodeModules, '@playwright/test'));
  }
}

module.exports = resolvePlaywrightModule();
