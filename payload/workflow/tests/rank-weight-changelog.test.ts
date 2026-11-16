// What to build next (lib/rank.mjs), the page-weight budget (lib/perfbudget.mjs) and the changelog from the commits
// (lib/changelog.mjs): three answers a script gives the same way every time.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inbox, rankCards, scoreCard } from '../../workflow/tools/lib/rank.mjs';
import { weighPages, weightLine } from '../../workflow/tools/lib/perfbudget.mjs';
import { changelogText, groupCommits } from '../../workflow/tools/lib/changelog.mjs';

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
  it("leaves out Renovate's Dependency Dashboard, under its default title or the one renovate.json gives it", () => {
    const dash = (n: number, title: string) => ({ ...card(n, []), title, column: null });
    const all = [{ ...card(8, ['feedback']), column: null }, dash(10, 'Dependency Dashboard'), dash(11, 'Renovate dashboard')];
    assert.deepEqual(inbox(all).map((c) => c.number), [8, 11]);
    assert.deepEqual(inbox(all, undefined, ['Dependency Dashboard', 'Renovate dashboard']).map((c) => c.number), [8]);
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

  it('a page over the budget from before has a baseline: a little heavier passes, much heavier fails, and the budget still counts', () => {
    const at = (kb: number) => [{ path: 'dist/app.js', gzipBytes: kb * 1024 }];
    const same = weighPages(at(330), 250, 329);
    assert.equal(same.ok, true, 'about as heavy as before: ordinary changes go on');
    assert.match(weightLine(same), /over the budget of 250 KB as it was before \(the baseline: 329 KB, with room up to 345\.5 KB\)/);
    assert.equal(weighPages(at(360), 250, 329).ok, false, 'much heavier than before fails');
    assert.equal(weighPages(at(260), 250, 200).ok, false, 'a baseline under the budget gives no room');
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
  const { healthMoves, shipping } = await import('../../workflow/tools/lib/retro.mjs');
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

describe('load tests', async () => {
  const { k6Script, readSummary, stagesFor } = await import('../../workflow/tools/lib/load.mjs');
  it('makes the stages of each kind from the expected users', () => {
    assert.deepEqual(stagesFor('smoke'), [{ duration: '30s', target: 1 }]);
    assert.deepEqual(stagesFor('stress', { users: 10 }).map((s) => s.target), [10, 20, 40, 0, 0]);
    assert.equal(Math.max(...stagesFor('spike', { users: 10 }).map((s) => s.target)), 100);
    assert.throws(() => stagesFor('lunch'), /unknown kind of test "lunch"/);
  });
  it('writes the goals into the script as k6 thresholds, and walks the configured paths', () => {
    const s = k6Script('load', { paths: ['health', '/api/plans'], users: 5 }, { p95ms: 250, errorRate: 0.02 });
    assert.match(s, /"http_req_duration":\["p\(95\)<250"\]/);
    assert.match(s, /"http_req_failed":\["rate<0\.02"\]/);
    assert.match(s, /const PATHS = \["\/health","\/api\/plans"\];/);
  });
  it('reads k6\'s summary against the goals, in plain words', () => {
    const good = { metrics: { http_req_duration: { 'p(95)': 120.4, med: 40, max: 400 }, http_req_failed: { value: 0.001 }, http_reqs: { count: 1200, rate: 19.96 }, vus_max: { value: 20 } } };
    const v = readSummary(good, 'load', { p95ms: 300, errorRate: 0.01 });
    assert.equal(v.ok, true);
    assert.deepEqual(v.lines.slice(0, 2), ['load: 1200 requests, 20 a second, up to 20 users at once', '95% answered within 120 ms (goal under 300 ms) ok; the slowest 400 ms, the middle 40 ms']);
    const slow = readSummary({ metrics: { http_req_duration: { 'p(95)': 900 }, http_req_failed: { value: 0.05 } } }, 'stress', {});
    assert.equal(slow.ok, false);
    assert.match(slow.lines.join('\n'), /TOO SLOW[\s\S]*TOO MANY[\s\S]*where it broke/);
  });
});

describe('how we will know it worked, read back', async () => {
  const { signsDue } = await import('../../workflow/tools/lib/retro.mjs');
  const shipped = (n: number, on: string, ...more: string[]) => ({ number: n, title: `card ${n}`,
    comments: [{ body: `Shipped. How we will know it worked: ten plans made in a week, look on ${on}.` }, ...more.map((body) => ({ body }))] });
  it('lists the signs whose date has come, oldest first, and not the later ones', () => {
    const due = signsDue([shipped(2, '2026-11-10'), shipped(1, '2026-11-01'), shipped(3, '2026-12-01')], new Date('2026-11-16T09:00:00Z'));
    assert.deepEqual(due.map((d) => [d.number, d.on]), [[1, '2026-11-01'], [2, '2026-11-10']]);
    assert.equal(due[0].sign, 'ten plans made in a week');
  });
  it('a "Looked:" comment after it closes it', () => {
    assert.deepEqual(signsDue([shipped(1, '2026-11-01', 'Looked: 14 plans, it worked.')], new Date('2026-11-16')), []);
  });
});

describe('the signs read back without a board, and in other words', async () => {
  const { signsDue, signsDueInProduct } = await import('../../workflow/tools/lib/retro.mjs');
  it('takes the first date after the sign, whatever the words between', () => {
    const card = (body: string) => [{ number: 1, title: 't', comments: [{ body }] }];
    assert.equal(signsDue(card('How we will know it worked: ten plans a week, check by 2026-11-01.'), new Date('2026-11-16'))[0]?.sign, 'ten plans a week');
    assert.equal(signsDue(card('How we will know it worked: people come back (2026-11-02)'), new Date('2026-11-16'))[0]?.on, '2026-11-02');
  });
  it('reads docs/PRODUCT.md, Signs to look at: the due ones, not the looked-at or later ones, nor another section', () => {
    const md = '# P\n\n## Signs to look at\n- 2026-11-01: ten plans a week (Plans: rest weeks)\n- 2026-11-03: x Looked: yes, 14\n- 2026-12-01: later\n\n## What we learned\n- 2026-10-01: not a sign\n';
    assert.deepEqual(signsDueInProduct(md, new Date('2026-11-16')), [{ sign: 'ten plans a week', on: '2026-11-01', what: 'Plans: rest weeks' }]);
  });
});
