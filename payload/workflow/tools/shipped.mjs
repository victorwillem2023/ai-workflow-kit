#!/usr/bin/env node
// What each shipped card took, kept and shown (lib/shipped.mjs): the other side of a card's effort label.
//   npm run shipped                        what the cards took: by effort label, the ones bigger than they looked, the areas that
//                                          run big, what the review keeps finding, the files that got in the way (/retro reads it)
//   npm run shipped -- --weeks 4           names one by one only the cards of the last 4 weeks (the labels are measured over all)
//   npm run shipped -- --note <topic> [--rounds <n>] [--review "<kind>=<n>, ..." | --review none] [--hard "<file>: <what got in the way>"]...
//                                          what only the builder knows, added to the feature's record (/ship step 9): how often the
//                                          owner sent it back, what the fresh review found by kind (missing, extra, tests,
//                                          two-ways, messier, rule-copied, safety, data, other), and the files that made it harder
//   node workflow/tools/shipped.mjs --record <topic> --dir <session folder> [--card <n,m>] --subject "<s>"
//                                          session.mjs --finish runs this, never a person: the size of the change against main,
//                                          the days since the session started, the cards' labels, the tokens used in its folder
// The records are a line each in git's common folder (workflow-shipped.jsonl): no commit, one file for every session folder.
// They stay on this computer; a fresh clone starts measuring again.
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { addRecord, FINDINGS, parseHard, parseReview, recordsText, shipRecord, tookLines, withNote } from './lib/shipped.mjs';
import { shippedFile, shippedRecords } from './lib/codestate.mjs';
import { recordFiles } from './lib/sessionfiles.mjs';
import { answerUse } from './lib/sessioncost.mjs';
import { MAIN } from './lib/branch.mjs';

const git = (cwd, ...a) => { try { return execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim(); } catch { return ''; } };
const root = git(process.cwd(), 'rev-parse', '--show-toplevel');
const main = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir').replace(/[\\/]\.git$/, '');
const argv = process.argv.slice(2);
const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const values = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const save = (records) => writeFileSync(shippedFile(main), recordsText(records));

/** The labels of the cards together, read from the board; none when it cannot be read (the record is kept without them). */
async function labelsOf(cards, board) {
  if (!board?.repo || !cards.length) return [];
  try {
    const { readCard } = await import('./lib/board.mjs');
    const { ghRun } = await import('./lib/gh.mjs');
    return [...new Set(cards.flatMap((n) => readCard(board, ghRun, n).labels))];
  } catch { return []; }
}

/** The tokens of the answers given in the session folder `dir` since `since`: what Claude Code's records say, 0 when none was there. */
function tokensIn(dir, since) {
  const same = (p) => resolve(String(p ?? '')).toLowerCase() === resolve(dir).toLowerCase();
  let total = 0;
  for (const f of recordFiles(main, since)) {
    for (const text of readFileSync(f, 'utf8').split('\n')) {
      if (!text.includes('"usage"')) continue;
      try { const line = JSON.parse(text); const a = line.cwd && same(line.cwd) ? answerUse(line) : null; if (a) total += a.input + a.output + a.cacheWrite + a.cacheRead; } catch { /* a line being written */ }
    }
  }
  return total;
}

if (argv.includes('--record')) {
  const topic = value('--record');
  const dir = value('--dir');
  if (!topic || !dir) { console.error('shipped: --record <topic> --dir <session folder> (session.mjs --finish runs it)'); process.exit(1); }
  const config = JSON.parse(readFileSync(join(main, 'workflow/config.json'), 'utf8'));
  const cards = String(value('--card') ?? '').split(',').map(Number).filter(Boolean);
  // when the session started: the oldest line of the branch's own history ("<topic>@{<date>}", the newest first)
  const started = /\{(.+)\}/.exec(git(main, 'reflog', 'show', '--date=iso-strict', '--format=%gd', topic).split('\n').filter(Boolean).at(-1) ?? '')?.[1] ?? null;
  const record = shipRecord({
    topic, cards, subject: value('--subject') ?? '', started, numstat: git(dir, 'diff', '--numstat', '--no-renames', MAIN, 'HEAD'),
    labels: await labelsOf(cards, config.board), areas: config.board?.labels?.areas ?? [], types: config.board?.types ?? [],
    tokens: tokensIn(dir, started ? new Date(started) : new Date(Date.now() - 30 * 86_400_000)),
    // the kit the project had when it shipped: what cards cost is compared across kit updates (lib/shipped.mjs, kitLine)
    kit: (() => { try { return /^version=(\S+)/m.exec(readFileSync(join(main, 'workflow', 'record'), 'utf8'))?.[1] ?? null; } catch { return null; } })(),
  });
  save(addRecord(shippedRecords(main), record));
  console.log(`Kept what it took: ${record.lines} lines changed in ${record.files.length} file${record.files.length === 1 ? '' : 's'}${record.days != null ? ` over ${record.days} day${record.days === 1 ? '' : 's'}` : ''}${record.effort ? `, for a card labelled effort ${record.effort}` : ''} (npm run shipped).`);
} else if (argv.includes('--note')) {
  const topic = value('--note');
  const rounds = value('--rounds');
  if (!topic || (rounds !== undefined && !/^\d+$/.test(rounds))) { console.error('shipped: --note <topic> [--rounds <n>] [--review "<kind>=<n>, ..." | --review none] [--hard "<file>: <what got in the way>"]...'); process.exit(1); }
  const hard = values('--hard').map(parseHard);
  if (hard.includes(null)) { console.error('shipped: --hard names one file and why, for example --hard "src/core/plan.ts: every caller builds its own week".'); process.exit(1); }
  const said = String(value('--review') ?? '').split(/[,;]+/).map((p) => p.split(/[=:]/)[0].trim().toLowerCase()).filter((k) => k && k !== 'none' && !FINDINGS.includes(k));
  const { records, found } = withNote(shippedRecords(main), topic, { rounds: rounds === undefined ? null : Number(rounds), review: parseReview(value('--review')), hard });
  if (!found) { console.log(`shipped: no record of "${topic}" to add to (one is kept when a feature is finished). Nothing was written.`); process.exit(0); }
  save(records);
  console.log(`shipped: noted on "${topic}"${said.length ? ` (${said.join(', ')} counted as "other": the kinds are ${FINDINGS.join(', ')})` : ''}`);
} else {
  const weeks = Number(value('--weeks')) || 0;
  console.log(tookLines(shippedRecords(main), { since: weeks ? new Date(Date.now() - weeks * 7 * 86_400_000) : null }).join('\n'));
}
