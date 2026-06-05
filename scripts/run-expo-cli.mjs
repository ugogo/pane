#!/usr/bin/env node
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const requireFromCwd = createRequire(
  pathToFileURL(path.join(process.cwd(), 'package.json')),
);

let expoCli;

try {
  expoCli = requireFromCwd.resolve('expo/bin/cli');
} catch {
  console.error('Expo CLI not installed. Run npm install first.');
  process.exit(1);
}

process.argv = [process.argv[0], expoCli, ...process.argv.slice(2)];
requireFromCwd(expoCli);
