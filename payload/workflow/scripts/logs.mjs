#!/usr/bin/env node
// A session's server log, readable. `session.mjs --serve <topic>` writes the dev server's output to a file outside the folder;
// this shows it one line per event: the time, the level, the message, the request it belongs to and its fields, instead of raw
// JSON. --ref shows one request's lines only (the "reference" a person sees in an error, src/server/errors.ts), --follow keeps
// showing new lines as they come.
//   node workflow/scripts/logs.mjs <topic> [--follow] [--ref <reference>] [--level warn]     a session's server
//   node workflow/scripts/logs.mjs <file> ...                                                  any log file
//   node workflow/scripts/logs.mjs                                                             which logs there are
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, watchFile } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LEVELS = ['debug', 'info', 'warn', 'error'];
const SHOWN_ALREADY = new Set(['time', 'level', 'msg', 'requestId', 'method', 'path', 'error', 'causes', 'app', 'version']);

/** One log line as a person reads it; a line that is not JSON (the dev server's own words) as it is. Null when filtered out. */
export function formatLine(raw, { ref, level } = {}) {
  let e;
  try { e = JSON.parse(raw); } catch { return ref || level ? null : raw; }
  if (!e || typeof e !== 'object' || !e.msg) return ref || level ? null : raw;
  if (ref && !String(e.requestId ?? '').startsWith(ref)) return null;
  if (level && LEVELS.indexOf(e.level) < LEVELS.indexOf(level)) return null;
  const time = String(e.time ?? '').slice(11, 19);
  const fields = Object.entries(e).filter(([k, v]) => !SHOWN_ALREADY.has(k) && v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ');
  // the error, and what caused it: inside the error (cause), or as the `causes` list src/server/errors.ts logs
  const causes = Array.isArray(e.causes) ? e.causes.map((c) => `\n    caused by ${c.kind ?? 'Error'}${c.code ? ` (${c.code})` : ''}: ${c.message ?? ''}`).join('') : '';
  const err = `${e.error ? `\n    ${errorText(e.error, '    ')}` : ''}${causes}`;
  return `${time} ${String(e.level ?? '').toUpperCase().padEnd(5)} ${e.msg}${e.requestId ? `  ref ${String(e.requestId).slice(0, 8)}` : ''}${fields ? `  ${fields}` : ''}${err}`;
}
function errorText(err, indent) {
  const head = `${err.kind ?? 'Error'}${err.code ? ` (${err.code})` : ''}: ${err.message ?? ''}${err.at?.[0] ? ` ${err.at[0]}` : ''}`;
  return err.cause ? `${head}\n${indent}caused by ${errorText(err.cause, `${indent}  `)}` : head;
}

/** Where `session.mjs --serve <topic>` writes a session's server log (the same name it uses). */
export function logFileOf(topic, prefix) {
  return join(tmpdir(), `${prefix}-${topic}-dev.log`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const what = argv.find((a, i) => !a.startsWith('--') && !['--ref', '--level'].includes(argv[i - 1]));
  const main = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' }).split('\n')[0].replace(/^worktree /, '');
  let prefix = basename(main);
  try { prefix = JSON.parse(readFileSync(join(main, 'workflow/config.json'), 'utf8')).session?.prefix ?? prefix; } catch { /* the folder's name */ }
  if (!what) {
    const logs = readdirSync(tmpdir()).filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('-dev.log'));
    console.log(logs.length ? `Session logs: ${logs.map((f) => f.slice(prefix.length + 1, -'-dev.log'.length)).join(', ')} (node workflow/scripts/logs.mjs <topic> --follow)` : 'No session server has written a log yet (node workflow/scripts/session.mjs --serve <topic> starts one).');
    process.exit(0);
  }
  const file = existsSync(what) ? what : logFileOf(what, prefix);
  if (!existsSync(file)) { console.error(`No log at ${file}: start the server with node workflow/scripts/session.mjs --serve ${what}`); process.exit(1); }
  const filter = { ref: opt('--ref'), level: opt('--level') };
  let shown = 0;
  const show = () => {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const l of lines.slice(shown, lines.length - 1)) { const out = formatLine(l, filter); if (out !== null) console.log(out); }
    shown = Math.max(shown, lines.length - 1);
  };
  show();
  if (argv.includes('--follow')) watchFile(file, { interval: 500 }, () => { if (statSync(file).size < 1) shown = 0; show(); });
}
