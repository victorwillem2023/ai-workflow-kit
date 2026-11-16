#!/usr/bin/env node
// The kit's stop points, held by Claude Code hooks instead of by the skills' wording alone (.claude/settings.local.json, hooks):
// a commit waits for the owner's own "done" and a push for the owner's own "push".
//   node workflow/scripts/stop-points.mjs --prompt   (UserPromptSubmit) the owner said done / commit / push: noted, with the time
//   node workflow/scripts/stop-points.mjs --tool     (PreToolUse, Bash) a commit or push without that word in the last hours: refused
//   node workflow/scripts/stop-points.mjs --status   what is noted now
// Where the owner's words are read: in Claude Code, from the chat's own transcript (`transcript_path` in the hook's input: the
// person's messages as Claude Code recorded them, never a tool's output), so a file the agent writes cannot say "done" for the
// owner. The note in git's own folder (one entry per chat) is only for agents that give no transcript (OpenCode's plugin).
// What this is: a stop for an agent that would commit by mistake or take a shortcut, not a lock against one that sets out to
// get around it with the same shell; the lock for that is on GitHub (branch protection, a required review: workflow/tools/README.md).
// A refused command says why, so the agent stops and asks; the owner's own terminal is never held.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** How long the owner's word holds: a "done" said this morning does not commit tonight's next feature. */
export const HOLDS_MS = 3 * 60 * 60 * 1000;

// A sentence that asks, or says "when you are done", is not the owner's word; a short yes is (the skills ask and wait for it:
// /setup's "on yes, one commit", /ship's subject). The word counts only when nothing about other work follows it: "done, looks
// good" and "done, push it" count; "done reading the plan", "done with lunch" and "a commit button" do not. Quoted text never counts.
const QUESTION = /^(?:what|how|why|is|are|was|does|do|did|can|could|should|would|will|when|where|which|who|have|has)\b/;
const CONDITION = /\b(?:if|when|whenever|once|after|before|until|unless|as soon as)\b/;
const NOT = /\b(?:not|don'?t|do not|never|no|isn'?t|aren'?t|wait|hold on|stop)\b/;
const YES = /^(?:y|yes|yep|yeah|ok|okay|sure|go|go ahead|do it|please do|sounds good|lgtm|approved|yes please|ok go)(?:\s*,?\s*(?:please|thanks|thank you|go ahead|do it|commit(?: it)?))?$/;
const DONE = /\b(?:done|finish(?:ed)? it|commit(?: it| this| that| them| the change| the work)?|ship it|land it|merge it)\b/;
const PUSH = /\bpush(?:ed)?\b/;
// what may follow the word: nothing, a comma or a stop, small words, or the next stop point itself
const ENDS = /^\s*(?:(?:now|then|please|thanks|thank you|already|too|here|for real|it|this|that|them)\b[\s,]*)*(?:$|[,!:)–-]|and (?:commit|ship|push|merge|finish|land)\b|so (?:commit|ship|push)\b)/;
const PUSH_ENDS = /^\s*(?:(?:it|this|that|them|now|please|too|as well)\b[\s,]*)*(?:$|[,!:)–-]|and\b|the (?:branch|change|changes|commit|commits|work|code|session|pr)\b|to (?:origin|the remote|remote|main|github|the branch)\b)/;
const NOUN_BEFORE = /\b(?:a|an|the|this|that|my|your|each|every|last|first|one)\s*$/;
const unquoted = (text) => text.replace(/["“”][^"“”]*["“”]/g, ' ').replace(/(^|\s)'[^'\n]*'(?=[\s.,!?;]|$)/g, '$1 ');
const sentences = (text) => text.split(/(?<=[.!?;\n])/).map((s) => s.trim()).filter(Boolean);

function saidIn(sentence, word, ends) {
  const plain = sentence.replace(/[.!;\s]+$/, '');
  if (sentence.endsWith('?') || QUESTION.test(plain)) return false;
  const m = word.exec(plain);
  if (!m) return false;
  const before = plain.slice(0, m.index);
  if (/^commit/.test(m[0]) && NOUN_BEFORE.test(before)) return false; // "the commit", "a commit button": a thing, not the act
  return ends.test(plain.slice(m.index + m[0].length)) && !CONDITION.test(before) && !NOT.test(before.split(',').pop() ?? '')
    && !/\b(?:not|isn'?t|aren'?t) (?:yet )?done\b|\bnot finished\b/.test(plain);
}

/** What the owner's message allows: { commit, push, clear } (clear: they said wait or not yet, which takes an earlier word back). */
export function saidInPrompt(prompt) {
  const text = String(prompt ?? '').toLowerCase().replace(/[‘’]/g, "'").trim();
  const parts = sentences(unquoted(text));
  const commit = YES.test(text.replace(/[.!\s]+$/, '')) || parts.some((s) => saidIn(s, DONE, ENDS));
  const push = parts.some((s) => saidIn(s, PUSH, PUSH_ENDS));
  const clear = !commit && !push && /^(?:wait|stop|hold on|not yet|not done|no\b|don'?t (?:commit|push)|do not (?:commit|push))/.test(text);
  return { commit, push, clear };
}

/** What a shell command would do that waits for the owner: 'commit', 'push' or null. */
export function needsWord(command) {
  const c = String(command ?? '');
  // git's own subcommand, also by its full path (/usr/bin/git, git.exe) and after any options before it (git -C <dir> -c x=y
  // commit); not the word in a path or a message
  const sub = (name) => new RegExp(`(?:^|[\\s;&|(/\\\\"'])git(?:\\.exe)?["']?(?:\\s+(?:-[Cc]\\s+\\S+|--?[\\w-]+(?:=\\S+)?))*\\s+${name}(?![\\w-])`).test(c);
  // the session script by its file or through npm (npm run session -- x --finish)
  const session = (flags) => new RegExp(`\\bsession(?:\\.mjs)?\\b[^|;&\\n]*--(?:${flags})\\b`).test(c);
  if (sub('push') || session('push') || /\bgh(?:\.exe)?\s+pr\s+merge\b/.test(c)) return 'push';
  if (sub('commit') || sub('merge(?!\\s+--abort)') || session('finish|merge|commit-notes')) return 'commit';
  return null;
}

// the owner's own files: the sign-off record, its signers, and this script's note
const OWN = ['SIGNOFFS.md', 'SIGNERS.md', 'workflow-said.json'];
const WRITES = /(?:(?<![\d&])>>?(?!\s*&|\s*\/dev\/null)|\btee\b|\bsed\s+(?:-\w*i|--in-place)|\bperl\s+-\w*i|\b(?:cp|mv|rm|truncate|dd|install|ln)\b|\b(?:write|append)File(?:Sync)?\b|\bcreateWriteStream\b|\bopen\s*\([^)]*['"][wa]|\bSet-Content\b|\bAdd-Content\b|\bOut-File\b|\bgit\s+(?:checkout|restore|apply|am)\b)/;
const globRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');

/** The names of the owner's files a command reaches, also through a glob (SIGN*.md, workflow-s*). */
function ownNamed(command) {
  const words = String(command ?? '').split(/[\s"'`;&|<>()=,]+/).filter(Boolean).map((w) => basename(w.replace(/\\/g, '/')));
  return OWN.filter((name) => words.some((w) => (/[*?[]/.test(w) ? globRe(w).test(name) : w.toLowerCase() === name.toLowerCase())));
}

/**
 * The owner's own files, which no agent writes whatever the owner said: a shell command that writes the sign-off record, its
 * signers or this script's note (the settings deny only the Edit and Write tools there). Its reason, or null.
 */
export function ownersOnly(command) {
  const named = ownNamed(command);
  if (!named.length || !WRITES.test(String(command))) return null;
  return named.includes('workflow-said.json') ? 'the stop points\' note is written only by the hook, from what the owner types'
    : `${named.join(' and ')} ${named.length === 1 ? 'is' : 'are'} written only by \`npm run signoff\`, in the owner's own terminal`;
}

/** The verdict on a command, given what the owner said and when: { ok, why }. */
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

/** The text a person typed, from one line of Claude Code's transcript; null for anything else (a tool's result, the harness's own). */
export function typedText(entry) {
  if (entry?.type !== 'user' || entry.isMeta || entry.message?.role !== 'user') return null;
  const c = entry.message.content;
  if (Array.isArray(c) && c.some((b) => b?.type === 'tool_result')) return null;
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('\n') : '';
  // a slash command the person typed is recorded as its name and arguments: the arguments are their words
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text);
  if (args) return args[1];
  return /^\s*<(?:command-|local-command|system-reminder)/.test(text) ? null : text;
}

/** What the owner said in a transcript (JSONL text), as the note would hold it: { commit, push } times, a "wait" clearing them. */
export function notedFromTranscript(jsonl) {
  let noted = {};
  for (const line of String(jsonl ?? '').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const text = typedText(entry);
    if (text == null) continue;
    const at = Date.parse(entry.timestamp ?? '') || 0;
    const said = saidInPrompt(text);
    if (said.clear) noted = {};
    if (said.commit) noted.commit = at;
    if (said.push) noted.push = at;
  }
  return noted;
}

const noteFile = (cwd) => {
  try { return join(resolve(cwd, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()), 'workflow-said.json'); } catch { return null; }
};
const readNote = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };

/** Whose word it is: the chat (its session id), else the folder; one chat's "done" never commits another chat's work. */
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
    // Claude Code: the owner's words from the chat's transcript; another agent (no transcript): the note its plugin wrote
    const transcript = input.transcript_path && existsSync(input.transcript_path) ? readFileSync(input.transcript_path, 'utf8') : null;
    const v = verdict(input.tool_input?.command, transcript != null ? notedFromTranscript(transcript) : all[key]);
    if (!v.ok) { process.stderr.write(`${v.why}\n`); process.exit(2); }
    process.exit(0);
  }
  if (mode === '--status') {
    const age = (t) => (t ? `${Math.round((Date.now() - t) / 60000)} minutes ago` : 'not said');
    const rows = Object.entries(all).map(([k, v]) => `${k}: commit ${age(v?.commit)}; push ${age(v?.push)}`);
    console.log(`${rows.length ? rows.join('\n') : 'nothing noted'}\n(each holds ${HOLDS_MS / 3600000} hours, for its own chat only; in Claude Code the hook reads the chat's transcript instead)`);
    process.exit(0);
  }
  console.error('usage: node workflow/scripts/stop-points.mjs --prompt | --tool | --status (the hooks call it with the agent\'s JSON on stdin)');
  process.exit(1);
}
