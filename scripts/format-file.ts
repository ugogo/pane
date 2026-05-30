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
 *
 * Run directly with `node scripts/format-file.ts` — Node strips the TypeScript
 * types natively (no build step).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

interface HookPayload {
  tool_input?: { file_path?: string };
}

async function main(): Promise<void> {
  let payload: string;
  try {
    payload = readFileSync(0, 'utf8');
  } catch {
    return; // no stdin — nothing to do
  }

  let filePath: string | undefined;
  try {
    filePath = (JSON.parse(payload) as HookPayload).tool_input?.file_path;
  } catch {
    return;
  }
  if (!filePath) return;

  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.rs') {
    spawnSync('rustfmt', ['--edition', '2021', filePath], { stdio: 'ignore' });
    return;
  }

  // Everything Prettier understands; it consults .prettierignore for us.
  const prettier = await import('prettier');
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
    writeFileSync(filePath, formatted);
  }
}

main().catch(() => {
  // Never fail the agent's edit because formatting tripped.
  process.exit(0);
});
