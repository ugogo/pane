// Metro config for the Pane Windows frontend living inside an npm workspace.
const { getDefaultConfig } = require('expo/metro-config');
const { withTamagui } = require('@tamagui/metro-plugin');
const fs = require('fs');
const path = require('path');
const appPackage = require('./package.json');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const workspacePackages = Object.keys({
  ...appPackage.dependencies,
  ...appPackage.devDependencies,
})
  .filter((name) => name.startsWith('@pane/'))
  .map((name) =>
    path.resolve(workspaceRoot, 'packages', name.slice('@pane/'.length)),
  )
  .filter((packagePath) => fs.existsSync(packagePath));

const config = getDefaultConfig(projectRoot, { isCSSEnabled: true });

if (!config.resolver.assetExts.includes('woff2')) {
  config.resolver.assetExts.push('woff2');
}

config.watchFolders = workspacePackages;
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Exclude Rust/Tauri build artifacts from the Metro watcher.
config.resolver.blockList = [
  /.*[\\/]tauri[\\/]target[\\/].*/,
  /.*[\\/]src-tauri[\\/]target[\\/].*/,
];

module.exports = withTamagui(config);
