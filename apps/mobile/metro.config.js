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

// Watching the whole workspace pulls in the Rust build dir. On Windows (no
// Watchman) Metro's fallback watcher crawls `target/debug/deps/` and crashes
// with ENOENT when a transient `rustc…` temp file disappears mid-walk. Exclude
// Rust/Tauri build artifacts from the crawl + watch entirely.
config.resolver.blockList = [
  /.*[\\/]tauri[\\/]target[\\/].*/,
  /.*[\\/]src-tauri[\\/]target[\\/].*/,
];

module.exports = config;
