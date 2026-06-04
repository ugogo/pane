// Metro config for the Pane Windows frontend living inside an npm workspace.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot, { isCSSEnabled: true });

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Exclude Rust/Tauri build artifacts from the Metro watcher.
config.resolver.blockList = [
  /.*[\\/]tauri[\\/]target[\\/].*/,
  /.*[\\/]src-tauri[\\/]target[\\/].*/,
];

module.exports = config;
