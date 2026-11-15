#!/usr/bin/env node
// The kit checks itself: install it into a fresh project in a temporary folder, the way a person would, and run everything
// there: the kit's own tests (they need a real project around them), the file map, the first baseline and the full gate.
// Then do it again with --update over the result, so an update is proven too. Used by .github/workflows/selftest.yml.
//   node scripts/selftest.mjs [<variant>...] [--keep]      no variant: full. --keep leaves the folders for a look
// The variants, each a project made the way its owner would make it:
//   full      TypeScript, every module and the ai module          lean     TypeScript, --lean: the build loop only
//   cluster   TypeScript with the cluster module (needs Docker)   vite     a Vite React starter, then the kit (needs the network)
//   python    uv's project, --lang python (needs uv)              go       go mod init, --lang go (needs go)
//   rust      cargo init, --lang rust (needs cargo, cargo-machete, cargo-audit)
// A variant whose tools are missing on this computer says so and is skipped; CI installs them and runs them all.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
// a tool is there when it answers --version (go answers "go version" instead)
const has = (cmd) => [['--version'], ['version']].some((a) => spawnSync(cmd, a, { stdio: 'ignore', shell: win }).status === 0);

const VARIANTS = {
  full: { args: ['--with', 'ai'] },
  lean: { args: ['--lean'] },
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

function runVariant(name) {
  const v = VARIANTS[name];
  const missing = (v.needs ?? []).filter((t) => !has(t));
  // go mod tidy -diff (the unused check) needs Go 1.23 or newer
  const goMinor = Number(/go1\.(\d+)/.exec(spawnSync('go', ['version'], { encoding: 'utf8', shell: win }).stdout ?? '')?.[1] ?? 0);
  if (name === 'go' && !missing.length && goMinor < 23) missing.push(`go 1.23 or newer (this computer has 1.${goMinor})`);
  if (missing.length) { console.log(`skip ${name}: ${missing.join(', ')} not installed here (CI runs it)`); return 'skipped'; }
  // the project folder itself has a plain lower-case name: a starter takes it as the package name (mkdtemp's has capitals)
  const tmp = mkdtempSync(join(tmpdir(), `kit-selftest-${name}-`));
  const dir = join(tmp, 'selftest-app');
  mkdirSync(dir);
  const steps = [];
  const step = (label, cmd, args) => {
    const t0 = Date.now();
    // npm, uv and cargo can be .cmd files on Windows; the arguments are fixed here, never outside input
    // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
    // input closed (''), so a starter that would ask a question takes its default instead of waiting
    const r = spawnSync(cmd, args, { cwd: dir, input: '', encoding: 'utf8', shell: win && cmd !== process.execPath, maxBuffer: 256 << 20, env: { ...process.env, CI: process.env.CI ?? '' } });
    const ok = r.status === 0;
    steps.push(ok);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (!ok) { console.log(String((r.stdout ?? '') + (r.stderr ?? '')).trim().split('\n').slice(-60).join('\n')); throw new Error(label); }
    return String(r.stdout ?? '');
  };
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  try {
    for (const [cmd, args] of v.prepare ?? []) {
      const said = step(`${cmd} ${args.slice(0, 3).join(' ')}`, cmd, args);
      if (cmd === 'npm' && args[0] === 'create' && !existsSync(join(dir, 'package.json'))) { console.log(`FAIL ${name}: npm create made no package.json in ${dir}:\n${said.trim().split('\n').slice(-12).join('\n')}`); throw new Error('create'); }
    }
    for (const [path, text] of Object.entries(v.files ?? {})) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); }
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Kit selftest');
    git('config', 'user.email', 'selftest@example.invalid');
    const install = [join(kit, 'install.mjs'), dir, '--project', 'Selftest App', '--repo', 'example/selftest-app', '--prefix', 'selftest', ...v.args];
    const said = step('install', process.execPath, install);
    // what the installer's "step 1" asks a person to run (TypeScript: one or more "npm i" joined by &&), so that line is proven too
    const line = /^\s*(?:1\.|step 1:)\s*(npm i [^\n]+)$/m.exec(said)?.[1];
    if (!v.args.includes('--lang') && !line) { console.log(`FAIL ${name}: the installer printed no "npm i" step:\n${said}`); throw new Error('step 1'); }
    for (const part of line ? line.split('&&').map((p) => p.trim().split(/\s+/).slice(2)) : []) step(`npm i ${part.join(' ')}`, 'npm', ['install', '--no-audit', '--no-fund', '--silent', ...part]);
    for (const [path, change] of Object.entries(v.fix ?? {})) writeFileSync(join(dir, path), change(readFileSync(join(dir, path), 'utf8')));
    for (const [cmd, args] of v.after ?? []) step(`${cmd} ${args.join(' ')}`, cmd, args);
    git('add', '-A');
    git('commit', '-q', '-m', 'Start from the kit');
    step('file map', process.execPath, ['tools/workflow/map.mjs']);
    step('first baseline', process.execPath, ['tools/workflow/gate.mjs', '--update-baseline']);
    step('the project\'s tests', 'npm', ['test', '--silent']);
    step('full gate', process.execPath, ['tools/workflow/gate.mjs', '--all']);
    git('add', '-A');
    git('commit', '-q', '-m', 'The first baseline');
    step('update over itself', process.execPath, [...install.filter((a, i) => !(a === '--with' || install[i - 1] === '--with' || a === '--lean')), '--update']);
    step('full gate after the update', process.execPath, ['tools/workflow/gate.mjs', '--all']);
    return 'passed';
  } catch {
    return 'failed';
  } finally {
    if (process.argv.includes('--keep')) console.log(`kept: ${dir}`);
    else rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const unknown = asked.filter((a) => !(a in VARIANTS) && a !== 'all');
if (unknown.length) { console.log(`Unknown variant ${unknown.join(', ')}. Variants: ${Object.keys(VARIANTS).join(', ')}, all`); process.exit(1); }
const names = asked.includes('all') ? Object.keys(VARIANTS) : asked.length ? asked : ['full'];
const results = Object.fromEntries(names.map((n) => [n, runVariant(n)]));
// on CI every asked variant must really run: a skip there means a tool the workflow should have installed is missing
const failed = Object.entries(results).filter(([, r]) => r === 'failed' || (process.env.CI && r === 'skipped')).map(([n]) => n);
console.log(`selftest: ${Object.entries(results).map(([n, r]) => `${n} ${r}`).join(', ')}`);
process.exit(failed.length ? 1 : 0);
