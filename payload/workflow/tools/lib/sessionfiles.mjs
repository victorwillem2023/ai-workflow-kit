// Where Claude Code keeps its own records of this project's chats (~/.claude/projects/<the folder's path, every ":", "\" and
// "/" a "-">, and the session folders next to it), for the tools that count what the AI used: workflow/tools/sessioncost.mjs by
// day and command, workflow/tools/shipped.mjs for one feature's session folder. Reads only.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The record files (.jsonl) of the project whose main folder is `main`, written to since `since` (a Date; all without one). */
export function recordFiles(main, since = null) {
  const records = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
  const name = main.replace(/[:\\/]/g, '-').toLowerCase();
  const dirs = existsSync(records) ? readdirSync(records).filter((d) => d.toLowerCase() === name || d.toLowerCase().startsWith(`${name}-`)) : [];
  return dirs.flatMap((d) => readdirSync(join(records, d), { recursive: true }).map((f) => join(records, d, String(f)))).filter((f) => f.endsWith('.jsonl'))
    // a record not written to since then holds nothing newer
    .filter((f) => { try { return !since || statSync(f).mtime >= since; } catch { return false; } });
}
