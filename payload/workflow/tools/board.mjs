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
//   --show <number>              a card's title, column, labels and text
//   --search "<words>"           cards (open and closed) whose title or text has the words: number, title, column
//   --next [n]                   the n (5) startable cards to build next: first-version cards first, then value for the effort (lib/rank.mjs)
//   --triage                     the view for /tidy: too much in progress, cards waiting for you, stalled or long-blocked work, the inbox,
//                                cards without a value, likely duplicates, an old backlog to prune; and the focus (lib/triage.mjs)
//   --graph                      which card needs which, as a tree (a "Depends on: #n" line in a card's text; lib/cardgraph.mjs)
//   --depends <number> <n,m>     card <number> needs #n and #m done first: writes or extends its "Depends on:" line
//   --rate <number> value high   set one label of a group (value, effort, feasibility) and take off its others
//   --undepend <number> <n,m>    takes #n and #m off that line (both print the full list the card ends up with)
//   --close <number> "<reason>"  close a card the owner decided against, the reason as its last comment
//   --inbox                      open issues not on the board yet (feedback, error alerts); --adopt <number> --label <type>... puts one on it
// A failure prints one plain sentence and exits 1.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderTriage, triage, triageLine } from './lib/triage.mjs';
import { adoptCard, closeCard, createCard, dependCard, moveCard, rateCard, blockCard, readCard, searchCards, checkBoard, initBoard, labelGroups, listCards, BoardError } from './lib/board.mjs';
import { inbox, rankCards, STARTABLE, TOOL_ISSUES, topTie, waitingCards } from './lib/rank.mjs';
import { renderTree } from './lib/cardgraph.mjs';
import { ghRun } from './lib/gh.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (args, input) => ghRun(args, input); // lib/gh.mjs

const argv = process.argv.slice(2);
const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const values = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const usage = 'Use --init, --labels, --map, --gaps, --check, --add "<title>" --label <type>, --move <number> "<column>", --block <number> "<reason>", --show <number>, --search "<words>", --next [n], --graph, --depends <number> <n,m>, --undepend <number> <n,m>, --rate <number> value|effort <word>, --triage, --close <number> "<reason>", --inbox or --adopt <number> --label <type>.';

function cardNumber(s) {
  const n = Number(String(s ?? '').replace(/^#/, ''));
  if (!Number.isInteger(n) || n <= 0) throw new BoardError(`"${s ?? ''}" is not a card number. ${usage}`);
  return n;
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
  const triageOptions = () => ({ wip: board.wip ?? 2, backlogMax: board.backlogMax ?? 30, firstVersion: board.labels?.milestone?.[0], columns: board.columns, toolIssues });
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
    const card = createCard(board, run, { title, body, labels: values('--label'), column: value('--column') ?? board.columns[0] });
    console.log(`board: #${card.number} made in ${value('--column') ?? board.columns[0]}: ${card.url}`);
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
    console.log(`#${c.number} ${c.title}\nColumn: ${c.column ?? 'not on the board'} (${c.state.toLowerCase()})\n` +
      `Labels: ${c.labels.join(', ') || 'none'}\n${c.url}\n\n${c.body}`);
  } else if (argv.includes('--next')) {
    // what to build next, by the owner's labels and a fixed sum (lib/rank.mjs), never by a model's taste
    const all = listCards(board, run);
    const ranked = rankCards(all, { firstVersion: board.labels?.milestone?.[0], columns: board.columns.filter((c) => STARTABLE.includes(c)) });
    const n = Number(value('--next')) || 5;
    if (!ranked.length) console.log('board: no open card can be started (Backlog, Needs a board or decision, Ready), or each waits for another');
    // a tie at the top is said as one, never dressed up as an order (the card number is no reason): the owner picks, once
    const tie = topTie(ranked);
    if (tie.length) console.log(`board: ${tie.map((c) => `#${c.number}`).join(', ')} are equal: nothing in the graph or the labels puts one first, so which comes first is yours to say (the board tidy-up, /tidy, asks once and keeps it as value labels)`);
    const tied = new Set(tie.map((c) => c.number));
    for (const c of ranked.slice(0, Math.max(n, tie.length))) console.log(`${tied.has(c.number) ? '= ' : ''}#${c.number} ${c.title} | ${c.column} | ${c.why} (score ${c.score})`);
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
    const line = triageLine(triage(all, triageOptions()));
    if (line) console.log(line);
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
const READS = ['--labels', '--check', '--map', '--gaps', '--show', '--search', '--next', '--triage', '--inbox', '--graph'];
try { await main(); } catch (e) {
  if (e instanceof BoardError && e.gh && READS.some((r) => argv.includes(r))) {
    console.log(`board (warning): ${e.message} Carrying on without the board.`);
    process.exit(0);
  }
  console.error(e instanceof BoardError ? e.message : `board: ${e?.message ?? e}`.split('\n')[0]);
  process.exit(1);
}
