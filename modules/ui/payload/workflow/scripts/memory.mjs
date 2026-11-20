#!/usr/bin/env node
// Does the page keep growing? Opens the app in a headless browser, does one round of what the owner does (open a route and close
// it, plan again, open a menu) many times, and compares what the page holds after one round and after all of them: elements,
// event listeners, and the script heap, each after a garbage collection. A page that lets go of what it drew holds the same
// after twenty rounds as after one; one that grows by the same amount every round keeps something it no longer shows.
// Built on browser.mjs. Usage:
//   node workflow/scripts/memory.mjs <url> --step "<js: one round>" [--setup "<js: once, first>"] [--ready "<js: true once loaded>"]
//        [--rounds 20] [--settle 250] [--width 1280] [--detached] [--json]
// A script given as @file.js is read from that file. --detached also lists the elements no longer on the page that something
// still holds, grouped by their top element (what to look for in the code). Exit code 1 when the page grows every round.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openBrowser, sleep } from './browser.mjs';

/** The options from the command line; throws a plain sentence when something is missing. */
export function parseMemoryArgs(argv) {
  const value = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback; };
  const script = (name) => { const v = value(name); return v?.startsWith('@') ? readFileSync(v.slice(1), 'utf8') : v; };
  const url = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--') || ['--detached', '--json'].includes(argv[i - 1])));
  if (!url) throw new Error('Say which page: node workflow/scripts/memory.mjs <url> --step "<one round>".');
  const step = script('--step');
  if (!step) throw new Error('Say what one round does with --step, for example --step "app.open(0); app.close()" (or --step @round.js).');
  return { url, step, setup: script('--setup') ?? '', ready: script('--ready') ?? 'true', rounds: Number(value('--rounds', 20)), settle: Number(value('--settle', 250)),
    width: Number(value('--width', 1280)), detached: argv.includes('--detached'), json: argv.includes('--json') };
}

/**
 * What the counts say: { grows, per: { nodes, listeners, heapKB } (per round, after the first), lines }. It grows when elements
 * or listeners are still rising at the end: more after all rounds than after one by at least `slack` per round (a page may
 * keep a few things cached, which stops after the first rounds). The heap is said, never judged alone: it moves with the
 * engine's own work.
 */
export function verdict(first, last, rounds, slack = 2) {
  const n = Math.max(1, rounds - 1);
  const per = Object.fromEntries(['nodes', 'listeners', 'heapKB'].map((k) => [k, Math.round(((last[k] - first[k]) / n) * 10) / 10]));
  const grows = per.nodes >= slack || per.listeners >= slack;
  const say = (k, word) => `${word} ${first[k]} after one round, ${last[k]} after ${rounds} (${per[k] >= 0 ? '+' : ''}${per[k]} a round)`;
  return { grows, per, lines: [say('nodes', 'elements:'), say('listeners', 'event listeners:'), say('heapKB', 'heap KB:'),
    grows ? `GROWS: every round leaves about ${Math.max(per.nodes, 0)} elements and ${Math.max(per.listeners, 0)} listeners behind` : 'steady: the page lets go of what each round drew'] };
}

/** The page's counts after a garbage collection: { nodes, listeners, heapKB, onPage }. */
async function counts(b) {
  await b.send('HeapProfiler.collectGarbage'); await sleep(200); await b.send('HeapProfiler.collectGarbage');
  const c = await b.send('Memory.getDOMCounters');
  const heap = (await b.send('Runtime.getHeapUsage')).usedSize;
  return { nodes: c.nodes, listeners: c.jsEventListeners, heapKB: Math.round(heap / 1024), onPage: await b.ev('document.querySelectorAll("*").length') };
}

// the elements no longer on the page, grouped by the top element of their detached tree, with a piece of its HTML
const DETACHED = `function () { const top = new Map(); for (const e of this) { try { if (e.isConnected) continue; } catch { continue; } /* a prototype, not an element */ let t = e; while (t.parentElement) t = t.parentElement;
  top.set(t, (top.get(t) ?? 0) + 1); } const c = {}; for (const [t, n] of top) { const k = t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + (t.getAttribute('class') ? '.' + t.getAttribute('class').trim().split(/\\s+/).join('.') : '')
  + ' | ' + t.outerHTML.replace(/<svg[\\s\\S]*?<\\/svg>/g, '<svg/>').slice(0, 140); c[k] = (c[k] ?? 0) + n; } return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 15); }`;

async function detached(b) {
  await b.send('HeapProfiler.enable'); await b.send('HeapProfiler.collectGarbage');
  const proto = await b.send('Runtime.evaluate', { expression: 'Element.prototype' });
  const all = await b.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId, objectGroup: 'memory' });
  const r = await b.send('Runtime.callFunctionOn', { objectId: all.objects.objectId, returnByValue: true, functionDeclaration: DETACHED });
  await b.send('Runtime.releaseObjectGroup', { objectGroup: 'memory' });
  if (r.exceptionDetails) throw new Error(`listing what is held: ${r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text}`);
  return r.result.value ?? [];
}

async function main() {
  const o = parseMemoryArgs(process.argv.slice(2));
  const b = await openBrowser({ width: o.width });
  try {
    await b.send('HeapProfiler.enable');
    await b.go(o.url);
    await b.until(o.ready, 60000);
    if (o.setup) await b.ev(`(async () => { ${o.setup}\n })()`);
    const round = async () => { await b.ev(`(async () => { ${o.step}\n })()`); await sleep(o.settle); };
    const before = await counts(b);
    await round();
    const first = await counts(b);
    for (let i = 1; i < o.rounds; i++) await round();
    const last = await counts(b);
    const v = verdict(first, last, o.rounds);
    const held = o.detached ? await detached(b) : null;
    if (v.grows && !o.detached) v.lines.push('run it again with --detached to see what the page still holds');
    if (o.json) console.log(JSON.stringify({ before, first, last, ...v, detached: held }));
    else {
      console.log(`memory: ${o.rounds} rounds on ${o.url}; on the page before the first: ${before.onPage} elements`);
      for (const l of v.lines) console.log(`  ${l}`);
      if (held) { console.log(held.length ? '  held but no longer on the page (elements | the top element they hang under):' : '  nothing held off the page'); for (const [k, n] of held) console.log(`    ${n}  ${k}`); }
    }
    process.exitCode = v.grows ? 1 : 0;
  } finally { await b.close(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(`memory: ${e.message}`); process.exit(2); });
