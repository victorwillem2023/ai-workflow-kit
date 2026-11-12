// The workflow gate (tools/workflow): which tests a change touches, which layer rules a change breaks,
// which files grew too big. The pure parts are tested here with in-memory files; no git, no disk.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { importsOf, resolveImport, buildGraph, affectedTests } from '../../tools/workflow/lib/graph.mjs';
import { globToRegExp, matchesAny } from '../../tools/workflow/lib/glob.mjs';
import { findViolations, newViolations } from '../../tools/workflow/lib/boundaries.mjs';
import { oversize, sizeVerdict, updateSizes, sizeNote } from '../../tools/workflow/lib/size.mjs';
import { securityAdvice } from '../../tools/workflow/lib/securityscan.mjs';
import { hostileAdvice } from '../../tools/workflow/lib/hostilecheck.mjs';
import { spawnSync } from 'node:child_process';

const files = (o: Record<string, string>) => new Map(Object.entries(o));

describe('glob matching', () => {
  it('** crosses folders, * stays inside one', () => {
    assert.ok(globToRegExp('src/core/**').test('src/core/a/b.ts'));
    assert.ok(globToRegExp('src/*.ts').test('src/a.ts'));
    assert.ok(!globToRegExp('src/*.ts').test('src/a/b.ts'));
    assert.ok(matchesAny('docs/GUIDE.md', ['**/*.md']));
  });
});

describe('reading imports', () => {
  it('finds static, type-only, re-export, side-effect and dynamic imports, also across lines', () => {
    const src = [
      "import a from './a';",
      "import type { B } from '../b';",
      "import {",
      '  c,',
      "} from './c';",
      "export * from './d';",
      "import './e';",
      "const f = await import('./f');",
      "import { readFileSync } from 'node:fs';",
    ].join('\n');
    assert.deepEqual(importsOf(src).sort(), ['../b', './a', './c', './d', './e', './f', 'node:fs']);
  });
  it('resolves extensionless, index and .js-for-.ts specifiers, and leaves packages alone', () => {
    const set = new Set(['src/a/x.ts', 'src/a/y/index.ts', 'src/b.ts']);
    assert.equal(resolveImport('src/a/z.ts', './x', set), 'src/a/x.ts');
    assert.equal(resolveImport('src/a/z.ts', './y', set), 'src/a/y/index.ts');
    assert.equal(resolveImport('src/a/z.ts', '../b.js', set), 'src/b.ts');
    assert.equal(resolveImport('src/a/z.ts', 'maplibre-gl', set), null);
  });
});

describe('affected tests', () => {
  const graph = buildGraph(
    files({
      'src/core/a.ts': 'export const a = 1;',
      'src/core/b.ts': "import { a } from './a';",
      'src/web/c.ts': "import { a } from '../core/a';",
      'src/core/lonely.ts': 'export const l = 1;',
      'tests/fakes.ts': "import { a } from '../src/core/a';",
      'tests/b.test.ts': "import '../src/core/b';",
      'tests/c.test.ts': "import '../src/web/c';",
      'tests/uses-fakes.test.ts': "import './fakes';",
      'tests/lonely.test.ts': "import '../src/core/lonely';",
      'tests/css.test.ts': "readFileSync(new URL('../src/web/styles.css', import.meta.url))",
    }),
    ['src/web/styles.css', 'src/core/a.ts', 'src/core/b.ts', 'src/web/c.ts', 'src/core/lonely.ts', 'tests/fakes.ts'],
  );
  const isTest = (f: string) => f.endsWith('.test.ts');

  it('a change to a core file selects every test that reaches it through any chain of imports', () => {
    const r = affectedTests(graph, ['src/core/a.ts'], { isTest });
    assert.deepEqual(r.tests, ['tests/b.test.ts', 'tests/c.test.ts', 'tests/uses-fakes.test.ts']);
    assert.equal(r.all, false);
  });
  it('a change nothing imports selects only the test for it, not the whole suite', () => {
    const r = affectedTests(graph, ['src/core/lonely.ts'], { isTest });
    assert.deepEqual(r.tests, ['tests/lonely.test.ts']);
  });
  it('a test file that changed runs itself', () => {
    const r = affectedTests(graph, ['tests/b.test.ts'], { isTest });
    assert.deepEqual(r.tests, ['tests/b.test.ts']);
  });
  it('a non-code file a test reads by name (styles.css) selects that test', () => {
    const r = affectedTests(graph, ['src/web/styles.css'], { isTest });
    assert.deepEqual(r.tests, ['tests/css.test.ts']);
  });
  it('an unknown non-code file runs everything, because the safe answer is all tests', () => {
    const r = affectedTests(graph, ['config/mystery.dat'], { isTest });
    assert.equal(r.all, true);
  });
  it('changes that cannot affect code (docs) select nothing', () => {
    const r = affectedTests(graph, ['docs/GUIDE.md'], { isTest, ignore: ['docs/**'] });
    assert.deepEqual(r.tests, []);
    assert.equal(r.all, false);
  });
});

describe('layer boundaries', () => {
  const rules = [
    { name: 'core is pure', from: 'src/core/**', forbid: ['src/web/**'], forbidNode: true },
    { name: 'web has no server', from: 'src/web/**', forbid: ['src/server/**'], forbidNode: false },
  ];
  const graph = buildGraph(
    files({
      'src/core/ok.ts': "import './helper';",
      'src/core/helper.ts': 'export {};',
      'src/core/bad.ts': "import '../web/ui';",
      'src/core/io.ts': "import { readFileSync } from 'node:fs';",
      'src/web/ui.ts': "import '../server/app';",
      'src/server/app.ts': 'export {};',
    }),
    [],
  );

  it('core importing web, or a node module, is a violation', () => {
    const v = findViolations(graph, rules).map((x) => x.key).sort();
    assert.deepEqual(v, [
      'core is pure|src/core/bad.ts|src/web/ui.ts',
      'core is pure|src/core/io.ts|node:fs',
      'web has no server|src/web/ui.ts|src/server/app.ts',
    ]);
  });
  it('a violation already in the baseline is accepted; a new one fails', () => {
    const all = findViolations(graph, rules);
    const fresh = newViolations(all, ['core is pure|src/core/bad.ts|src/web/ui.ts']);
    assert.equal(fresh.length, 2);
    assert.ok(!fresh.some((v) => v.key.includes('bad.ts')));
  });
});

describe('file size', () => {
  const lines = (n: number) => 'x\n'.repeat(n);
  it('a new file over the limit still fails', () => {
    const sizes = oversize(files({ 'src/a.ts': lines(500), 'src/b.ts': lines(600), 'src/c.ts': lines(10) }), 400);
    assert.deepEqual(sizes, { 'src/a.ts': 500, 'src/b.ts': 600 });
    const w = sizeVerdict({ ...sizes, 'src/new.ts': 401 }, { 'src/a.ts': 500, 'src/b.ts': 600 });
    assert.deepEqual(w.failing, [{ file: 'src/new.ts', lines: 401 }]);
  });
  it('a baselined file that grows now fails the size check', () => {
    const v = sizeVerdict({ 'src/a.ts': 500, 'src/b.ts': 600 }, { 'src/a.ts': 500, 'src/b.ts': 550 });
    assert.deepEqual(v.failing, [{ file: 'src/b.ts', was: 550, lines: 600 }]);
    assert.deepEqual(v.grown, [{ file: 'src/b.ts', was: 550, now: 600 }]);
  });
  it('a baselined file that shrinks or stays the same passes', () => {
    const v = sizeVerdict({ 'src/a.ts': 500, 'src/b.ts': 520 }, { 'src/a.ts': 500, 'src/b.ts': 550 });
    assert.deepEqual(v.failing, []);
    assert.deepEqual(v.grown, []);
  });
  it('--update-baseline refuses to raise a number and names the file', () => {
    const r = updateSizes({ 'src/a.ts': 450, 'src/b.ts': 700, 'src/new.ts': 410 }, { 'src/a.ts': 500, 'src/b.ts': 600 }, null);
    assert.equal(r.ok, false);
    assert.deepEqual(r.raised.map((x: { file: string }) => x.file), ['src/b.ts', 'src/new.ts']);
    assert.equal(r.next, undefined);
  });
  it('--update-baseline lowers numbers and drops files that are now small', () => {
    const r = updateSizes({ 'src/a.ts': 450 }, { 'src/a.ts': 500, 'src/gone.ts': 900 }, null);
    assert.equal(r.ok, true);
    assert.deepEqual(r.next, { 'src/a.ts': 450 });
  });
  it('--update-baseline with --allow-growth raises it and prints the reason', () => {
    const r = updateSizes({ 'src/b.ts': 610 }, { 'src/b.ts': 600 }, 'import rewrite');
    assert.equal(r.ok, true);
    assert.deepEqual(r.next, { 'src/b.ts': 610 });
    assert.match(r.message ?? '', /import rewrite/);
    assert.match(r.message ?? '', /src\/b\.ts 600 -> 610/);
  });
  it('the gate command refuses to raise a number without --allow-growth', () => {
    const r = spawnSync(process.execPath, ['tools/workflow/gate.mjs', '--update-baseline', '--allow-growth'], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /reason/);
  });
  it('--update-baseline keeps the reason of a file that is still big', () => {
    const r = updateSizes({ 'src/a.ts': 450, 'src/b.ts': 600 }, { 'src/a.ts': 500, 'src/b.ts': 600 }, null, { 'src/a.ts': 'one parser, one job' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.nextReasons, { 'src/a.ts': 'one parser, one job' });
  });
  it('--update-baseline drops the reason of a file that is no longer big', () => {
    const r = updateSizes({ 'src/a.ts': 450 }, { 'src/a.ts': 500, 'src/gone.ts': 900 }, null, { 'src/a.ts': 'keep', 'src/gone.ts': 'old reason' });
    assert.deepEqual(r.nextReasons, { 'src/a.ts': 'keep' });
    const none = updateSizes({ 'src/a.ts': 450 }, { 'src/a.ts': 500, 'src/gone.ts': 900 }, null, { 'src/gone.ts': 'old reason' });
    assert.deepEqual(none.nextReasons, {});
  });
  it('a reason for a file that is not in the size list fails the size check', () => {
    const v = sizeVerdict({ 'src/a.ts': 500 }, { 'src/a.ts': 500 }, { 'src/a.ts': 'ok', 'src/small.ts': 'stale' });
    assert.deepEqual(v.stale, ['src/small.ts']);
    assert.equal(sizeVerdict({ 'src/a.ts': 500 }, { 'src/a.ts': 500 }).stale.length, 0);
  });
  it('the size note counts the files that have a reason', () => {
    const sizes = { 'src/a.ts': 500, 'src/b.ts': 600 };
    const v = sizeVerdict(sizes, sizes, { 'src/a.ts': 'one job' });
    assert.equal(sizeNote(sizes, v, { 'src/a.ts': 'one job' }), '2 big files, 1 with a reason, none grown');
  });
  it('a file that got smaller than the limit drops out of the baseline list', () => {
    const v = sizeVerdict({ 'src/a.ts': 500 }, { 'src/a.ts': 500, 'src/gone.ts': 900 });
    assert.deepEqual(v.shrunk, ['src/gone.ts']);
  });
});

describe('security-review advice', () => {
  const diffOf = (file: string, ...added: string[]) =>
    [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, '@@ -1,0 +1 @@', ...added.map((l) => '+' + l)].join('\n');

  it('advises a security-review when the diff adds an outbound fetch in src', () => {
    const a = securityAdvice(diffOf('src/server/x.ts', 'const r = await fetch(url);'));
    assert.deepEqual(a, ['advice: src/server/x.ts adds an outbound fetch: run the security-review skill before --finish']);
  });
  it('advises a security-review when the diff adds a server route in src/server', () => {
    const a = securityAdvice(diffOf('src/server/app.ts', "if (url.pathname === '/api/upload') {"));
    assert.deepEqual(a, ['advice: src/server/app.ts adds a server route: run the security-review skill before --finish']);
  });
  it('advises on a file read, and ignores comments and removed lines', () => {
    assert.equal(securityAdvice(diffOf('src/server/y.ts', 'const t = readFileSync(p);')).length, 1);
    assert.deepEqual(securityAdvice(diffOf('src/server/y.ts', '// calls fetch(url) later')), []);
    const removed = ['--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +0,0 @@', '-await fetch(u);'].join('\n');
    assert.deepEqual(securityAdvice(removed), []);
  });
  it('says nothing for a diff that only changes tests or docs', () => {
    const diff = diffOf('tests/x.test.ts', 'await fetch(u);') + '\n' + diffOf('docs/GUIDE.md', 'fetch(url)');
    assert.deepEqual(securityAdvice(diff), []);
  });
  it('advice does not make the gate fail', () => {
    const r = spawnSync(process.execPath, ['tools/workflow/gate.mjs', '--advice', '--base', 'HEAD'], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    for (const l of r.stdout.split('\n').filter(Boolean)) assert.match(l, /^advice: /);
  });
});

describe('hostile-input advice', () => {
  const diffOf = (file: string, ...added: string[]) =>
    [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, '@@ -1,0 +1 @@', ...added.map((l) => '+' + l)].join('\n');

  it('advises a hostile-input test when the diff reads input in src/server and adds no refusal test', () => {
    const a = hostileAdvice(diffOf('src/server/x.ts', 'const data = JSON.parse(await res.text());'));
    assert.deepEqual(a, ['advice: src/server/x.ts reads input but no new test says what it refuses']);
  });
  it('says nothing when the diff adds a test named for what it refuses', () => {
    const diff = diffOf('src/server/x.ts', 'const data = JSON.parse(text);') + '\n' +
      diffOf('tests/x.test.ts', "  it('refuses a page over 13 MB', () => {");
    assert.deepEqual(hostileAdvice(diff), []);
    for (const word of ['rejects', 'caps', 'too large', 'hostile']) {
      const d = diffOf('src/core/y.ts', 'readFileSync(p)') + '\n' + diffOf('tests/y.test.ts', `test('${word} it', () => {`);
      assert.deepEqual(hostileAdvice(d), [], word);
    }
  });
  it('says nothing for a diff outside src/core, src/server and src/server', () => {
    const diff = diffOf('src/web/x.ts', 'JSON.parse(s)') + '\n' + diffOf('src/pipeline/z.ts', 'await fetch(u)') + '\n' + diffOf('src/core/c.ts', '// JSON.parse(x)');
    assert.deepEqual(hostileAdvice(diff), []);
  });
  it('advice does not make the gate fail', () => {
    const r = spawnSync(process.execPath, ['tools/workflow/gate.mjs', '--advice', '--base', 'HEAD'], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    for (const l of r.stdout.split('\n').filter(Boolean)) assert.match(l, /^advice: /);
  });
});
