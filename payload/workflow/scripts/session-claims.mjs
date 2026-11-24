// The files each session holds (lib/claims.mjs, read by lib/sessionclaims.mjs), for workflow/scripts/session.mjs: a new session
// whose files a running one is changing does not start (the owner may say --anyway), --list says what each one changes, and
// --beside tells a builder what the sessions next to it decide.
import { touchedPaths, claimOf, clashes, clashMessage, besideNote, stackOf } from '../tools/lib/claims.mjs';
import { neverIn, resolverFor, sessionClaims, specOf } from '../tools/lib/sessionclaims.mjs';
import { main, onBoard, eachCard, FLOW } from './session-core.mjs';

/** The "Touches" paths of the cards (read only when the topic has no spec: the spec says it better). */
async function touchesOf(card) {
  const out = [];
  for (const n of eachCard(card)) await onBoard(`Card #${n}'s "Touches" line could not be read; check what it changes`, (lib, board, run) => { out.push(...touchedPaths(lib.readCard(board, run, Number(n)).body)); });
  return out;
}

/**
 * What `topic` holds and what the other sessions hold, the same way for a start and for --beside: the spec says it best, a spec
 * naming no file (or none yet) leaves it to the cards' Touches lines, and so for a running session that holds nothing yet.
 */
async function claimsNow(topic, card) {
  const never = neverIn(main);
  const resolve = resolverFor(main);
  const all = sessionClaims(main);
  const self = all.find((s) => s.topic === topic);
  const spec = specOf(main, topic, self?.dir);
  let mine = claimOf({ spec, changed: self?.files ?? [] }, never, resolve);
  const cards = card ?? self?.cards.join(',') ?? '';
  if (!mine.length && cards) mine = claimOf({ touches: await touchesOf(cards) }, never, resolve);
  const others = all.filter((s) => s.topic !== topic);
  for (const s of others) if (!s.files.length && s.cards.length) s.files = claimOf({ touches: await touchesOf(s.cards.join(',')) }, never, resolve);
  return { mine, spec, self, others, all };
}

/**
 * Before a new session's folder is made: what its spec (or its cards' Touches lines) says it changes, against what the running
 * sessions change. A clash throws (nothing is made yet); with `anyway` it is said and the start goes on. `on`: the session it is
 * stacked on, which it may share files with. `anyway`: 'adopted' for a folder an orchestrator made already (said, never refused).
 */
export async function checkClaims(topic, card, on, anyway) {
  const { mine, spec, others, all } = await claimsNow(topic, card);
  if (!mine.length) { if (card) console.log(`(nothing says yet which files "${topic}" changes: ${spec ? 'its spec names no file under "Files that change"' : 'no spec'} and its card has no "Touches" line, so it was not checked against the sessions running)`); return; }
  const found = clashes(mine, others, { skip: stackOf(topic, all, on) });
  if (!found.length) return;
  if (!anyway) throw new Error(clashMessage(topic, card, found, { stack: FLOW !== 'pr' }));
  const which = `${found.map((o) => `"${o.topic}"`).join(', ')}, which also change${found.length === 1 ? 's' : ''} ${[...new Set(found.flatMap((o) => o.files))].slice(0, 4).join(', ')}`;
  console.log(anyway === 'adopted' ? `Careful: this folder changes files beside ${which}. Settle who changes what before both are built (node workflow/scripts/session.mjs --beside ${topic}).`
    : `Started beside ${which} (the owner's choice: --anyway). Settle who changes what before both are built.`);
}

/** For --list: what each running session changes, one line under it ("" when nothing yet). */
export function claimLines() {
  return new Map(sessionClaims(main).map((s) => [s.topic, s.files.length ? `    changes: ${s.files.slice(0, 5).join(', ')}${s.files.length > 5 ? ` and ${s.files.length - 5} more` : ''}` : '']));
}

/** --beside [topic]: the sessions that change files this one changes, with what their specs decide there. */
export async function beside(topic) {
  const { mine, others, all } = await claimsNow(topic);
  console.log(besideNote(topic, clashes(mine, others, { skip: stackOf(topic, all) })));
}
