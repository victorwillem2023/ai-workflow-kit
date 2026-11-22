#!/usr/bin/env node
// The backlog board from the command line (npm run board -- ...), on lib/board.mjs; settings: `board` in workflow/config.json.
//   --init                       makes what the config describes and GitHub lacks: labels, the project (when board.project is not set; the number is
//                                written into the config), the columns. Safe to run again.
//   --labels                     the labels the config allows, grouped (types, areas, effort, feasibility); /idea reads this
//   --gaps                       the app map's gap and weak ends no open card is on (with the map module; nothing without)
//   --map [--all]                the worksheet (with the map module): open cards by column with the app map ends they are on, and the map's hygiene problems
//   --check                      which columns from the config the project lacks, open cards with no type label, and config labels the repo lacks
//   --add "<title>" --label <type> [--label <name>]... [--body-file <file>] [--column "<column>"]   a new card (Backlog by default)
//   --move <number> "<column>"   move a card          --block <number> "<reason>"   to Blocked, the reason as a comment
//   --show <number>              a card's title, column, labels and text; a "code:" line when it is likely to change a file the code's state points at (lib/cardcode.mjs)
//   --search "<words>"           cards (open and closed) whose title or text has the words: number, title, column
//   --next [n]                   the n (5) startable cards to build next: first-version cards first, then value for the effort (lib/rank.mjs),
//                                the effort counted as what such cards really took here once enough shipped (lib/shipped.mjs); under a card a
//                                "code:" line when it is likely to change a file to clean up first (lib/cardcode.mjs)
//   --next [n] --json            the same as fields: the tie, the next cards, the waiting ones, the triage (lib/boardview.mjs)
//   --focus [--all]              the focus block: where the picked one stands, or the best blocks to pick from (one theme each, lib/focus.mjs)
//   --focus "<theme>" [n,m]      picks a block (its proposed cards, or the ones named); --focus --add <n> puts one more card in it;
//                                --focus --clear drops it. While a block is picked, --next offers only its cards
//   --focus                      with the app map, goals come first: a kind of request or a part of the app with a count of how far it is, and
//                                code health with its numbers (--focus "<goal id>" picks one; --all every goal; --areas the blocks by area)
//   --add ... --unsorted         a card the agent made on its own: it waits for the owner's yes; --unsorted lists those, --accept <n,m|all> lets them in
//   --expire [--yes]             cards untouched for eight weeks, not of high value: listed, and closed with --yes
//   --together [n,m]             which of the cards to start (or the ones named) go together: in one session, one after another, or side by side
//   --room                       whether one more piece of work may be started (the limit board.wip; a session's cards count once): exit code 3 when not
//   --stopped "<line>"           where this session stopped and what comes next: the next --next starts with it
//   --sweep ["<theme>" [--from n]]   every open card for a full clean-up (/sweep): the count per theme, or one theme's cards, 25 at a
//                                time, each with what it lacks (area, type, value, effort) and how long it is untouched
//   --triage                     the view for /tidy: too much in progress, cards waiting for you, stalled or long-blocked work, the inbox,
//                                cards without a value, likely duplicates, an old backlog to prune; and the focus (lib/triage.mjs)
//   --graph                      which card needs which, as a tree (a "Depends on: #n" line in a card's text; lib/cardgraph.mjs)
//   --depends <number> <n,m>     card <number> needs #n and #m done first: writes or extends its "Depends on:" line
//   --rate <number> value high   set one label of a group (value, effort, feasibility) and take off its others
//   --undepend <number> <n,m>    takes #n and #m off that line (both print the full list the card ends up with)
//   --close <number> "<reason>"  close a card the owner decided against, the reason as its last comment
//   --inbox                      open issues not on the board yet (feedback, error alerts); --adopt <number> --label <type>... puts one on it
// A failure prints one plain sentence and exits 1.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderTriage, triage, triageLine } from './lib/triage.mjs';
import { unlabelCard, adoptCard, closeCard, createCard, dependCard, moveCard, rateCard, blockCard, readCard, searchCards, checkBoard, initBoard, labelGroups, listCards, BoardError } from './lib/board.mjs';
import { inbox, rankCards, STARTABLE, TO_SORT, TOOL_ISSUES, topTie, waitingCards } from './lib/rank.mjs';
import { renderTree } from './lib/cardgraph.mjs';
import { boardView } from './lib/boardview.mjs';
import { ghRun } from './lib/gh.mjs';
import { MAIN, ORIGIN_MAIN } from './lib/branch.mjs';
import { STOPPED_FILE, stoppedLines } from './lib/stopped.mjs';
import { codeHotspots, shippedRecords } from './lib/codestate.mjs';
import { calibrate } from './lib/shipped.mjs';
import { codeAdvice } from './lib/cardcode.mjs';
import { together, togetherLines } from './lib/together.mjs';
import { expired, focusLine, focusState, goalCount, goalLine, healthGoal, HEALTH, labelGoal, proposeBlocks, renderBlocks, renderGoals, renderSweep, roomLines, roomToStart, sourcesFor, suggestGoals, sweepGroups, toSort, upkeepDue, urgentOutside, whereYouWere } from './lib/focus.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (args, input) => ghRun(args, input); // lib/gh.mjs

// The cards each session folder carries (branch.<topic>.card, kept by workflow/scripts/session.mjs), for the limit on work in
// progress (lib/focus.mjs roomToStart): [{ topic, cards, finished }]. Read once per run; no git, no sessions: every card counts.
let sessionsNow;
const sessionCards = () => (sessionsNow ??= (() => {
  const git = (cwd, ...args) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); } catch { return null; } };
  // the first worktree git lists is the main folder
  return (git(root, 'worktree', 'list', '--porcelain') ?? '').split(/\r?\n\r?\n/).filter((b) => b.trim()).slice(1).flatMap((block) => {
    const dir = /^worktree (.+)$/m.exec(block)?.[1]?.trim();
    const topic = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim();
    if (!dir || !topic || !existsSync(dir)) return [];
    const cards = (git(root, 'config', '--get', `branch.${topic}.card`) ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
    // without a card only the folder can say: finished when nothing is loose and its commits are on main (what session.mjs --clean takes away)
    const finished = !cards.length && git(dir, 'status', '--porcelain') === '' && git(root, 'merge-base', '--is-ancestor', topic, MAIN) !== null
      && (git(root, 'reflog', 'show', '--format=%H', `refs/heads/${topic}`) ?? '').split('\n').filter(Boolean).length > 1;
    return [{ topic, cards, finished }];
  });
})());

const argv = process.argv.slice(2);
const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const values = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const usage = 'Use --init, --labels, --map, --gaps, --check, --add "<title>" --label <type>, --move <number> "<column>", --block <number> "<reason>", --show <number>, --search "<words>", --next [n], --focus ["<theme>" [n,m] | --add <number> | --clear], --sweep ["<theme>"], --graph, --depends <number> <n,m>, --undepend <number> <n,m>, --rate <number> value|effort <word>, --triage, --close <number> "<reason>", --inbox or --adopt <number> --label <type>.';

function cardNumber(s) {
  const n = Number(String(s ?? '').replace(/^#/, ''));
  if (!Number.isInteger(n) || n <= 0) throw new BoardError(`"${s ?? ''}" is not a card number. ${usage}`);
  return n;
}

// The picked focus, the stopping note and the health numbers last seen live in git's common folder: no commit, and every
// session folder of the project reads the same ones.
function commonFile(name) {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  return join(resolve(root, common), name);
}
const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const focusFile = () => commonFile('workflow-focus.json');
function readFocus() {
  const f = readJson(focusFile());
  return f?.theme && Array.isArray(f.cards) ? f : null;
}
// what the effort labels really cost here, once enough cards shipped (lib/shipped.mjs calibrate); read once per run
let measuredNow;
const measured = () => (measuredNow ??= (() => { const m = calibrate(shippedRecords(root)); return m.cost || Object.keys(m.areas).length ? m : null; })());
const focusOptions = (board) => ({ areas: board.labels?.areas ?? [], firstVersion: board.labels?.milestone?.[0], size: board.focusSize ?? 5, measured: measured() });
/** For each card given, its "code:" line (lib/cardcode.mjs) or nothing: a Map of card number -> line. */
function codeLines(config, cards, open) {
  const spots = codeHotspots(root, config, { n: 12 });
  const o = { spots, records: shippedRecords(root), areas: config.board.labels?.areas ?? [], open, health: config.board.health ?? HEALTH };
  return new Map(cards.map((c) => [c.number, codeAdvice(c, o)?.line]).filter(([, l]) => l));
}
const upkeepOf = (board, all) => upkeepDue(all, { health: board.health ?? HEALTH, every: board.upkeepEvery ?? 8 });

/** Today's health numbers, from the gate's baseline and the flaky list: what a code health goal brings down. */
function healthNumbers(config) {
  const base = readJson(join(root, config.baseline ?? 'workflow/tools/baseline.json')) ?? {};
  const n = (x) => (Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : 0);
  let flaky = 0;
  try { flaky = n(readJson(commonFile('workflow-flaky.json'))); } catch { /* no git: no list */ }
  return { 'files over the size limit': n(base.sizes), 'long functions': n(base.functions), 'functions copied': n(base.copies), 'import circles': n(base.cycles), 'files without a test': n(base.untested), 'flaky tests': flaky };
}

/**
 * The goals to choose from, by where the phase says they come from (lib/focus.mjs DIRECTION; `direction.goals` in
 * workflow/levels.json overrides): the app map's kinds of request and parts (lib/goals.mjs, with the map module), code
 * health with its numbers, and once people use the app what they reported and what the running app reports.
 */
async function gatherGoals(config, all) {
  const board = config.board;
  const levels = readJson(join(root, 'workflow/levels.json')) ?? {};
  const sources = sourcesFor(levels.phase ?? levels.preset ?? 'production', levels.direction?.goals);
  const goals = [];
  const lib = join(root, 'workflow', 'tools', 'lib', 'goals.mjs');
  let mapped = null;
  if ((sources.includes('requests') || sources.includes('parts')) && existsSync(lib) && existsSync(join(root, 'docs', 'flow', 'map.js'))) {
    try {
      const { loadFlow } = await import(pathToFileURL(join(root, 'workflow', 'tools', 'lib', 'worksheet.mjs')).href);
      mapped = (await import(pathToFileURL(lib).href)).mapGoals(loadFlow(root), all);
    } catch { /* a map that cannot be read gives no goals; npm run board -- --map says what is wrong with it */ }
  }
  for (const s of sources) {
    if (s === 'signals') goals.push(labelGoal('signals', 'What the running app reports', all, board.signalLabels ?? ['alert', 'error', 'incident']));
    if (s === 'feedback') goals.push(labelGoal('feedback', 'What your users reported', all, [board.feedbackLabel ?? 'feedback']));
    if (s === 'requests') goals.push(...(mapped ?? []).filter((g) => g.kind === 'request'));
    if (s === 'parts') goals.push(...(mapped ?? []).filter((g) => g.kind === 'part'));
    if (s === 'health' || s === 'bugs') {
      // what the state of the code says (lib/hotspots.mjs): the first suggestions go into the code health goal's notes, and an
      // area with several open bugs is a goal of its own (stabilise it before building more on it)
      const bugs = all.filter((c) => c.state === 'open' && c.column && c.labels.includes('bug')).map((c) => ({ number: c.number, area: (board.labels?.areas ?? []).find((a) => c.labels.includes(a)) ?? null }));
      const spots = codeHotspots(root, config, { bugs });
      if (s === 'bugs') for (const h of spots.filter((x) => x.kind === 'bug-cluster')) {
        const area = bugs.find((b) => h.what.includes(String(b.area ?? 'no area').replace(/^area:\s*/i, '')))?.area;
        const g = labelGoal(`bugs:${String(area ?? 'none').replace(/^area:\s*/i, '').toLowerCase().replace(/\W+/g, '-')}`, `Stabilise ${String(area ?? 'the cards with no area').replace(/^area:\s*/i, '')}: its open bugs`, all.filter((c) => c.labels.includes('bug') && (area ? c.labels.includes(area) : !(board.labels?.areas ?? []).some((a) => c.labels.includes(a)))), ['bug']);
        // a goal like the others, never "due": it is offered beside the product's own goals, not before them
        goals.push({ ...g, kind: 'bugs', due: false, notes: [h.principle] });
      }
      if (s === 'health') {
        const g = healthGoal(all, healthNumbers(config), readJson(commonFile('workflow-health-seen.json')), { health: board.health ?? HEALTH, every: board.upkeepEvery ?? 8 });
        goals.push({ ...g, notes: [...g.notes, ...spots.filter((x) => x.kind !== 'bug-cluster').slice(0, 3).map((x) => `${x.what} (${x.principle.split(':')[0]})`)] });
      }
    }
  }
  return goals.filter((g) => g.total > 0 || g.kind === 'request');
}

/** --focus: shows the picked goal or block, or the ones to pick from; with a name picks one; --add and --clear change it. */
async function focusCommand(config, all) {
  const board = config.board;
  const at = argv.indexOf('--focus');
  const word = argv[at + 1];
  const now = readFocus();
  if (word === '--clear') { rmSync(focusFile(), { force: true }); console.log(now ? `board: the focus "${now.theme}" is dropped; --next offers every card again` : 'board: no focus was picked'); return; }
  if (word === '--add') {
    if (!now) throw new BoardError('No focus is picked yet: npm run board -- --focus shows what to pick from.');
    const n = cardNumber(argv[at + 2]);
    if (!all.some((c) => c.number === n && c.state === 'open')) throw new BoardError(`#${n} is not an open card.`);
    writeFileSync(focusFile(), JSON.stringify({ ...now, cards: [...new Set([...now.cards, n])] }, null, 2) + '\n');
    console.log(`board: #${n} is in the focus "${now.theme}" now`);
    return;
  }
  const goals = await gatherGoals(config, all);
  const blocks = proposeBlocks(all, focusOptions(board));
  if (word && !word.startsWith('--')) { pickFocus(config, all, goals, blocks, word, argv[at + 2]); return; }
  const f = focusNow(board, all, goals);
  if (f && !f.finished) {
    console.log(f.line);
    for (const c of f.state.left) console.log(`  #${c.number} ${c.title} (${c.why})`);
    for (const l of f.extra) console.log(l);
    console.log('(another one: npm run board -- --focus "<goal or theme>"; none: --focus --clear)');
    return;
  }
  if (f) console.log(`focus: "${now.theme}" is done${f.state.check.length ? ` (#${f.state.check.map((c) => c.number).join(', #')} still wait for you to try)` : ''}. Pick the next one:`);
  const live = goals.filter((g) => g.left > 0);
  if (live.length && !argv.includes('--areas')) console.log(renderGoals(argv.includes('--all') ? live : suggestGoals(goals), goals));
  else console.log(renderBlocks(blocks, upkeepOf(board, all), { health: board.health ?? HEALTH, show: argv.includes('--all') ? 99 : 4 }));
}

/** The picked focus as it stands: { state, line, finished, extra, cards } (a goal is measured again, so its count moves), or null. */
function focusNow(board, all, goals) {
  const now = readFocus();
  if (!now) return null;
  const g = now.goal ? goals.find((x) => x.id === now.goal) : null;
  const cards = [...new Set([...now.cards, ...(g?.cards ?? [])])];
  const state = focusState(all, { ...now, cards }, focusOptions(board));
  if (!g) return { state, cards, line: focusLine(state), finished: state.finished, extra: [] };
  const stuck = state.finished && g.left > 0;
  const extra = stuck ? [`(nothing of this goal can be started: ${g.uncarded || g.left} thing${(g.uncarded || g.left) === 1 ? '' : 's'} left ${g.uncarded ? 'with no card yet' : 'on cards that wait'}; /tidy focus makes the cards, ${g.notes[0] ?? ''})`] : [];
  return { state, cards, line: goalLine(g, state), finished: state.finished && g.left === 0, extra };
}

/** Picks a goal (by its id or name) or an area's block: the cards named, else the goal's or the block's own. */
function pickFocus(config, all, goals, blocks, name, numbers) {
  const board = config.board;
  const low = name.toLowerCase();
  const named = String(numbers ?? '').split(/[\s,]+/).filter((x) => x && !x.startsWith('--'));
  const save = (focus, said) => { writeFileSync(focusFile(), JSON.stringify({ ...focus, since: new Date().toISOString().slice(0, 10) }, null, 2) + '\n'); console.log(said); };
  const g = goals.find((x) => x.id.toLowerCase() === low || x.name.toLowerCase() === low);
  if (g) {
    const cards = named.length ? named.map(cardNumber) : g.cards;
    // the numbers as they are now: the goal is due again when one of them is worse than this
    if (g.kind === 'health') writeFileSync(commonFile('workflow-health-seen.json'), JSON.stringify(healthNumbers(config), null, 2) + '\n');
    save({ theme: g.name, goal: g.id, cards }, `board: the goal is "${g.name}" now (${goalCount(g)}): ${cards.length ? cards.map((n) => `#${n}`).join(', ') : 'no card yet'}${g.uncarded ? `; ${g.uncarded} thing${g.uncarded === 1 ? '' : 's'} left with no card yet` : ''}. --next offers only its cards until it is done; new cards wait.`);
    return;
  }
  const same = (a) => a.toLowerCase() === low || a.toLowerCase().replace(/^area:\s*/, '') === low;
  const themes = [...new Set([...(board.labels?.areas ?? []), ...blocks.map((x) => x.theme)])];
  const known = themes.find(same);
  if (!known) throw new BoardError(`"${name}" is no goal and no theme of this board. The goals: ${goals.filter((x) => x.left > 0).map((x) => x.id).join(', ') || 'none'}. The themes: ${themes.join(', ')}.`);
  const cards = named.length ? named.map(cardNumber) : (blocks.find((x) => x.theme === known)?.cards ?? []).map((c) => c.number);
  if (!cards.length) throw new BoardError(`No card of "${known}" can be started, so there is no block to pick.`);
  save({ theme: known, cards }, `board: the focus is ${known} now: ${cards.map((n) => `#${n}`).join(', ')}. --next offers only these until they are done; new cards wait in the backlog.`);
}

/** Which places of the app map each card is on (card number -> places), when the project has the map; else an empty map. */
async function cardPlaces() {
  const lib = join(root, 'workflow', 'tools', 'lib', 'worksheet.mjs');
  const places = new Map();
  if (!existsSync(lib) || !existsSync(join(root, 'docs', 'flow', 'map.js'))) return places;
  try {
    const { loadFlow, mapEnds } = await import(pathToFileURL(lib).href);
    // only where the code is: a row of a request page says what is asked, not which files change
    for (const e of mapEnds(loadFlow(root)).filter((x) => !x.where.startsWith('What someone asks'))) for (const n of e.cards) places.set(n, [...new Set([...(places.get(n) ?? []), e.where])]);
  } catch { /* a map that cannot be read: the areas decide */ }
  return places;
}

/** The cards that go together among `candidates` (lib/together.mjs), as lines. */
async function togetherFor(board, all, candidates) {
  return togetherLines(together(candidates, { all, places: await cardPlaces(), areas: board.labels?.areas ?? [], room: Math.max(2, Math.min(3, board.wip ?? 3)) })).slice(0, 4);
}

/** The stopping note (board --stopped "<text>") and, asked of git now, the finished features not pushed (lib/stopped.mjs). */
function stoppedLine() {
  let ahead = 0;
  try { ahead = Number(execFileSync('git', ['rev-list', '--count', `${ORIGIN_MAIN}..${MAIN}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim()) || 0; } catch { /* no origin: nothing to say */ }
  return stoppedLines(readJson(commonFile(STOPPED_FILE)), { ahead });
}

/** For --next: the ranking kept to the picked focus while it is not finished, and the lines to say around it. */
async function withinFocus(config, all, ranked) {
  const board = config.board;
  const was = whereYouWere(all);
  const room = roomToStart(all, board.wip ?? 2, sessionCards());
  const before = [...stoppedLine(), ...(was ? [`you were on: ${was}`] : []),
    ...(room.room ? [] : [`STOP: ${room.count} pieces of work are in progress and the limit is ${room.limit}: finish or park one before starting another (park: npm run board -- --move <n> "Ready")`])];
  const waiting = toSort(all, TO_SORT).length;
  const sort = waiting ? [`(${waiting} card${waiting === 1 ? '' : 's'} made along the way wait${waiting === 1 ? 's' : ''} for your yes before ${waiting === 1 ? 'it is' : 'they are'} offered: npm run board -- --unsorted)`] : [];
  const goals = await gatherGoals(config, all);
  const f = focusNow(board, all, goals);
  const dueGoals = goals.filter((g) => g.due && g.left > 0 && g.id !== readFocus()?.goal);
  const due = dueGoals.length ? [`(due: ${dueGoals.map((g) => `${g.name} (${g.notes.at(-1) ?? goalCount(g)})`).join('; ')}; npm run board -- --focus)`] : [];
  if (!f) {
    const hint = ranked.length > 5 ? [`(no goal picked: ${ranked.length} cards can be started. One goal at a time is calmer: npm run board -- --focus shows what to pick from)`] : [];
    return { ranked, before, after: [...sort, ...hint, ...due], line: null };
  }
  if (f.finished) return { ranked, before: [...before, `focus: "${readFocus().theme}" is done: pick the next one (npm run board -- --focus)`], after: [...sort, ...due], line: null };
  const mine = new Set(f.cards);
  const outside = ranked.filter((c) => !mine.has(c.number)).length;
  const urgent = urgentOutside(all, { cards: f.cards });
  const after = [...f.extra,
    ...(urgent.length ? [`(outside the focus but urgent: ${urgent.map((c) => `#${c.number} ${c.title}`).join('; ')}: a bug of high value)`] : []),
    ...(outside ? [`(${outside} other card${outside === 1 ? '' : 's'} can be started but wait${outside === 1 ? 's' : ''} for a later goal)`] : []), ...sort, ...due];
  return { ranked: ranked.filter((c) => mine.has(c.number)), before: [...before, f.line], after, line: f.line };
}

async function main() {
  const configFile = join(root, 'workflow/config.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  const board = config.board;
  if (!board) throw new BoardError('workflow/config.json has no "board" block.');
  // board.wip: how many cards may be in progress at once (2 for one person); board.backlogMax: when the backlog needs pruning
  // the issues tools keep open (Renovate's dashboard, under the title renovate.json gives it) are never inbox items
  let renovateTitle;
  try { renovateTitle = JSON.parse(readFileSync(join(root, 'renovate.json'), 'utf8')).dependencyDashboardTitle; } catch {}
  const toolIssues = [...TOOL_ISSUES, ...(renovateTitle ? [renovateTitle] : [])];
  const triageOptions = () => ({ wip: board.wip ?? 2, backlogMax: board.backlogMax ?? 30, firstVersion: board.labels?.milestone?.[0], columns: board.columns, toolIssues, sessions: sessionCards() });
  if (argv.includes('--init')) {
    const r = initBoard(board, run, undefined, { title: config.name });
    if (r.created) {
      config.board.project = r.project;
      writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
      console.log(`board: project ${r.project} made for ${board.owner} and written into workflow/config.json`);
    }
    console.log(`board: ${r.labelsMade.length ? 'labels made: ' + r.labelsMade.join(', ') : 'every label exists'}`);
    console.log(`board: ${r.columnsAdded.length ? 'columns added: ' + r.columnsAdded.join(', ') : 'every column exists'}`);
    console.log(`board: https://github.com/${board.owner.includes('/') ? board.owner : 'users/' + board.owner}/projects/${r.project}`);
  } else if (argv.includes('--map')) {
    // the worksheet lives with the app map (the map module): without it there is nothing to map the cards to
    const lib = join(root, 'workflow', 'tools', 'lib', 'worksheet.mjs');
    if (!existsSync(lib)) throw new BoardError('--map needs the app map (the kit\'s map module: docs/flow and workflow/tools/lib/worksheet.mjs).');
    const { loadFlow, worksheet } = await import(pathToFileURL(lib).href);
    console.log(worksheet(loadFlow(root), listCards(board, run), board.columns, { all: argv.includes('--all') }).text);
  } else if (argv.includes('--gaps')) {
    // the app map's `gap` and `weak` ends that no open card is on: what nobody plans yet (/next and /tidy pass them on)
    const lib = join(root, 'workflow', 'tools', 'lib', 'worksheet.mjs');
    if (!existsSync(lib) || !existsSync(join(root, 'docs', 'flow', 'map.js'))) return;
    const { loadFlow, mapGaps, mapFiles } = await import(pathToFileURL(lib).href);
    const flow = loadFlow(root);
    const gaps = mapGaps(flow, listCards(board, run));
    if (gaps.length) console.log([`map: ${gaps.length} end${gaps.length === 1 ? '' : 's'} not built or weak, with no card on ${gaps.length === 1 ? 'it' : 'them'}:`,
      ...gaps.slice(0, 10).map((e) => `  ${e.status}: ${e.where} › ${e.text}${e.note ? ` (${e.note})` : ''}`), ...(gaps.length > 10 ? [`  and ${gaps.length - 10} more`] : [])].join('\n'));
    const { unnamed } = mapFiles(flow);
    if (unnamed) console.log(`map: ${unnamed} decision${unnamed === 1 ? '' : 's'} name no file (f:), so the gate cannot tell when ${unnamed === 1 ? 'it goes' : 'they go'} stale`);
  } else if (argv.includes('--labels')) {
    const g = labelGroups(board);
    for (const [k, names] of Object.entries(g)) console.log(`${k}: ${names.join(' | ') || '(none in the config)'}`);
  } else if (argv.includes('--check')) {
    const { missing, untyped, unknownLabels } = checkBoard(board, run);
    const problems = [];
    if (missing.length) problems.push(`The board lacks these columns: ${missing.join(', ')}.`);
    if (untyped.length) {
      problems.push(`${untyped.length} open card(s) have no type label (${board.types.join(', ')}):`,
        ...untyped.map((c) => `  #${c.number} ${c.title}`));
    }
    if (unknownLabels.length) problems.push(`The config names labels the repo does not have (npm run board -- --init makes them): ${unknownLabels.join(', ')}.`);
    if (problems.length) throw new BoardError(problems.join('\n'));
    console.log(`board: project ${board.project} of ${board.owner} has all ${board.columns.length} columns` +
      (board.types?.length ? ', and every open card has a type label' : '') + '; every label the config names exists');
  } else if (argv.includes('--add')) {
    const title = value('--add');
    if (!title?.trim()) throw new BoardError(`--add needs a title. ${usage}`);
    const file = value('--body-file');
    const body = file ? readFileSync(file, 'utf8') : '';
    // --unsorted: a card the agent made on its own (an open point, something noticed): it waits for the owner's yes (--accept)
    const unsorted = argv.includes('--unsorted');
    const card = createCard(board, run, { title, body, labels: [...values('--label'), ...(unsorted ? [TO_SORT] : [])], column: value('--column') ?? board.columns[0] });
    console.log(`board: #${card.number} made in ${value('--column') ?? board.columns[0]}${unsorted ? ', waiting for the owner\'s yes before it is offered (npm run board -- --accept ' + card.number + ')' : ''}: ${card.url}`);
  } else if (argv.includes('--move')) {
    const number = cardNumber(value('--move'));
    const column = argv[argv.indexOf('--move') + 2];
    if (!column) throw new BoardError(`--move needs a column. The columns are: ${board.columns.join(', ')}.`);
    moveCard(board, run, number, column);
    console.log(`board: #${number} moved to ${column}`);
  } else if (argv.includes('--block')) {
    const number = cardNumber(value('--block'));
    blockCard(board, run, number, argv[argv.indexOf('--block') + 2]);
    console.log(`board: #${number} moved to Blocked, the reason added as a comment`);
  } else if (argv.includes('--show')) {
    const c = readCard(board, run, cardNumber(value('--show')));
    // the code's state, when this card is likely to change a file it points at; the open cards are read only then (is one that work already?)
    let code = codeLines(config, [c], []).get(c.number);
    if (code) { try { code = codeLines(config, [c], listCards(board, run, { wholeText: true })).get(c.number) ?? code; } catch { /* the line without the card that does it */ } }
    console.log(`#${c.number} ${c.title}\nColumn: ${c.column ?? 'not on the board'} (${c.state.toLowerCase()})\n` +
      `Labels: ${c.labels.join(', ') || 'none'}\n${c.url}${code ? `\n${code}` : ''}\n\n${c.body}`);
  } else if (argv.includes('--next')) {
    // what to build next, by the owner's labels and a fixed sum (lib/rank.mjs), never by a model's taste
    const all = listCards(board, run);
    const everyRanked = rankCards(all, { firstVersion: board.labels?.milestone?.[0], columns: board.columns.filter((c) => STARTABLE.includes(c)), measured: measured() });
    // a picked focus block keeps the offer to its own cards (lib/focus.mjs); what the owner was on is said first
    const focus = await withinFocus(config, all, everyRanked);
    const ranked = focus.ranked;
    const n = Number(value('--next')) || 5;
    if (argv.includes('--json')) {
      // the same ranking as fields, for the docs portal (lib/boardview.mjs)
      const { waiting: held, loops } = waitingCards(all, { columns: board.columns.filter((c) => STARTABLE.includes(c)) });
      console.log(JSON.stringify({ ...boardView({ ranked, tie: topTie(ranked), waiting: held, loops, inboxCount: inbox(all, undefined, toolIssues).length, triage: triage(all, triageOptions()), n, repo: board.repo }), focus: focus.line, was: focus.before[0]?.startsWith('you were on') ? focus.before[0] : null }));
      return;
    }
    for (const l of focus.before) console.log(l);
    if (!ranked.length) console.log('board: no open card can be started (Backlog, Needs a board or decision, Ready), or each waits for another');
    // a tie at the top is said as one, never dressed up as an order (the card number is no reason): the owner picks, once
    const tie = topTie(ranked);
    if (tie.length) console.log(`board: ${tie.map((c) => `#${c.number}`).join(', ')} are equal: nothing in the graph or the labels puts one first, so which comes first is yours to say (the board tidy-up, /tidy, asks once and keeps it as value labels)`);
    const tied = new Set(tie.map((c) => c.number));
    // under a card, the file it is likely to change that the code's state points at (lib/cardcode.mjs): from its title and its area's shipped cards
    const shown = ranked.slice(0, Math.max(n, tie.length));
    const code = codeLines(config, shown, all);
    for (const c of shown) console.log(`${tied.has(c.number) ? '= ' : ''}#${c.number} ${c.title} | ${c.column} | ${c.why} (score ${c.score})${code.has(c.number) ? `\n  ${code.get(c.number)}` : ''}`);
    // the graph first: cards that wait for an open card are not offered, but said, with what they wait for
    const { waiting: held, loops } = waitingCards(all, { columns: board.columns.filter((c) => STARTABLE.includes(c)) });
    if (held.length) console.log(`(waiting for other cards: ${held.map((c) => `#${c.number} for ${c.waitsFor.map((d) => `#${d}`).join(', ')}`).join('; ')}; the tree: npm run board -- --graph)`);
    for (const l of loops) console.log(`(LOOP: ${l.map((x) => `#${x}`).join(' -> ')} -> #${l[0]} wait for each other, so none can start)`);
    const noEdges = all.filter((c) => c.state === 'open' && c.column).every((c) => !c.body);
    if (noEdges && ranked.length > 1) console.log('(no card says what it depends on: a card that needs another first gets "Depends on: #n" (npm run board -- --depends <n> <m>), or the order can start one too early)');
    const unvalued = ranked.filter((c) => /value not set/.test(c.why) && !tied.has(c.number)).length;
    if (unvalued) console.log(`(${unvalued} startable card${unvalued === 1 ? ' has' : 's have'} no value label: set one, the order is only as good as the labels)`);
    const waiting = inbox(all, undefined, toolIssues).length;
    if (waiting) console.log(`(${waiting} open issue${waiting === 1 ? ' is' : 's are'} not on the board yet: npm run board -- --inbox)`);
    // which of the cards to start go together: one session, one after another, or side by side (lib/together.mjs)
    for (const l of await togetherFor(board, all, ranked.slice(0, 12))) console.log(l);
    for (const l of focus.after) console.log(l);
    const line = triageLine(triage(all, triageOptions()));
    if (line) console.log(line);
  } else if (argv.includes('--unsorted')) {
    const waiting = toSort(listCards(board, run), TO_SORT);
    if (!waiting.length) console.log('board: no card waits for your yes');
    for (const c of waiting) console.log(`#${c.number} ${c.title} [${c.labels.filter((l) => l !== TO_SORT).join(', ')}]`);
    if (waiting.length) console.log('Let them in: npm run board -- --accept <n,m> (or --accept all); drop one: npm run board -- --close <n> "<reason>".');
  } else if (argv.includes('--accept')) {
    const word = value('--accept');
    const waiting = toSort(listCards(board, run), TO_SORT).map((c) => c.number);
    const numbers = word === 'all' ? waiting : String(word ?? '').split(/[\s,]+/).filter(Boolean).map(cardNumber);
    if (!numbers.length) throw new BoardError('--accept needs card numbers (--accept 12,15) or "all".');
    for (const n of numbers.filter((x) => waiting.includes(x))) unlabelCard(board, run, n, TO_SORT);
    console.log(`board: ${numbers.filter((x) => waiting.includes(x)).map((n) => `#${n}`).join(', ') || 'none of them'} can be ranked and offered now`);
  } else if (argv.includes('--expire')) {
    // cards nobody touched for eight weeks, not of high value: listed; closed only with --yes (the owner's), each reopenable
    const old = expired(listCards(board, run), { days: board.expireDays ?? 56, firstVersion: board.labels?.milestone?.[0] });
    if (!old.length) { console.log('board: no card is old enough to let go'); return; }
    for (const c of old) console.log(`#${c.number} ${c.title} | untouched ${c.days} days`);
    if (!argv.includes('--yes')) { console.log(`${old.length} card${old.length === 1 ? '' : 's'} to let go. Close them: npm run board -- --expire --yes (each can be reopened).`); return; }
    for (const c of old) closeCard(board, run, c.number, `Closed after ${c.days} days untouched, in a backlog clean-up: reopen it if it matters again.`);
    console.log(`board: ${old.length} closed`);
  } else if (argv.includes('--together')) {
    // the cards named, or the ones to start (the picked goal's, else the best twelve): which go together, and how
    const all = listCards(board, run);
    const named = String(value('--together') ?? '').split(/[\s,]+/).filter((x) => x && !x.startsWith('--')).map(cardNumber);
    const ranked = rankCards(all, { firstVersion: board.labels?.milestone?.[0], columns: board.columns.filter((c) => STARTABLE.includes(c)), measured: measured() });
    const candidates = named.length ? named.map((n) => all.find((c) => c.number === n)).filter(Boolean) : (await withinFocus(config, all, ranked)).ranked.slice(0, 12);
    const lines = await togetherFor(board, all, candidates);
    console.log(lines.length ? lines.join('\n') : 'board: nothing says these go together: one card at a time, best first');
  } else if (argv.includes('--room')) {
    // the limit on work in progress, as an exit code: /work and /build ask before they start one more
    // work, not cards: the cards one session carries count once (lib/focus.mjs roomToStart)
    const r = roomToStart(listCards(board, run), board.wip ?? 2, sessionCards());
    if (r.room) { console.log([`board: ${r.count} in progress, the limit is ${r.limit}: room for ${r.room} more`, ...roomLines(r)].join('\n')); return; }
    console.log(`board: STOP, ${r.count} pieces of work are in progress and the limit is ${r.limit}:\n${roomLines(r).join('\n')}\nFinish one, or park one (npm run board -- --move <n> "Ready"), before starting another.`);
    process.exitCode = 3;
  } else if (argv.includes('--stopped')) {
    const text = String(value('--stopped') ?? '').trim();
    if (!text || text.startsWith('--')) throw new BoardError('--stopped needs one line: where you stopped and what comes next.');
    writeFileSync(commonFile(STOPPED_FILE), JSON.stringify({ at: new Date().toISOString(), text: text.slice(0, 400) }, null, 2) + '\n');
    console.log('board: kept; the next "what now" starts with it');
  } else if (argv.includes('--sweep')) {
    // every open card for a full clean-up (/sweep): the themes with their counts, or one theme's cards, 25 at a time
    const theme = value('--sweep');
    const groups = sweepGroups(listCards(board, run), { areas: board.labels?.areas ?? [], types: board.types ?? [] });
    console.log(renderSweep(groups, theme && !theme.startsWith('--') ? theme : null, Number(value('--from')) || 0));
  } else if (argv.includes('--focus')) {
    await focusCommand(config, listCards(board, run));
  } else if (argv.includes('--graph')) {
    // which card needs which, as a tree: what nothing waits on at the top, what depends on it below (lib/cardgraph.mjs)
    // only the cards on the board (the reports and Renovate's dashboard are issues, not work)
    const tree = renderTree(listCards(board, run).filter((c) => c.column));
    console.log(tree || 'board: no open cards');
  } else if (argv.includes('--depends') || argv.includes('--undepend')) {
    // prints the full list the card ends up with, so a dependency that is still there is never hidden
    const flag = argv.includes('--depends') ? '--depends' : '--undepend';
    const number = cardNumber(value(flag));
    const on = String(argv[argv.indexOf(flag) + 2] ?? '').split(/[\s,]+/).filter(Boolean).map(cardNumber);
    const now = dependCard(board, run, number, on, { remove: flag === '--undepend' });
    console.log(`board: #${number} ${now.length ? `now depends on ${now.map((x) => `#${x}`).join(', ')}` : 'depends on no card now'} (written in its text)`);
  } else if (argv.includes('--rate')) {
    const number = cardNumber(value('--rate'));
    const at = argv.indexOf('--rate');
    console.log(`board: #${number} is ${rateCard(board, run, number, argv[at + 2], argv[at + 3])} now`);
  } else if (argv.includes('--triage')) {
    // the view for /tidy: what needs a decision so nothing piles up, and the focus (lib/triage.mjs)
    console.log(renderTriage(triage(listCards(board, run), triageOptions())));
  } else if (argv.includes('--close')) {
    const number = cardNumber(value('--close'));
    closeCard(board, run, number, argv[argv.indexOf('--close') + 2]);
    console.log(`board: #${number} closed, the reason added as a comment`);
  } else if (argv.includes('--inbox')) {
    const waiting = inbox(listCards(board, run), undefined, toolIssues);
    if (!waiting.length) console.log('board: every open issue is on the board');
    for (const c of waiting) console.log(`#${c.number} ${c.title}${c.labels.length ? ` [${c.labels.join(', ')}]` : ''}`);
    if (waiting.length) console.log('Put one on the board: npm run board -- --adopt <number> --label <type> [--label <name>]...; or close it with a reply.');
  } else if (argv.includes('--adopt')) {
    const number = cardNumber(value('--adopt'));
    adoptCard(board, run, number, { labels: values('--label'), column: value('--column') ?? board.columns[0] });
    console.log(`board: #${number} put on the board in ${value('--column') ?? board.columns[0]}`);
  } else if (argv.includes('--search')) {
    const found = searchCards(board, run, value('--search'));
    if (!found.length) console.log('board: no card matches those words');
    for (const c of found) console.log(`#${c.number} ${c.title} | ${c.column ?? 'not on the board'} | ${c.state}`);
  } else {
    throw new BoardError(usage);
  }
}

// the commands that only read: when GitHub cannot be reached they warn in one line and let the flow around them go on
const READS = ['--labels', '--check', '--map', '--gaps', '--show', '--search', '--next', '--triage', '--inbox', '--graph', '--focus', '--sweep', '--unsorted', '--room', '--together'];
try { await main(); } catch (e) {
  if (e instanceof BoardError && e.gh && READS.some((r) => argv.includes(r))) {
    console.log(`board (warning): ${e.message} Carrying on without the board.`);
    process.exit(0);
  }
  console.error(e instanceof BoardError ? e.message : `board: ${e?.message ?? e}`.split('\n')[0]);
  process.exit(1);
}
