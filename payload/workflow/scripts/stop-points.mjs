#!/usr/bin/env node
// The kit's stop points, held by Claude Code hooks instead of by the skills' wording alone (.claude/settings.json, hooks):
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
import { createHash } from 'node:crypto';
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
const ENDS = /^\s*(?:(?:now|then|please|thanks|thank you|already|too|here|for real|it|this|that|them)\b[\s,]*)*(?:$|[,!:)–-]|and (?:then )?(?:commit|ship|push|merge|finish|land)\b|so (?:commit|ship|push)\b)/;
const PUSH_ENDS = /^\s*(?:(?:it|this|that|them|now|please|too|as well)\b[\s,]*)*(?:$|[,!:)–-]|and\b|the (?:branch|change|changes|commit|commits|work|code|session|pr)\b|to (?:origin|the remote|remote|main|github|the branch)\b)/;
const NOUN_BEFORE = /\b(?:a|an|the|this|that|my|your|each|every|last|first|one)\s*$/;
const unquoted = (text) => text.replace(/["“”][^"“”]*["“”]/g, ' ').replace(/(^|\s)'[^'\n]*'(?=[\s.,!?;]|$)/g, '$1 ');
const sentences = (text) => text.split(/(?<=[.!?;\n])/).map((s) => s.trim()).filter(Boolean);

// what may stand before the word in its part of the sentence: nothing, or a short approving lead-in ("ok,", "yes", "it's",
// "that's all", "we're", "looks", "go ahead and", "please"). A description has more in front ("mark a ride as done", "rides
// that are done", "rename the button to commit"), and that is a feature, not the owner's word.
const LEAD = /^\s*(?:(?:ok|okay|yes|yeah|yep|great|good|perfect|nice|cool|thanks|thank you|lgtm|it works|works|looks good)\b[\s,!.]*)*(?:(?:it|that|this|we|i|everything|all|the change|the feature)(?:'s|'re|'m| is| are| am)?\s+)?(?:(?:all|looks|seems|really|now|finally|totally|so)\s+)?(?:(?:please|now|then|go ahead and|you can|you may|feel free to)\s+)?(?:(?:commit|done|finish it|ship it|merge it)\s+(?:and|then|and then)\s+)?$/;

function saidIn(sentence, word, ends) {
  const plain = sentence.replace(/[.!;\s]+$/, '');
  if (sentence.endsWith('?') || QUESTION.test(plain)) return false;
  // every place the word stands, until one is the owner's word ("once it is done, commit and push" has two)
  return [...plain.matchAll(new RegExp(word.source, 'g'))].some((m) => saidAt(plain, m, ends));
}

function saidAt(plain, m, ends) {
  const before = plain.slice(0, m.index);
  if (!LEAD.test(before.split(/[,;:–-]/).pop() ?? '')) return false;
  if (/^commit/.test(m[0]) && NOUN_BEFORE.test(before)) return false; // "the commit", "a commit button": a thing, not the act
  const after = plain.slice(m.index + m[0].length);
  return ends.test(after) && !CONDITION.test(before) && !NOT.test(before.split(',').pop() ?? '')
    && !/\b(?:not|isn'?t|aren'?t) (?:yet )?done\b|\bnot finished\b/.test(plain)
    // "done, but the footer is still wrong": the rest takes it back
    && !/^[\s,;:–-]*(?:but|except|though|although|however|only|still|yet)\b|\b(?:but|except|still)\b.*\b(?:wrong|broken|off|missing|fix|change|left)\b/.test(after)
    // "well done", "you said it was done", "I thought it was done": praise or someone else's word, not the owner's
    && !/\b(?:well|nicely|said|says|told me|thought|think|claimed|was|were)\s+(?:(?:it|that|this)\s+)?(?:(?:was|is)\s+)?$/.test(before);
}

/** What the owner's message allows: { commit, push, clear } (clear: they said wait or not yet, which takes an earlier word back). */
export function saidInPrompt(prompt) {
  const text = String(prompt ?? '').toLowerCase().replace(/[‘’]/g, "'").trim();
  // a slash command's arguments are a topic or a description (/spec let riders mark a ride as done, /ship done-button), never
  // the owner's approval: the skill asks for that, and the answer is its own message
  if (text.startsWith('/')) return { commit: false, push: false, clear: false };
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
  // every git command that makes a commit: commit and merge, and cherry-pick, revert, am and rebase (stopping one is free)
  if (['commit', 'merge', 'cherry-pick', 'revert', 'am', 'rebase'].some((n) => sub(`${n}(?!\\s+--(?:abort|quit))`)) || session('finish|merge|commit-notes')) return 'commit';
  return null;
}

// the owner's own files: the sign-off record, its signers, and this script's note
const OWN = ['SIGNOFFS.md', 'SIGNERS.md', 'workflow-said.json', 'levels.json'];
// a command that writes files it names (a redirect is judged by where it points: reading the record into /tmp is fine)
const WRITES = /(?:\btee\b|\bsed\s+(?:-\w*i|--in-place)|\bperl\s+-\w*i|\b(?:cp|mv|rm|truncate|dd|install|ln)\b|\b(?:write|append)File(?:Sync)?\b|\bcreateWriteStream\b|\bopen\s*\([^)]*['"][wa]|\bSet-Content\b|\bAdd-Content\b|\bOut-File\b|\bgit\s+(?:checkout|restore|apply|am)\b)/;
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
  const c = String(command ?? '');
  // where each redirect writes: refused when that is one of the owner's files (`grep done SIGNOFFS.md > /tmp/o` only reads it)
  const redirected = [...c.matchAll(/(?<![\d&])>>?\s*(["']?)([^\s"'`;&|<>()]+)\1/g)].map((m) => m[2]);
  const intoOwn = ownNamed(redirected.join(' '));
  const named = intoOwn.length ? intoOwn : WRITES.test(c) ? ownNamed(c) : [];
  if (!named.length) return null;
  if (named.includes('levels.json')) return 'workflow/levels.json is the owner\'s (how strict the gate is): propose the change and let them make it';
  return named.includes('workflow-said.json') ? 'the stop points\' note is written only by the hook, from what the owner types'
    : `${named.join(' and ')} ${named.length === 1 ? 'is' : 'are'} written only by \`npm run signoff\`, in the owner's own terminal`;
}

/** The verdict on a command, given what the owner said and when: { ok, why }. */
export function verdict(command, noted, now = Date.now()) {
  const mine = ownersOnly(command);
  if (mine) return { ok: false, why: `Refused: ${mine}. It is the owner's to write: tell them what it waits for, or what you would change and why (a sign-off: workflow/guides/SENSITIVE.md). (workflow/scripts/stop-points.mjs)` };
  const word = needsWord(command);
  if (!word) return { ok: true };
  const at = noted?.[word];
  if (at && now - at <= HOLDS_MS) return { ok: true };
  const say = word === 'push' ? '"push"' : '"done" (or "commit", "finish it")';
  return { ok: false, why: `Stop point: this ${word === 'push' ? 'push' : 'commit'} waits for the owner. They have not said ${say} in this chat in the last ${HOLDS_MS / 3600000} hours. Hand the change over as the skill says and ask; do not try another way to ${word}. (workflow/scripts/stop-points.mjs)` };
}

/** The text a person typed, from one line of Claude Code's transcript; null for anything else (a tool's result, the harness's own). */
export function typedText(entry) {
  if (entry?.type !== 'user' || entry.message?.role !== 'user') return null;
  // what the harness writes as a user turn: a summary after /compact, a subagent's own chat, meta lines
  if (entry.isMeta || entry.isCompactSummary || entry.isSidechain || entry.isVisibleInTranscriptOnly) return null;
  // Claude Code says who made each user turn: { kind: 'human' } for the person, 'task-notification' and others for the harness
  if (entry.origin && entry.origin.kind !== 'human') return null;
  const c = entry.message.content;
  if (Array.isArray(c) && c.some((b) => b?.type === 'tool_result')) return null;
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('\n') : '';
  // a slash command the person typed is recorded as its name and arguments: what they typed was "/name args"
  const name = /<command-name>\/?([\w:-]+)<\/command-name>/.exec(text)?.[1];
  if (name) return `/${name} ${/<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1] ?? ''}`.trim();
  return /^\s*<(?:command-|local-command|system-reminder|task-notification|user-prompt-submit-hook|bash-)/.test(text)
    || /^\s*(?:This session is being continued from a previous conversation|Caveat: The messages below)/.test(text) ? null : text;
}

/** A short fingerprint of what someone typed (spaces and case aside), as the prompt hook notes it and the tool hook checks it. */
export const typedPrint = (text) => createHash('sha256').update(String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 20);

/**
 * What the owner said in a transcript (JSONL text), as the note would hold it: { commit, push } times, a "wait" clearing them.
 * Only the person's own turns count: the ones Claude Code marks `origin: human`, or, in a transcript without that mark, the ones
 * the prompt hook saw (`typed`: the fingerprints it noted; it runs on what the person types and on nothing else). A summary, a
 * task notice or a hook's message in the transcript can never say "done" for them.
 */
export function notedFromTranscript(jsonl, typed = new Set()) {
  let noted = {};
  for (const line of String(jsonl ?? '').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const text = typedText(entry);
    // Claude Code's own mark that the person typed it is enough (the recorded text can differ from what the prompt hook saw: an
    // image, an @file); a turn without that mark needs its fingerprint among the ones the prompt hook noted
    if (text == null || !(entry.origin?.kind === 'human' || typed.has(typedPrint(text)))) continue;
    const at = Date.parse(entry.timestamp ?? '') || 0;
    const said = saidInPrompt(text); // a slash command ("/ship done-button") is never the word: saidInPrompt says so
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
export function nextNote(all, key, said, now = Date.now(), print = null) {
  const fresh = (v) => Math.max(v.commit ?? 0, v.push ?? 0, ...(v.typed ?? []).map((t) => t.at ?? 0)) > now - HOLDS_MS;
  const kept = Object.fromEntries(Object.entries(all ?? {}).filter(([, v]) => v && typeof v === 'object' && fresh(v)));
  // what the person typed, by its fingerprint, for the tool hook to check the transcript against (the last few hours, at most 200)
  const typed = [...(kept[key]?.typed ?? []).filter((t) => t.at > now - HOLDS_MS), ...(print ? [{ h: print, at: now }] : [])].slice(-200);
  const words = said.clear ? {} : { commit: kept[key]?.commit, push: kept[key]?.push, ...(said.commit ? { commit: now } : {}), ...(said.push ? { push: now } : {}) };
  const mine = Object.fromEntries(Object.entries({ ...words, ...(typed.length ? { typed } : {}) }).filter(([, v]) => v != null));
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
    // every message is noted by its fingerprint (the tool hook counts only those in the transcript); its words, when it has some
    writeFileSync(file, `${JSON.stringify(nextNote(all, key, saidInPrompt(input.prompt), Date.now(), typedPrint(input.prompt)))}\n`);
    process.exit(0);
  }
  if (mode === '--tool') {
    // Claude Code: the owner's words from the chat's transcript, only the messages the prompt hook saw; another agent (no
    // transcript): the note its plugin wrote
    const transcript = input.transcript_path && existsSync(input.transcript_path) ? readFileSync(input.transcript_path, 'utf8') : null;
    const typed = new Set((all[key]?.typed ?? []).map((t) => t.h));
    const v = verdict(input.tool_input?.command, transcript != null ? notedFromTranscript(transcript, typed) : all[key]);
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
