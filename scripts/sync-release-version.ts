import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function replaceFirst(
  path: string,
  pattern: RegExp,
  replacement: (...groups: string[]) => string,
): void {
  const raw = readFileSync(path, 'utf8');
  let replaced = false;
  const updated = raw.replace(pattern, (...args: string[]) => {
    replaced = true;
    return replacement(...args.slice(1, -2));
  });

  if (!replaced) {
    fail(`could not update ${path}`);
  }

  writeFileSync(path, updated);
}

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`expected stable semver x.y.z, got '${version ?? ''}'`);
}

replaceFirst(
  'src-tauri/Cargo.toml',
  /(^version\s*=\s*")[^"]*(")/m,
  (before, after) => `${before}${version}${after}`,
);
replaceFirst(
  'src-tauri/tauri.conf.json',
  /("version"\s*:\s*")[^"]*(")/,
  (before, after) => `${before}${version}${after}`,
);
replaceFirst(
  'src-tauri/Cargo.lock',
  /(name = "pane"\r?\nversion = ")[^"]*(")/,
  (before, after) => {
    return `${before}${version}${after}`;
  },
);

console.log(`synced Rust/Tauri versions to ${version}`);
