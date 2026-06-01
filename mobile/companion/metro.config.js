// Metro config for the Expo companion living inside an npm workspace.
//
// The companion imports `@pane/protocol` (plain .ts source at the repo root).
// Metro doesn't follow hoisted workspace `node_modules` on its own, so we widen
// the watch + resolution roots: watch the whole workspace, and resolve modules
// from the app first, then the hoisted root. `../..` is the workspace root in
// both the current (`mobile/companion`) and future (`apps/mobile`) layouts.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
