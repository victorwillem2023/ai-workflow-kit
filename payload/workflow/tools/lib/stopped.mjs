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
export function stoppedLines(note, { ahead = 0, now = Date.now(), done = [] } = {}) {
  const waiting = ahead > 0 ? `${plural(ahead)} on local main, not pushed (push: node workflow/scripts/session.mjs --push)` : '';
  const fresh = note?.text && now - Date.parse(note.at) <= NOTE_DAYS * 86_400_000;
  if (!fresh) return waiting ? [waiting] : [];
  const pushed = note.pushedAt && Date.parse(note.pushedAt) >= Date.parse(note.at) ? ` (pushed since, ${String(note.pushedAt).slice(0, 10)})` : '';
  // a card the note names that is done by now: the note may point at the wrong next card (`done`: the numbers that are)
  const stale = staleCards(note.text, done);
  return [`where you stopped (${String(note.at).slice(0, 10)}): ${note.text}${pushed}${waiting ? ` (${waiting})` : ''}${stale.length ? ` (careful: #${stale.join(', #')} ${stale.length === 1 ? 'is' : 'are'} done already, so check what comes next on the board)` : ''}`];
}

/**
 * The card numbers a note names as still to do that are in `done`: a number written after "shipped", "done", "finished",
 * "closed", "merged" or "built" (up to the next ; or .) is what was finished, and being done is right for it.
 */
export function staleCards(text, done = []) {
  const s = String(text ?? '');
  // finished from the word until a ; or . or the word that starts what comes next ("Shipped #607, next: #590")
  const finished = /\b(shipped|done|finished|closed|merged|built)\b(?:(?!\b(?:next|then|after that|todo)\b)[^;.])*$/i;
  const ahead = [...s.matchAll(/#(\d+)/g)].filter((m) => !finished.test(s.slice(Math.max(0, m.index - 60), m.index)));
  return [...new Set(ahead.map((m) => Number(m[1])))].filter((n) => done.includes(n));
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
