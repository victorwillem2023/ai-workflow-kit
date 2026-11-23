// The stopping note (lib/stopped.mjs): what was said, with the push state asked of git when it is shown, never stored.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { markPushed, staleCards, stoppedLines } from '../../workflow/tools/lib/stopped.mjs';

const now = Date.parse('2026-11-22T10:00:00Z');
const note = { at: '2026-11-20T23:04:29Z', text: 'Shipped #543; next: pick with /work' };

describe('the stopping note', () => {
  it('says features wait to be pushed only when git says local main is ahead of origin', () => {
    assert.deepEqual(stoppedLines(note, { ahead: 2, now }), ['where you stopped (2026-11-20): Shipped #543; next: pick with /work (2 features on local main, not pushed (push: node workflow/scripts/session.mjs --push))']);
    assert.deepEqual(stoppedLines(note, { ahead: 0, now }), ['where you stopped (2026-11-20): Shipped #543; next: pick with /work']);
  });
  it('says the waiting features on their own when there is no note, and nothing when none wait', () => {
    assert.deepEqual(stoppedLines(null, { ahead: 1, now }), ['1 feature on local main, not pushed (push: node workflow/scripts/session.mjs --push)']);
    assert.deepEqual(stoppedLines(null, { ahead: 0, now }), []);
    assert.deepEqual(stoppedLines({ ...note, at: '2026-10-01T00:00:00Z' }, { ahead: 0, now }), [], 'a note three weeks old is not said');
  });
  it('a note written before the last push says it was pushed since', () => {
    assert.match(stoppedLines({ ...note, pushedAt: '2026-11-21T08:00:00Z' }, { now })[0], /\(pushed since, 2026-11-21\)$/);
    assert.doesNotMatch(stoppedLines({ ...note, pushedAt: '2026-11-19T08:00:00Z' }, { now })[0], /pushed since/, 'a push before the note is not this note\'s');
  });
  describe('markPushed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stopped-'));
    after(() => rmSync(dir, { recursive: true, force: true }));
    it('stamps the note as pushed and keeps its text; no note: nothing is written', () => {
      const file = join(dir, 'workflow-stopped.json');
      assert.equal(markPushed(file), false);
      writeFileSync(file, JSON.stringify(note));
      assert.equal(markPushed(file, new Date('2026-11-21T08:00:00Z')), true);
      assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { ...note, pushedAt: '2026-11-21T08:00:00.000Z' });
    });
  });
});

describe('a note that points at a card done already', () => {
  it('says so when shown, so the next card comes from the board and not from the note', () => {
    const n = { at: '2026-11-22T09:00:00Z', text: 'Shipped #607 and #606; next: #590, then #609' };
    assert.match(stoppedLines(n, { now, done: [607, 606, 590] })[0], /\(careful: #590 is done already, so check what comes next on the board\)$/, 'what was shipped is meant to be done');
    assert.doesNotMatch(stoppedLines(n, { now, done: [607, 606] })[0], /careful/);
    assert.doesNotMatch(stoppedLines(n, { now, done: [] })[0], /careful/);
    assert.deepEqual(staleCards('next: #590', [590, 1]), [590]);
    assert.deepEqual(staleCards('Shipped #607, next: #590', [607, 590]), [590], 'a comma before what comes next');
  });
});
