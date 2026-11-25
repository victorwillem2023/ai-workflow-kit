// The smoothness check (workflow/scripts/smooth.mjs): what the frames say, and the command line. The browser itself is not started here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSmoothArgs, verdict } from '../../workflow/scripts/smooth.mjs';

const steady = (n: number, gap = 1000 / 60) => Array.from({ length: n }, (_, i) => i * gap);

describe('does it move smoothly', () => {
  it('a frame every beat is smooth; one that waited three beats dropped two', () => {
    assert.equal(verdict(steady(120), [], { task: 0.5 }).stutters, false);
    const frames = steady(121).filter((_, i) => i !== 61 && i !== 62);
    const v = verdict(frames, [], {});
    assert.equal(v.dropped, 2);
    assert.equal(v.stutters, false, 'two dropped in 120 is under the limit');
  });
  it('stutters when too many frames drop, or one frame is long enough to see, and says where the work went', () => {
    const v = verdict(steady(60, 40), [120, 60], { task: 1.2, script: 0.9, layout: 0.2, style: 0.1 }, 4);
    assert.equal(v.stutters, true);
    assert.match(v.lines.at(-1) ?? '', /^STUTTERS: \d+% of the frames dropped .*the biggest share of the work is script/);
    assert.match(v.lines[1], /busy: 2 times, the longest 120 ms/);
    assert.match(v.lines[2], /with the processor slowed 4 times/);
    const hitch = verdict([...steady(100), ...steady(100).map((t) => t + 99 * (1000 / 60) + 110)], [], {});
    assert.deepEqual([hitch.share < 0.05, hitch.longest, hitch.stutters], [true, 110, true], 'one frame of 110 ms is a hitch anyone sees, however few dropped');
  });
  it('nothing drawn is never smooth: it says nothing was measured', () => {
    const v = verdict([], [], {});
    assert.equal(v.stutters, true);
    assert.match(v.lines[0] ?? '', /^NOTHING MEASURED/);
  });
  it('counts each gesture on its own: the still page between two is never a gap', () => {
    const v = verdict([steady(30), steady(30).map((t) => t + 5000)], [], {});
    assert.deepEqual([v.dropped, v.longest, v.stutters], [0, 17, false]);
  });
  it('reads a swipe, a scroll or a round, and says how to give one when none is there', () => {
    const o = parseSmoothArgs(['http://127.0.0.1:8788/', '--swipe', '300,500 40,500', '--times', '3']);
    assert.deepEqual([o.url, o.swipe, o.times, o.width, o.slow], ['http://127.0.0.1:8788/', { from: { x: 300, y: 500 }, to: { x: 40, y: 500 } }, 3, 390, 4]);
    assert.equal(parseSmoothArgs(['--scroll', '1200', 'http://x/']).scroll, 1200);
    assert.throws(() => parseSmoothArgs(['http://x/']), /Say what moves/);
    assert.throws(() => parseSmoothArgs(['http://x/', '--swipe', '300 40']), /two points, from and to/);
    assert.throws(() => parseSmoothArgs(['--step', 'x()']), /Say which page/);
    assert.throws(() => parseSmoothArgs(['http://x/', '--scroll', '600', '--times', 'five']), /--times takes a whole number of at least 1, not "five"/);
    assert.throws(() => parseSmoothArgs(['http://x/', '--scroll', 'lots']), /--scroll takes a whole number/);
  });
});
