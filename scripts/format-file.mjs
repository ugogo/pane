#!/usr/bin/env node
/**
 * Format-on-edit hook for AI agents.
 *
 * Wired up as a Claude Code `PostToolUse` hook (see .claude/settings.json):
 * after the agent writes or edits a file, this formats just that file so
 * agent-authored code lands in the same shape as a human's format-on-save.
 *
 * Reads the hook payload as JSON on stdin, formats the touched file with
 * Prettier (web assets) or rustfmt (.rs), and always exits 0 so a formatting
 * hiccup never blocks the agent.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function main() {
  let payload;
  try {
    payload = readFileSync(0, 'utf8');
  } catch {
    return; // no stdin — nothing to do
  }

  let filePath;
  try {
    filePath = JSON.parse(payload)?.tool_input?.file_path;
  } catch {
    return;
  }
  if (!filePath) return;

  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.rs') {
    spawnSync('rustfmt', ['--edition', '2021', filePath], {
      stdio: 'ignore',
    });
    return;
  }

  // Everything Prettier understands; it consults .prettierignore for us.
  const prettier = await import('prettier').then((m) => m.default ?? m);
  const info = await prettier.getFileInfo(filePath, {
    ignorePath: path.join(process.cwd(), '.prettierignore'),
    resolveConfig: true,
  });
  if (info.ignored || !info.inferredParser) return;

  const source = readFileSync(filePath, 'utf8');
  const config = await prettier.resolveConfig(filePath);
  const formatted = await prettier.format(source, {
    ...config,
    filepath: filePath,
  });
  if (formatted !== source) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(filePath, formatted);
  }
}

main().catch(() => {
  // Never fail the agent's edit because formatting tripped.
  process.exit(0);
});
