// The stopping note (board --stopped "<line>", in git's common folder as workflow-stopped.json) and what git says now.
// The note holds only what was said; whether features wait to be pushed is worked out from git each time it is shown, so a note
// written before a push can never claim "not pushed" after it. session.mjs --push also stamps the note as pushed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const STOPPED_FILE = 'workflow-stopped.json';
// a note older than this is not said any more: the work has moved on
const NOTE_DAYS = 21;

const plural = (n) => `${n} feature${n === 1 ? '' : 's'}`;

/**
 * The lines --next starts with: the note (when there is a recent one) and, only when it is true now, how many finished features
 * wait on the local main (`ahead`: git rev-list --count origin/main..main). A note written before the last push says so.
 */
export function stoppedLines(note, { ahead = 0, now = Date.now() } = {}) {
  const waiting = ahead > 0 ? `${plural(ahead)} on local main, not pushed (push: node workflow/scripts/session.mjs --push)` : '';
  const fresh = note?.text && now - Date.parse(note.at) <= NOTE_DAYS * 86_400_000;
  if (!fresh) return waiting ? [waiting] : [];
  const pushed = note.pushedAt && Date.parse(note.pushedAt) >= Date.parse(note.at) ? ` (pushed since, ${String(note.pushedAt).slice(0, 10)})` : '';
  return [`where you stopped (${String(note.at).slice(0, 10)}): ${note.text}${pushed}${waiting ? ` (${waiting})` : ''}`];
}

/** After a push: the note, when there is one, is stamped as pushed (its text stays: what comes next is still true). */
export function markPushed(file, now = new Date()) {
  if (!existsSync(file)) return false;
  let note;
  try { note = JSON.parse(readFileSync(file, 'utf8')); } catch { return false; }
  if (!note?.text) return false;
  writeFileSync(file, JSON.stringify({ ...note, pushedAt: now.toISOString() }, null, 2) + '\n');
  return true;
}
