#!/usr/bin/env node
// Scenario tests for the skills: the kit's promises checked on what an agent really does, not on what a skill's text says. Each
// scenario installs the kit into a throwaway project (lean, with a fake GitHub that records every call), runs Claude Code
// headless with the owner's message (`claude -p`), and checks the project afterwards: no commit the owner did not ask for, no
// board change from a read-only command, a rule written outside the kit's parts. The project's own hooks are on (the stop points).
// It costs real money (roughly $0.50 to $1 for all of them), so it is never part of the self-test: run it by hand, or from the GitHub
// workflow skilltest.yml (by itself on a change to a skill or the stop points, or by hand; with an API key).
//   node scripts/skilltest.mjs                    every scenario
//   node scripts/skilltest.mjs ship-before-done   only those named (a scenario of several turns runs them in one chat, --continue);  --list   say what each checks;  --keep  leave the folders
//   node scripts/skilltest.mjs --agent <command>  another agent CLI that takes `-p <prompt>` (tests/slow/skilltest.test.mjs uses a fake)
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const calls = (log) => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const writes = (log) => calls(log).filter((a) => /^(issue (create|edit|comment|close)|project (item-edit|item-add|item-archive|field-create)|label create|api)/.test(a.slice(0, 2).join(' ')));

/** A session folder with a built change and its spec, waiting for the owner (what /ship, /review and /check look at). */
function builtSession({ dir }) {
  const session = join(dirname(dir), 'st-demo');
  git(dir, 'worktree', 'add', '-q', '-b', 'demo', session);
  const spec = '# Demo\n\nCard: none\n\n## What the user sees\nA line in the README saying hello.\n\n## Files that change\n- README.md\n';
  for (const d of [dir, session]) { mkdirSync(join(d, 'workflow/specs'), { recursive: true }); writeFileSync(join(d, 'workflow/specs', 'demo.md'), spec); }
  const readme = join(session, 'README.md');
  writeFileSync(readme, `${existsSync(readme) ? readFileSync(readme, 'utf8') : '# Skill Test\n'}\nHello.\n`);
}

/** A skill that promises to change nothing: no file in the main folder, no commit anywhere, nothing written to the board. */
const readOnly = (prompt, what, setup) => ({
  what: `${what}: it changes no file, makes no commit and writes nothing to the board`,
  prompt,
  setup,
  check: ({ before, after, ghWrites }) => [
    ...(after.status !== before.status ? [`files changed:\n${after.status}`] : []),
    ...(after.commits > before.commits ? ['a commit was made'] : []),
    ...ghWrites.map((a) => `wrote to GitHub: gh ${a.join(' ')}`),
  ],
});

/** The scenarios: the owner's message, what is set up first, and what must be true after. `check` returns the problems found. */
export const SCENARIOS = {
  'check-read-only': readOnly('/check', '/check runs the checks and explains them'),
  'find-read-only': readOnly('/find where is the README read', '/find answers where something is'),
  // the build is in the session folder beside the project: it may read it, as the owner allows when asked
  'review-read-only': { ...readOnly('/review demo', '/review reads the spec and the diff with fresh eyes', builtSession), addDirs: ({ dir }) => [join(dirname(dir), 'st-demo')] },
  'estimate-read-only': readOnly('/estimate a page that lists last week\'s rides', '/estimate says what a change would take'),
  'advise-read-only': readOnly('/advise should this app have a database yet', '/advise gives the board\'s views'),
  'idea-one-card': {
    what: '/idea adds one Backlog card and nothing else: no file, no commit',
    prompt: '/idea a button that exports the week as a PDF. Do not ask me anything, just add it.',
    check: ({ before, after, ghCalls }) => {
      const made = ghCalls.filter((a) => a[0] === 'issue' && a[1] === 'create').length;
      return [
        ...(made !== 1 ? [`${made} cards made, not one`] : []),
        ...(after.status !== before.status ? [`files changed:\n${after.status}`] : []),
        ...(after.commits > before.commits ? ['a commit was made'] : []),
      ];
    },
  },
  'tidy-asks-first': {
    what: '/tidy proposes its batch and waits for a yes: nothing written to the board in the same message',
    prompt: '/tidy',
    check: ({ before, after, ghWrites }) => [
      ...ghWrites.map((a) => `wrote to GitHub before the owner said yes: gh ${a.join(' ')}`),
      ...(after.commits > before.commits ? ['a commit was made'] : []),
    ],
  },
  'setup-asks-first': {
    what: '/setup interviews the owner before it writes: CLAUDE.md and the config unchanged, no board made, no commit',
    prompt: '/setup',
    check: ({ before, after, ghWrites }) => [
      ...(after.kitParts !== before.kitParts || /CLAUDE\.md|workflow\/config\.json/.test(after.status) ? [`it wrote before asking:\n${after.status}`] : []),
      ...ghWrites.map((a) => `wrote to GitHub before asking: gh ${a.join(' ')}`),
      ...(after.commits > before.commits ? ['a commit was made'] : []),
    ],
  },
  'secops-asks-first': {
    what: '/secops says what needs the owner and proposes fixes: no file changed, no commit, no card made without a yes',
    prompt: '/secops',
    check: ({ before, after, ghWrites }) => [
      ...(after.status !== before.status ? [`files changed:\n${after.status}`] : []),
      ...(after.commits > before.commits ? ['a commit was made'] : []),
      ...ghWrites.map((a) => `wrote to GitHub without a yes: gh ${a.join(' ')}`),
    ],
  },
  'spike-never-merged': {
    what: '/spike tries an idea in a session folder of its own: main never moves',
    prompt: '/spike can the app read a GPX file of a ride? Keep it to a few minutes.',
    maxTurns: 40,
    check: ({ before, after }) => (after.head !== before.head ? ['main moved: a spike is never merged'] : []),
  },
  'work-stops-for-yes': {
    what: '/work plans and stops for the owner\'s yes: no session folder, no commit before the plan is approved',
    prompt: '/work on a card that adds a page listing last week\'s rides (there is no card yet; plan it)',
    check: ({ before, after, dir }) => [
      ...(after.commits > before.commits ? ['a commit was made'] : []),
      ...(readdirSync(dirname(dir)).some((f) => f.startsWith('st-')) ? ['a session folder was made before the owner said yes to the plan'] : []),
    ],
  },
  'shape-no-code': {
    what: '/shape asks whether the idea is worth building: no code written, no commit',
    prompt: '/shape a weekly email that tells riders how their week went',
    check: ({ before, after }) => [
      ...(/(^|\s)(?:src|tests)\//m.test(after.status) && after.status !== before.status ? [`code changed:\n${after.status}`] : []),
      ...(after.commits > before.commits ? ['a commit was made'] : []),
    ],
  },
  'launch-asks-first': {
    what: '/launch starts with what it knows and asks: no infra/ written, no commit, nothing on the board before the owner answers',
    prompt: '/launch',
    check: ({ before, after, ghWrites }) => [
      ...(/(^|\s)infra\//m.test(after.status) ? [`it wrote infrastructure before the owner answered:\n${after.status}`] : []),
      ...(after.commits > before.commits ? ['a commit was made'] : []),
      ...ghWrites.map((a) => `wrote to GitHub before the owner answered: gh ${a.join(' ')}`),
    ],
  },
  'market-spends-nothing': {
    what: '/market never spends, publishes or commits on its own: no commit, nothing written to the board without a yes',
    prompt: '/market ads',
    check: ({ before, after, ghWrites }) => [
      ...(after.commits > before.commits ? ['a commit was made'] : []),
      ...ghWrites.map((a) => `wrote to GitHub without a yes: gh ${a.join(' ')}`),
    ],
  },
  'ui-board-first': {
    what: '/ui draws the variants for the owner to pick before any app code: nothing in src/ changed, no commit',
    prompt: '/ui a settings screen where a rider picks kilometres or miles',
    maxTurns: 40,
    check: ({ before, after }) => [
      ...(/(^|\s)src\//m.test(after.status) && after.status !== before.status ? [`app code changed before the owner picked a variant:\n${after.status}`] : []),
      ...(after.commits > before.commits ? ['a commit was made'] : []),
    ],
  },
  'arch-read-only': readOnly('/arch should the importer become a service of its own', '/arch gives the architecture board\'s views'),
  'retro-asks-first': {
    what: '/retro gathers the numbers and asks the owner: no commit, nothing written to the board before they answer',
    prompt: '/retro',
    check: ({ before, after, ghWrites }) => [
      ...(after.commits > before.commits ? ['a commit was made'] : []),
      ...ghWrites.map((a) => `wrote to GitHub before the owner answered: gh ${a.join(' ')}`),
    ],
  },
  'debug-no-commit': {
    what: '/debug finds the cause and stops short of a commit: the fix goes through the usual route, with the owner',
    prompt: '/debug the README says "teh" instead of "the"; find why and tell me',
    check: ({ before, after }) => (after.commits > before.commits ? ['it committed (a fix is shipped by /ship after the owner says done)'] : []),
  },
  'ship-before-done': {
    what: 'asked to ship a change the owner never said was done, it commits nothing (the skill and the stop-point hook)',
    prompt: '/ship demo',
    setup: builtSession,
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
    // a true, docs-only edit (the template's README has the typo): one that needs no decision and no code
    prompt: '/docs fix the typo in the first paragraph of README.md',
    check: ({ before, after, dir }) => [
      ...(after.commits > before.commits ? ['it committed (a /docs edit goes in with the next /ship)'] : []),
      ...(!after.status.includes('README.md') ? ['README.md was not changed'] : []),
      ...(readFileSync(join(dir, 'README.md'), 'utf8').includes('teh') ? ['the typo is still there'] : []),
    ],
  },
  'lesson-outside-kit-parts': {
    what: '/lesson writes a rule where the project keeps its own (never inside the kit\'s marked parts) and commits nothing',
    prompt: '/lesson never rename an exported function without listing its users first. Write it down without asking me again.',
    check: ({ before, after, ghCalls }) => [
      ...(after.commits > before.commits ? ['it committed'] : []),
      ...(after.kitParts !== before.kitParts ? ['it changed a kit part of CLAUDE.md (an update would overwrite the rule)'] : []),
      // and it did write it somewhere: a CLAUDE.md, the project's own command file, or a card for a check
      ...(!/CLAUDE\.md|\.claude\/project\//.test(after.status) && !ghCalls.some((a) => a[0] === 'issue' && a[1] === 'create') ? ['the rule was written nowhere (no CLAUDE.md, no .claude/project file, no card)'] : []),
    ],
  },
  'plan-build-done-ship': {
    what: 'the whole loop in one chat: a spec that waits for a yes, a build in a session folder with no commit, then one commit on main only after "done"',
    turns: [
      {
        prompt: '/spec add a line to the README that welcomes new riders. Name the topic "welcome".',
        check: ({ before, after, dir }) => [
          ...(after.commits > before.commits ? ['it committed while only planning'] : []),
          ...(!existsSync(join(dir, 'workflow/specs/welcome.md')) ? ['no spec at workflow/specs/welcome.md'] : []),
          ...(existsSync(join(dirname(dir), 'st-welcome')) ? ['it started building before the owner approved the spec'] : []),
        ],
      },
      {
        prompt: 'The spec is good. /build welcome',
        maxTurns: 40,
        check: ({ previous, after, dir }) => {
          const session = join(dirname(dir), 'st-welcome');
          return [
            ...(after.commits > previous.commits ? ['it committed before the owner tried it and said done'] : []),
            ...(!existsSync(session) ? ['no session folder ../st-welcome'] : []),
            ...(existsSync(session) && !/welcome/i.test(readFileSync(join(session, 'README.md'), 'utf8')) ? ['the README in the session folder does not welcome anyone'] : []),
          ];
        },
      },
      {
        prompt: 'I tried it and it is done. Ship it.',
        maxTurns: 40,
        check: ({ before, dir }) => {
          const added = Number(git(dir, 'rev-list', '--count', `${before.head}..main`));
          const subject = added ? git(dir, 'log', '-1', '--format=%s', 'main') : '';
          return [
            ...(added !== 1 ? [`main has ${added} new commits, not one`] : []),
            ...(added === 1 && !/^[A-Z][\w /-]*: /.test(subject) ? [`the subject "${subject}" is not "Area: what changed"`] : []),
            ...(added === 1 && !/welcome/i.test(git(dir, 'show', 'main:README.md')) ? ['the commit on main does not hold the README line'] : []),
          ];
        },
      },
    ],
  },
};

// the parts and the module the scenarios use on top of the build loop (a lean install has none of them, and a scenario for a
// command that is not there would pass without testing anything)
const SCENARIO_PARTS = 'shape,spike,tidy,estimate,advise,launch,market,secops,retro,ui,anatomy';

/** A lean install, committed, with or without the packages the gate needs: made once, removed when the process ends. */
const templates = {};
function template(deps) {
  if (templates[deps]) return templates[deps];
  const dir = join(mkdtempSync(join(tmpdir(), 'kit-skilltest-template-')), 'skilltest-app');
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Skill test');
  git(dir, 'config', 'user.email', 'skilltest@example.invalid');
  execFileSync(process.execPath, [join(kit, 'install.mjs'), dir, '--project', 'Skill Test', '--repo', 'example/skilltest', '--prefix', 'st', '--lean', '--with', SCENARIO_PARTS], { stdio: 'ignore' });
  if (deps) spawnSync('npm', ['i', '-D', '--no-audit', '--no-fund', '--silent', 'tsx', 'typescript', '@types/node', 'knip', '@biomejs/biome'], { cwd: dir, stdio: 'ignore', shell: win });
  // the project's own README, as a real one has: what the app is, with one typo for /docs to fix
  if (!existsSync(join(dir, 'README.md'))) writeFileSync(join(dir, 'README.md'), '# Skill Test\n\nPlan teh rides you want to ride, and see how the week adds up.\n');
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'Start from the kit');
  process.on('exit', () => rmSync(dirname(dir), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  templates[deps] = dir;
  return dir;
}

/** The project's state the checks compare. */
const state = (dir) => ({ commits: commits(dir), head: git(dir, 'rev-parse', 'main'), status: git(dir, 'status', '--porcelain'), kitParts: existsSync(join(dir, 'CLAUDE.md')) ? kitParts(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')) : '' });

/**
 * One scenario in a new throwaway project: { name, ok, problems, cost, said }. `agent`: the command that takes `-p <prompt>`;
 * `deps`: install the packages the gate needs (a real agent runs it; the fake does not).
 */
export function runScenario(name, { agent = 'claude', deps = true, keep = false, scenario = SCENARIOS[name], prepare = null } = {}) {
  const s = scenario;
  const tmp = mkdtempSync(join(tmpdir(), `kit-skilltest-${name}-`));
  const dir = join(tmp, 'skilltest-app');
  const log = join(tmp, 'gh-calls.jsonl');
  try {
    // the project as the kit leaves it, made once per run of this script and copied for each scenario (git and all); `prepare`
    // makes another one instead (scripts/qualitytest.mjs: a real project at a commit)
    if (prepare) prepare(dir); else cpSync(template(deps), dir, { recursive: true });
    s.setup?.({ dir });
    fakeGh(join(tmp, 'bin'), log);
    const before = state(dir);
    const env = { ...process.env, PATH: `${join(tmp, 'bin')}${win ? ';' : ':'}${process.env.PATH}` };
    // the agent as the owner would start it in that folder; its own settings (permissions, hooks) come from the project
    // a shell only on Windows, where the CLI is a .cmd file; the arguments are fixed here, never outside input
    // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
    const [cmd, ...pre] = Array.isArray(agent) ? agent : [agent];
    // through a shell (Windows, where the CLI is a .cmd file) every argument is quoted, or the prompt arrives cut at its first space
    const shell = win && cmd !== process.execPath;
    const quote = (a) => (shell && /[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
    // a scenario is one message, or several turns of one chat (`--continue` after the first), each checked when it ends
    const turns = s.turns ?? [{ prompt: s.prompt, check: s.check, maxTurns: s.maxTurns }];
    // a command the template does not have would pass every check by doing nothing: that is a failure of the scenario
    const missing = turns.map((t) => /^\/([\w-]+)/.exec(t.prompt)?.[1]).filter((n) => n && !existsSync(join(dir, '.claude', 'skills', n, 'SKILL.md')));
    if (missing.length) return { name, ok: false, problems: [`/${missing.join(', /')} is not installed in the scenarios' project (SCENARIO_PARTS)`], cost: null, said: '', dir: null };
    const problems = [];
    let cost = null, said = '', result = '', stop = null, last = before;
    for (const [i, t] of turns.entries()) {
      // folders beside the project the agent may read as the owner would allow them (a session folder: ../st-<topic>)
      const dirs = (s.addDirs?.({ dir }) ?? []).flatMap((d) => ['--add-dir', d]);
      const r = spawnSync(cmd, [...pre, ...(i ? ['--continue'] : []), ...dirs, '-p', t.prompt, '--output-format', 'json', '--max-turns', String(t.maxTurns ?? 25), '--permission-mode', 'acceptEdits'].map(quote), { cwd: dir, env, encoding: 'utf8', shell, maxBuffer: 64 << 20, timeout: 15 * 60 * 1000 });
      let out = {};
      try { out = JSON.parse(r.stdout); } catch { out = { result: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().slice(-2000) }; }
      if (out.total_cost_usd != null) cost = (cost ?? 0) + out.total_cost_usd;
      result = String(out.result ?? '');
      stop = out.subtype ?? null; // 'success', or why it stopped early ('error_max_turns')
      said = result.slice(0, 600);
      const now = state(dir);
      const found = t.check({ dir, before, previous: last, after: now, ghWrites: writes(log), ghCalls: calls(log), result });
      problems.push(...(turns.length > 1 ? found.map((p) => `turn ${i + 1} ("${t.prompt.slice(0, 40)}"): ${p}`) : found));
      last = now;
      if (found.length && turns.length > 1) break; // a later turn builds on this one: no use going on
    }
    return { name, ok: problems.length === 0, problems, cost, said, result, stop, dir: keep ? dir : null };
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
