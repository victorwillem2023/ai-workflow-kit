// How the app feels while it is built (src/web/feel.ts, src/server/pageevents.ts): each motion with the frames it dropped, each
// busy moment and each key action's time reach the session's log, and nothing else the page sends does.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLogger } from '../../src/server/log';
import { logPageEvents } from '../../src/server/pageevents';
import { type FeelEnv, type FeelEvent, startFeel, watchFeel } from '../../src/web/feel';

type Pointer = { clientX?: number; clientY?: number; pointerType?: string; scrollX?: number; scrollY?: number };

/** A page with a clock of its own: frames are drawn and the heartbeat ticks only when the test says so. */
function fakePage() {
  let t = 0;
  let hidden = false;
  let frames: ((t: number) => void)[] = [];
  const every: { fn: () => void; ms: number }[] = [];
  const on = new Map<string, ((e: Pointer) => void)[]>();
  let measure: ((name: string, ms: number) => void) | undefined;
  const env: FeelEnv = {
    now: () => t,
    frame: (fn) => void frames.push(fn),
    every: (fn, ms) => void every.push({ fn, ms }),
    listen: (type, fn) => void on.set(type, [...(on.get(type) ?? []), fn]),
    measures: (fn) => {
      measure = fn;
    },
    hidden: () => hidden,
    page: () => '/deck',
  };
  const sent: FeelEvent[][] = [];
  return {
    sent,
    feel: startFeel(env, (e) => void sent.push(e)),
    fire: (type: string, e: Pointer = {}) => on.get(type)?.forEach((f) => f(e)),
    /** draws one frame `gap` ms after the last */
    draw: (gap: number) => {
      t += gap;
      const due = frames;
      frames = [];
      for (const f of due) f(t);
    },
    wait: (ms: number) => {
      t += ms;
    },
    beat: () => every.filter((x) => x.ms === 100).forEach((x) => x.fn()),
    send: () => every.filter((x) => x.ms === 2000).forEach((x) => x.fn()),
    measure: (name: string, ms: number) => measure?.(name, ms),
    hide: () => {
      hidden = true;
    },
    show: () => {
      hidden = false;
      on.get('visibilitychange')?.forEach((f) => f({}));
    },
  };
}

describe('how the page feels, in the log', () => {
  it('a swipe is one motion: how far, how long, the frames drawn and the ones it dropped', () => {
    const p = fakePage();
    p.fire('pointerdown', { clientX: 300, clientY: 500, pointerType: 'touch' });
    for (let i = 0; i < 10; i++) {
      p.draw(1000 / 60);
      p.fire('pointermove', { clientX: 300 - (i + 1) * 26, clientY: 500 });
    }
    p.draw(50); // a frame that waited three beats: two dropped
    p.fire('pointerup', { clientX: 40, clientY: 500 });
    for (let i = 0; i < 25; i++) p.draw(1000 / 60); // the motion ends once the finger has been gone a while
    p.send();
    const [motion] = p.sent.flat();
    assert.ok(motion?.kind === 'motion');
    assert.deepEqual([motion.by, motion.ms, motion.dx, motion.dy, motion.dropped, motion.longest, motion.page], ['touch', 217, -260, 0, 2, 50, '/deck']);
    assert.ok(motion.frames > 20, 'the frames after the finger left count too, until the page is still');
    assert.equal(p.sent.flat().length, 1, 'one motion, not one event per frame');
  });
  it('a swipe the browser takes over as its own scroll counts how far it scrolled; a scroll alone too', () => {
    const p = fakePage();
    p.fire('pointerdown', { clientX: 300, clientY: 500, pointerType: 'touch' });
    p.draw(1000 / 60);
    p.fire('pointermove', { clientX: 292, clientY: 500 });
    p.fire('pointercancel', {});
    for (const x of [8, 150, 390]) {
      p.draw(1000 / 60);
      p.fire('scroll', { scrollX: x, scrollY: 0 });
    }
    for (let i = 0; i < 25; i++) p.draw(1000 / 60);
    for (const y of [10, 400, 1200]) {
      p.draw(1000 / 60);
      p.fire('scroll', { scrollX: 0, scrollY: y });
    }
    for (let i = 0; i < 25; i++) p.draw(1000 / 60);
    p.send();
    assert.deepEqual(p.sent.flat().map((e) => e.kind === 'motion' && [e.by, e.dx, e.dy]), [['touch', -390, 0], ['scroll', 0, -1190]]);
  });
  it('a finger that holds still before it drags is still one motion, ended only once it lifts', () => {
    const p = fakePage();
    p.fire('pointerdown', { clientX: 300, clientY: 500, pointerType: 'touch' });
    for (let i = 0; i < 40; i++) p.draw(1000 / 60); // held still for over half a second
    p.fire('pointermove', { clientX: 100, clientY: 500 });
    p.fire('pointerup', { clientX: 100, clientY: 500 });
    for (let i = 0; i < 25; i++) p.draw(1000 / 60);
    p.send();
    const all = p.sent.flat();
    assert.equal(all.length, 1);
    assert.ok(all[0]?.kind === 'motion' && all[0].dx === -200);
  });
  it('a press whose release never comes still ends, a few seconds after it last moved', () => {
    const p = fakePage();
    p.fire('pointerdown', { clientX: 0, clientY: 0, pointerType: 'mouse' });
    for (let i = 0; i < 400; i++) p.draw(1000 / 60);
    p.send();
    assert.equal(p.sent.flat()[0]?.kind, 'motion');
  });
  it('a frame an ended motion still waited for never counts in the next one', () => {
    const p = fakePage();
    p.fire('pointerdown', { clientX: 0, clientY: 0, pointerType: 'touch' });
    p.draw(1000 / 60);
    p.fire('pagehide'); // ends the motion while its next frame is still asked for
    p.fire('pointerdown', { clientX: 0, clientY: 0, pointerType: 'touch' });
    for (let i = 0; i < 10; i++) p.draw(1000 / 60);
    p.fire('pointerup', {});
    for (let i = 0; i < 25; i++) p.draw(1000 / 60);
    p.send();
    const second = p.sent.flat()[1];
    assert.ok(second?.kind === 'motion');
    assert.ok(second.frames < 40, `one chain of frames, not two (${second.frames})`);
    assert.equal(second.dropped, 0);
  });
  it('a late heartbeat is a busy moment, a measure is a timing, and a hidden page is never busy', () => {
    const p = fakePage();
    p.wait(100);
    p.beat();
    p.wait(450);
    p.beat();
    p.measure('plan made', 182.4);
    p.hide();
    p.wait(5000);
    p.beat();
    p.feel.flush();
    p.wait(60_000); // a hidden tab's timer, a minute late
    p.show();
    p.wait(100);
    p.beat();
    p.feel.flush();
    assert.deepEqual(p.sent.flat(), [
      { kind: 'busy', ms: 350, page: '/deck' },
      { kind: 'timing', name: 'plan made', ms: 182, page: '/deck' },
    ]);
  });
  it('on a real page it listens without holding up a scroll, times the measures and sends only the path', () => {
    const listened: { type: string; fn: (e: { target?: unknown }) => void; opts?: { capture?: boolean; passive?: boolean } }[] = [];
    let frame: ((t: number) => void) | undefined;
    let now = 0;
    let observed = '';
    let report: ((list: { getEntries(): { name: string; duration: number }[] }) => void) | undefined;
    const sent: FeelEvent[][] = [];
    const feel = watchFeel(
      {
        performance: { now: () => now },
        requestAnimationFrame: (fn) => {
          frame = fn;
          return 0;
        },
        setInterval: () => 0,
        addEventListener: (type, fn, opts) => void listened.push({ type, fn, opts }),
        document: { visibilityState: 'visible' },
        location: { pathname: '/deck' },
        PerformanceObserver: class {
          constructor(cb: typeof report) {
            report = cb;
          }
          observe(o: { type: string }) {
            observed = o.type;
          }
        },
      },
      (e) => void sent.push(e),
    );
    assert.ok(listened.some((l) => l.type === 'scroll' && l.opts?.passive && l.opts.capture));
    assert.equal(observed, 'measure');
    report?.({ getEntries: () => [{ name: 'plan made', duration: 90.4 }] });
    const scroll = listened.find((l) => l.type === 'scroll');
    scroll?.fn({ target: { scrollLeft: 0, scrollTop: 100 } });
    scroll?.fn({ target: { scrollLeft: 0, scrollTop: 700 } });
    now = 1000;
    frame?.(now);
    feel.flush();
    assert.deepEqual(sent.flat(), [
      { kind: 'timing', name: 'plan made', ms: 90, page: '/deck' },
      { kind: 'motion', by: 'scroll', ms: 0, dx: 0, dy: -600, frames: 0, dropped: 0, longest: 0, page: '/deck' },
    ]);
  });
  it('the server keeps only known events and fields, capped, at most 50 a call', () => {
    const lines: Record<string, unknown>[] = [];
    const log = createLogger({ level: 'debug', write: (l) => lines.push(JSON.parse(l)) });
    const n = logPageEvents(
      [
        { kind: 'motion', by: 'touch', ms: 240, dx: -260, dy: 0, frames: 35, dropped: 2, longest: 50, page: '/deck', password: 'x' },
        { kind: 'busy', ms: 1e12, page: 'p'.repeat(500) },
        { kind: 'timing', name: 'plan made', ms: 182 },
        { kind: 'anything' },
        'nonsense',
      ],
      { log },
    );
    assert.equal(n, 3);
    assert.deepEqual(lines.map((l) => [l.level, l.msg]), [['info', 'page motion'], ['warn', 'page busy'], ['info', 'page timing']]);
    assert.equal(lines[0]?.password, undefined, 'a field the page made up is never written');
    assert.equal(lines[1]?.ms, 600_000);
    assert.equal(String(lines[1]?.page).length, 200);
    assert.equal(logPageEvents(Array.from({ length: 80 }, () => ({ kind: 'busy', ms: 200 })), { log }), 50);
    assert.equal(logPageEvents({ kind: 'busy' }, { log }), 0, 'one event not in a list is nothing');
  });
});
