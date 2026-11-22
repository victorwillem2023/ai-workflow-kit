// The board triage behind /tidy (lib/triage.mjs): what on the board needs a decision, and the focus.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { likelyDuplicates, renderTriage, triage, triageLine } from '../../workflow/tools/lib/triage.mjs';
import { roomToStart } from '../../workflow/tools/lib/focus.mjs';

const now = new Date('2026-11-15T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const card = (number: number, title: string, column: string | null, labels: string[] = [], days = 1) => ({ number, title, state: 'open', labels, column, createdAt: ago(days), updatedAt: ago(days) });

describe('the board triage', () => {
  const cards = [
    card(1, 'Export the week as a PDF', 'In progress', ['feature', 'value: high'], 20),
    card(2, 'Dark mode toggle', 'In progress', ['ui', 'value: low'], 2),
    card(3, 'Sync with Garmin', 'In progress', ['feature', 'value: medium'], 1),
    card(4, 'Coach notes on a run', 'Waiting for your check', ['feature'], 5),
    card(5, 'Strava import of activities', 'Backlog', ['feature', 'value: high', 'effort: small']),
    card(6, 'Import activities from Strava', 'Backlog', ['feature']),
    card(7, 'The app crashes on sign-in', null, ['bug'], 9),
    card(8, 'Wait for the API key', 'Blocked', ['feature', 'value: medium'], 30),
    { ...card(9, 'Old closed idea', 'Done'), state: 'closed' },
  ];
  const t = triage(cards, { now, wip: 2 });
  const kinds = t.findings.map((f) => f.kind);
  it('finds too much started, a card waiting for the owner, stalled and long-blocked work, the inbox, unranked cards and duplicates', () => {
    assert.deepEqual(kinds, ['too-much-started', 'waiting-for-you', 'stalled', 'blocked-long', 'inbox', 'unranked', 'duplicate']);
    assert.deepEqual(t.findings.find((f) => f.kind === 'stalled')?.cards.map((c) => c.number), [1]);
    assert.deepEqual(t.findings.find((f) => f.kind === 'duplicate')?.cards.map((c) => c.number), [5, 6]);
  });
  it('puts finishing first when the limit is reached, and names the best card to start after', () => {
    assert.deepEqual(t.focus.finish.map((c) => c.number), [1, 2, 3]);
    assert.equal(t.focus.start[0].number, 5);
    assert.match(renderTriage(t), /^board: 8 open, 3 in progress, 2 in the backlog, 1 in the inbox\nfocus: finish #1, #2, #3; then start #5/);
    assert.match(triageLine(t), /the board needs 7 decisions: .*\/tidy/);
  });
  it("triage's too-much-started gives the same count as --room", () => {
    const sessions = [{ topic: 'export', cards: [1, 2] }];
    const grouped = triage(cards, { now, wip: 2, sessions });
    assert.equal(grouped.counts.work, roomToStart(cards, 2, sessions).count);
    assert.ok(!grouped.findings.some((f) => f.kind === 'too-much-started'), 'three cards in two pieces of work fit a limit of two');
    assert.match(renderTriage(grouped), /^board: 8 open, 3 cards in progress in 2 pieces of work, /);
    const over = triage(cards, { now, wip: 1, sessions });
    assert.equal(over.findings[0].what, '2 pieces of work in progress, 3 cards (the limit is 1)');
    assert.equal(t.counts.work, 3);
  });
  it('is quiet on a tidy board, and offers old low-value cards for pruning when the backlog grows', () => {
    const tidy = triage([card(5, 'Strava import', 'Ready', ['value: high'])], { now });
    assert.deepEqual([tidy.findings, triageLine(tidy)], [[], '']);
    const many = Array.from({ length: 35 }, (_, i) => card(100 + i, `Idea number ${i} about ${'xyz'.repeat(i % 7 + 1)}`, 'Backlog', ['value: low'], 90));
    assert.equal(triage(many, { now }).findings.find((f) => f.kind === 'prune')?.cards.length, 10);
  });
  it('does not pair short titles that only share a word or two', () => {
    const pairs = (a: string, b: string) => likelyDuplicates([card(1, a, 'Backlog'), card(2, b, 'Backlog')]).length;
    // two words
    assert.equal(pairs('Dark mode', 'Dark theme'), 0);
    assert.equal(pairs('Export PDF', 'Export CSV'), 0);
    assert.equal(pairs('Garmin sync', 'Garmin login'), 0);
    // three words, one of them different or extra
    assert.equal(pairs('Garmin sync bug', 'Garmin sync'), 0);
    assert.equal(pairs('Strava import settings', 'Strava import'), 0);
    assert.equal(pairs('Export plan PDF', 'Export plan CSV'), 0);
    assert.equal(pairs('Weekly plan email', 'Weekly plan view'), 0);
  });
  it('still pairs short titles with the same words in another order', () => {
    const pairs = (a: string, b: string) => likelyDuplicates([card(1, a, 'Backlog'), card(2, b, 'Backlog')]).length;
    assert.equal(pairs('Dark mode toggle', 'Toggle dark mode'), 1);
    assert.equal(pairs('Login fix', 'Fix login'), 1);
    assert.equal(pairs('Strava import of activities', 'Import activities from Strava'), 1);
  });
  it('calls titles duplicates only when they share most of their words', () => {
    assert.equal(likelyDuplicates([card(1, 'Export the plan as PDF', 'Backlog'), card(2, 'Share the plan by link', 'Backlog')]).length, 0);
  });
});
