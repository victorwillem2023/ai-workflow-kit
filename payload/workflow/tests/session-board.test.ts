// workflow/scripts/session.mjs and the board: --card keeps the card in step (In progress at the start, Waiting for your check at
// the hand-over, Done at the finish, --partial for a card that stays open), and a board that cannot be reached never stops a start or a finish.
// A fake `gh` records the calls (workflow/tests/session-repo.ts): no network.
// Run in throwaway git repos: a bare "origin" and a clone in the shape of the project (workflow/tests/session-repo.ts).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitIn, ghCalls, ghCmd, git, makeRepo, OPTION, roots, run } from './session-repo';

// the fake gh knows card 42 on project 1 (workflow/tests/session-repo.ts); the project's own config may name no board yet
// (--allow-empty: or it names project 1 already)
const setup = () => {
  const r = makeRepo();
  const cfg = JSON.parse(readFileSync(join(r.main, 'workflow/config.json'), 'utf8'));
  writeFileSync(join(r.main, 'workflow/config.json'), JSON.stringify({ ...cfg, board: { ...cfg.board, project: 1 } }));
  git(r.main, 'add', '-A'); git(r.main, 'commit', '-q', '--allow-empty', '-m', 'board'); git(r.main, 'push', '-q', 'origin', 'main');
  return r;
};

describe('a session and its card', () => {
  after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

  it('a session without --card never touches the board', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'new.txt', 'x\n', 'add');
    assert.ok(run(r, '--finish', 'a', '--no-checks').ok);
    assert.equal(ghCalls(r).length, 0);
  });

  it('handing over moves the session\'s card to Waiting for your check; finishing moves it to Done and does not close it', () => {
    const r = setup();
    assert.ok(run(r, 'a', '--card', '42').ok);
    commitIn(r.wt('a'), 'new.txt', 'x\n', 'Hills: a new thing for the user');
    const handed = run(r, '--handover', 'a');
    assert.ok(handed.ok, handed.out);
    const done = run(r, '--finish', 'a', '--no-checks');
    assert.ok(done.ok, done.out);
    const calls = ghCalls(r);
    const edits = calls.filter((c) => ghCmd(c) === 'project item-edit');
    const to = (e: { args: string[] }) => e.args[e.args.indexOf('--single-select-option-id') + 1];
    assert.deepEqual(edits.map(to), [OPTION['In progress'], OPTION['Waiting for your check'], OPTION.Done], 'at the start, the hand-over and the finish');
    const comments = calls.filter((c) => ghCmd(c) === 'issue comment');
    assert.match(comments[1].input, /ready for your check/);
    assert.match(comments[2].input, /Hills: a new thing for the user/, 'the comment holds the commit\'s subject');
    assert.ok(calls.every((c) => !/close|delete/.test(ghCmd(c)) && !c.args.includes('--state')), 'the card is not closed');
  });

  it('finishing with --partial leaves the card where it was and comments what is left', () => {
    const r = setup();
    assert.ok(run(r, 'a', '--card', '42').ok);
    commitIn(r.wt('a'), 'new.txt', 'x\n', 'Hills: the first half');
    const done = run(r, '--finish', 'a', '--no-checks', '--partial', 'the map part; "quotes" & $(rm -rf x)');
    assert.ok(done.ok, done.out);
    const calls = ghCalls(r);
    assert.equal(calls.filter((c) => ghCmd(c) === 'project item-edit').length, 1, 'only the start moved the card');
    const comments = calls.filter((c) => ghCmd(c) === 'issue comment');
    assert.equal(comments[1].input, 'Finished on the local main: Hills: the first half. Still open: the map part; "quotes" & $(rm -rf x)', 'the text reaches gh on stdin, unchanged');
    assert.ok(comments[1].args.every((x) => !x.includes('the map part')), 'and not as part of a command line');
    assert.ok(calls.every((c) => !/close|delete/.test(ghCmd(c))), 'the card is not closed');
  });

  it('finishing with --partial moves a card from Backlog to In progress', () => {
    const r = setup();
    assert.ok(run(r, 'a', '--card', '42').ok);
    r.env.CARD_COLUMN = 'Backlog';
    commitIn(r.wt('a'), 'new.txt', 'x\n', 'Hills: the first half');
    const done = run(r, '--finish', 'a', '--no-checks', '--partial', 'the rest');
    assert.ok(done.ok, done.out);
    const edits = ghCalls(r).filter((c) => ghCmd(c) === 'project item-edit');
    assert.equal(edits.length, 2);
    assert.equal(edits[1].args[edits[1].args.indexOf('--single-select-option-id') + 1], OPTION['In progress']);
    assert.match(ghCalls(r).filter((c) => ghCmd(c) === 'issue comment')[1].input, /Still open: the rest$/);
  });

  it('finishing without --partial moves the card to Done', () => {
    const r = setup();
    assert.ok(run(r, 'a', '--card', '42').ok);
    commitIn(r.wt('a'), 'new.txt', 'x\n', 'Hills: all of it');
    assert.ok(run(r, '--finish', 'a', '--no-checks').ok);
    const edits = ghCalls(r).filter((c) => ghCmd(c) === 'project item-edit');
    assert.equal(edits[1].args[edits[1].args.indexOf('--single-select-option-id') + 1], OPTION.Done);
    assert.doesNotMatch(ghCalls(r).filter((c) => ghCmd(c) === 'issue comment')[1].input, /Still open/);
  });

  it('--partial with no text is refused and changes nothing', () => {
    const r = setup();
    assert.ok(run(r, 'a', '--card', '42').ok);
    commitIn(r.wt('a'), 'new.txt', 'x\n', 'Hills: the first half');
    const before = git(r.main, 'rev-parse', 'main');
    const calls = ghCalls(r).length;
    for (const args of [['--partial'], ['--partial', '  '], ['--partial', '--no-checks']]) {
      const done = run(r, '--finish', 'a', ...(args[0] === '--partial' && args[1] === '--no-checks' ? args : ['--no-checks', ...args]));
      assert.equal(done.ok, false, args.join(' '));
      assert.match(done.out, /--partial/);
    }
    assert.equal(git(r.main, 'rev-parse', 'main'), before, 'main did not move');
    assert.ok(existsSync(r.wt('a')), 'the session is still there');
    assert.equal(ghCalls(r).length, calls, 'the board was not touched');
  });

  it('a board that cannot be reached does not stop a start or a finish', () => {
    const r = setup();
    r.env.GH_FAIL = '1';
    const made = run(r, 'a', '--card', '42');
    assert.ok(made.ok, made.out);
    assert.match(made.out, /board/i);
    assert.ok(existsSync(r.wt('a')), 'the session was made');
    commitIn(r.wt('a'), 'new.txt', 'x\n', 'add');
    const done = run(r, '--finish', 'a', '--no-checks');
    assert.ok(done.ok, done.out);
    assert.match(done.out, /board/i);
    assert.ok(existsSync(join(r.main, 'new.txt')), 'the feature is on main');
  });
});
