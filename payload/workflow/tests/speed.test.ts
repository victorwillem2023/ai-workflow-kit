// The speed check's judgement (workflow/tools/lib/speed.mjs): today's numbers are the baseline the first time, a page that got
// slower than it allows fails, and Google's lines for good are said as advice only.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { limitOf, median, speedVerdict } from '../../workflow/tools/lib/speed.mjs';

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
  it('a page with no tap set is timed without one, and the median ignores a run that measured nothing', () => {
    assert.equal(speedVerdict('desk', { firstMs: 800, usableMs: 900, tapMs: null }, { firstMs: 800, usableMs: 900, tapMs: 50 }).ok, true);
    assert.equal(median([300, null, 100, 200]), 200);
    assert.equal(median([]), null);
  });
});
