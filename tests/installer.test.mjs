// The installer's own helpers, one by one (seconds, not the minutes of scripts/selftest.mjs): writing JSON back without
// reflowing it, the record and the choices, the kit's marked parts of CLAUDE.md, and moving doc paths. npm run test:quick
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { formatJson, rewriteJson } from '../install-config.mjs';
import { detectLang, detectProject, inList, readChoices, recorded, recordLines, repoFromRemote } from '../install-choices.mjs';
import { mergeKitBlocks, rewriteChangedRules, unmarkInstalled } from '../install-docs.mjs';
import { movePaths, movePathsBack, oldPaths } from '../doc-layout.mjs';
import { due, older, STEPS } from '../migrations/index.mjs';
import { moveKitPaths, moveKitPathsBack, oldKitPaths } from '../kit-layout.mjs';
import { moveToWorkflowFolder } from '../migrations/3.0.0-workflow-folder.mjs';
import { changesSince } from '../install-report.mjs';

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
    const d = folder({ 'workflow/record': 'version=2.9.11\nlang=go\nproject=Trail\nrepo=o/trail\nprefix=tr\nmodules=map\nlean=1\nparts=shape\n' });
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
    assert.ok(inList(['workflow/tools/**'], 'workflow/tools/gate.mjs'));
    assert.ok(inList(['all'], 'anything'));
    assert.ok(!inList(['tools/'], 'scripts/x.mjs'));
    rmSync(d, { recursive: true, force: true });
  });
});

describe('the kit\'s parts of CLAUDE.md', () => {
  const fill = (t) => t.replace(/\{\{(\w+)\}\}/g, 'X');
  it('an existing CLAUDE.md keeps its own text and gets the kit\'s parts it lacks at its end', () => {
    const d = folder({ 'CLAUDE.md': '# Mine\n\nOur notes.\n', 'workflow/config.json': '{ "budget": { "CLAUDE.md": 100 } }\n' });
    const added = mergeKitBlocks({ target: d, kit, fill });
    const text = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
    assert.ok(text.startsWith('# Mine\n\nOur notes.\n'));
    assert.ok(added.length >= 5 && text.includes('<!-- kit:how-we-work -->'));
    assert.ok(JSON.parse(readFileSync(join(d, 'workflow/config.json'), 'utf8')).budget['CLAUDE.md'] >= Buffer.byteLength(text), 'the budget fits');
    assert.deepEqual(mergeKitBlocks({ target: d, kit, fill }), [], 'a second time adds nothing');
    rmSync(d, { recursive: true, force: true });
  });
  it('an update replaces a kit part only when it is what the project\'s kit version wrote', () => {
    const tags = spawnSync('git', ['tag', '-l', 'v2.9.11'], { cwd: kit, encoding: 'utf8' }).stdout.trim();
    if (!tags) return; // a copy of the kit without its tags: nothing to compare with (the installer says so)
    const old = fill(spawnSync('git', ['show', 'v2.9.11:starter/CLAUDE.md'], { cwd: kit, encoding: 'utf8' }).stdout);
    const changed = old.replace(/^## Writing style.*$/m, (h) => `${h}\n- Our own line.`);
    const d = folder({ 'CLAUDE.md': changed, 'workflow/record': 'version=2.9.11\n' });
    rewriteChangedRules({ target: d, kit, fill });
    const text = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
    assert.ok(text.includes('<!-- kit:how-we-work -->'), 'an untouched part is the kit\'s now');
    assert.ok(text.includes('- Our own line.') && !text.includes('<!-- kit:writing-style -->'), 'a changed part stays the project\'s');
    rmSync(d, { recursive: true, force: true });
  });
});

describe('profiles', () => {
  it("the library's guides: no profile takes one; the record, --with or a guide the project has already does", () => {
    const d = folder();
    const p = (...a) => readChoices([d, '--repo', 'o/x', ...a], kit);
    assert.ok(!['mesh', 'ads', 'a2a'].some((n) => p().parts.includes(n)), 'product takes none');
    assert.deepEqual([p('--with', 'ads').library, p('--with', 'ads').parts.includes('ads')], [['ads'], true]);
    assert.ok(p('--lean', '--with', 'mesh').parts.includes('mesh'), 'a lean project too');
    mkdirSync(join(d, 'docs', 'run'), { recursive: true });
    writeFileSync(join(d, 'docs', 'run', 'MESH.md'), '# mesh\n');
    assert.deepEqual(p().library, ['mesh'], 'a project that has the guide keeps it on an update');
    assert.deepEqual(recordLines({ version: '3.1.1', lang: 'ts', project: 'X', repo: 'o/x', prefix: 'x', modules: [], stages: [], skip: [], lean: false, parts: [], sections: [], library: ['mesh'] }).filter((l) => l.startsWith('library=')), ['library=mesh']);
    rmSync(d, { recursive: true, force: true });
  });
  it('a profile is a starting point: --with and --without adjust it, the record keeps it, another profile starts from its own', () => {
    const d = folder();
    const p = (...a) => readChoices([d, '--repo', 'o/x', ...a], kit);
    assert.deepEqual([p().profile, p().lean, p().parts.length > 5], ['product', false, true], 'a new project: product');
    assert.deepEqual([p('--lean').profile, p('--lean').parts], ['solo', []], '--lean is solo');
    assert.equal(p('--profile', 'minimal').gateOnly, true);
    assert.equal(p('--profile', 'team').team, true);
    assert.ok(!p('--without', 'market,ui').parts.includes('market') && !p('--without', 'market,ui').modules.includes('ui'));
    assert.match(p('--profile', 'huge').error, /Unknown profile "huge"/);
    mkdirSync(join(d, 'workflow'), { recursive: true });
    writeFileSync(join(d, 'workflow/record'), 'version=2.10.0\nrepo=o/x\nprofile=product\nwithout=market\nmodules=ui,map\n');
    assert.deepEqual([p().profile, p().parts.includes('market'), p().modules], ['product', false, ['ui', 'map']], 'the record keeps what was left out');
    assert.deepEqual([p('--with', 'market').parts.includes('market')], [true], '--with brings it back');
    assert.deepEqual([p('--profile', 'solo').parts, p('--profile', 'solo').modules, p('--profile', 'solo').profileChanged], [[], [], true], 'solo starts from its own');
    writeFileSync(join(d, 'workflow/record'), 'version=2.9.11\nrepo=o/x\nlean=1\nparts=shape\n');
    assert.deepEqual([p().profile, p().parts], ['solo', ['shape']], 'a lean project from before profiles is solo, its parts kept');
    rmSync(d, { recursive: true, force: true });
  });
});

describe('uninstall', () => {
  it('takes out the kit\'s files as it wrote them, its parts of CLAUDE.md and its scripts, and keeps what the project changed or wrote', () => {
    const d = folder({ 'CLAUDE.md': '# Mine\n\nOur notes.\n', 'package.json': '{ "name": "x", "scripts": { "dev": "vite" } }\n' });
    spawnSync('git', ['init', '-q'], { cwd: d });
    const installed = spawnSync(process.execPath, [join(kit, 'install.mjs'), d, '--repo', 'o/x'], { encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stderr);
    writeFileSync(join(d, 'workflow', 'tools', 'README.md'), 'changed by the project\n');
    const said = spawnSync(process.execPath, [join(kit, 'install.mjs'), d, '--uninstall'], { encoding: 'utf8' }).stdout;
    assert.match(said, /The kit is out of/);
    assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8').trim(), '# Mine\n\nOur notes.');
    assert.deepEqual(JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).scripts, { dev: 'vite' });
    assert.ok(existsSync(join(d, 'workflow', 'tools', 'README.md')) && !existsSync(join(d, 'workflow', 'tools', 'gate.mjs')), 'the changed one stays, the rest goes');
    assert.ok(!existsSync(join(d, 'workflow/record')) && !existsSync(join(d, '.claude', 'skills')));
    assert.match(said, /kept, because you changed them[\s\S]*workflow\/tools\/README\.md/);
    rmSync(d, { recursive: true, force: true });
  });
});

describe('"(not installed)" marks', () => {
  it('come out where what they name is there now, and stay where it is not', () => {
    const d = folder({
      'docs/PRODUCT.md': 'Run `/shape 3` (not installed) or /market (not installed); see docs/run/LAUNCH.md (with the launch part, not installed) and npm run launch-check (not installed).\n',
      '.claude/skills/shape/SKILL.md': 'x', 'docs/run/LAUNCH.md': 'x', 'package.json': '{ "scripts": {} }',
    });
    spawnSync('git', ['init', '-q'], { cwd: d });
    assert.deepEqual(unmarkInstalled({ target: d }), ['docs/PRODUCT.md']);
    assert.equal(readFileSync(join(d, 'docs/PRODUCT.md'), 'utf8'), 'Run `/shape 3` or /market (not installed); see `docs/run/LAUNCH.md` and npm run launch-check (not installed).\n');
    rmSync(d, { recursive: true, force: true });
  });
  it('are not written for a doc the project has as its own, so an update does not take the kit\'s files for changed ones', () => {
    // a project with its own docs/SECURITY.md and no security module (Trailsmith on 3.3.1: five kit files "changed" on every update)
    const d = folder({ 'docs/SECURITY.md': '# Security: ours\n' });
    spawnSync('git', ['init', '-q'], { cwd: d });
    const installed = spawnSync(process.execPath, [join(kit, 'install.mjs'), d, '--repo', 'o/x', '--modules', 'none'], { encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stderr);
    assert.match(readFileSync(join(d, '.claude/skills/secops/SKILL.md'), 'utf8'), /`docs\/SECURITY\.md`/);
    const updated = spawnSync(process.execPath, [join(kit, 'install.mjs'), d, '--update'], { encoding: 'utf8' });
    assert.equal(updated.status, 0, updated.stderr);
    assert.doesNotMatch(updated.stdout, /kept, because the project changed them/);
    rmSync(d, { recursive: true, force: true });
  });
});

describe('what changed for you', () => {
  it('the headlines of the versions after the project\'s, newest first, with code that holds ** left alone', () => {
    const log = '# Changelog\n\n- **2.9.9**: **the kit asks about AI**. More.\n- **2.9.8**, from x. **A test moves a card**: and `tools/**`\n  wraps. **An update\n  keeps every setting**: yes.\n- **2.9.7**: **old**.\n';
    assert.deepEqual(changesSince(log, '2.9.7', '2.9.9'), [
      { version: '2.9.9', headlines: ['the kit asks about AI'] },
      { version: '2.9.8', headlines: ['A test moves a card', 'An update keeps every setting'] },
    ]);
    assert.deepEqual(changesSince(log, '2.9.9', '2.9.9'), []);
  });
});

describe('migrations', () => {
  it('a step is due when the project\'s version is older than it, oldest first, and every step when there is no record', () => {
    assert.ok(older('2.9.7', '2.9.10') && !older('2.9.10', '2.9.7') && !older('2.9.8', '2.9.8'));
    assert.deepEqual(due('2.8.5', 'before').map((s) => s.version), ['2.9.0', '2.9.3']);
    assert.deepEqual(due('2.9.1', 'before').map((s) => s.version), ['2.9.3'], 'a project at 2.9.1 still gets the correction');
    assert.deepEqual(due('2.9.3', 'before'), [], 'a project at 2.9.3 has its docs where they belong');
    assert.deepEqual(due(null, 'config').map((s) => s.version), ['2.9.7', '3.3.0', '3.4.0']);
    assert.deepEqual(due('3.2.1', 'config').map((s) => s.version), ['3.3.0', '3.4.0'], 'a project at 3.2.1 gets the knip.json and notes fix');
    const versions = STEPS.map((s) => s.version);
    assert.deepEqual(versions, [...versions].sort((a, b) => (older(a, b) ? -1 : older(b, a) ? 1 : 0)), 'STEPS are oldest first');
    for (const s of STEPS) assert.ok(['before', 'claude', 'config'].includes(s.phase) && s.what && typeof s.run === 'function', `${s.version} has a phase, a what and a run`);
  });
});

describe('the typecheck keeps its notes (3.4.0)', () => {
  it('a typecheck script as an older kit wrote it gets --incremental; one the project changed stays', async () => {
    const { default: step } = await import('../migrations/3.4.0-typecheck-incremental.mjs');
    const d = folder({ 'package.json': '{\n  "scripts": {\n    "typecheck": "tsc --noEmit -p tsconfig.gate.json",\n    "dev": "vite"\n  }\n}\n' });
    assert.equal(step.run({ target: d }).said.length, 1);
    const pkg = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.scripts, { typecheck: 'tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo -p tsconfig.gate.json', dev: 'vite' });
    assert.deepEqual(step.run({ target: d }).said, [], 'once');
    writeFileSync(join(d, 'package.json'), '{ "scripts": { "typecheck": "tsc --noEmit && eslint ." } }\n');
    assert.deepEqual(step.run({ target: d }).said, [], "the project's own stays");
    rmSync(d, { recursive: true, force: true });
  });
});

describe('the kit under workflow/ (3.0)', () => {
  it('moves every old kit path once, never a word or a path that only ends the same way, and back again', () => {
    const cases = [
      ['node tools/workflow/gate.mjs --all', 'node workflow/tools/gate.mjs --all'],
      ['see `workflow.config.json` and `.workflow-kit`.', 'see `workflow/config.json` and `workflow/record`.'],
      ['in specs/<topic>.md and ../app-x/specs/x.md', 'in workflow/specs/<topic>.md and ../app-x/workflow/specs/x.md'],
      ['the waiting specs, and mydocs/workflow/x', 'the waiting specs, and mydocs/workflow/x'],
      ['node scripts/session.mjs --finish; node scripts/build.mjs', 'node workflow/scripts/session.mjs --finish; node scripts/build.mjs'],
      ['ends a sentence: workflow.config.json.', 'ends a sentence: workflow/config.json.'],
    ];
    for (const [old, now] of cases) {
      assert.equal(moveKitPaths(old), now);
      assert.equal(moveKitPaths(now), now, 'twice changes nothing more');
      assert.equal(moveKitPathsBack(now), old);
      assert.deepEqual(oldKitPaths(now), []);
    }
  });
  it('is quick on a long line with no spaces (a data file, minified code)', () => {
    let x = 12345, s = '';
    while (s.length < 450_000) { x = (x * 1103515245 + 12345) % 2147483648; s += x.toString(36); }
    const t0 = Date.now();
    moveKitPaths(`${s} tools/workflow/gate.mjs`);
    assert.ok(Date.now() - t0 < 2000, 'it once took hours here');
  });
  it('an older project\'s kit files move with git, its text follows, and its settings find the kit\'s tests', () => {
    const d = folder({
      '.workflow-kit': 'version=2.10.0\nsha 0123456789abcdef tools/workflow/gate.mjs\n', 'tools/workflow/gate.mjs': '// gate\n',
      'workflow.config.json': '{\n  "roots": ["src", "tests"],\n  "tests": "tests/**/*.test.ts"\n}\n', 'CLAUDE.md': 'Run `node tools/workflow/gate.mjs`.\n',
      'scripts/build.mjs': '// the project\'s own\n', 'tsconfig.json': '{ "include": ["src", "tests"] }\n',
    });
    spawnSync('git', ['init', '-q'], { cwd: d });
    spawnSync('git', ['add', '-A'], { cwd: d });
    const r = moveToWorkflowFolder(d);
    assert.ok(existsSync(join(d, 'workflow', 'tools', 'gate.mjs')) && existsSync(join(d, 'workflow', 'record')) && existsSync(join(d, 'scripts', 'build.mjs')));
    assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), 'Run `node workflow/tools/gate.mjs`.\n');
    assert.match(readFileSync(join(d, 'workflow', 'record'), 'utf8'), /sha 0123456789abcdef workflow\/tools\/gate\.mjs/);
    const cfg = JSON.parse(readFileSync(join(d, 'workflow', 'config.json'), 'utf8'));
    assert.deepEqual([cfg.tests, cfg.roots], ['{tests,workflow/tests}/**/*.test.ts', ['src', 'tests', 'workflow']]);
    assert.deepEqual(JSON.parse(readFileSync(join(d, 'tsconfig.json'), 'utf8')).include, ['src', 'tests', 'workflow']);
    assert.match(r.said[0], /moved under workflow\//);
    assert.deepEqual(moveToWorkflowFolder(d).moved, [], 'a second time does nothing');
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

describe('3.3.0 on a project from 3.2.1', async () => {
  const { default: step, OLD_KNIP } = await import('../migrations/3.3.0-knip-and-notes.mjs');
  it("knip.json as the kit wrote it gets the new ignore list and the build's start files; the notes placeholder goes", () => {
    const d = folder();
    writeFileSync(join(d, 'knip.json'), `${JSON.stringify(OLD_KNIP, null, 2)}\n`);
    writeFileSync(join(d, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', start: 'node src/server/main.ts' } }));
    mkdirSync(join(d, 'src', 'server'), { recursive: true });
    writeFileSync(join(d, 'src', 'server', 'main.ts'), '');
    mkdirSync(join(d, 'docs', 'design', 'notes'), { recursive: true });
    writeFileSync(join(d, 'docs', 'design', 'notes', 'README.md'), 'One notes file per board (/ui writes it).\n');
    const r = step.run({ target: d, kit });
    const knip = JSON.parse(readFileSync(join(d, 'knip.json'), 'utf8'));
    assert.ok(knip.ignore.includes('workflow/**') && !knip.ignore.includes('scripts/**'), JSON.stringify(knip));
    assert.ok(knip.entry?.includes('src/server/main.ts'), 'the start file the build names');
    assert.equal(existsSync(join(d, 'docs', 'design', 'notes', 'README.md')), false);
    assert.ok(existsSync(join(d, 'docs', 'design', 'notes', '.gitkeep')), 'the folder stays');
    assert.equal(r.said.length, 2);
    rmSync(d, { recursive: true, force: true });
  });
  it('a knip.json the project changed stays as it is', () => {
    const d = folder();
    const own = { ...OLD_KNIP, ignore: [...OLD_KNIP.ignore, 'legacy/**'] };
    writeFileSync(join(d, 'knip.json'), JSON.stringify(own));
    step.run({ target: d, kit });
    assert.deepEqual(JSON.parse(readFileSync(join(d, 'knip.json'), 'utf8')), own);
    rmSync(d, { recursive: true, force: true });
  });
});
