// The speed check's judgement (workflow/tools/lib/speed.mjs): today's numbers are the baseline the first time, a page that got
// slower than it allows fails, and Google's lines for good are said as advice only.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { downloadLine, limitOf, median, speedVerdict, timedSteps, walkVerdict } from '../../workflow/tools/lib/speed.mjs';

describe('how fast a page is on a slow phone', () => {
  it('the first time, today\'s numbers are the baseline and it passes', () => {
    const v = speedVerdict('phone', { firstMs: 3100, usableMs: 7000, tapMs: 90 }, null);
    assert.equal(v.ok, true);
    assert.match(v.lines[0] ?? '', /^speed \(phone\): first screen 3\.1 s, usable 7 s, a tap answered 90 ms .*today's numbers are its baseline/);
    assert.match(v.lines.join('\n'), /advice: first screen is over Google's line for good \(2\.5 s\)/);
  });
  it('fails a page slower than its baseline allows, and says by how much; a little slower passes', () => {
    const base = { firstMs: 1000, usableMs: 2000, tapMs: 100 };
    assert.equal(speedVerdict('phone', { firstMs: 1300, usableMs: 2100, tapMs: 120 }, base).ok, true, 'runs move a little');
    const v = speedVerdict('phone', { firstMs: 1000, usableMs: 7000, tapMs: 180 }, base);
    assert.deepEqual(v.slower, ['usableMs', 'tapMs']);
    assert.match(v.lines.join('\n'), /slower than before: usable 7 s \(was 2 s, allowed up to 2\.7 s\)/);
    assert.equal(limitOf(100, 'tapMs'), 175);
  });
  it('a walk is timed as the moments a person waits for: each action with the waits after it, by its name', () => {
    const g = timedSteps({ path: '/', steps: [{ see: 'Plan' }, { click: 'Plan', name: 'plan a request' }, { see: '3 routes' }, { swipe: 'left' }, { see: 'Card 2', name: 'swipe to the next card' }] }, (s) => `step ${Object.keys(s)[0]}`);
    assert.deepEqual(g.map((x) => [x.name, x.steps.length]), [['open the app', 2], ['plan a request', 2], ['swipe to the next card', 2]]);
    assert.deepEqual(timedSteps({ open: 'open the deck', steps: [{ swipe: 'left' }, { swipe: 'left' }] }, () => 'swipe "left"').map((x) => x.name), ['open the deck', 'swipe "left"', 'swipe "left" (2)'], 'each step its own name');
  });
  it('says what a step downloaded, the biggest first, a run of tiles as one', () => {
    const tiles = Array.from({ length: 14 }, (_, i) => ({ url: `https://tiles.example.org/v1/${i}.pbf`, bytes: 13 * 1024 }));
    assert.equal(downloadLine([{ url: 'http://127.0.0.1/assets/maplibre-gl-a1.js', bytes: 210 * 1024 }, ...tiles, { url: 'http://127.0.0.1/assets/app.js', bytes: 1024 }]),
      'downloaded 393 KB: maplibre-gl-a1.js 210 KB, tiles.example.org/v1 x14 182 KB, app.js 1 KB');
    const chunks = ['maplibre-gl-a1.js', 'index-b2.js', 'deck-c3.js', 'card-d4.js'].map((f, i) => ({ url: `http://127.0.0.1/assets/${f}`, bytes: (i ? 10 : 200) * 1024 }));
    assert.match(downloadLine(chunks), /^downloaded 230 KB: maplibre-gl-a1\.js 200 KB/, 'the app\'s own chunks are never merged: the heavy one is named');
  });
  it('a walk step says its numbers and the ones before, and fails when it got clearly slower', () => {
    const base = { 'swipe to the next card': { slowMs: 900, fastMs: 200 } };
    const same = walkVerdict('phone', [{ name: 'swipe to the next card', slowMs: 950, fastMs: 210 }], base);
    assert.equal(same.ok, true);
    assert.equal(same.lines[1], '  swipe to the next card: 950 ms on slow 4G, 210 ms on fast 4G (was 900 ms, 200 ms)');
    const worse = walkVerdict('phone', [{ name: 'swipe to the next card', slowMs: 2600, fastMs: 210, downloads: [{ url: 'http://x/maplibre.js', bytes: 210 * 1024 }] }], base);
    assert.deepEqual([worse.ok, worse.slower], [false, ['swipe to the next card']]);
    assert.match(worse.lines.join('\n'), /2\.6 s on slow 4G.* SLOWER\n {4}downloaded 210 KB: maplibre\.js 210 KB/);
    assert.match(walkVerdict('phone', [{ name: 'open the app', slowMs: 4000, fastMs: 1100 }], null).lines[0], /today's numbers are its baseline/);
  });
  it('a page with no tap set is timed without one, and the median ignores a run that measured nothing', () => {
    assert.equal(speedVerdict('desk', { firstMs: 800, usableMs: 900, tapMs: null }, { firstMs: 800, usableMs: 900, tapMs: 50 }).ok, true);
    assert.equal(median([300, null, 100, 200]), 200);
    assert.equal(median([]), null);
  });
});
