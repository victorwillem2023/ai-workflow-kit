#!/usr/bin/env node
// The kit checks itself: install it into a fresh project in a temporary folder, the way a person would, and run everything
// there: the kit's own tests (they need a real project around them), the file map, the first baseline and the full gate.
// Then do it again with --update over the result, so an update is proven too. Used by .github/workflows/selftest.yml.
//   node scripts/selftest.mjs [<variant>...] [--keep]      no variant: full. --keep leaves the folders for a look
//   node scripts/selftest.mjs --quick                      full and lean only: enough for a routine change (CI still runs them all)
// Variants run side by side (--jobs <n>, default 4), each with its own port range (WORKFLOW_TEST_PORTS): a session's --finish
// stops whatever listens on its port, so two projects checked at once must never share one.
// The variants, each a project made the way its owner would make it:
//   full      TypeScript, every module and the ai module          lean     TypeScript, --lean: the build loop only
//   cluster   TypeScript with the cluster module (needs Docker)   vite     a Vite React starter, then the kit (needs the network)
//   python    uv's project, --lang python (needs uv)              go       go mod init, --lang go (needs go)
//   rust      cargo init, --lang rust (needs cargo, cargo-machete, cargo-audit)
// A variant whose tools are missing on this computer says so and is skipped; CI installs them and runs them all.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORRECTIONS, MOVES, movePathsBack, oldPaths } from '../doc-layout.mjs';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
// a tool is there when it answers --version (go answers "go version" instead)
const has = (cmd) => [['--version'], ['version']].some((a) => spawnSync(cmd, a, { stdio: 'ignore', shell: win }).status === 0);

const VARIANTS = {
  // full: the run stage entered (docs/run/ there); every other variant without it, as a new project starts
  full: { args: ['--with', 'ai', '--stage', 'run'] },
  // lean: no installed text may name a command that is not installed without saying so
  lean: { args: ['--lean'], check: unmarkedMentions },
  cluster: { args: ['--with', 'cluster'], needs: ['docker'] },
  // /setup's step for a framework starter: its files into the kit's format, once (setup/SKILL.md)
  // and the one thing Biome cannot fix by itself in Vite's demo (a button with no type), fixed as the setup agent would
  vite: {
    args: [],
    prepare: [['npm', ['create', '--yes', 'vite@6.5.0', '.', '--', '--template', 'react-ts']], ['npm', ['install', '--no-audit', '--no-fund', '--silent']]],
    fix: { 'src/App.tsx': (t) => t.replace('<button onClick', '<button type="button" onClick') },
    after: [['npx', ['--no-install', 'biome', 'check', '--write', '--no-errors-on-unmatched', 'src', 'tests']]],
  },
  python: { args: ['--lang', 'python'], needs: ['uv'], after: [['uv', ['sync', '--quiet']]], files: { 'src/selftest/__init__.py': 'def add(a: int, b: int) -> int:\n    return a + b\n', 'tests/test_add.py': 'from selftest import add\n\n\ndef test_add() -> None:\n    assert add(1, 2) == 3\n' } },
  go: { args: ['--lang', 'go'], needs: ['go'], prepare: [['go', ['mod', 'init', 'example.com/selftest']]], files: { 'internal/add/add.go': 'package add\n\n// Add adds two numbers.\nfunc Add(a, b int) int { return a + b }\n', 'internal/add/add_test.go': 'package add\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {\n\tif Add(1, 2) != 3 {\n\t\tt.Fatal("1 + 2")\n\t}\n}\n' } },
  rust: { args: ['--lang', 'rust'], needs: ['cargo', 'cargo-machete', 'cargo-audit'], prepare: [['cargo', ['init', '--lib', '--name', 'selftest', '--vcs', 'none', '--quiet']]] },
};

/** Every mention of a skill the project does not have (in its skills, docs and CLAUDE.md) that does not say "(not installed)". */
/** The project's text files (tracked and new, not ignored), with the kit's stamp file, which names paths too. */
const projectText = (dir) => [...execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\n').filter((f) => f && /\.(md|mjs|cjs|js|ts|tsx|mts|json|ya?ml|html|tpl|txt|toml|py|go|rs)$/.test(f) && existsSync(join(dir, f))), '.workflow-kit'];
/** Every old doc path (from before kit 2.9) still named in the project: "file: docs/X.md". */
function oldDocPaths(dir) {
  return projectText(dir).flatMap((f) => oldPaths(readFileSync(join(dir, f), 'utf8')).map((p) => `${f}: ${p}`));
}
/** The project as a kit from before 2.9 left it: every doc back at the top of docs/, every path in its text the old one. */
function asOlderKitLeftIt(dir) {
  for (const [from, to] of MOVES) if (existsSync(join(dir, to))) execFileSync('git', ['mv', to, from], { cwd: dir, stdio: 'ignore' });
  const text = () => projectText(dir).filter((x) => x !== '.workflow-kit');
  for (const f of text()) { const was = readFileSync(join(dir, f), 'utf8'); const back = movePathsBack(was); if (back !== was) writeFileSync(join(dir, f), back); }
  const mark = join(dir, '.workflow-kit');
  writeFileSync(mark, movePathsBack(readFileSync(mark, 'utf8')));
  // PRODUCTION.md where kit 2.9.0 to 2.9.2 put it (docs/run/), so the update's correction is proven too
  if (existsSync(join(dir, 'docs', 'PRODUCTION.md'))) {
    mkdirSync(join(dir, 'docs', 'run'), { recursive: true });
    execFileSync('git', ['mv', 'docs/PRODUCTION.md', 'docs/run/PRODUCTION.md'], { cwd: dir, stdio: 'ignore' });
    for (const f of text()) { const t = readFileSync(join(dir, f), 'utf8'); const r = t.replaceAll('docs/PRODUCTION.md', 'docs/run/PRODUCTION.md'); if (r !== t) writeFileSync(join(dir, f), r); }
  }
  // the stamps as that older kit wrote them: of every kit file as it is now (nobody changed them since the kit wrote them)
  const hash = (t) => createHash('sha1').update(String(t).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
  writeFileSync(mark, readFileSync(mark, 'utf8').replace(/^sha (\S+) (.+)$/gm, (line, h, f) => (existsSync(join(dir, f)) ? `sha ${hash(readFileSync(join(dir, f), 'utf8'))} ${f}` : line)));
  // a run-stage page of the project's own (a deploy page /setup filled), pointing at a kit guide of that stage: it must keep leading somewhere
  writeFileSync(join(dir, 'docs', 'DEPLOY.md'), "# Deploying (the project's own page)\n\nThe edge and its certificates: `docs/INFRA.md`.\n");
  // the helpers an older kit did not have (src/server/trace.ts ...): the update adds them
  for (const h of HELPERS) if (existsSync(join(dir, h))) rmSync(join(dir, h));
  // CLAUDE.md exactly at its budget, as a project near it is: the move's longer paths must not fail its gate
  const cfg = JSON.parse(readFileSync(join(dir, 'workflow.config.json'), 'utf8'));
  if (cfg.budget?.['CLAUDE.md']) { cfg.budget['CLAUDE.md'] = Buffer.byteLength(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')); writeFileSync(join(dir, 'workflow.config.json'), `${JSON.stringify(cfg, null, 2)}\n`); }
}
const HELPERS = ['src/server/trace.ts', 'src/server/errors.ts', 'src/web/report.ts', 'tests/production/debugging.test.ts'];

/**
 * Every doc the installed skills, docs and CLAUDE.md point at in backticks is there: a stage not reached yet, or a part left out,
 * says so instead of pointing at nothing. (A path with a placeholder, a glob, or a page a tool writes on demand is not counted.)
 */
function missingDocPointers(dir) {
  const onDemand = new Set(['docs/run/INFRA-MAP.md', 'docs/MAP.md', 'docs/README.md']);
  const files = [...walkMd(join(dir, '.claude')), ...walkMd(join(dir, 'docs')), join(dir, 'CLAUDE.md')];
  const out = [];
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/`(docs\/[\w/-]+\.md)`/g)) if (!onDemand.has(m[1]) && !existsSync(join(dir, m[1]))) out.push(`${f.slice(dir.length + 1)}:${i + 1}: ${m[1]}`);
  });
  return out;
}

/**
 * Every installed doc has a reader: a skill, a tool, a script or CLAUDE.md names it, so it is read at the moment it steers the
 * owner and is not just there. (Folder notes, generated pages and the project's own content folders are not counted.)
 */
function docsWithoutReader(dir) {
  const docs = walkMd(join(dir, 'docs')).map((f) => f.slice(dir.length + 1).replace(/\\/g, '/'))
    .filter((d) => !/^docs\/(MAP|README)\.md$|\/README\.md$|^docs\/(guide|code|design|decisions|requests|sources|flow)\//.test(d));
  const walkAll = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkAll(join(d, e.name)) : [join(d, e.name)])) : []);
  const readers = [...walkAll(join(dir, '.claude')), ...walkAll(join(dir, 'tools')), ...walkAll(join(dir, 'scripts')), join(dir, 'CLAUDE.md')]
    .filter((f) => /\.(md|mjs|js|ts)$/.test(f) && existsSync(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
  return docs.filter((d) => !readers.includes(d));
}

function unmarkedMentions(dir) {
  const skills = new Set(readdirSync(join(dir, '.claude', 'skills')));
  const missing = readdirSync(join(kit, 'payload', '.claude', 'skills')).filter((s) => !skills.has(s));
  if (!missing.length) return [];
  const files = [...walkMd(join(dir, '.claude')), ...walkMd(join(dir, 'docs')), join(dir, 'CLAUDE.md')];
  const out = [];
  const re = new RegExp(`(\`/(?:${missing.join('|')})\\b[^\`\\n]*\`|(?<![\\w\`/.-])/(?:${missing.join('|')})\\b(?![\\w-]))(?! \\(not installed\\))`, 'g');
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => { for (const m of line.matchAll(re)) out.push(`${f.slice(dir.length + 1)}:${i + 1}: ${m[0]}`); });
  return out;
}
function walkMd(d) {
  if (!existsSync(d)) return [];
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkMd(join(d, e.name)) : e.name.endsWith('.md') ? [join(d, e.name)] : []));
}

async function runVariant(name) {
  const v = VARIANTS[name];
  const missing = (v.needs ?? []).filter((t) => !has(t));
  // the pinned staticcheck and govulncheck (starter/lang.json) need Go 1.26 or newer
  const goMinor = Number(/go1\.(\d+)/.exec(spawnSync('go', ['version'], { encoding: 'utf8', shell: win }).stdout ?? '')?.[1] ?? 0);
  if (name === 'go' && !missing.length && goMinor < 26) missing.push(`go 1.26 or newer (this computer has 1.${goMinor})`);
  if (missing.length) { console.log(`skip ${name}: ${missing.join(', ')} not installed here (CI runs it)`); return 'skipped'; }
  // the project folder itself has a plain lower-case name: a starter takes it as the package name (mkdtemp's has capitals)
  const tmp = mkdtempSync(join(tmpdir(), `kit-selftest-${name}-`));
  const dir = join(tmp, 'selftest-app');
  mkdirSync(dir);
  const steps = [];
  // its own port range, so projects checked side by side never stop each other's test servers
  const env = { ...process.env, CI: process.env.CI ?? '', WORKFLOW_KIT_TESTS: '1', WORKFLOW_TEST_PORTS: String(Object.keys(VARIANTS).indexOf(name) * 400) };
  const step = (label, cmd, args) => new Promise((done, fail) => {
    const t0 = Date.now();
    // npm, uv and cargo can be .cmd files on Windows; the arguments are fixed here, never outside input
    // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
    // stdin closed, so a starter that would ask a question takes its default instead of waiting
    const p = spawn(cmd, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], shell: win && cmd !== process.execPath, env });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', (e) => { out += e.message; });
    p.on('close', (code) => {
      const ok = code === 0;
      steps.push(ok);
      // a failure prints its last lines in the same write, so lines of variants running at the same time do not mix into it
      const tail = ok ? '' : `\n${out.trim().split('\n').slice(-60).join('\n')}`;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s)${tail}`);
      if (ok) done(out); else fail(new Error(label));
    });
  });
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  try {
    for (const [cmd, args] of v.prepare ?? []) {
      const said = await step(`${cmd} ${args.slice(0, 3).join(' ')}`, cmd, args);
      if (cmd === 'npm' && args[0] === 'create' && !existsSync(join(dir, 'package.json'))) { console.log(`FAIL ${name}: npm create made no package.json in ${dir}:\n${said.trim().split('\n').slice(-12).join('\n')}`); throw new Error('create'); }
    }
    for (const [path, text] of Object.entries(v.files ?? {})) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); }
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Kit selftest');
    git('config', 'user.email', 'selftest@example.invalid');
    const install = [join(kit, 'install.mjs'), dir, '--project', 'Selftest App', '--repo', 'example/selftest-app', '--prefix', 'selftest', ...v.args];
    const said = await step('install', process.execPath, install);
    if (v.check) {
      const found = v.check(dir);
      console.log(`${found.length ? 'FAIL' : 'ok  '} ${name}: no command named that is not installed${found.length ? `:\n${found.slice(0, 20).join('\n')}` : ''}`);
      if (found.length) throw new Error('mentions');
    }
    const pointers = missingDocPointers(dir);
    console.log(`${pointers.length ? 'FAIL' : 'ok  '} ${name}: every doc pointed at is there${pointers.length ? `:\n${pointers.slice(0, 20).join('\n')}` : ''}`);
    if (pointers.length) throw new Error('doc pointers');
    const unread = docsWithoutReader(dir);
    console.log(`${unread.length ? 'FAIL' : 'ok  '} ${name}: every doc has a skill, tool or CLAUDE.md that reads it${unread.length ? `: ${unread.join(', ')}` : ''}`);
    if (unread.length) throw new Error('docs without a reader');
    const stale = oldDocPaths(dir);
    console.log(`${stale.length ? 'FAIL' : 'ok  '} ${name}: no doc named by its old path${stale.length ? `:\n${stale.slice(0, 20).join('\n')}` : ''}`);
    if (stale.length) throw new Error('old doc paths');
    // what the installer's "step 1" asks a person to run (TypeScript: one or more "npm i" joined by &&), so that line is proven too
    const line = /^\s*(?:1\.|step 1:)\s*(npm i [^\n]+)$/m.exec(said)?.[1];
    if (!v.args.includes('--lang') && !line) { console.log(`FAIL ${name}: the installer printed no "npm i" step:\n${said}`); throw new Error('step 1'); }
    for (const part of line ? line.split('&&').map((p) => p.trim().split(/\s+/).slice(2)) : []) await step(`npm i ${part.join(' ')}`, 'npm', ['install', '--no-audit', '--no-fund', '--silent', ...part]);
    for (const [path, change] of Object.entries(v.fix ?? {})) writeFileSync(join(dir, path), change(readFileSync(join(dir, path), 'utf8')));
    for (const [cmd, args] of v.after ?? []) await step(`${cmd} ${args.join(' ')}`, cmd, args);
    git('add', '-A');
    git('commit', '-q', '-m', 'Start from the kit');
    await step('file map', process.execPath, ['tools/workflow/map.mjs']);
    await step('first baseline', process.execPath, ['tools/workflow/gate.mjs', '--update-baseline']);
    // the full gate runs the project's whole test suite (npm test) itself: no separate run of it
    await step('full gate', process.execPath, ['tools/workflow/gate.mjs', '--all']);
    git('add', '-A');
    git('commit', '-q', '-m', 'The first baseline');
    // the update starts from the layout an older kit left (every doc at the top of docs/), so moving a project over is proven too
    asOlderKitLeftIt(dir);
    git('add', '-A');
    git('commit', '-q', '-m', 'As a kit from before 2.9 left it');
    const updated = await step('update over itself', process.execPath, [...install.filter((a, i) => !(a === '--with' || install[i - 1] === '--with' || a === '--lean')), '--update']);
    // nothing of the kit's may be taken for the project's own work: the move rewrote paths in kit files, nobody changed them
    // (only the kit's own files: "the kit's version differs"; a project page kept in a stage not reached is rightly its own)
    const claimed = /kept, because the project changed them \(\d+\); the kit's version differs[\s\S]*?(?=\n {2}\S|\n\S|$)/.exec(updated)?.[0];
    console.log(`${claimed ? 'FAIL' : 'ok  '} ${name}: the update takes no kit file for the project's own${claimed ? `:\n${claimed}` : ''}`);
    if (claimed) throw new Error('kit files taken for the project');
    const left = [...oldDocPaths(dir), ...[...MOVES, ...CORRECTIONS].filter(([from]) => existsSync(join(dir, from))).map(([from]) => `${from} was not moved`),
      ...(v.args.includes('--lang') || !existsSync(join(dir, 'src', 'server', 'log.ts')) ? [] : HELPERS.filter((h) => !existsSync(join(dir, h))).map((h) => `${h} was not added back`))];
    console.log(`${left.length ? 'FAIL' : 'ok  '} ${name}: the update moved the docs into their folders${left.length ? `:\n${left.slice(0, 20).join('\n')}` : ''}`);
    if (left.length) throw new Error('docs not moved');
    // and nothing the project keeps points at a doc the update took away (its own run page at the kit's guide)
    const after = missingDocPointers(dir);
    console.log(`${after.length ? 'FAIL' : 'ok  '} ${name}: after the update every doc pointed at is there${after.length ? `:\n${after.slice(0, 20).join('\n')}` : ''}`);
    if (after.length) throw new Error('doc pointers after the update');
    // what the update's own last lines ask for: the map (the docs index changed with the docs)
    await step('file map after the update', process.execPath, ['tools/workflow/map.mjs']);
    await step('full gate after the update', process.execPath, ['tools/workflow/gate.mjs', '--all']);
    return 'passed';
  } catch {
    return 'failed';
  } finally {
    if (process.argv.includes('--keep')) console.log(`kept: ${dir}`);
    else rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

const asked = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--jobs');
const unknown = asked.filter((a) => !(a in VARIANTS) && a !== 'all');
if (unknown.length) { console.log(`Unknown variant ${unknown.join(', ')}. Variants: ${Object.keys(VARIANTS).join(', ')}, all`); process.exit(1); }
const names = asked.includes('all') ? Object.keys(VARIANTS) : asked.length ? asked : process.argv.includes('--quick') ? ['full', 'lean'] : ['full'];
// side by side, at most --jobs at once (each runs a whole project's checks, which use several cores themselves)
const jobsAt = process.argv.indexOf('--jobs');
const jobs = Math.max(1, Number(jobsAt >= 0 ? process.argv[jobsAt + 1] : 0) || Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2))));
const results = {};
const queue = [...names];
await Promise.all(Array.from({ length: Math.min(jobs, names.length) }, async () => {
  for (let n = queue.shift(); n; n = queue.shift()) results[n] = await runVariant(n);
}));
// on CI every asked variant must really run: a skip there means a tool the workflow should have installed is missing
const failed = Object.entries(results).filter(([, r]) => r === 'failed' || (process.env.CI && r === 'skipped')).map(([n]) => n);
console.log(`selftest: ${names.map((n) => `${n} ${results[n]}`).join(', ')}`);
process.exit(failed.length ? 1 : 0);
