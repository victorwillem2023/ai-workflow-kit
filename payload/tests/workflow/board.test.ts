// The board tool (tools/workflow/lib/board.mjs): the only code that talks to the GitHub board, through `gh`.
// Every test uses a fake `gh` runner that answers from memory and records the argument lists; no network.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCard, moveCard, commentCard, blockCard, readCard, searchCards, checkBoard, boardCache, BoardError } from '../../tools/workflow/lib/board.mjs';
import type { Board, GhResult } from '../../tools/workflow/lib/board.mjs';

const COLUMNS = ['Backlog', 'Needs a board or decision', 'Ready', 'In progress', 'Waiting for your check', 'Done'];
const board: Board = { owner: 'someone', repo: 'someone/app', project: 1, field: 'Status', columns: COLUMNS };
// The board as the config has it now: a Blocked column and one type label per card.
const TYPED_COLUMNS = [...COLUMNS.slice(0, 5), 'Blocked', 'Done'];
const TYPES = ['ui', 'feature', 'bug', 'workflow'];
const typed: Board = { ...board, columns: TYPED_COLUMNS, types: TYPES };

const ok = (stdout: unknown): GhResult => ({ status: 0, stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout), stderr: '' });

// A fake gh: a project with the given Status options, one issue already on it (#7), and a record of every call.
function fakeGh(options = COLUMNS) {
  const calls: { args: string[]; input?: string }[] = [];
  const fields = { fields: [
    { id: 'F_title', name: 'Title', type: 'ProjectV2Field' },
    { id: 'F_status', name: 'Status', type: 'ProjectV2SingleSelectField', options: options.map((name, i) => ({ id: `opt${i}`, name })) },
  ] };
  const run = (args: string[], input?: string): GhResult => {
    calls.push({ args, input });
    const cmd = args.slice(0, 2).join(' ');
    if (cmd === 'project field-list') return ok(fields);
    if (cmd === 'project view') return ok({ id: 'P_1', title: 'My Project' });
    if (cmd === 'label list') return ok([{ name: 'bug' }]);
    if (cmd === 'label create') return ok('');
    if (cmd === 'issue create') return ok('https://github.com/someone/app/issues/42\n');
    if (cmd === 'project item-add') return ok({ id: 'ITEM_42' });
    if (cmd === 'api graphql') {
      // The one-card lookup: issue #7 is on project 1 (ours); #8 only on project 2; any other number is on none.
      const number = Number(args.find((a) => a.startsWith('n='))?.slice(2));
      const nodes = number === 7 ? [{ id: 'ITEM_OTHER', project: { number: 2 } }, { id: 'ITEM_7', project: { number: 1 } }]
        : number === 8 ? [{ id: 'ITEM_8_ELSEWHERE', project: { number: 2 } }] : [];
      return ok({ data: { repository: { issue: { projectItems: { nodes } } } } });
    }
    if (cmd === 'project item-edit') return ok({});
    if (cmd === 'issue comment') return ok('https://github.com/someone/app/issues/7#issuecomment-1\n');
    if (cmd === 'issue list') return ok([
      { number: 7, title: 'Push once per category (W9)', labels: [{ name: 'workflow' }, { name: 'next' }] },
      { number: 8, title: 'Lighter workflow (W3)', labels: [] },
      { number: 12, title: 'Only an area label', labels: [{ name: 'area: Trips' }] },
      { number: 13, title: 'A bug', labels: [{ name: 'bug' }] },
    ]);
    if (cmd === 'issue view') return ok({
      number: 7, title: 'Push once per category (W9)', body: 'The row text.', state: 'OPEN',
      url: 'https://github.com/someone/app/issues/7', labels: [{ name: 'next' }, { name: 'area: workflow and docs' }],
      projectItems: [{ title: 'My Project', status: { name: 'Ready', optionId: 'opt2' } }],
    });
    return { status: 1, stdout: '', stderr: `unknown command ${cmd}` };
  };
  return { run, calls };
}

const call = (calls: { args: string[]; input?: string }[], cmd: string) => calls.find((c) => c.args.slice(0, 2).join(' ') === cmd);
const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];

describe('the board tool', () => {
  it('adding a card makes the issue, puts it on the board and sets its column', () => {
    const gh = fakeGh();
    const card = createCard(board, gh.run, { title: 'Export to PDF (D4b)', body: 'Row text.', labels: ['bug', 'next'], column: 'Backlog' });
    assert.equal(card.number, 42);
    const create = call(gh.calls, 'issue create')!;
    assert.equal(flag(create.args, '--repo'), 'someone/app');
    assert.equal(flag(create.args, '--title'), 'Export to PDF (D4b)');
    assert.equal(create.input, 'Row text.');
    assert.ok(call(gh.calls, 'label create')!.args.includes('next'), 'the missing label is made first');
    assert.equal(flag(call(gh.calls, 'project item-add')!.args, '--url'), 'https://github.com/someone/app/issues/42');
    const edit = call(gh.calls, 'project item-edit')!.args;
    assert.equal(flag(edit, '--id'), 'ITEM_42');
    assert.equal(flag(edit, '--field-id'), 'F_status');
    assert.equal(flag(edit, '--single-select-option-id'), 'opt0');
  });

  it('moving a card sets the column by its name', () => {
    const gh = fakeGh();
    moveCard(board, gh.run, 7, 'Waiting for your check');
    const edit = call(gh.calls, 'project item-edit')!.args;
    assert.equal(flag(edit, '--id'), 'ITEM_7');
    assert.equal(flag(edit, '--project-id'), 'P_1');
    assert.equal(flag(edit, '--single-select-option-id'), 'opt4');
  });

  it('moving a card looks up that one card and never lists the whole board', () => {
    const gh = fakeGh();
    moveCard(board, gh.run, 7, 'Ready');
    assert.equal(call(gh.calls, 'project item-list'), undefined, 'the whole board is not read');
    const lookups = gh.calls.filter((c) => c.args.slice(0, 2).join(' ') === 'api graphql');
    assert.equal(lookups.length, 1);
    const args = lookups[0].args;
    assert.ok(args.includes('n=7'), 'the issue number is passed as a variable, not built into the query');
    assert.ok(args.includes('o=someone') && args.includes('r=app'));
    assert.equal(flag(call(gh.calls, 'project item-edit')!.args, '--id'), 'ITEM_7', 'the entry of our project is used, not the other one');
  });

  it('a card that is on another project but not this one is reported as not on the board', () => {
    const gh = fakeGh();
    assert.throws(() => moveCard(board, gh.run, 8, 'Ready'), (e: Error) => e instanceof BoardError && e.message === 'Card #8 is not on the board.');
    assert.throws(() => moveCard(board, gh.run, 99, 'Ready'), (e: Error) => e instanceof BoardError && e.message === 'Card #99 is not on the board.');
    assert.equal(call(gh.calls, 'project item-edit'), undefined, 'nothing is changed');
  });

  it('blocking a card and moving it with one cache look the card up once', () => {
    const gh = fakeGh(TYPED_COLUMNS);
    const cache = boardCache();
    moveCard(typed, gh.run, 7, 'In progress', cache);
    blockCard(typed, gh.run, 7, 'waiting for X', cache);
    assert.equal(gh.calls.filter((c) => c.args.slice(0, 2).join(' ') === 'api graphql').length, 1);
    assert.equal(gh.calls.filter((c) => c.args.slice(0, 2).join(' ') === 'project item-edit').length, 2);
  });

  it('an unknown column is refused, and the answer lists the columns that exist', () => {
    const gh = fakeGh();
    assert.throws(() => moveCard(board, gh.run, 7, 'Doing'), (e: Error) =>
      e instanceof BoardError && e.message.includes('"Doing"') && COLUMNS.every((c) => e.message.includes(c)));
    assert.equal(call(gh.calls, 'project item-edit'), undefined, 'nothing is changed');
  });

  it('the board check names every column from the config that the project lacks', () => {
    const gh = fakeGh(['Backlog', 'Ready', 'In progress', 'Done']);
    const check = checkBoard(board, gh.run);
    assert.deepEqual(check.missing, ['Needs a board or decision', 'Waiting for your check']);
    assert.deepEqual(checkBoard(board, fakeGh().run).missing, []);
  });

  it('a title with quotes, backticks and a semicolon reaches gh as one argument, not as a command', () => {
    const gh = fakeGh();
    const title = 'Say "hi" `rm -rf /`; echo $(whoami) & del *';
    createCard(board, gh.run, { title, body: 'x', labels: [], column: 'Backlog' });
    const args = call(gh.calls, 'issue create')!.args;
    assert.equal(args.filter((a) => a === title).length, 1);
    assert.ok(args.every((a) => a === title || !a.includes('rm -rf')), 'no other argument carries a piece of it');
  });

  it('a board that cannot be reached (gh missing, no network, not signed in) gives one plain sentence, not a stack trace', () => {
    const failures: GhResult[] = [
      { status: null, stdout: '', stderr: '', error: Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' }) },
      { status: 1, stdout: '', stderr: 'error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n' },
      { status: 4, stdout: '', stderr: 'To get started with GitHub CLI, please run:  gh auth login\n' },
    ];
    const sentences = failures.map((f) => {
      try { checkBoard(board, () => f); } catch (e) { assert.ok(e instanceof BoardError); return (e as Error).message; }
      assert.fail('no error');
    });
    assert.match(sentences[0], /gh .*not installed/);
    assert.match(sentences[1], /network/);
    assert.match(sentences[2], /not signed in.*gh auth login/);
    for (const s of sentences) { assert.ok(!s.includes('\n'), s); assert.ok(!/\bat \w+ \(/.test(s), s); }
  });

  it('many cards with one cache read the board and the labels once, and a label made for one card is not made again', () => {
    const gh = fakeGh();
    const cache = boardCache();
    for (let i = 0; i < 5; i++) createCard(board, gh.run, { title: `Card ${i}`, labels: ['bug', 'next'], column: 'Backlog' }, cache);
    const count = (cmd: string) => gh.calls.filter((c) => c.args.slice(0, 2).join(' ') === cmd).length;
    assert.equal(count('project field-list'), 1);
    assert.equal(count('project view'), 1);
    assert.equal(count('label list'), 1);
    assert.equal(count('label create'), 1, '"next" is made for the first card only');
    assert.equal(count('issue create'), 5);
    assert.equal(count('project item-add'), 5);
    assert.equal(count('project item-edit'), 5);
  });

  it('a GitHub rate limit is said as one sentence that says to wait', () => {
    const limited: GhResult = { status: 1, stdout: '', stderr: 'GraphQL: was submitted too quickly (createIssue)\nAPI rate limit exceeded\n' };
    assert.throws(() => checkBoard(board, () => limited), (e: Error) =>
      e instanceof BoardError && /rate limit/i.test(e.message) && /wait/i.test(e.message) && !e.message.includes('\n'));
  });

  it('block moves the card to Blocked and adds the reason as a comment', () => {
    const gh = fakeGh(TYPED_COLUMNS);
    blockCard(typed, gh.run, 7, 'waiting for the owner to pick board 60b A, B or C');
    const edit = call(gh.calls, 'project item-edit')!.args;
    assert.equal(flag(edit, '--id'), 'ITEM_7');
    assert.equal(flag(edit, '--single-select-option-id'), `opt${TYPED_COLUMNS.indexOf('Blocked')}`);
    const comment = call(gh.calls, 'issue comment')!;
    assert.equal(comment.args[2], '7');
    assert.equal(flag(comment.args, '--repo'), 'someone/app');
    assert.equal(flag(comment.args, '--body-file'), '-', 'the reason goes in on stdin, not as an argument');
    assert.match(comment.input!, /^Blocked: waiting for the owner to pick board 60b A, B or C$/);
  });

  it('block without a reason is refused', () => {
    for (const reason of ['', '   ', undefined]) {
      const gh = fakeGh(TYPED_COLUMNS);
      assert.throws(() => blockCard(typed, gh.run, 7, reason as unknown as string), (e: Error) =>
        e instanceof BoardError && /reason/i.test(e.message));
      assert.equal(gh.calls.length, 0, 'nothing is read or changed');
    }
  });

  it('check lists cards that have no type label', () => {
    const gh = fakeGh(TYPED_COLUMNS);
    const check = checkBoard(typed, gh.run);
    assert.deepEqual(check.missing, []);
    assert.deepEqual(check.untyped, [{ number: 8, title: 'Lighter workflow (W3)' }, { number: 12, title: 'Only an area label' }]);
    const list = call(gh.calls, 'issue list')!.args;
    assert.equal(flag(list, '--state'), 'open');
    assert.deepEqual(checkBoard(board, fakeGh().run).untyped, [], 'a board with no types in the config has nothing to report');
  });

  const SKILL = 'Labels: one `effort: ...` and one `feasibility: ...` (placeholders), `area: Trips`, `area: Names`, `effort: small`, `feasibility: high`, and the type `bug`.';
  const withLabels = (names: string[]) => { const gh = fakeGh(TYPED_COLUMNS);
    const run = (a: string[], i?: string) => a.slice(0, 2).join(' ') === 'label list' ? ok(names.map((name) => ({ name }))) : gh.run(a, i);
    return run; };

  it('--check reports a label named in the /idea skill that the repo does not have', () => {
    const run = withLabels(['area: Trips', 'effort: small', 'feasibility: high']);
    assert.deepEqual(checkBoard(typed, run, boardCache(), { skillText: SKILL }).unknownLabels, ['area: Names']);
  });

  it('--check says nothing about labels when every label in the /idea skill exists', () => {
    const run = withLabels(['area: Trips', 'area: Names', 'effort: small', 'feasibility: high']);
    assert.deepEqual(checkBoard(typed, run, boardCache(), { skillText: SKILL }).unknownLabels, []);
  });

  it('--check still works when the /idea skill file has no label list', () => {
    const gh = fakeGh(TYPED_COLUMNS);
    for (const skillText of ['No labels here.', '', undefined]) {
      assert.deepEqual(checkBoard(typed, gh.run, boardCache(), { skillText }).unknownLabels, []);
    }
    assert.equal(call(gh.calls, 'label list'), undefined, 'nothing to compare, so no extra call');
  });

  it('add refuses a card without a type label', () => {
    for (const labels of [[], ['area: Trips'], ['bug', 'ui']]) {
      const gh = fakeGh(TYPED_COLUMNS);
      assert.throws(() => createCard(typed, gh.run, { title: 'A new idea', labels, column: 'Backlog' }), (e: Error) =>
        e instanceof BoardError && /type label/.test(e.message) && TYPES.every((t) => e.message.includes(t)));
      assert.equal(gh.calls.length, 0, 'no issue is made');
    }
    const gh = fakeGh(TYPED_COLUMNS);
    assert.equal(createCard(typed, gh.run, { title: 'A new idea', labels: ['feature', 'area: Trips'], column: 'Backlog' }).number, 42);
  });

  it('showing a card returns its title, text, labels and column', () => {
    const gh = fakeGh();
    const card = readCard(board, gh.run, 7);
    assert.deepEqual(card, {
      number: 7, title: 'Push once per category (W9)', body: 'The row text.', state: 'OPEN',
      url: 'https://github.com/someone/app/issues/7', labels: ['next', 'area: workflow and docs'], column: 'Ready',
    });
  });

  it('a comment reaches the card as text on stdin, not as part of a command', () => {
    const gh = fakeGh();
    commentCard(board, gh.run, 7, 'Done; `rm -rf /` $(whoami)');
    const c = call(gh.calls, 'issue comment')!;
    assert.equal(c.args[2], '7');
    assert.equal(flag(c.args, '--repo'), 'someone/app');
    assert.equal(c.input, 'Done; `rm -rf /` $(whoami)');
    assert.ok(c.args.every((a) => !a.includes('rm -rf')));
  });
});

describe('searching the board', () => {
  // A gh that answers `issue list` with two cards, one open on the board and one closed.
  const found = [
    { number: 5, title: 'Export to PDF', state: 'OPEN', projectItems: [{ title: 'My Project', status: { name: 'Backlog' } }] },
    { number: 9, title: 'Hill reps in the plan', state: 'CLOSED', projectItems: [] },
  ];
  const searchGh = (answer: unknown = found) => {
    const calls: string[][] = [];
    const run = (args: string[]): GhResult => { calls.push(args); return ok(answer); };
    return { run, calls };
  };

  it('searching the board returns the number, title, state and column of each card that matches the words', () => {
    const gh = searchGh();
    const cards = searchCards(board, gh.run, 'export to pdf');
    assert.deepEqual(cards, [
      { number: 5, title: 'Export to PDF', state: 'open', column: 'Backlog' },
      { number: 9, title: 'Hill reps in the plan', state: 'closed', column: null },
    ]);
    assert.ok(gh.calls[0].includes('--state') && gh.calls[0][gh.calls[0].indexOf('--state') + 1] === 'all');
    assert.equal(gh.calls[0][gh.calls[0].indexOf('--limit') + 1], '20');
  });

  it('a search with no words is refused with a plain sentence', () => {
    const gh = searchGh();
    assert.throws(() => searchCards(board, gh.run, '   '), (e: Error) => e instanceof BoardError && /words/.test(e.message));
    assert.equal(gh.calls.length, 0);
  });

  it('search words reach gh as one argument, not as a command', () => {
    const gh = searchGh();
    const words = `it's \`rm -rf /\`; whoami "x"`;
    searchCards(board, gh.run, words);
    const args = gh.calls[0];
    assert.equal(args[args.indexOf('--search') + 1], words);
    assert.equal(args.filter((a) => a.includes('whoami')).length, 1);
  });

  it('a search that finds nothing returns an empty list', () => {
    assert.deepEqual(searchCards(board, searchGh([]).run, 'nothing here'), []);
  });
});
