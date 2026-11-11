#!/usr/bin/env node
// The backlog board from the command line (npm run board -- ...), on lib/board.mjs; settings: `board` in workflow.config.json.
//   --init                       makes what the config describes and GitHub lacks: labels, the project (when board.project is not set; the number is
//                                written into the config), the columns. Safe to run again.
//   --labels                     the labels the config allows, grouped (types, areas, effort, feasibility); /idea reads this
//   --check                      which columns from the config the project lacks, open cards with no type label, and config labels the repo lacks
//   --add "<title>" --label <type> [--label <name>]... [--body-file <file>] [--column "<column>"]   a new card (Backlog by default)
//   --move <number> "<column>"   move a card          --block <number> "<reason>"   to Blocked, the reason as a comment
//   --show <number>              a card's title, column, labels and text
//   --search "<words>"           cards (open and closed) whose title or text has the words: number, title, column
// A failure prints one plain sentence and exits 1.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCard, moveCard, blockCard, readCard, searchCards, checkBoard, initBoard, labelGroups, BoardError } from './lib/board.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WINDOWS_GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';

// gh with an argument list and no shell; on Windows also where its installer puts it when the PATH lacks it.
let ghPath = 'gh';
function run(args, input) {
  const go = () => spawnSync(ghPath, args, { input, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 64 << 20 });
  let res = go();
  if (res.error?.code === 'ENOENT' && process.platform === 'win32' && ghPath === 'gh') { ghPath = WINDOWS_GH; res = go(); }
  return res;
}

const argv = process.argv.slice(2);
const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const values = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const usage = 'Use --init, --labels, --check, --add "<title>" --label <type>, --move <number> "<column>", --block <number> "<reason>", --show <number> or --search "<words>".';

function cardNumber(s) {
  const n = Number(String(s ?? '').replace(/^#/, ''));
  if (!Number.isInteger(n) || n <= 0) throw new BoardError(`"${s ?? ''}" is not a card number. ${usage}`);
  return n;
}

function main() {
  const configFile = join(root, 'workflow.config.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  const board = config.board;
  if (!board) throw new BoardError('workflow.config.json has no "board" block.');
  if (argv.includes('--init')) {
    const r = initBoard(board, run, undefined, { title: config.name });
    if (r.created) {
      config.board.project = r.project;
      writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
      console.log(`board: project ${r.project} made for ${board.owner} and written into workflow.config.json`);
    }
    console.log(`board: ${r.labelsMade.length ? 'labels made: ' + r.labelsMade.join(', ') : 'every label exists'}`);
    console.log(`board: ${r.columnsAdded.length ? 'columns added: ' + r.columnsAdded.join(', ') : 'every column exists'}`);
    console.log(`board: https://github.com/${board.owner.includes('/') ? board.owner : 'users/' + board.owner}/projects/${r.project}`);
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
  } else if (argv.includes('--search')) {
    const found = searchCards(board, run, value('--search'));
    if (!found.length) console.log('board: no card matches those words');
    for (const c of found) console.log(`#${c.number} ${c.title} | ${c.column ?? 'not on the board'} | ${c.state}`);
  } else {
    throw new BoardError(usage);
  }
}

try { main(); } catch (e) {
  console.error(e instanceof BoardError ? e.message : `board: ${e?.message ?? e}`.split('\n')[0]);
  process.exit(1);
}
