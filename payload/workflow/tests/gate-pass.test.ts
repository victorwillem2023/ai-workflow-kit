// What the gate remembers between runs (lib/shippass.mjs) and the switch to work lines (lib/size.mjs, switchToWork): the pieces a
// release broke or left untested. Run in a throwaway git repo.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gatePassAdvice, gatePassOf, isTreeish, recordGatePass, treeOf, untrackedInputs } from '../../workflow/tools/lib/shippass.mjs';
import { switchToWork } from '../../workflow/tools/lib/size.mjs';

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'gate-pass-'));
  dirs.push(d);
  const git = (...a: string[]) => execFileSync('git', a, { cwd: d, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  writeFileSync(join(d, 'a.txt'), 'one\n');
  git('add', '-A'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'start');
  return { d, git };
}

describe('what the gate remembers', () => {
  it('takes a tree as --base, as --finish passes the one gate:ship passed on, and a commit; not a name git does not have', () => {
    const { d, git } = repo();
    assert.equal(isTreeish(d, git('rev-parse', 'HEAD')), true, 'a commit');
    assert.equal(isTreeish(d, treeOf(d)), true, 'the ship pass: a tree');
    assert.equal(isTreeish(d, '0123456789abcdef0123456789abcdef01234567'), false);
  });
  it('a changed or newly arrived spec changes what the pass is keyed on; the advice of a pass is kept to say again', () => {
    const { d } = repo();
    const before = untrackedInputs(d);
    mkdirSync(join(d, 'workflow/specs'), { recursive: true });
    writeFileSync(join(d, 'workflow/specs', 'hills.md'), '# Spec: hills\n');
    const arrived = untrackedInputs(d);
    assert.notEqual(arrived, before, 'a spec arrived');
    writeFileSync(join(d, 'workflow/specs', 'hills.md'), '# Spec: hills, approved\n');
    assert.notEqual(untrackedInputs(d), arrived, 'the spec changed');
    writeFileSync(join(d, '.env'), 'PORT=1\n');
    assert.notEqual(untrackedInputs(d), arrived);
    recordGatePass(d, 'the-key', ['advice: one', 'advice: two']);
    assert.equal(gatePassOf(d), 'the-key');
    assert.deepEqual(gatePassAdvice(d), ['advice: one', 'advice: two']);
  });
});

describe('the switch to work lines', () => {
  it('lets a file under the old line limit join the list with no reason, and still refuses a real one', () => {
    const old = { sizes: { 'src/big.ts': 601 } };
    const work = { 'src/big.ts': 263, 'src/mid.ts': 250 };
    const ok = switchToWork(work, old, new Map([['src/big.ts', 601], ['src/mid.ts', 380]]), 400, null);
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.joined, ['src/mid.ts']);
    assert.deepEqual(ok.next, { 'src/big.ts': 263, 'src/mid.ts': 250 });
    const real = switchToWork({ ...work, 'src/new.ts': 300 }, old, new Map([['src/big.ts', 601], ['src/mid.ts', 380], ['src/new.ts', 520]]), 400, null);
    assert.equal(real.ok, false, 'a file over the old limit too is new: it needs its reason');
    assert.deepEqual(real.raised.map((x) => x.file), ['src/new.ts']);
    assert.equal(switchToWork({ 'src/mid.ts': 250 }, { sizeMeasure: 'work', sizes: { 'src/big.ts': 263 } }, new Map([['src/mid.ts', 380]]), 400, null).ok, false, 'after the switch, a new big file is new again');
  });
});
