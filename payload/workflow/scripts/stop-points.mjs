#!/usr/bin/env node
// The kit's stop points, held by Claude Code hooks instead of by the skills' wording alone (.claude/settings.local.json, hooks):
// a commit waits for the owner's own "done" and a push for the owner's own "push". The words are read from what the owner types
// (the UserPromptSubmit hook sees only the person's own message, never the agent's), so an agent cannot say them for the owner.
//   node workflow/scripts/stop-points.mjs --prompt   (UserPromptSubmit) the owner said done / commit / push: noted, with the time
//   node workflow/scripts/stop-points.mjs --tool     (PreToolUse, Bash) a commit or push without that word in the last hours: refused
//   node workflow/scripts/stop-points.mjs --status   what is noted now
// The note lives in git's own folder, never in the project's files, one entry per chat (Claude Code's session id): a "done" in
// one chat does not commit another chat's session folder, and a "wait" or "not yet" takes the chat's word back.
// A refused command says why, so the agent stops and asks; the owner's own terminal is never held.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** How long the owner's word holds: a "done" said this morning does not commit tonight's next feature. */
export const HOLDS_MS = 3 * 60 * 60 * 1000;

// A sentence that asks, or says "when you are done", is not the owner's word; a short yes is (the skills ask and wait for it:
// /setup's "on yes, one commit", /ship's subject). "push" counts only as git's push: on its own, or of it, the branch, the change.
const QUESTION = /^(?:what|how|why|is|are|was|does|do|did|can|could|should|would|will|when|where|which|who|have|has)\b/;
const CONDITION = /\b(?:if|when|whenever|once|after|before|until|unless|as soon as)\b/;
const NOT = /\b(?:not|don'?t|do not|never|no|isn'?t|aren'?t|wait|hold on|stop)\b/;
const YES = /^(?:y|yes|yep|yeah|ok|okay|sure|go|go ahead|do it|please do|sounds good|lgtm|approved|yes please|ok go)(?:\s*,?\s*(?:please|thanks|thank you|go ahead|do it|commit(?: it)?))?$/;
const DONE = /\b(?:done|finish(?:ed)? it|commit(?: it| this| that| them| the change| the work)?|ship it|land it|merge it)\b(?!\s+(?:hook|message|messages|subject|history|log|hash|checklist|list|column|criteria|state|rule|rules|step)\b)/;
const PUSH = /\bpush(?:ed)?\b(?=\s*$|\s*,|\s+(?:it|this|that|them|now|please|too|as well|and\b|the (?:branch|change|changes|commit|commits|work|code|session|pr)\b|to (?:origin|the remote|remote|main|github|the branch)\b))/;
const sentences = (text) => text.split(/(?<=[.!?;\n])/).map((s) => s.trim()).filter(Boolean);
const saidIn = (sentence, word) => {
  const plain = sentence.replace(/[.!;\s]+$/, '');
  if (sentence.endsWith('?') || QUESTION.test(plain)) return false;
  const at = plain.search(word);
  if (at < 0) return false;
  const before = plain.slice(0, at);
  return !CONDITION.test(before) && !NOT.test(before.split(',').pop() ?? '')
    && !/\b(?:not|isn'?t|aren'?t) (?:yet )?done\b|\bnot finished\b/.test(plain);
};

/** What the owner's message allows: { commit, push, clear } (clear: they said wait or not yet, which takes an earlier word back). */
export function saidInPrompt(prompt) {
  const text = String(prompt ?? '').toLowerCase().replace(/[‘’]/g, "'").trim();
  const parts = sentences(text);
  const commit = YES.test(text.replace(/[.!\s]+$/, '')) || parts.some((s) => saidIn(s, DONE));
  const push = parts.some((s) => saidIn(s, PUSH));
  const clear = !commit && !push && /^(?:wait|stop|hold on|not yet|not done|no\b|don'?t (?:commit|push)|do not (?:commit|push))/.test(text);
  return { commit, push, clear };
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
/**
 * The owner's own record, which no agent writes whatever the owner said: a shell command that writes docs/company/SIGNOFFS.md or
 * names the sign-off key (the settings deny only the Edit and Write tools there). Its reason, or null.
 */
export function ownersOnly(command) {
  const c = String(command ?? '');
  if (/workflow-signoff\.key/i.test(c)) return 'the sign-off key belongs to `npm run signoff` alone';
  // (a redirect into a file; `2>/dev/null` and `2>&1` write nothing there)
  const writes = /(?:(?<![\d&])>>?(?!\s*&|\s*\/dev\/null)|\btee\b|\bsed\s+(?:-\w*i|--in-place)|\bperl\s+-\w*i|\b(?:cp|mv|rm|truncate|dd|install|ln)\b|\b(?:write|append)File(?:Sync)?\b|\bcreateWriteStream\b|\bopen\s*\([^)]*['"][wa]|\bSet-Content\b|\bAdd-Content\b|\bOut-File\b|\bgit\s+(?:checkout|restore|apply|am)\b)/;
  if (/SIGNOFFS\.md/i.test(c) && writes.test(c)) return 'docs/company/SIGNOFFS.md is written only by `npm run signoff`, in the owner\'s own terminal';
  return null;
}

export function verdict(command, noted, now = Date.now()) {
  const mine = ownersOnly(command);
  if (mine) return { ok: false, why: `Refused: ${mine}. A sign-off is the owner reading the change; tell them it waits for them (workflow/guides/SENSITIVE.md). (workflow/scripts/stop-points.mjs)` };
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

/** Whose word it is: the chat (Claude Code's session id), else the folder; one chat's "done" never commits another chat's work. */
export function noteKey(input, cwd) {
  if (input?.session_id) return `session:${input.session_id}`;
  try {
    return `folder:${execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()}`;
  } catch { return `folder:${resolve(cwd)}`; }
}

/** The note after the owner's message: their words set, a "wait" clears, and notes older than the hold are dropped. */
export function nextNote(all, key, said, now = Date.now()) {
  const kept = Object.fromEntries(Object.entries(all ?? {}).filter(([, v]) => v && typeof v === 'object'
    && Math.max(v.commit ?? 0, v.push ?? 0) > now - HOLDS_MS));
  const mine = said.clear ? {} : { ...(kept[key] ?? {}), ...(said.commit ? { commit: now } : {}), ...(said.push ? { push: now } : {}) };
  if (Object.keys(mine).length) kept[key] = mine; else delete kept[key];
  return kept;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const mode = process.argv[2];
  let input = {};
  try { input = mode === '--status' ? {} : JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* no input: nothing to hold */ }
  // the folder Claude Code says the command runs in, else the hook's own (a path it cannot use is no reason to let a commit through)
  const cwd = input.cwd && existsSync(input.cwd) ? input.cwd : process.cwd();
  const file = noteFile(cwd) ?? noteFile(process.cwd());
  if (!file) process.exit(0); // not in a git repository: nothing to hold
  const all = existsSync(file) ? readNote(file) : {};
  const key = noteKey(input, cwd);
  if (mode === '--prompt') {
    const said = saidInPrompt(input.prompt);
    if (said.commit || said.push || said.clear) writeFileSync(file, `${JSON.stringify(nextNote(all, key, said))}\n`);
    process.exit(0);
  }
  if (mode === '--tool') {
    const v = verdict(input.tool_input?.command, all[key]);
    if (!v.ok) { process.stderr.write(`${v.why}\n`); process.exit(2); }
    process.exit(0);
  }
  if (mode === '--status') {
    const age = (t) => (t ? `${Math.round((Date.now() - t) / 60000)} minutes ago` : 'not said');
    const rows = Object.entries(all).map(([k, v]) => `${k}: commit ${age(v?.commit)}; push ${age(v?.push)}`);
    console.log(rows.length ? `${rows.join('\n')}\n(each holds ${HOLDS_MS / 3600000} hours, for its own chat only)` : 'nothing noted');
    process.exit(0);
  }
  console.error('usage: node workflow/scripts/stop-points.mjs --prompt | --tool | --status (the hooks call it with Claude Code\'s JSON on stdin)');
  process.exit(1);
}
