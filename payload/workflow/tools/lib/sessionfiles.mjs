// Where Claude Code keeps its own records of this project's chats (~/.claude/projects/<the folder's path, every ":", "\" and
// "/" a "-">, and the session folders next to it), for the tools that count what the AI used: workflow/tools/sessioncost.mjs by
// day and command, workflow/tools/shipped.mjs for one feature's session folder. Reads only.
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The list of session folders that are not next to the main folder (an orchestrator's own place for them): one path per line, in the main folder's .git. */
export const FOLDERS_FILE = 'kit-session-folders';
export function sessionFolders(main) {
  try { return readFileSync(join(main, '.git', FOLDERS_FILE), 'utf8').split(/\r?\n/).filter(Boolean); } catch { return []; }
}
/** Notes a session folder that is somewhere else, once, so what the AI used there is still counted after the folder is gone. */
export function noteSessionFolder(main, dir) {
  try { if (!sessionFolders(main).includes(dir)) appendFileSync(join(main, '.git', FOLDERS_FILE), `${dir}\n`); } catch { /* a note is never a reason to fail */ }
}

/** The record files (.jsonl) of the project whose main folder is `main`, written to since `since` (a Date; all without one). */
export function recordFiles(main, since = null) {
  const records = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
  const asRecord = (dir) => dir.replace(/[:\\/]/g, '-').toLowerCase();
  const name = asRecord(main);
  // session folders an orchestrator keeps elsewhere, as --adopt noted them (also the finished ones, whose folders are gone)
  const far = new Set(sessionFolders(main).map(asRecord));
  const dirs = existsSync(records) ? readdirSync(records).filter((d) => d.toLowerCase() === name || d.toLowerCase().startsWith(`${name}-`) || far.has(d.toLowerCase())) : [];
  return dirs.flatMap((d) => readdirSync(join(records, d), { recursive: true }).map((f) => join(records, d, String(f)))).filter((f) => f.endsWith('.jsonl'))
    // a record not written to since then holds nothing newer
    .filter((f) => { try { return !since || statSync(f).mtime >= since; } catch { return false; } });
}
