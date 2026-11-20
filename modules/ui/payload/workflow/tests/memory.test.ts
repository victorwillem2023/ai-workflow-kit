// The page memory check and the bundle weigher (workflow/scripts/memory.mjs, weigh.mjs): what the counts say, the command
// line, and where a module's weight is counted. The browser itself is not started here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMemoryArgs, verdict } from '../../workflow/scripts/memory.mjs';
import { areaOf, weighLines } from '../../workflow/scripts/weigh.mjs';

describe('does the page keep growing', () => {
  it('grows when every round leaves elements or listeners behind; a page that settles is steady', () => {
    const v = verdict({ nodes: 100, listeners: 10, heapKB: 500 }, { nodes: 233, listeners: 29, heapKB: 520 }, 20);
    assert.deepEqual([v.grows, v.per.nodes, v.per.listeners], [true, 7, 1]);
    assert.match(v.lines.at(-1) ?? '', /^GROWS: every round leaves about 7 elements and 1 listeners behind/);
    assert.equal(verdict({ nodes: 100, listeners: 10, heapKB: 500 }, { nodes: 110, listeners: 10, heapKB: 900 }, 20).grows, false, 'a few cached elements and a moving heap are not a leak');
  });
  it('reads the page, the round and the options; a missing round says how to give one', () => {
    const o = parseMemoryArgs(['http://127.0.0.1:8788/', '--step', 'app.open(0); app.close()', '--rounds', '5', '--detached']);
    assert.deepEqual([o.url, o.step, o.rounds, o.detached, o.ready, o.width], ['http://127.0.0.1:8788/', 'app.open(0); app.close()', 5, true, 'true', 1280]);
    assert.throws(() => parseMemoryArgs(['http://x/']), /Say what one round does with --step/);
    assert.throws(() => parseMemoryArgs(['--step', 'x()']), /Say which page/);
  });
});

describe('what the build weighs', () => {
  it('counts a module under its package, or its folder up to three deep', () => {
    assert.deepEqual(['C:/app/node_modules/react-dom/cjs/x.js', 'node_modules/@scope/pkg/a.js', 'src/web/ui/route/Page.tsx', 'src/main.ts', 'config/vibes.ts'].map(areaOf),
      ['node_modules/react-dom', 'node_modules/@scope/pkg', 'src/web/ui', 'src', 'config']);
    assert.match(weighLines([{ id: 'src/web/a.ts', gzip: 2048 }, { id: 'node_modules/react/index.js', gzip: 1024 }]), /^weigh: 3\.0 KB gzipped in 2 modules[^]*by folder or package:\n {4}2\.0 {2}src\/web\n {4}1\.0 {2}node_modules\/react\nbiggest files:\n {4}2\.0 {2}src\/web\/a\.ts/);
  });
});
