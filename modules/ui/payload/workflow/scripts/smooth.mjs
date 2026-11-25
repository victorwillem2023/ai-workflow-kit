#!/usr/bin/env node
// Does it move smoothly? Opens the app in a headless browser as a phone (touch, a phone's width, the processor slowed 4 times
// like a mid-range phone), does the gesture the owner will do a few times (a swipe, a scroll, or a script), and reports the
// frames the page dropped, its longest frame, the moments it was busy, and what each frame cost (script, layout, style). It
// cannot say how a swipe feels on an iPhone; it catches the laggy version before anyone tries it. Built on browser.mjs. Usage:
//   node workflow/scripts/smooth.mjs <url> --swipe "300,500 40,500" [--ms 250]      a finger from one point to another
//   node workflow/scripts/smooth.mjs <url> --scroll 1200                            a finger scroll down by that many pixels
//   node workflow/scripts/smooth.mjs <url> --step "<js: one round>"                 what the page does (an animation it starts)
//        [--times 5] [--settle 400] [--setup "<js: once, first>"] [--ready "<js: true once loaded>"] [--width 390] [--slow 4] [--json]
// A script given as @file.js is read from that file. Exit code 1 when it stutters (workflow/guides/SCREENS.md, *Feel*).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openBrowser, sleep } from './browser.mjs';

const VALUED = ['--swipe', '--ms', '--scroll', '--step', '--times', '--settle', '--setup', '--ready', '--width', '--slow'];
const FRAME_MS = 1000 / 60;
// a frame later than this is one a person can see: a hitch, not a missed beat
const HITCH_MS = 50;
// more dropped than this share of the frames, or one hitch this long, and it stutters
const MAX_DROPPED = 0.05;
const MAX_FRAME_MS = 100;

/** The options from the command line; throws a plain sentence when something is missing. */
export function parseSmoothArgs(argv) {
  const value = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback; };
  const script = (name) => { const v = value(name); return v?.startsWith('@') ? readFileSync(v.slice(1), 'utf8') : v; };
  const url = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !VALUED.includes(argv[i - 1])));
  if (!url) throw new Error('Say which page: node workflow/scripts/smooth.mjs <url> --swipe "300,500 40,500".');
  let swipe = null;
  if (value('--swipe')) {
    const m = /^\s*(\d+)\s*,\s*(\d+)\s+(\d+)\s*,\s*(\d+)\s*$/.exec(value('--swipe'));
    if (!m) throw new Error('A swipe is two points, from and to: --swipe "300,500 40,500" (x,y in pixels of the page).');
    swipe = { from: { x: +m[1], y: +m[2] }, to: { x: +m[3], y: +m[4] } };
  }
  // a number given on the command line: a whole number at least `min`, else a plain sentence saying which
  const count = (name, fallback, min) => {
    const n = Number(value(name, fallback));
    if (!Number.isInteger(n) || n < min) throw new Error(`${name} takes a whole number of at least ${min}, not "${value(name)}".`);
    return n;
  };
  const scroll = value('--scroll') !== undefined ? count('--scroll', 0, 1) : null;
  const step = script('--step') ?? null;
  if (!swipe && !scroll && !step) throw new Error('Say what moves: --swipe "300,500 40,500", --scroll 1200, or --step "<what one round does>".');
  return { url, swipe, scroll, step, ms: count('--ms', 250, 16), times: count('--times', 5, 1), settle: count('--settle', 400, 0),
    setup: script('--setup') ?? '', ready: script('--ready') ?? 'true', width: count('--width', 390, 200), slow: count('--slow', 4, 1), json: argv.includes('--json') };
}

/**
 * What the frames and the work say: { stutters, dropped, share, longest, hitches, busy, perFrame, lines }. `frames` are the times
 * each frame was drawn (ms), one list per gesture (only while it moves and its animation ends, so the still page between two
 * gestures cannot water down a stutter), or one list; `tasks` the lengths of the moments the page was busy (ms); `work` the
 * seconds spent in script, layout and style over the run. A frame that comes after n beats instead of one dropped n - 1.
 */
export function verdict(frames, tasks, work, slow = 1) {
  const runs = Array.isArray(frames[0]) ? frames : [frames];
  const gaps = runs.flatMap((run) => run.slice(1).map((t, i) => t - run[i]));
  // nothing drawn while it moved is no proof of smooth: the page never got ready, or the gesture did not reach it
  if (!gaps.length) return { stutters: true, dropped: 0, share: 0, longest: 0, hitches: 0, busy: { count: tasks.length, longest: 0 }, perFrame: { all: 0, script: 0, layout: 0, style: 0 },
    lines: ['NOTHING MEASURED: no frame was drawn while it moved; check --ready, --setup and the gesture'] };
  const dropped = gaps.reduce((n, g) => n + Math.max(0, Math.round(g / FRAME_MS) - 1), 0);
  const share = gaps.length ? dropped / (gaps.length + dropped) : 0;
  const longest = Math.round(Math.max(0, ...gaps));
  const hitches = gaps.filter((g) => g > HITCH_MS).length;
  const busy = { count: tasks.length, longest: Math.round(Math.max(0, ...tasks)) };
  const per = (s) => Math.round(((s * 1000) / Math.max(1, gaps.length)) * 10) / 10;
  const perFrame = { all: per(work.task ?? 0), script: per(work.script ?? 0), layout: per(work.layout ?? 0), style: per(work.style ?? 0) };
  const stutters = share > MAX_DROPPED || longest > MAX_FRAME_MS;
  const pct = Math.round(share * 100);
  const lines = [
    `frames: ${gaps.length} drawn, ${dropped} dropped (${pct}%), the longest ${longest} ms (a frame is 17 ms), ${hitches} over ${HITCH_MS} ms`,
    `busy: ${busy.count ? `${busy.count} times, the longest ${busy.longest} ms` : 'never over 50 ms'}`,
    `work per frame: ${perFrame.all} ms (script ${perFrame.script}, layout ${perFrame.layout}, style ${perFrame.style})${slow > 1 ? `, with the processor slowed ${slow} times` : ''}`,
    stutters
      ? `STUTTERS: ${share > MAX_DROPPED ? `${pct}% of the frames dropped (at most ${MAX_DROPPED * 100}%)` : `one frame took ${longest} ms (at most ${MAX_FRAME_MS})`}; the biggest share of the work is ${biggest(perFrame)}`
      : 'smooth: no frame a person would see missing',
  ];
  return { stutters, dropped, share, longest, hitches, busy, perFrame, lines };
}

const biggest = (p) => ['script', 'layout', 'style'].sort((a, b) => p[b] - p[a])[0];

// records each frame while a gesture is on (one list per gesture) and each busy moment in the page (a long task: Chrome's own
// count of the main thread held over 50 ms)
const START = `(() => { const s = window.__smooth = { runs: [], rec: false, tasks: [], on: true };
  const tick = (t) => { if (!s.on) return; if (s.rec) s.runs[s.runs.length - 1].push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  try { s.po = new PerformanceObserver((l) => { for (const e of l.getEntries()) s.tasks.push(e.duration); }); s.po.observe({ type: 'longtask' }); } catch { /* none */ }
  return true; })()`;
const STOP = '(() => { const s = window.__smooth; s.on = false; s.po?.disconnect(); return { frames: s.runs, tasks: s.tasks }; })()';
const REC = (on) => (on ? '(() => { const s = window.__smooth; s.runs.push([]); s.rec = true; })()' : 'window.__smooth.rec = false');
// after the finger lifts, a snap or a transition still runs: its frames count, the still page after it does not
const TAIL_MS = 500;

async function work(b) {
  const m = Object.fromEntries((await b.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  return { task: m.TaskDuration ?? 0, script: m.ScriptDuration ?? 0, layout: m.LayoutDuration ?? 0, style: m.RecalcStyleDuration ?? 0 };
}

/** One finger from one point to another in `ms`, a move every frame. */
async function swipe(b, { from, to }, ms) {
  const steps = Math.max(2, Math.round(ms / FRAME_MS));
  const at = (k) => [{ x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps }];
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let k = 1; k <= steps; k++) { await sleep(FRAME_MS); await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k) }); }
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function main() {
  const o = parseSmoothArgs(process.argv.slice(2));
  const b = await openBrowser({ width: o.width, height: 844, scale: 2 });
  try {
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await b.send('Performance.enable');
    await b.go(o.url);
    await b.until(o.ready, 60000);
    if (o.setup) await b.ev(`(async () => { ${o.setup}\n })()`);
    if (o.slow > 1) await b.send('Emulation.setCPUThrottlingRate', { rate: o.slow });
    const before = await work(b);
    await b.ev(START);
    for (let i = 0; i < o.times; i++) {
      await b.ev(REC(true));
      if (o.swipe) await swipe(b, o.swipe, o.ms);
      else if (o.scroll) await b.send('Input.synthesizeScrollGesture', { x: Math.round(o.width / 2), y: 600, yDistance: -o.scroll, gestureSourceType: 'touch', speed: 1200 });
      else await b.ev(`(async () => { ${o.step}\n })()`);
      await sleep(Math.min(o.settle, TAIL_MS));
      await b.ev(REC(false));
      await sleep(Math.max(0, o.settle - TAIL_MS));
    }
    const seen = await b.ev(STOP);
    const after = await work(b);
    const spent = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]]));
    const v = verdict(seen.frames, seen.tasks, spent, o.slow);
    if (o.json) console.log(JSON.stringify(v));
    else {
      const what = o.swipe ? `${o.times} swipes` : o.scroll ? `${o.times} scrolls of ${o.scroll} px` : `${o.times} rounds`;
      console.log(`smooth: ${what} on ${o.url}, as a phone ${o.width} px wide`);
      for (const l of v.lines) console.log(`  ${l}`);
    }
    process.exitCode = v.stutters ? 1 : 0;
  } finally { await b.close(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(`smooth: ${e.message}`); process.exit(2); });
