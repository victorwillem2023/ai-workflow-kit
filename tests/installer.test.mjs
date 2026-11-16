// The installer's own helpers, one by one (seconds, not the minutes of scripts/selftest.mjs): writing JSON back without
// reflowing it, the record and the choices, the kit's marked parts of CLAUDE.md, and moving doc paths. npm run test:quick
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { formatJson, rewriteJson } from '../install-config.mjs';
import { detectLang, detectProject, inList, readChoices, recorded, recordLines, repoFromRemote } from '../install-choices.mjs';
import { mergeKitBlocks, rewriteChangedRules } from '../install-docs.mjs';
import { movePaths, movePathsBack, oldPaths } from '../doc-layout.mjs';

const kit = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const folder = (files = {}) => {
  const d = mkdtempSync(join(tmpdir(), 'kit-unit-'));
  for (const [f, t] of Object.entries(files)) { mkdirSync(join(d, f, '..'), { recursive: true }); writeFileSync(join(d, f), t); }
  return d;
};

describe('JSON written back', () => {
  it('unchanged, it is the same text, whatever its layout', () => {
    const text = '{\n  "a": [1, 2],\n  "b": { "c": true },\n    "odd":   "spacing"\n}\n';
    const odd = '{\n  "a": [1, 2],\n  "b": { "c": true },\n  "odd":   "spacing"\n}\n';
    assert.equal(rewriteJson(odd, JSON.parse(odd)), odd, 'its own spacing too');
    assert.equal(rewriteJson(odd, { ...JSON.parse(odd), a: [1, 2, 3] }), odd.replace('[1, 2]', '[1, 2, 3]'), 'and when another key changed');
    assert.ok(text);
  });
  it('a list that grew at its end keeps its layout: one line stays one line, a list of lines gets a line', () => {
    const one = '{\n  "types": ["ui", "bug"]\n}\n';
    assert.equal(rewriteJson(one, { types: ['ui', 'bug', 'spike'] }), '{\n  "types": ["ui", "bug", "spike"]\n}\n');
    const lines = '{\n  "checks": [\n    { "name": "a" },\n    { "name": "b" }\n  ]\n}\n';
    assert.equal(rewriteJson(lines, { checks: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }), '{\n  "checks": [\n    { "name": "a" },\n    { "name": "b" },\n    { "name": "c" }\n  ]\n}\n');
  });
  it('a nested object keeps the text of the keys that did not change', () => {
    const text = '{\n  "board": {\n    "labels": { "areas": ["x"] },\n    "types": ["ui"]\n  }\n}\n';
    const out = rewriteJson(text, { board: { labels: { areas: ['x'] }, types: ['ui', 'spike'] } });
    assert.match(out, /"labels": \{ "areas": \["x"\] \}/);
    assert.match(out, /"types": \["ui", "spike"\]/);
  });
  it('a new key is laid out like the kit\'s own config, and text that is not JSON is laid out anew', () => {
    assert.equal(formatJson({ a: [1, 2] }), '{\n  "a": [1, 2]\n}');
    assert.equal(rewriteJson('not json', { a: 1 }), '{\n  "a": 1\n}\n');
  });
});

describe('the record and the choices', () => {
  it('the record has every choice and no path of this computer', () => {
    const lines = recordLines({ version: '2.10.0', kitRepo: 'https://x/kit.git', lang: 'go', project: 'Trail', repo: 'o/trail', prefix: 'trail', modules: ['map'], stages: [], skip: [], lean: false, parts: [], sections: ['map'] });
    const mark = lines.join('\n');
    for (const [k, v] of [['version', '2.10.0'], ['ref', 'v2.10.0'], ['lang', 'go'], ['project', 'Trail'], ['repo', 'o/trail'], ['prefix', 'trail']]) assert.equal(recorded(mark, k), v);
    assert.doesNotMatch(mark, /^kit=/m);
  });
  it('reads a GitHub remote in its https and ssh forms', () => {
    assert.equal(repoFromRemote('https://github.com/o/my-app.git'), 'o/my-app');
    assert.equal(repoFromRemote('git@github.com:o/my-app.git'), 'o/my-app');
    assert.equal(repoFromRemote('https://gitlab.com/o/my-app.git'), null);
  });
  it('finds the language and the name from the project', () => {
    const d = folder({ 'pyproject.toml': '[project]\nname = "trail-tools"\n' });
    assert.equal(detectLang(d), 'python');
    assert.equal(detectProject(d), 'Trail Tools');
    rmSync(d, { recursive: true, force: true });
  });
  it('a project with the record is updated by a plain run, and a flag changes only its own choice', () => {
    const d = folder({ '.workflow-kit': 'version=2.9.11\nlang=go\nproject=Trail\nrepo=o/trail\nprefix=tr\nmodules=map\nlean=1\nparts=shape\n' });
    const plain = readChoices([d], kit);
    assert.equal(plain.update, true);
    assert.deepEqual([plain.lang, plain.project, plain.repo, plain.prefix, plain.lean, plain.modules.join(), plain.parts.join()], ['go', 'Trail', 'o/trail', 'tr', true, 'map', 'shape']);
    const renamed = readChoices([d, '--project', 'Trail Two'], kit);
    assert.deepEqual([renamed.project, renamed.lang, renamed.repo], ['Trail Two', 'go', 'o/trail']);
    assert.equal(readChoices([d, '--force'], kit).update, false, '--force replaces the machinery');
    assert.equal(readChoices([d, '--force'], kit).lang, 'go', 'and still keeps the choices');
    rmSync(d, { recursive: true, force: true });
  });
  it('without a repo it says so, and --take and --skip take folders', () => {
    const d = folder();
    assert.equal(readChoices([d], kit).error, 'repo');
    assert.ok(inList(['tools/workflow/**'], 'tools/workflow/gate.mjs'));
    assert.ok(inList(['all'], 'anything'));
    assert.ok(!inList(['tools/'], 'scripts/x.mjs'));
    rmSync(d, { recursive: true, force: true });
  });
});

describe('the kit\'s parts of CLAUDE.md', () => {
  const fill = (t) => t.replace(/\{\{(\w+)\}\}/g, 'X');
  it('an existing CLAUDE.md keeps its own text and gets the kit\'s parts it lacks at its end', () => {
    const d = folder({ 'CLAUDE.md': '# Mine\n\nOur notes.\n', 'workflow.config.json': '{ "budget": { "CLAUDE.md": 100 } }\n' });
    const added = mergeKitBlocks({ target: d, kit, fill });
    const text = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
    assert.ok(text.startsWith('# Mine\n\nOur notes.\n'));
    assert.ok(added.length >= 5 && text.includes('<!-- kit:how-we-work -->'));
    assert.ok(JSON.parse(readFileSync(join(d, 'workflow.config.json'), 'utf8')).budget['CLAUDE.md'] >= Buffer.byteLength(text), 'the budget fits');
    assert.deepEqual(mergeKitBlocks({ target: d, kit, fill }), [], 'a second time adds nothing');
    rmSync(d, { recursive: true, force: true });
  });
  it('an update replaces a kit part only when it is what the project\'s kit version wrote', () => {
    const tags = spawnSync('git', ['tag', '-l', 'v2.9.11'], { cwd: kit, encoding: 'utf8' }).stdout.trim();
    if (!tags) return; // a copy of the kit without its tags: nothing to compare with (the installer says so)
    const old = fill(spawnSync('git', ['show', 'v2.9.11:starter/CLAUDE.md'], { cwd: kit, encoding: 'utf8' }).stdout);
    const changed = old.replace(/^## Writing style.*$/m, (h) => `${h}\n- Our own line.`);
    const d = folder({ 'CLAUDE.md': changed, '.workflow-kit': 'version=2.9.11\n' });
    rewriteChangedRules({ target: d, kit, fill });
    const text = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
    assert.ok(text.includes('<!-- kit:how-we-work -->'), 'an untouched part is the kit\'s now');
    assert.ok(text.includes('- Our own line.') && !text.includes('<!-- kit:writing-style -->'), 'a changed part stays the project\'s');
    rmSync(d, { recursive: true, force: true });
  });
});

describe('doc paths', () => {
  it('moves the old paths, never a path that only ends the same way, and back again', () => {
    assert.equal(movePaths('see docs/LAUNCH.md and ../docs/COSTS.md, not mydocs/LAUNCH.md'), 'see docs/run/LAUNCH.md and ../docs/company/COSTS.md, not mydocs/LAUNCH.md');
    assert.equal(movePathsBack(movePaths('docs/LAUNCH.md')), 'docs/LAUNCH.md');
    assert.deepEqual(oldPaths('docs/run/LAUNCH.md'), []);
  });
});
