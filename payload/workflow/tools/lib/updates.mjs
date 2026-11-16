// What the waiting dependency updates mean, in plain lines: Dependabot's pull requests and security alerts read through gh
// (workflow/tools/updates.mjs), judged here without any I/O. Every update gets a verdict:
//   take   a small update (a fix or a new feature, same major version) whose checks passed
//   look   a new major version (or a 0.x minor, which may break as much), or checks that failed or still run
//   hold   an update that clashes with a decision: type definitions for a newer Node than the app runs on, or a library the
//          config holds (`updates.hold` in workflow/config.json: { "<library>": "<why>" }); stop it at the source
//          (an ignore entry in .github/dependabot.yml, holdSnippet) so the same pull request does not come back every week

const ORDER = { take: 0, look: 1, hold: 2 };

/** The libraries one pull request moves: [{ name, from, to }]. Reads the body's "Updates `x` from a to b" lines (a grouped pull
 *  request) and else the title "Bump x from a to b". */
export function parseUpdates(pr) {
  const out = [];
  const seen = new Set();
  for (const m of String(pr.body ?? '').matchAll(/Updates `([^`]+)` from ([\w.+-]+) to ([\w.+-]+)/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ name: m[1], from: m[2], to: m[3] });
  }
  if (out.length) return out;
  // Renovate: a table row per library, "| [vite](https://...) | devDependencies | minor | `8.3.6` -> `8.4.0` |"
  for (const row of String(pr.body ?? '').split('\n')) {
    const m = /^\|\s*\[?([^\]|(]+?)\]?(?:\([^)]*\))?\s*\|.*?`[\^~]?v?([\w.+-]+)`\s*(?:->|→)\s*`[\^~]?v?([\w.+-]+)`/.exec(row);
    if (m && !seen.has(m[1].trim())) { seen.add(m[1].trim()); out.push({ name: m[1].trim(), from: m[2], to: m[3] }); }
  }
  if (out.length) return out;
  const t = /^Bump (\S+) from ([\w.+-]+) to ([\w.+-]+)/.exec(String(pr.title ?? ''));
  return t ? [{ name: t[1], from: t[2], to: t[3] }] : [];
}

/** Which update tools are on: { renovate, dependabot, both, renovateIdle } from what is in the repository and on GitHub. */
export function updateTools({ renovateJson, dependabotYml, dashboard }) {
  const renovate = Boolean(renovateJson);
  const dependabot = /package-ecosystem/.test(String(dependabotYml ?? ''));
  return { renovate, dependabot, both: renovate && dependabot && Boolean(dashboard), renovateIdle: renovate && !dashboard };
}

const parts = (v) => String(v).replace(/^v/, '').split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);

/** How far a version moves: 'major', 'minor' or 'patch'. A 0.x minor counts as major (semver lets it break). */
export function bump(from, to) {
  const [a1, a2] = parts(from);
  const [b1, b2] = parts(to);
  if (b1 !== a1) return 'major';
  if (b2 !== a2) return a1 === 0 ? 'major' : 'minor';
  return 'patch';
}

/** The state of a pull request's checks from gh's statusCheckRollup: 'green', 'red', 'running' or 'none'. */
export function checksState(rollup) {
  const list = Array.isArray(rollup) ? rollup : [];
  if (!list.length) return 'none';
  const res = list.map((c) => String(c.conclusion ?? c.state ?? '').toUpperCase());
  if (res.some((r) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(r))) return 'red';
  if (list.some((c) => c.status && String(c.status).toUpperCase() !== 'COMPLETED') || res.some((r) => ['', 'PENDING', 'EXPECTED'].includes(r))) return 'running';
  return 'green';
}

/** The major version of Node the app runs on: `.tool-versions` (the pin), else package.json `engines.node`, else the
 *  Dockerfile's `FROM node:<n>`, else `.nvmrc`; null when none says. Each text may be missing. */
export function runtimeNode({ pkg, dockerfile, nvmrc, toolVersions } = {}) {
  const pinned = /^\s*(?:nodejs|node)\s+v?(\d+)/m.exec(String(toolVersions ?? ''));
  if (pinned) return { major: Number(pinned[1]), from: '.tool-versions' };
  const fromEngines = /(\d+)/.exec(String(pkg?.engines?.node ?? ''));
  if (fromEngines) return { major: Number(fromEngines[1]), from: 'package.json engines' };
  const fromDocker = /^\s*FROM\s+node:(\d+)/im.exec(String(dockerfile ?? ''));
  if (fromDocker) return { major: Number(fromDocker[1]), from: 'the Dockerfile' };
  const fromNvm = /(\d+)/.exec(String(nvmrc ?? ''));
  if (fromNvm) return { major: Number(fromNvm[1]), from: '.nvmrc' };
  return null;
}

/** The verdict on one library's update: { verdict, why }. */
export function judge(u, { checks = 'none', node = null, hold = {}, tools = new Set() } = {}) {
  if (hold[u.name]) return { verdict: 'hold', why: `held in workflow/config.json: ${hold[u.name]}` };
  const step = bump(u.from, u.to);
  // green checks do not prove these: the gate never runs the tool images (helm, k6, the scanners), and Node is what everything runs on
  if (tools.has(u.name)) return { verdict: 'look', why: 'a tool your checks do not run: try it once before taking it' };
  if (['node', 'nodejs'].includes(u.name)) return { verdict: 'look', why: 'Node itself, what the app runs on: take it with a look' };
  if (u.name === '@types/node' && node && parts(u.to)[0] > node.major) {
    return { verdict: 'hold', why: `the types are for Node ${parts(u.to)[0]}, the app runs on Node ${node.major} (${node.from})` };
  }
  if (step === 'major') return { verdict: 'look', why: `a new major version (${u.from} to ${u.to}): read what it changes before taking it` };
  if (checks === 'red') return { verdict: 'look', why: 'its checks failed' };
  if (checks === 'running') return { verdict: 'look', why: 'its checks still run' };
  return { verdict: 'take', why: checks === 'green' ? `a ${step} update, checks green` : `a ${step} update (no checks ran on it)` };
}

/** One pull request judged: { number, url, verdict (the worst of its libraries), updates: [{ name, from, to, verdict, why }] }. */
export function judgePr(pr, ctx = {}) {
  const checks = checksState(pr.statusCheckRollup);
  const updates = parseUpdates(pr).map((u) => ({ ...u, ...judge(u, { ...ctx, checks }) }));
  const verdict = updates.reduce((w, u) => (ORDER[u.verdict] > ORDER[w] ? u.verdict : w), updates.length ? 'take' : 'look');
  return { number: pr.number, url: pr.url, title: pr.title, checks, verdict, updates };
}

/** The lines that stop the held libraries' new major versions at the source, under the npm entry of .github/dependabot.yml. */
export function holdSnippet(names) {
  if (!names.length) return '';
  return ['    ignore:', ...names.flatMap((n) => [`      - dependency-name: "${n}"`, '        update-types: ["version-update:semver-major"]'])].join('\n');
}

/** Security alerts from gh's /dependabot/alerts answer, worst first: [{ name, severity, summary, fixed, url }]. */
export function readAlerts(list) {
  const rank = { critical: 0, high: 1, medium: 2, moderate: 2, low: 3 };
  return (Array.isArray(list) ? list : []).map((a) => ({
    name: a.dependency?.package?.name ?? a.security_vulnerability?.package?.name ?? '?',
    severity: String(a.security_advisory?.severity ?? a.security_vulnerability?.severity ?? 'unknown').toLowerCase(),
    summary: String(a.security_advisory?.summary ?? '').slice(0, 120),
    fixed: a.security_vulnerability?.first_patched_version?.identifier ?? null,
    url: a.html_url,
  })).sort((x, y) => (rank[x.severity] ?? 9) - (rank[y.severity] ?? 9));
}

/** The one line for a session's start or the health screen: "updates: 1 security alert (high); 2 to take, 1 to look at, 1 to hold". */
export function shortLine(prs, alerts, { selfMerging = false } = {}) {
  const n = (v) => prs.filter((p) => p.verdict === v).length;
  const bits = [];
  if (alerts.length) bits.push(`${alerts.length} security alert${alerts.length === 1 ? '' : 's'} (${alerts[0].severity})`);
  // what needs the owner, the first one by name ("helm 3.16 -> 3.22, a tool your checks do not run")
  const first = prs.flatMap((p) => p.updates ?? []).find((u) => u.verdict === 'look' || u.verdict === 'hold');
  const needs = n('look') + n('hold');
  if (needs) bits.push(`${needs} to look at${first ? `: ${first.name} ${first.from} -> ${first.to}, ${first.why}` : ''}`);
  // with automerge on (renovate.json), the small ones are not the owner's job: they merge once their checks pass
  if (n('take')) bits.push(selfMerging ? `${n('take')} merge by themselves once their checks pass` : `${n('take')} to take`);
  if (!bits.length) return 'updates: nothing waiting';
  return `updates: ${bits.join('; ')}${alerts.length || needs || !selfMerging ? ' (npm run updates)' : ''}`;
}

/** Whether the project's renovate.json merges small updates by itself (a package rule with automerge on). */
export function autoMerges(renovateJson) {
  try { return (JSON.parse(String(renovateJson ?? '')).packageRules ?? []).some((r) => r.automerge === true); } catch { return false; }
}

/** The tool images the kit's tools run with Docker, by their `// renovate: docker` mark: updates to these are the owner's to try. */
export function toolImages(texts) {
  return new Set(texts.flatMap((t) => [...String(t ?? '').matchAll(/'([a-z0-9][a-z0-9./_-]*):v?[0-9][\w.-]*'[,;]?\s*\/\/ renovate: docker/g)].map((m) => m[1])));
}
