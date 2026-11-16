#!/usr/bin/env node
// The kit's stop points, held by Claude Code hooks instead of by the skills' wording alone (.claude/settings.local.json, hooks):
// a commit waits for the owner's own "done" and a push for the owner's own "push". The words are read from what the owner types
// (the UserPromptSubmit hook sees only the person's own message, never the agent's), so an agent cannot say them for the owner.
//   node workflow/scripts/stop-points.mjs --prompt   (UserPromptSubmit) the owner said done / commit / push: noted, with the time
//   node workflow/scripts/stop-points.mjs --tool     (PreToolUse, Bash) a commit or push without that word in the last hours: refused
//   node workflow/scripts/stop-points.mjs --status   what is noted now
// The note lives in git's own folder (shared by the main folder and every session folder), never in the project's files.
// A refused command says why, so the agent stops and asks; the owner's own terminal is never held.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** How long the owner's word holds: a "done" said this morning does not commit tonight's next feature. */
export const HOLDS_MS = 3 * 60 * 60 * 1000;

/** What the owner's message allows: { commit, push } (true when it says so, and does not say "not"). */
export function saidInPrompt(prompt) {
  const text = String(prompt ?? '').toLowerCase();
  const no = (word) => new RegExp(`\\b(?:not|don'?t|do not|never|no)\\b[^.!?\\n]{0,20}\\b${word}`).test(text);
  const commit = /\b(?:done|finish(?:ed)? it|commit(?: it| this| and push)?|ship it|land it|merge it)\b/.test(text) && !no('(?:done|finish|commit|ship|land|merge)')
    && !/\b(?:not|isn'?t|aren'?t) (?:yet )?done\b|\bnot finished\b/.test(text);
  const push = /\bpush(?:ed)?\b/.test(text) && !no('push');
  return { commit, push };
}

/** What a shell command would do that waits for the owner: 'commit', 'push' or null. */
export function needsWord(command) {
  const c = String(command ?? '');
  // git's own subcommand, after any options before it (git -C <dir> -c user.name=x commit), not a word in a path or a message
  const sub = (name) => new RegExp(`(?:^|[\\s;&|(])git(?:\\s+(?:-[Cc]\\s+\\S+|--?[\\w-]+(?:=\\S+)?))*\\s+${name}(?![\\w-])`).test(c);
  if (sub('push') || /session\.mjs\b[^|;&\n]*--push\b/.test(c)) return 'push';
  if (sub('commit') || /session\.mjs\b[^|;&\n]*--(?:finish|merge|commit-notes)\b/.test(c)) return 'commit';
  return null;
}

/** The verdict on a command, given what the owner said and when: { ok, why }. */
export function verdict(command, noted, now = Date.now()) {
  const word = needsWord(command);
  if (!word) return { ok: true };
  const at = noted?.[word];
  if (at && now - at <= HOLDS_MS) return { ok: true };
  const say = word === 'push' ? '"push"' : '"done" (or "commit", "finish it")';
  return { ok: false, why: `Stop point: this ${word === 'push' ? 'push' : 'commit'} waits for the owner. They have not said ${say} in this chat in the last ${HOLDS_MS / 3600000} hours. Hand the change over as the skill says and ask; do not try another way to ${word}. (workflow/scripts/stop-points.mjs)` };
}

const noteFile = (cwd) => {
  try { return join(resolve(cwd, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()), 'workflow-said.json'); } catch { return null; }
};
const readNote = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const mode = process.argv[2];
  let input = {};
  try { input = mode === '--status' ? {} : JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* no input: nothing to hold */ }
  // the folder Claude Code says the command runs in, else the hook's own (a path it cannot use is no reason to let a commit through)
  const file = (input.cwd && existsSync(input.cwd) ? noteFile(input.cwd) : null) ?? noteFile(process.cwd());
  if (!file) process.exit(0); // not in a git repository: nothing to hold
  const noted = existsSync(file) ? readNote(file) : {};
  if (mode === '--prompt') {
    const said = saidInPrompt(input.prompt);
    if (said.commit || said.push) writeFileSync(file, `${JSON.stringify({ ...noted, ...(said.commit ? { commit: Date.now() } : {}), ...(said.push ? { push: Date.now() } : {}) })}\n`);
    process.exit(0);
  }
  if (mode === '--tool') {
    const v = verdict(input.tool_input?.command, noted);
    if (!v.ok) { process.stderr.write(`${v.why}\n`); process.exit(2); }
    process.exit(0);
  }
  if (mode === '--status') {
    const age = (t) => (t ? `${Math.round((Date.now() - t) / 60000)} minutes ago` : 'not said');
    console.log(`commit: ${age(noted.commit)}; push: ${age(noted.push)} (each holds ${HOLDS_MS / 3600000} hours)`);
    process.exit(0);
  }
  console.error('usage: node workflow/scripts/stop-points.mjs --prompt | --tool | --status (the hooks call it with Claude Code\'s JSON on stdin)');
  process.exit(1);
}
