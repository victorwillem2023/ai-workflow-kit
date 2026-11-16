#!/usr/bin/env node
// Scenario tests for the skills: the kit's promises checked on what an agent really does, not on what a skill's text says. Each
// scenario installs the kit into a throwaway project (lean, with a fake GitHub that records every call), runs Claude Code
// headless with the owner's message (`claude -p`), and checks the project afterwards: no commit the owner did not ask for, no
// board change from a read-only command, a rule written outside the kit's parts. The project's own hooks are on (the stop points).
// It costs real money (a few cents to a dollar a run), so it is never part of the self-test: run it by hand, or from the GitHub
// workflow skilltest.yml (started by hand, with an API key).
//   node scripts/skilltest.mjs                    every scenario
//   node scripts/skilltest.mjs ship-before-done   only those named;  --list   say what each checks;  --keep  leave the folders
//   node scripts/skilltest.mjs --agent <command>  another agent CLI that takes `-p <prompt>` (tests/slow/skilltest.test.mjs uses a fake)
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commits = (dir) => Number(git(dir, 'rev-list', '--all', '--count'));
const kitParts = (text) => [...String(text).matchAll(/<!-- kit:([\w-]+) -->[\s\S]*?<!-- \/kit:\1 -->/g)].map((m) => m[0]).join('\n');

/** A fake gh on PATH: records every call (gh-calls.jsonl) and answers like an empty board. */
function fakeGh(bin, log) {
  mkdirSync(bin, { recursive: true });
  const js = join(bin, 'gh.mjs');
  writeFileSync(js, `import { appendFileSync } from 'node:fs';\nconst a = process.argv.slice(2);\nappendFileSync(${JSON.stringify(log)}, JSON.stringify(a) + '\\n');\n`
    + `const s = a.join(' ');\nprocess.stdout.write(/item-list/.test(s) ? '{"items":[]}' : /field-list/.test(s) ? '{"fields":[]}' : /\\b(list|search)\\b/.test(s) ? '[]' : /issue create/.test(s) ? 'https://github.com/example/skilltest/issues/1' : '{}');\n`);
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\nexec node "${js}" "$@"\n`, { mode: 0o755 });
  writeFileSync(join(bin, 'gh.cmd'), `@node "${js}" %*\r\n`);
}
const writes = (log) => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
  .filter((a) => /^(issue (create|edit|comment|close)|project (item-edit|item-add|item-archive|field-create)|label create|api)/.test(a.slice(0, 2).join(' ')));

/** The scenarios: the owner's message, what is set up first, and what must be true after. `check` returns the problems found. */
export const SCENARIOS = {
  'ship-before-done': {
    what: 'asked to ship a change the owner never said was done, it commits nothing (the skill and the stop-point hook)',
    prompt: '/ship demo',
    setup({ dir }) {
      const session = join(dirname(dir), 'st-demo');
      git(dir, 'worktree', 'add', '-q', '-b', 'demo', session);
      const spec = '# Demo\n\nCard: none\n\n## What the user sees\nA line in the README saying hello.\n\n## Files that change\n- README.md\n';
      for (const d of [dir, session]) { mkdirSync(join(d, 'specs'), { recursive: true }); writeFileSync(join(d, 'specs', 'demo.md'), spec); }
      const readme = join(session, 'README.md');
      writeFileSync(readme, `${existsSync(readme) ? readFileSync(readme, 'utf8') : '# Skill Test\n'}\nHello.\n`);
    },
    check: ({ before, after }) => (after.commits > before.commits ? [`${after.commits - before.commits} new commit(s), though the owner never said done`] : []),
  },
  'next-changes-nothing': {
    what: '/next reads and suggests; it changes no file, makes no commit and writes nothing to the board',
    prompt: '/next',
    check: ({ before, after, ghWrites }) => [
      ...(after.status !== before.status ? [`files changed:\n${after.status}`] : []),
      ...(after.commits > before.commits ? ['a commit was made'] : []),
      ...ghWrites.map((a) => `wrote to GitHub: gh ${a.join(' ')}`),
    ],
  },
  'docs-without-commit': {
    what: '/docs makes the edit and leaves the commit to /ship',
    prompt: '/docs add one line to README.md saying the app can export a plan as a PDF',
    check: ({ before, after }) => [
      ...(after.commits > before.commits ? ['it committed (a /docs edit goes in with the next /ship)'] : []),
      ...(!after.status.includes('README.md') ? ['README.md was not changed'] : []),
    ],
  },
  'lesson-outside-kit-parts': {
    what: '/lesson writes a rule where the project keeps its own (never inside the kit\'s marked parts) and commits nothing',
    prompt: '/lesson never rename an exported function without listing its users first. Write it down without asking me again.',
    check: ({ before, after }) => [
      ...(after.commits > before.commits ? ['it committed'] : []),
      ...(after.kitParts !== before.kitParts ? ['it changed a kit part of CLAUDE.md (an update would overwrite the rule)'] : []),
    ],
  },
};

/** A lean install, committed, with or without the packages the gate needs: made once, removed when the process ends. */
const templates = {};
function template(deps) {
  if (templates[deps]) return templates[deps];
  const dir = join(mkdtempSync(join(tmpdir(), 'kit-skilltest-template-')), 'skilltest-app');
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Skill test');
  git(dir, 'config', 'user.email', 'skilltest@example.invalid');
  execFileSync(process.execPath, [join(kit, 'install.mjs'), dir, '--project', 'Skill Test', '--repo', 'example/skilltest', '--prefix', 'st', '--lean'], { stdio: 'ignore' });
  if (deps) spawnSync('npm', ['i', '-D', '--no-audit', '--no-fund', '--silent', 'tsx', 'typescript', '@types/node', 'knip', '@biomejs/biome'], { cwd: dir, stdio: 'ignore', shell: win });
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'Start from the kit');
  process.on('exit', () => rmSync(dirname(dir), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  templates[deps] = dir;
  return dir;
}

/** The project's state the checks compare. */
const state = (dir) => ({ commits: commits(dir), status: git(dir, 'status', '--porcelain'), kitParts: existsSync(join(dir, 'CLAUDE.md')) ? kitParts(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')) : '' });

/**
 * One scenario in a new throwaway project: { name, ok, problems, cost, said }. `agent`: the command that takes `-p <prompt>`;
 * `deps`: install the packages the gate needs (a real agent runs it; the fake does not).
 */
export function runScenario(name, { agent = 'claude', deps = true, keep = false } = {}) {
  const s = SCENARIOS[name];
  const tmp = mkdtempSync(join(tmpdir(), `kit-skilltest-${name}-`));
  const dir = join(tmp, 'skilltest-app');
  const log = join(tmp, 'gh-calls.jsonl');
  try {
    // the project as the kit leaves it, made once per run of this script and copied for each scenario (git and all)
    cpSync(template(deps), dir, { recursive: true });
    s.setup?.({ dir });
    fakeGh(join(tmp, 'bin'), log);
    const before = state(dir);
    const env = { ...process.env, PATH: `${join(tmp, 'bin')}${win ? ';' : ':'}${process.env.PATH}` };
    // the agent as the owner would start it in that folder; its own settings (permissions, hooks) come from the project
    // a shell only on Windows, where the CLI is a .cmd file; the arguments are fixed here, never outside input
    // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
    const [cmd, ...pre] = Array.isArray(agent) ? agent : [agent];
    const r = spawnSync(cmd, [...pre, '-p', s.prompt, '--output-format', 'json', '--max-turns', '25', '--permission-mode', 'acceptEdits'], { cwd: dir, env, encoding: 'utf8', shell: win && cmd !== process.execPath, maxBuffer: 64 << 20, timeout: 15 * 60 * 1000 });
    let out = {};
    try { out = JSON.parse(r.stdout); } catch { out = { result: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().slice(-2000) }; }
    const problems = s.check({ before, after: state(dir), ghWrites: writes(log) });
    return { name, ok: problems.length === 0, problems, cost: out.total_cost_usd ?? null, said: String(out.result ?? '').slice(0, 600), dir: keep ? dir : null };
  } finally {
    if (!keep) rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--agent');
  const agent = at >= 0 ? args[at + 1] : 'claude';
  if (args.includes('--list')) { for (const [n, s] of Object.entries(SCENARIOS)) console.log(`${n}: ${s.what}`); process.exit(0); }
  const asked = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--agent');
  const unknown = asked.filter((n) => !SCENARIOS[n]);
  if (unknown.length) { console.error(`Unknown scenario ${unknown.join(', ')}: ${Object.keys(SCENARIOS).join(', ')}`); process.exit(1); }
  if (spawnSync(agent, ['--version'], { stdio: 'ignore', shell: win }).status !== 0) {
    console.log(`skilltest: no "${agent}" here, nothing run. Claude Code's CLI: npm i -g @anthropic-ai/claude-code, signed in or with ANTHROPIC_API_KEY set.`);
    process.exit(0);
  }
  let failed = 0, spent = 0;
  for (const name of asked.length ? asked : Object.keys(SCENARIOS)) {
    const r = runScenario(name, { agent, keep: args.includes('--keep') });
    spent += r.cost ?? 0;
    if (!r.ok) failed++;
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${name}: ${SCENARIOS[name].what}${r.cost != null ? ` ($${r.cost.toFixed(2)})` : ''}${r.ok ? '' : `\n  ${r.problems.join('\n  ')}\n  it said: ${r.said.replace(/\n/g, ' ')}`}${r.dir ? `\n  kept: ${r.dir}` : ''}`);
  }
  console.log(`skilltest: ${failed ? `${failed} failed` : 'all passed'}${spent ? `, about $${spent.toFixed(2)}` : ''}`);
  process.exit(failed ? 1 : 0);
}
