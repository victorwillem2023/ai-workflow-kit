// The only code that talks to the GitHub board (a Projects board over the repo's issues), through `gh`.
// Pure apart from the runner: every call is `run(args, input)` with an argument list (never a shell string),
// so tests pass a fake and the real one is in tools/workflow/board.mjs. Columns and type labels come from the config.

/** A failure said as one plain sentence, safe to print as is. */
export class BoardError extends Error {
  constructor(message) { super(message); this.name = 'BoardError'; }
}

// One plain sentence for a failed gh call: missing, no network, not signed in, or gh's own first line.
function failure(res, what) {
  if (res.error?.code === 'ENOENT') {
    return new BoardError('gh (the GitHub command line) is not installed or not on the PATH: install it from https://cli.github.com and run gh auth login.');
  }
  const err = `${res.stderr ?? ''}`.trim();
  if (/rate limit|submitted too quickly|secondary rate|abuse detection/i.test(err)) {
    return new BoardError("GitHub's rate limit stopped gh: wait a while (up to an hour) and run it again.");
  }
  if (/auth login|not logged in|authentication|HTTP 401|Bad credentials/i.test(err)) {
    return new BoardError('gh is not signed in to GitHub: run gh auth login (and gh auth refresh -s project for the board).');
  }
  if (/connect|network|resolve host|timeout|timed out|no such host|internet/i.test(err)) {
    return new BoardError('The board cannot be reached: gh could not connect to GitHub (no network?).');
  }
  if (/scope|project/i.test(err) && /permission|scope|access/i.test(err)) {
    return new BoardError('gh may not touch the board: run gh auth refresh -s project.');
  }
  const first = err.split('\n').find((l) => l.trim()) ?? res.error?.message ?? 'no answer';
  return new BoardError(`gh failed while ${what}: ${first.trim().replace(/\s+/g, ' ')}`);
}

function gh(run, what, args, input) {
  let res;
  try { res = run(args, input); } catch (e) { res = { status: null, stdout: '', stderr: '', error: e }; }
  if (res.error || res.status !== 0) throw failure(res, what);
  return `${res.stdout ?? ''}`;
}

function ghJson(run, what, args) {
  const out = gh(run, what, args);
  try { return JSON.parse(out); } catch { throw new BoardError(`gh gave an answer that is not JSON while ${what}.`); }
}

/** What the board and labels are, read once and kept: pass one to createCard (and the others) for many calls in a row. */
export const boardCache = () => ({});

const project = (board) => [String(board.project), '--owner', board.owner];
const columnList = (names) => names.join(', ');

/** The column field (Status by default) and its options, read from the project; ids are never hard-coded. */
function statusField(board, run, cache = {}) {
  if (cache.field) return cache.field;
  const { fields = [] } = ghJson(run, 'reading the board', ['project', 'field-list', ...project(board), '--format', 'json']);
  const name = board.field ?? 'Status';
  const field = fields.find((f) => f.name === name && Array.isArray(f.options));
  if (!field) throw new BoardError(`The board has no column field called "${name}".`);
  return (cache.field = field);
}

function knownColumn(board, column) {
  if (!board.columns.includes(column)) {
    throw new BoardError(`There is no column "${column}" on the board. The columns are: ${columnList(board.columns)}.`);
  }
}

function projectId(board, run, cache = {}) {
  if (!cache.projectId) cache.projectId = ghJson(run, 'reading the board', ['project', 'view', ...project(board), '--format', 'json']).id;
  return cache.projectId;
}

function setColumn(board, run, itemId, column, cache) {
  const field = statusField(board, run, cache);
  const option = field.options.find((o) => o.name === column);
  if (!option) {
    throw new BoardError(`The board has no column "${column}". It has: ${columnList(field.options.map((o) => o.name))}.`);
  }
  gh(run, 'setting the column', ['project', 'item-edit', '--id', itemId, '--project-id', projectId(board, run, cache),
    '--field-id', field.id, '--single-select-option-id', option.id]);
}

const repoLabels = (board, run, cache) => cache.labels ??= new Set(ghJson(run, 'reading the labels',
  ['label', 'list', '--repo', board.repo, '--limit', '1000', '--json', 'name']).map((l) => l.name));

/** Makes the labels the repo lacks; returns the names made. `colorOf(name)` picks the colour (the config's `labelColor` by default). */
function ensureLabels(board, run, labels, cache = {}, colorOf = () => board.labelColor ?? 'ededed') {
  const made = [];
  if (!labels.length) return made;
  const have = repoLabels(board, run, cache);
  for (const name of labels) {
    if (have.has(name)) continue;
    gh(run, 'making a label', ['label', 'create', name, '--repo', board.repo, '--color', colorOf(name)]);
    have.add(name);
    made.push(name);
  }
  return made;
}

// The label groups the config names (`board.types` and `board.labels`: areas, effort, feasibility), each with a colour.
const LABEL_COLORS = { types: 'c5def5', areas: 'ededed', effort: 'fef2c0', feasibility: 'd4f0d4' };
export function labelGroups(board) {
  const l = board.labels ?? {};
  return { types: board.types ?? [], areas: l.areas ?? [], effort: l.effort ?? [], feasibility: l.feasibility ?? [] };
}
const allLabels = (board) => Object.values(labelGroups(board)).flat();
const colorFor = (board) => { const g = labelGroups(board); return (name) => LABEL_COLORS[Object.keys(g).find((k) => g[k].includes(name))] ?? 'ededed'; };

// The config's type labels (`board.types`): a card has exactly one; none in the config means no rule.
const typesOf = (board, labels) => (board.types ?? []).filter((t) => labels.includes(t));

function oneType(board, labels) {
  if (!board.types?.length || typesOf(board, labels).length === 1) return;
  throw new BoardError(`A card needs exactly one type label: ${board.types.join(', ')} (add it with --label).`);
}

/** Makes the issue (labels made first when missing), puts it on the board and sets its column. */
export function createCard(board, run, { title, body = '', labels = [], column }, cache = boardCache()) {
  knownColumn(board, column);
  oneType(board, labels);
  ensureLabels(board, run, labels, cache);
  const url = gh(run, 'making the card', ['issue', 'create', '--repo', board.repo, '--title', title, '--body-file', '-',
    ...labels.flatMap((l) => ['--label', l])], body).trim().split('\n').pop().trim();
  const number = Number(url.match(/\/issues\/(\d+)$/)?.[1]);
  if (!number) throw new BoardError(`gh made the card but did not say its number (it said "${url}").`);
  try {
    const item = ghJson(run, 'putting the card on the board', ['project', 'item-add', ...project(board), '--url', url, '--format', 'json']);
    setColumn(board, run, item.id, column, cache);
    return { number, url, itemId: item.id };
  } catch (e) {
    // The issue exists already: say which, so a caller that keeps a list does not make it twice.
    if (e instanceof BoardError) e.card = { number, url };
    throw e;
  }
}

/** Moves card #number to the column with that name. */
export function moveCard(board, run, number, column, cache = boardCache()) {
  knownColumn(board, column);
  setColumn(board, run, itemId(board, run, number, cache), column, cache);
}

// The card's entry on our project, from one small query for that issue (not the whole board); kept in the cache.
// `gh issue view --json projectItems` has no item id, so this is GraphQL. Numbers go in as variables.
const ITEM_QUERY = 'query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){projectItems(first:20){nodes{id project{number}}}}}}';

function itemId(board, run, number, cache) {
  const n = Number(number);
  const ids = cache.itemIds ??= new Map();
  if (ids.has(n)) return ids.get(n);
  const [owner, repo] = board.repo.split('/');
  const res = ghJson(run, `finding card #${n} on the board`, ['api', 'graphql', '-f', `query=${ITEM_QUERY}`,
    '-f', `o=${owner}`, '-f', `r=${repo}`, '-F', `n=${n}`]);
  const nodes = res.data?.repository?.issue?.projectItems?.nodes ?? [];
  const item = nodes.find((i) => i?.project?.number === Number(board.project));
  if (!item?.id) throw new BoardError(`Card #${n} is not on the board.`);
  ids.set(n, item.id);
  return item.id;
}

/** Adds a comment to card #number (the text goes in on stdin, never on the command line). */
export function commentCard(board, run, number, text) {
  gh(run, `commenting on card #${number}`, ['issue', 'comment', String(number), '--repo', board.repo, '--body-file', '-'], text);
}

const BLOCKED = 'Blocked';

/** Moves card #number to Blocked and adds the reason as a comment ("Blocked: <reason>"). A reason is required. */
export function blockCard(board, run, number, reason, cache = boardCache()) {
  const why = `${reason ?? ''}`.trim();
  if (!why) throw new BoardError(`Say why card #${number} is blocked: --block <number> "<reason>".`);
  moveCard(board, run, number, BLOCKED, cache);
  commentCard(board, run, number, `Blocked: ${why}`);
}

/** Title, text, labels, state and column of card #number. */
export function readCard(board, run, number) {
  const c = ghJson(run, `reading card #${number}`, ['issue', 'view', String(number), '--repo', board.repo,
    '--json', 'number,title,body,state,url,labels,projectItems']);
  const onBoard = (c.projectItems ?? []).find((p) => p.status?.name);
  return { number: c.number, title: c.title, body: c.body, state: c.state, url: c.url,
    labels: (c.labels ?? []).map((l) => l.name), column: onBoard?.status.name ?? null };
}

/** Cards (open and closed, at most 20) whose title or text contains the words; the words go to gh as one argument. */
export function searchCards(board, run, words) {
  const text = String(words ?? '').trim();
  if (!text) throw new BoardError('Search needs some words, for example --search "export to pdf".');
  return ghJson(run, 'searching the cards', ['issue', 'list', '--repo', board.repo, '--state', 'all', '--limit', '20',
    '--search', text, '--json', 'number,title,state,projectItems'])
    .map((c) => ({ number: c.number, title: c.title, state: String(c.state).toLowerCase(),
      column: (c.projectItems ?? []).find((p) => p.status?.name)?.status.name ?? null }));
}

/** Which columns from the config the project lacks (empty when it has them all), the ones it has, and the
 *  open cards with no type label from the config (`untyped`, empty when the config lists no types), and the labels the config
 *  names (types, areas, effort, feasibility) that the repo does not have (`unknownLabels`). */
export function checkBoard(board, run, cache = boardCache()) {
  const have = statusField(board, run, cache).options.map((o) => o.name);
  const untyped = !board.types?.length ? [] : ghJson(run, 'reading the cards', ['issue', 'list', '--repo', board.repo,
    '--state', 'open', '--limit', '1000', '--json', 'number,title,labels'])
    .filter((c) => !typesOf(board, (c.labels ?? []).map((l) => l.name)).length)
    .map((c) => ({ number: c.number, title: c.title }));
  const named = allLabels(board);
  const unknownLabels = named.length ? named.filter((n) => !repoLabels(board, run, cache).has(n)) : [];
  return { columns: have, missing: board.columns.filter((c) => !have.includes(c)), untyped, unknownLabels };
}

// GraphQL takes the option list inline; names are JSON strings, colours an enum. Options are matched by name, so cards keep their column.
const optionList = (names) => '[' + names.map((n) => `{name: ${JSON.stringify(n)}, color: GRAY, description: ""}`).join(', ') + ']';

/**
 * Sets the board up from the config: the labels (types, areas, effort, feasibility), the project (made when `board.project` is not
 * a number yet, titled `title`, and linked to the repo), and the column field's options (the config's columns in order; options the
 * board already has and the config does not list stay, after them). Safe to run again: it only makes what is missing.
 */
export function initBoard(board, run, cache = boardCache(), { title } = {}) {
  const labelsMade = ensureLabels(board, run, allLabels(board), cache, colorFor(board));
  let project = Number(board.project), created = false;
  if (!Number.isInteger(project) || project <= 0) {
    project = Number(ghJson(run, 'making the project', ['project', 'create', '--owner', board.owner, '--title', title ?? board.repo.split('/')[1], '--format', 'json']).number);
    if (!project) throw new BoardError('gh made the project but did not say its number: look it up on GitHub and put it in workflow.config.json under board.project.');
    created = true;
    try { run(['project', 'link', String(project), '--owner', board.owner, '--repo', board.repo]); } catch { /* linking is a convenience */ }
  }
  const b = { ...board, project };
  const field = statusField(b, run, cache);
  const have = field.options.map((o) => o.name);
  const columnsAdded = board.columns.filter((c) => !have.includes(c));
  if (columnsAdded.length) {
    const names = [...board.columns, ...have.filter((n) => !board.columns.includes(n))];
    const query = `mutation { updateProjectV2Field(input: {fieldId: ${JSON.stringify(field.id)}, singleSelectOptions: ${optionList(names)}}) { projectV2Field { ... on ProjectV2SingleSelectField { id } } } }`;
    gh(run, 'setting the columns', ['api', 'graphql', '-f', `query=${query}`]);
    delete cache.field;
  }
  return { project, created, labelsMade, columnsAdded };
}
