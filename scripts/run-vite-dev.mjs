import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const appDir = join(repoRoot, 'apps', 'windows');
const viteBin = join(appDir, 'node_modules', 'vite', 'bin', 'vite.js');
const args = process.argv.slice(2);
const viteArgs = args.length > 0 ? args : ['--host', '127.0.0.1'];

let shuttingDown = false;

const vite = spawn(process.execPath, [viteBin, ...viteArgs], {
  cwd: appDir,
  stdio: 'inherit',
  windowsHide: true,
});

function shutdown(signal) {
  shuttingDown = true;
  if (!vite.killed) {
    vite.kill(signal);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

vite.on('exit', (code, signal) => {
  if (shuttingDown || signal) {
    process.exit(0);
  }

  const unsignedCode = code == null ? 0 : code >>> 0;
  if (unsignedCode === 4294967295 || unsignedCode === 3221225786) {
    process.exit(0);
  }

  process.exit(code ?? 1);
});
