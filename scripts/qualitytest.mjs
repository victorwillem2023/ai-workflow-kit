#!/usr/bin/env node
// Quality scenarios for the skills: not whether an agent keeps the kit's promises (scripts/skilltest.mjs) but whether its answer
// is good. Each plants a small project with a known flaw (scripts/quality/fixtures.mjs, never installed into a project), runs
// the skill headless and grades the answer against points written beforehand: by a script where a script can tell (it names
// both copies of the list), by a second model only where it cannot (the end state gives the kind a home of its own), each
// point a yes or no, never "is this good?". Blind by design: a scenario fails when the kit's installed text names its answer.
// One run is one sample, so a scenario runs three times and passes when most runs do. It costs real money (an /anatomy run
// reads a whole flow), so it never runs in the self-test: by hand before a release, after a change to one of these skills, or
// from the qualitytest workflow (.github/workflows/qualitytest.yml, started by hand). Each real run adds a line to scripts/quality-scores.jsonl, so a drop shows.
//   node scripts/qualitytest.mjs [<scenario>...] [--runs 3] [--keep] [--no-record]   --list   say what each checks
//   node scripts/qualitytest.mjs --local <file.json>   a real project at a commit (the file says where; it stays on your computer)
//   --agent <command> / --judge <command>: other CLIs that take -p (tests/slow/qualitytest.test.mjs uses stand-ins)
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenario } from './skilltest.mjs';
import { jsonAt } from './kitreview.mjs';
import { GRAVEL_PACE, SPREAD_SUMMIT, WEEK_TOTAL } from './quality/fixtures.mjs';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const SCORES = join(kit, 'scripts', 'quality-scores.jsonl');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

/** Writes the files into the project and commits them, as the owner's own code. */
function plant(dir, files) {
  for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); }
  git(dir, 'add', '-A'); git(dir, '-c', 'user.name=Quality test', '-c', 'user.email=quality@example.invalid', 'commit', '-q', '-m', 'The project so far');
}

/**
 * Every text file of the kit's own parts in a project (.claude/ and workflow/, not the specs), for the blind check: the project's
 * own code and docs may name the answer (that is where the flaw is), the kit's text may not.
 */
function kitText(dir, planted) {
  const out = [];
  const walk = (d) => { for (const e of existsSync(d) ? readdirSync(d) : []) {
    const p = join(d, e);
    if (/^(node_modules|\.git|specs)$/.test(e)) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(md|mjs|json|ts|txt)$/.test(e) && !planted.has(relative(dir, p).replace(/\\/g, '/'))) out.push([relative(dir, p), read(p)]);
  } };
  walk(join(dir, '.claude')); walk(join(dir, 'workflow'));
  return out;
}

/** The answer's text: what the agent said and the files it wrote that the scenario names (globs of one * only). */
function answerOf(dir, result, files = []) {
  const found = files.flatMap((g) => { const [d, pat] = [dirname(g), new RegExp('^' + g.split('/').pop().replace(/[.]/g, '\\.').replace('*', '.*') + '$')]; return existsSync(join(dir, d)) ? readdirSync(join(dir, d)).filter((f) => pat.test(f)).map((f) => join(d, f)) : []; });
  return [result, ...found.map((f) => `\n\n--- ${f} ---\n${read(join(dir, f))}`)].join('');
}

/** The scenarios: the owner's message, the project it meets, the answer it should reach, and how many points make a pass. */
export const QUALITY = {
  'anatomy-spread-kind': {
    what: '/anatomy finds a kind spread over the shared steps, rules with two homes, and plans one home for it, check first',
    prompt: '/anatomy shape: summit. There is no owner here: choose yourself, write the cards as a list instead of making them, and write the page docs/anatomy/summit.md.',
    maxTurns: 60, files: SPREAD_SUMMIT, answerFiles: ['docs/anatomy/*.md'],
    secrets: ['BACK_OFF', 'tripUp', 'dayUp', 'summit-trip'],
    points: [
      { id: 'list-twice', what: 'the list of points to step back through is one rule in two files (TRIES, BACK_OFF)', test: (t) => /TRIES/.test(t) && /BACK_OFF/.test(t) },
      { id: 'shared-steps', what: 'names three or more shared steps that ask whether it is a summit', test: (t) => ['candidates', 'score', 'select', 'notes'].filter((f) => new RegExp(`\\b${f}\\.ts\\b`).test(t)).length >= 3 },
      { id: 'own-home', judge: 'The end state gives "to a top" (summit) a home of its own, a module or pipeline, and the shared steps (candidates, score, select, notes) no longer branch on whether it is a summit.' },
      { id: 'one-route-up', judge: 'The day hike and the trip use one way to route a way up: one list of points to step back through, not two.' },
      { id: 'one-reach', judge: 'Whether the top was reached is decided in one place for the day hike, the trip and the notes (today three places with different rules).' },
      { id: 'check-first', judge: 'The first card of the plan is a before-and-after check that records what summit outings plan today, so the refactors can show they change nothing.' },
      { id: 'order', judge: 'The refactor cards, which change nothing anyone sees, come before the cards that change behaviour.' },
    ],
    pass: { judge: 4, must: ['own-home'] },
  },
  'review-catches-bugs': {
    what: '/review finds the two mistakes against the spec in a built change, and that its test catches neither',
    prompt: '/review week-total',
    maxTurns: 30,
    // the build is in the session folder beside the project; in a chat the owner allows reading it when asked
    addDirs: ({ dir }) => [join(dirname(dir), 'st-week-total')],
    setup: (dir) => {
      plant(dir, WEEK_TOTAL.main);
      const session = join(dirname(dir), 'st-week-total');
      git(dir, 'worktree', 'add', '-q', '-b', 'week-total', session);
      for (const d of [dir, session]) { mkdirSync(join(d, 'workflow/specs'), { recursive: true }); writeFileSync(join(d, 'workflow/specs/week-total.md'), WEEK_TOTAL.spec); }
      for (const [f, text] of Object.entries(WEEK_TOTAL.session)) { mkdirSync(dirname(join(session, f)), { recursive: true }); writeFileSync(join(session, f), text); }
    },
    planted: [...Object.keys(WEEK_TOTAL.main), 'workflow/specs/week-total.md'],
    secrets: ['weekTotalKm'],
    points: [
      // the mistake named, not the code or the spec quoted: NaN or undefined for a ride with no distance, whole km against one decimal
      { id: 'missing-km', what: 'a ride with no distance makes the total NaN', test: (t) => /NaN|\bundefined\b[^.\n]*\b(km|distance|total)|(km|distance|total)[^.\n]*\bundefined\b/i.test(t) },
      { id: 'rounding', what: 'the total is rounded to whole km, not one decimal', test: (t) => /one decimal|1 decimal|tenth/i.test(t) && /\b(whole|integer|nearest (whole )?(km|kilomet))/i.test(t) },
      { id: 'both-wrong', judge: 'It says both: a ride with no distance makes the total NaN (it must count as 0), and the total is rounded to whole km instead of one decimal.' },
      { id: 'tests-miss', judge: 'It says the test covers neither case (no ride without a distance, no decimals), so it would not catch these mistakes.' },
      { id: 'no-false-alarm', judge: 'It raises no serious finding that is wrong about this code (remarks on style or naming are fine).' },
    ],
    pass: { judge: 2, must: ['both-wrong'] },
  },
  'spec-rule-home': {
    what: '/spec puts a change asked as a special case into the rule\'s home, and names the patch as the design not taken',
    prompt: '/spec Gravel rides take longer: in src/core/estimate.ts add if (o.surface === \'gravel\') hours *= 1.2. Name the topic gravel-pace. There is no owner here: do not ask, decide yourself and write the spec; do not start building.',
    maxTurns: 40, files: GRAVEL_PACE, answerFiles: ['workflow/specs/gravel-pace.md'],
    secrets: ['paceFor', 'PACE_KMH'],
    points: [
      { id: 'spec-written', what: 'the spec is written', test: (t) => /# Spec/i.test(t) },
      { id: 'home-named', what: 'its End state line names the rule\'s home (pace.ts, paceFor)', test: (t) => /^End state:.*(pace\.ts|paceFor|PACE_KMH)/m.test(t) },
      { id: 'callers', what: 'it names the other callers that would miss a patch in estimate.ts', test: (t) => /plan-day|summary\.ts|daysFor/.test(t) },
      { id: 'rule-home', judge: 'The spec puts the gravel slowdown in the rule\'s home (pace.ts or paceFor, for example a pace by surface), not as an if in estimate.ts.' },
      { id: 'patch-not-end', judge: 'The if in estimate.ts that the card asked for is named as a step or the design not taken, with why: plan-day and the summary would still use the old pace.' },
      { id: 'test-first', judge: 'A test is named that fails today: a gravel ride\'s pace or time, checked where the rule lives.' },
    ],
    pass: { judge: 2, must: ['rule-home'] },
  },
};

/** The judge: each point a yes or no with a reason, from a second model that sees only the answer. { met: { id: bool }, why, cost, error }. */
export function judge(points, text, { judgeCmd = 'claude' } = {}) {
  if (!points.length) return { met: {}, why: {}, cost: 0 };
  const prompt = ['You grade one answer against a checklist. For each point say whether the answer clearly makes that point (true) or',
    'not (false), with a reason of at most 15 words. Do not use tools. Reply with JSON only:',
    '{"points":[{"id":"<id>","met":true,"why":"<reason>"}]}', '', 'Checklist:', ...points.map((p) => `- ${p.id}: ${p.judge}`),
    '', 'The answer:', '<<<', text.slice(0, 60000), '>>>'].join('\n');
  const [cmd, ...pre] = Array.isArray(judgeCmd) ? judgeCmd : [judgeCmd];
  const cwd = mkdtempSync(join(tmpdir(), 'kit-quality-judge-')); // no project around it: it sees the answer only
  try {
    const r = spawnSync(cmd, [...pre, '-p', '--output-format', 'json', '--max-turns', '1', '--model', 'sonnet'], { cwd, input: prompt, encoding: 'utf8', shell: win && cmd !== process.execPath, maxBuffer: 16 << 20, timeout: 5 * 60 * 1000 });
    let out = {};
    try { out = JSON.parse(r.stdout); } catch { return { met: {}, why: {}, cost: null, error: `the judge gave no JSON: ${String(r.stdout || r.stderr).slice(0, 200)}` }; }
    const list = jsonAt(out.result, 'points')?.points;
    if (!Array.isArray(list)) return { met: {}, why: {}, cost: out.total_cost_usd ?? null, error: 'the judge\'s answer was not the JSON asked for' };
    return { met: Object.fromEntries(list.map((p) => [p.id, p.met === true])), why: Object.fromEntries(list.map((p) => [p.id, String(p.why ?? '')])), cost: out.total_cost_usd ?? null };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

/** What the installed kit says that names the answer: ['<file>: <word>'] (empty when the scenario is blind). */
export const leaks = (dir, s) => kitText(dir, new Set([...Object.keys(s.files ?? {}), ...(s.planted ?? [])])).flatMap(([f, text]) => (s.secrets ?? []).filter((w) => text.includes(w)).map((w) => `${f}: ${w}`));

/** One run: the skill on the planted project, the answer graded. { ok, points: { id: bool }, why, cost, problems, answer }. */
export function runOnce(name, s, { agent = 'claude', judgeCmd = 'claude', deps = true, keep = false, prepare = null } = {}) {
  let answer = '', leaked = [];
  const scenario = { what: s.what, prompt: s.prompt, maxTurns: s.maxTurns, addDirs: s.addDirs,
    setup: ({ dir }) => { leaked = leaks(dir, s); if (s.setup) s.setup(dir); else if (s.files) plant(dir, s.files); },
    check: ({ dir, result }) => { answer = answerOf(dir, result, s.answerFiles); return []; } };
  const r = runScenario(name, { agent, deps, keep, scenario, prepare });
  // a run that never reached the skill (not installed) or was cut short says so: an empty answer would read like a worse skill
  if (!r.ok) return { ok: false, points: {}, why: {}, cost: r.cost, problems: r.problems, answer };
  if (r.stop && r.stop !== 'success') return { ok: false, points: {}, why: {}, cost: r.cost, problems: [`the run stopped early (${r.stop}): raise its maxTurns, or look at what it was doing (--keep)`], answer };
  if (leaked.length) return { ok: false, points: {}, why: {}, cost: r.cost, problems: [`not blind: the kit's text names the answer (${leaked.slice(0, 5).join('; ')})`], answer };
  const scripted = Object.fromEntries(s.points.filter((p) => p.test).map((p) => [p.id, !!p.test(answer)]));
  const toJudge = s.points.filter((p) => p.judge);
  const j = judge(toJudge, answer, { judgeCmd });
  const points = { ...scripted, ...Object.fromEntries(toJudge.map((p) => [p.id, !!j.met[p.id]])) };
  const judged = toJudge.filter((p) => points[p.id]).length;
  const problems = [...s.points.filter((p) => p.test && !points[p.id]).map((p) => `missed: ${p.what}`),
    ...(s.pass?.must ?? []).filter((id) => !points[id]).map((id) => `the judge did not find a point it must: ${toJudge.find((p) => p.id === id)?.judge ?? id}`),
    ...(judged < (s.pass?.judge ?? toJudge.length) ? [`the judge found ${judged} of ${toJudge.length} points, ${s.pass?.judge ?? toJudge.length} needed${j.error ? ` (${j.error})` : ''}`] : [])];
  return { ok: problems.length === 0, points, why: j.why, cost: (r.cost ?? 0) + (j.cost ?? 0), problems, answer, dir: r.dir };
}

/** A scenario over several runs: it passes when most do. { ok, runs, passed, share: { id: 0..1 }, cost, problems }. */
export function runQuality(name, s, { runs = 3, ...opts } = {}) {
  const all = Array.from({ length: runs }, () => runOnce(name, s, opts));
  const passed = all.filter((r) => r.ok).length;
  const share = Object.fromEntries(s.points.map((p) => [p.id, all.filter((r) => r.points[p.id]).length / runs]));
  // the answer kept for reading is a failed run's when there is one: that is the one that says why
  return { ok: passed > runs / 2, runs, passed, share, cost: all.reduce((t, r) => t + (r.cost ?? 0), 0), problems: [...new Set(all.flatMap((r) => r.problems))], last: all.findLast((r) => !r.ok) ?? all.at(-1) };
}

/** A scenario from a file on this computer: a real project at a commit, brought up to this kit, with its own points. */
export function localScenario(file) {
  const c = JSON.parse(readFileSync(file, 'utf8'));
  const prepare = (dir) => {
    // a path in the file is read from where the file is, not from the throwaway folder the clone runs in
    git(dirname(dir), 'clone', '-q', '--local', resolve(dirname(resolve(file)), c.repo), dir);
    // main is the project's code at that commit, whatever the branch was called: the skills compare with main
    git(dir, 'checkout', '-q', '-B', 'main', c.commit);
    git(dir, 'remote', 'remove', 'origin');
    execFileSync(process.execPath, [join(kit, 'install.mjs'), dir, ...(c.install ?? []), '--update'], { stdio: 'ignore' });
    git(dir, 'add', '-A'); git(dir, '-c', 'user.name=Quality test', '-c', 'user.email=quality@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'This kit');
  };
  const points = (c.points ?? []).map((p) => (p.pattern ? { id: p.id, what: p.what ?? p.pattern, test: (t) => new RegExp(p.pattern, 'i').test(t) } : { id: p.id, judge: p.judge }));
  return { name: c.name ?? 'local', s: { what: c.what ?? c.prompt, prompt: c.prompt, maxTurns: c.maxTurns ?? 80, answerFiles: c.answerFiles ?? [], secrets: c.secrets ?? [], points, pass: c.pass ?? {} }, prepare };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  // a command of several words ("node fake.mjs") is split, as the scripts that run it take [command, ...arguments]
  const agent = (opt('--agent') ?? 'claude').split(' '), judgeCmd = (opt('--judge') ?? 'claude').split(' ');
  if (args.includes('--list')) { for (const [n, s] of Object.entries(QUALITY)) console.log(`${n}: ${s.what}`); process.exit(0); }
  if (spawnSync(agent[0], [...agent.slice(1), '--version'], { stdio: 'ignore', shell: win && agent[0] !== process.execPath }).status !== 0) { console.log(`qualitytest: no "${agent}" here, nothing run. Claude Code's CLI: npm i -g @anthropic-ai/claude-code, signed in or with ANTHROPIC_API_KEY set.`); process.exit(0); }
  const flags = new Set(['--agent', '--judge', '--runs', '--local']);
  const asked = args.filter((a, i) => !a.startsWith('--') && !flags.has(args[i - 1]));
  const local = opt('--local') ? localScenario(opt('--local')) : null;
  const list = local ? [[local.name, local.s, local.prepare]] : (asked.length ? asked : Object.keys(QUALITY)).map((n) => [n, QUALITY[n], null]);
  if (list.some(([, s]) => !s)) { console.error(`Unknown scenario: ${Object.keys(QUALITY).join(', ')}`); process.exit(1); }
  const version = read(join(kit, 'VERSION')).trim();
  const before = read(SCORES).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  let failed = 0, spent = 0;
  for (const [name, s, prepare] of list) {
    const r = runQuality(name, s, { runs: Math.max(1, Math.floor(Number(opt('--runs') ?? 3)) || 3), agent, judgeCmd, keep: args.includes('--keep'), prepare });
    spent += r.cost;
    if (!r.ok) failed++;
    const prev = before.filter((x) => x.scenario === name).at(-1);
    const score = Object.values(r.share).reduce((t, v) => t + v, 0) / Math.max(1, s.points.length);
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${name}: ${s.what} (${r.passed} of ${r.runs} runs, score ${score.toFixed(2)}${prev ? `, was ${prev.score.toFixed(2)} on ${prev.kit}` : ''}, $${r.cost.toFixed(2)})`);
    for (const p of s.points) console.log(`     ${(r.share[p.id] * r.runs).toFixed(0)}/${r.runs} ${p.id}: ${p.what ?? p.judge}`);
    if (!r.ok) {
      // what it answered, to read why: a weaker skill, or a point the scenario words too narrowly
      const saved = join(tmpdir(), `qualitytest-${name.replace(/\W+/g, '-')}-${Date.now()}.md`);
      writeFileSync(saved, r.last?.answer ?? '');
      console.log(`  ${r.problems.join('\n  ')}\n  its answer: ${saved}`);
    }
    if (r.last?.dir) console.log(`  kept: ${r.last.dir}`);
    if (!args.includes('--no-record')) appendFileSync(SCORES, JSON.stringify({ at: new Date().toISOString(), kit: version, scenario: name, runs: r.runs, passed: r.passed, ok: r.ok, score: Math.round(score * 100) / 100, share: r.share, cost: Math.round(r.cost * 100) / 100 }) + '\n');
  }
  console.log(`qualitytest: ${failed ? `${failed} failed` : 'all passed'}, about $${spent.toFixed(2)}`);
  process.exit(failed ? 1 : 0);
}
