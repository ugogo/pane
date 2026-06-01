#!/usr/bin/env node
/**
 * Regenerate tracked Tauri artifacts under src-tauri/gen/schemas/.
 *
 * `tauri_build` (via `cargo build`) merges src-tauri/capabilities/*.json into
 * capabilities.json and refreshes ACL/schema JSON. Run after editing capability
 * manifests and commit the updated gen output with the feature.
 */
import { spawnSync } from 'node:child_process';

const cargo = spawnSync(
  'cargo',
  ['build', '--manifest-path', 'src-tauri/Cargo.toml'],
  { stdio: 'inherit' },
);

if (cargo.status !== 0) {
  process.exit(cargo.status ?? 1);
}

if (process.argv.includes('--check')) {
  const diff = spawnSync(
    'git',
    ['diff', '--exit-code', '--', 'src-tauri/gen/schemas/'],
    { stdio: 'inherit' },
  );
  process.exit(diff.status ?? 1);
}
