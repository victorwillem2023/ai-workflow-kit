// What to build next (lib/rank.mjs), the page-weight budget (lib/perfbudget.mjs) and the changelog from the commits
// (lib/changelog.mjs): three answers a script gives the same way every time.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inbox, rankCards, scoreCard } from '../../tools/workflow/lib/rank.mjs';
import { weighPages, weightLine } from '../../tools/workflow/lib/perfbudget.mjs';
import { changelogText, groupCommits } from '../../tools/workflow/lib/changelog.mjs';

const card = (number: number, labels: string[], column = 'Backlog', state = 'open') => ({ number, title: `card ${number}`, state, labels, column });

describe('what to build next', () => {
  it('puts first-version cards first, then value for the effort, a low feasibility counting against', () => {
    const cards = [
      card(1, ['feature', 'value: high', 'effort: large']),
      card(2, ['feature', 'value: medium', 'effort: small']),
      card(3, ['feature', 'value: low', 'effort: small', 'first version']),
      card(4, ['feature', 'value: high', 'effort: small', 'feasibility: low']),
      card(5, ['feature', 'value: high', 'effort: small'], 'In progress'),
      card(6, ['feature', 'value: high', 'effort: small'], 'Ready', 'closed'),
    ];
    assert.deepEqual(rankCards(cards, { firstVersion: 'first version' }).map((c) => c.number), [3, 2, 4, 1]);
  });
  it('says why in words, and treats a missing value as in between', () => {
    const s = scoreCard(card(7, ['bug', 'effort: small']), 'first version');
    assert.equal(s.why, 'value not set, effort small, a bug');
    assert.equal(s.score, 1.78);
  });
  it('lists open issues that are not on the board, leaving the reports out', () => {
    const all = [{ ...card(8, ['feedback']), column: null }, { ...card(9, ['security-report']), column: null }, card(10, ['feature'])];
    assert.deepEqual(inbox(all).map((c) => c.number), [8]);
  });
});

describe('the page-weight budget', () => {
  it('adds up the compressed files and names the biggest when over', () => {
    const files = [{ path: 'dist/assets/index.js', gzipBytes: 200 * 1024 }, { path: 'dist/assets/chart.js', gzipBytes: 80 * 1024 }, { path: 'dist/assets/index.css', gzipBytes: 10 * 1024 }];
    const v = weighPages(files, 250);
    assert.equal(v.ok, false);
    assert.equal(v.kb, 290);
    assert.match(weightLine(v), /290 KB, the budget is 250 KB.*The biggest: dist\/assets\/index\.js 200 KB, dist\/assets\/chart\.js 80 KB/s);
    assert.equal(weightLine(weighPages(files.slice(2), 250)), 'page weight: 10 KB of 250 KB (compressed)');
  });
});

describe('the changelog', () => {
  it('groups the commit subjects by area, leaving the workflow commits and merges out', () => {
    const groups = groupCommits([
      { hash: 'aaaaaaa1', subject: 'Plans: a week can be moved by a day' },
      { hash: 'bbbbbbb2', subject: 'Workflow: kit 2.2.0' },
      { hash: 'ccccccc3', subject: 'Sign-in: Google accounts on the list can enter' },
      { hash: 'ddddddd4', subject: 'Plans: the long run grows by at most 10% a week' },
      { hash: 'eeeeeee5', subject: 'Merge branch x' },
      { hash: 'fffffff6', subject: 'Release v0.1.0' },
    ]);
    assert.deepEqual(groups.map((g) => [g.area, g.items.length]), [['Plans', 2], ['Sign-in', 1]]);
    assert.match(changelogText('v0.2.0', groups), /^## v0\.2\.0\n\n### Plans\n- a week can be moved by a day \(aaaaaaa\)/);
    assert.match(changelogText('2026-11-15', []), /Nothing that changes the app/);
  });
});

describe('the retro numbers', async () => {
  const { healthMoves, shipping } = await import('../../tools/workflow/lib/retro.mjs');
  it('counts features per week, leaving workflow commits out, and the streak up to last week', () => {
    const now = new Date('2026-11-18T12:00:00Z'); // a Wednesday, week 47
    const commits = [
      { date: '2026-11-10T10:00:00Z', subject: 'Plans: move a week' },
      { date: '2026-11-11T10:00:00Z', subject: 'Workflow: kit 2.3.0' },
      { date: '2026-11-03T10:00:00Z', subject: 'Sign-in: Google' },
      { date: '2026-10-20T10:00:00Z', subject: 'Plans: the first plan' },
    ];
    const s = shipping(commits, now, 5);
    assert.deepEqual(s.weeks.map((w) => w.features), [1, 0, 1, 1, 0]);
    assert.equal(s.streak, 2);
  });
  it('says which known exceptions moved, and which way', () => {
    const lines = healthMoves({ sizes: { 'a.ts': 500 }, boundaries: [] }, { sizes: {}, boundaries: ['x'] }, 10, 12);
    assert.deepEqual(lines, ['big files: 1 -> 0 (better)', 'layer exceptions: 0 -> 1 (worse: a baseline grew, look at why)', 'test files: 10 -> 12']);
  });
});
