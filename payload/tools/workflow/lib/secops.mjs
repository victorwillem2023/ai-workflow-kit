// The weekly security report, from what the scanners wrote (no I/O here): libraries with known vulnerabilities (OSV-Scanner,
// Trivy), our own code (Semgrep), the Dockerfile and infrastructure files (Trivy), and secrets anywhere in git's history
// (gitleaks); and two things no scanner sees: certificates near their end, and an access review that is due. Every finding becomes { area, severity, what, where, fix, id, url }, the same library and advisory found by two
// scanners is one finding, and the report says in plain words what needs the owner, what is worth a look, and what to do.

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const rank = (s) => { const i = SEVERITIES.indexOf(s); return i < 0 ? SEVERITIES.length : i; };
const MAX_FINDINGS = 500; // a scan with more than this is cut: the report must stay readable

function fromScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'medium';
  return n >= 9 ? 'critical' : n >= 7 ? 'high' : n >= 4 ? 'medium' : 'low';
}
const fromWord = (w) => {
  const s = String(w ?? '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high' || s === 'error') return 'high';
  if (s === 'medium' || s === 'moderate' || s === 'warning') return 'medium';
  return 'low';
};
const clip = (s, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const strip = (p) => String(p ?? '').replace(/^\/(src|work)\//, '');

/** Libraries from OSV-Scanner's JSON. */
export function fromOsv(json) {
  const out = [];
  for (const r of json?.results ?? []) {
    for (const p of r.packages ?? []) {
      for (const g of p.groups ?? []) {
        const v = (p.vulnerabilities ?? []).find((x) => (g.ids ?? []).includes(x.id)) ?? {};
        const fixed = (v.affected ?? []).flatMap((a) => a.ranges ?? []).flatMap((x) => x.events ?? []).map((e) => e.fixed).filter(Boolean);
        const cve = [...(g.aliases ?? []), ...(v.aliases ?? [])].find((a) => /^CVE-/.test(a)) ?? g.ids?.[0];
        out.push({ area: 'library', severity: g.max_severity ? fromScore(g.max_severity) : fromWord(v.database_specific?.severity), pkg: p.package?.name, version: p.package?.version, id: cve, fixed: fixed.sort().pop() ?? null, what: clip(v.summary || cve), where: `${strip(r.source?.path)}: ${p.package?.name} ${p.package?.version}`, url: `https://osv.dev/${g.ids?.[0] ?? cve}` });
      }
    }
  }
  return out;
}

/** Libraries, configuration mistakes and secrets from Trivy's JSON. */
export function fromTrivy(json) {
  const out = [];
  for (const r of json?.Results ?? []) {
    for (const v of r.Vulnerabilities ?? []) out.push({ area: 'library', severity: fromWord(v.Severity), pkg: v.PkgName, version: v.InstalledVersion, id: v.VulnerabilityID, fixed: v.FixedVersion || null, what: clip(v.Title || v.VulnerabilityID), where: `${strip(r.Target)}: ${v.PkgName} ${v.InstalledVersion}`, url: v.PrimaryURL });
    for (const m of r.Misconfigurations ?? []) if (m.Status !== 'PASS') out.push({ area: 'setup', severity: fromWord(m.Severity), id: m.ID, what: clip(m.Title), where: strip(r.Target), fix: clip(m.Resolution, 220), url: m.PrimaryURL });
    for (const s of r.Secrets ?? []) out.push({ area: 'secret', severity: 'critical', id: s.RuleID, what: clip(s.Title), where: `${strip(r.Target)}:${s.StartLine}` });
  }
  return out;
}

/** Our own code from Semgrep's JSON. */
export function fromSemgrep(json) {
  return (json?.results ?? []).map((r) => {
    const sentences = String(r.extra?.message ?? '').split(/(?<=\.)\s+/);
    // the rule's own advice: the sentences that say what to do ("Add ...", "Use ...")
    const advice = sentences.slice(1).filter((s) => /^(Add|Use|Set|Replace|Avoid|Prefer|Pin|Remove|Consider|Instead|Pass|Validate|Escape)\b/.test(s)).join(' ');
    return {
      area: 'code', severity: fromWord(r.extra?.metadata?.impact === 'HIGH' && r.extra?.severity === 'ERROR' ? 'critical' : r.extra?.severity), id: String(r.check_id).split('.').pop(),
      what: clip(sentences[0]), where: `${r.path}:${r.start?.line}`, fix: r.extra?.fix ? `replace with: ${clip(r.extra.fix, 120)}` : advice ? clip(advice, 260) : null,
      url: r.extra?.metadata?.source ?? null,
    };
  });
}

/** Secrets in git's history from gitleaks' JSON (run with --redact: the value itself is never in it). */
export function fromGitleaks(json) {
  return (Array.isArray(json) ? json : []).map((l) => ({ area: 'secret', severity: 'critical', id: l.RuleID, what: clip(l.Description || l.RuleID), where: `${l.File}:${l.StartLine}${l.Commit ? ` (commit ${String(l.Commit).slice(0, 12)})` : ''}` }));
}

const DAY = 86_400_000;

/** The certificates of the app's addresses: [{ host, validTo, error }] from a TLS handshake. One that ends within 7 days (or
 *  could not be read) needs the owner now: renewal is meant to be automatic, so a near end means the renewal is broken. */
export function fromCerts(certs, now = new Date()) {
  const out = [];
  for (const c of certs ?? []) {
    if (c.error) { out.push({ area: 'certificate', severity: 'high', id: 'unreadable', what: `the certificate of ${c.host} could not be read (${clip(c.error, 80)})`, where: c.host }); continue; }
    const days = Math.floor((new Date(c.validTo) - now) / DAY);
    const severity = days <= 7 ? 'critical' : days <= 14 ? 'high' : days <= 21 ? 'medium' : null;
    if (severity) out.push({ area: 'certificate', severity, id: 'expiry', what: days < 0 ? `the certificate of ${c.host} has expired` : `the certificate of ${c.host} ends in ${days} days`, where: c.host });
  }
  return out;
}

/** The access review (docs/company/ACCESS.md, its "Last review: YYYY-MM-DD" line): due every 90 days. No file: nothing to say. */
export function accessDue(text, now = new Date()) {
  if (text == null) return [];
  const m = /Last review:\s*(\d{4}-\d{2}-\d{2})/.exec(String(text));
  const where = 'docs/company/ACCESS.md';
  if (!m) return [{ area: 'access', severity: 'medium', id: 'access-review', what: 'no access review is recorded yet', where }];
  const days = Math.floor((now - new Date(`${m[1]}T00:00:00Z`)) / DAY);
  return days > 90 ? [{ area: 'access', severity: days > 120 ? 'high' : 'medium', id: 'access-review', what: `the last access review was ${days} days ago`, where }] : [];
}

/** One list, worst first: the same library and advisory from two scanners is one finding; a secret in a file and in its history is one. */
export function combine(...lists) {
  const seen = new Map();
  for (const f of lists.flat()) {
    const key = f.area === 'library' ? `lib|${f.pkg}|${f.version}|${f.id}` : f.area === 'secret' ? `secret|${String(f.where).replace(/ \(commit .*\)$/, '')}` : `${f.area}|${f.id}|${f.where}`;
    const had = seen.get(key);
    if (!had || rank(f.severity) < rank(had.severity) || (!had.fixed && f.fixed)) seen.set(key, { ...had, ...f });
  }
  return [...seen.values()].sort((a, b) => rank(a.severity) - rank(b.severity) || String(a.where).localeCompare(String(b.where))).slice(0, MAX_FINDINGS);
}

const ver = (v) => String(v ?? '').replace(/^[^\d]*/, '').split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
const newer = (a, b) => { const x = ver(a); const y = ver(b); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); return false; };

/** The version to update to: of the fixed versions a scanner lists (">=4.17.19", "5.0.10, 3.0.7, 2.1.5"), the one on the
 *  installed version's own major line, else the lowest above it. */
export function pickFixed(fixed, installed) {
  const all = String(fixed ?? '').split(/[,|\s]+/).map((s) => s.replace(/^[<>=~^v]+/, '')).filter((s) => /^\d/.test(s));
  if (!all.length) return null;
  const mine = all.filter((v) => ver(v)[0] === ver(installed)[0] && newer(v, installed));
  const above = all.filter((v) => newer(v, installed));
  const pool = mine.length ? mine : above.length ? above : all;
  return pool.reduce((lo, v) => (newer(lo, v) ? v : lo));
}

/** One finding per library and version: the worst severity, every advisory, and the one version that fixes them all. */
export function byLibrary(findings) {
  const out = [];
  const libs = new Map();
  for (const f of findings) {
    if (f.area !== 'library') { out.push(f); continue; }
    const key = `${f.pkg}|${f.version}`;
    const fix = pickFixed(f.fixed, f.version);
    const had = libs.get(key);
    if (!had) { libs.set(key, { ...f, fixed: fix, ids: [f.id].filter(Boolean), unfixed: fix ? 0 : 1 }); continue; }
    if (rank(f.severity) < rank(had.severity)) had.severity = f.severity;
    if (f.id && !had.ids.includes(f.id)) had.ids.push(f.id);
    if (fix && (!had.fixed || newer(fix, had.fixed))) had.fixed = fix;
    if (!fix) had.unfixed++;
  }
  // the same rule in the same file is one row, with its lines
  const rules = new Map();
  for (const f of out.splice(0)) {
    const m = f.area === 'code' ? /^(.*):(\d+)$/.exec(String(f.where)) : null;
    if (!m) { out.push(f); continue; }
    const key = `${f.id}|${m[1]}`;
    const had = rules.get(key);
    if (!had) { rules.set(key, { ...f, file: m[1], lines: [Number(m[2])] }); continue; }
    had.lines.push(Number(m[2]));
    if (rank(f.severity) < rank(had.severity)) had.severity = f.severity;
  }
  for (const r of rules.values()) out.push({ ...r, where: `${r.file}:${r.lines.sort((a, b) => a - b).join(', ')}` });
  for (const l of libs.values()) {
    out.push({ ...l, id: l.ids.length > 3 ? `${l.ids.slice(0, 3).join(', ')} and ${l.ids.length - 3} more` : l.ids.join(', '), what: l.ids.length > 1 ? `${l.ids.length} known vulnerabilities in ${l.pkg}` : l.what });
  }
  return out.sort((a, b) => rank(a.severity) - rank(b.severity) || String(a.where).localeCompare(String(b.where)));
}

/** What to do about one finding, in a sentence. */
export function fixFor(f) {
  if (f.area === 'library') {
    const some = f.unfixed ? `; ${f.unfixed} of them have no fix yet: check whether the app uses the affected part` : '';
    return f.fixed ? `update ${f.pkg} to ${f.fixed} or later (or the library that pulls it in; an \`overrides\` entry as a last step)${some}` : 'no fixed version yet: check whether the app uses the affected part, and watch the advisory';
  }
  if (f.area === 'secret') return 'change the key at its provider now, then take it out of the code: it is in git\'s history, so treat it as leaked';
  if (f.area === 'certificate') return 'renewal is meant to be automatic (Caddy, cert-manager, or certbot\'s timer): find why it stopped and fix that; renewing by hand hides the broken part';
  if (f.area === 'access') return 'run `npm run access`, check each person and key against docs/company/ACCESS.md, take away what is no longer needed, then set the date';
  if (f.fix) return f.fix;
  if (f.area === 'code') return 'read the rule and the line; fix it, or mark it `nosemgrep: <rule>` with the reason when it is safe by design';
  return 'see the rule';
}

/** Whether a finding is in the kit's own files (fixed in the kit, then `install.mjs --update`), not in the app. */
export const inKit = (f) => /^(tools\/workflow\/|scripts\/(session|session-stop|deploy|shots|dev-check)\.|\.github\/workflows\/(gate|release|secops)\.yml)/.test(String(f.where));

const row = (f) => `| ${f.what.replace(/\|/g, '\\|')}${f.id ? ` (${f.id})` : ''} | \`${String(f.where).replace(/\|/g, '\\|')}\` | ${f.severity} | ${fixFor(f).replace(/\|/g, '\\|')} |`;

/** The ISO week of a date: { year, week }. */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - start) / 86_400_000 + 1) / 7) };
}

/** The report: { title, body } in plain words. `ran`: the scanners that ran, with what each covers; `failed`: the ones that did not. */
export function report(all, { date = new Date(), ran = [], failed = [] } = {}) {
  const findings = byLibrary(all);
  const { year, week } = isoWeek(date);
  // the kit's own files are counted apart: they are fixed in the kit, not by this project's owner
  const app = findings.filter((f) => !inKit(f));
  const kit = findings.filter(inKit);
  const count = (s) => app.filter((f) => f.severity === s).length;
  const urgent = app.filter((f) => rank(f.severity) <= 1);
  const title = `Security report, ${year} week ${week}: ${urgent.length ? `${urgent.length} need${urgent.length === 1 ? 's' : ''} you` : 'nothing urgent'}`;
  const table = (list) => (list.length ? ['| What | Where | How bad | What to do |', '|---|---|---|---|', ...list.map(row)].join('\n') : 'None.');
  const lines = [
    `**In one line**: ${SEVERITIES.map((s) => `${count(s)} ${s}`).join(', ')}.${urgent.length ? ' The ones under *Needs you* should be fixed this week.' : ' Nothing needs you this week.'}${kit.length ? ` And ${kit.length} in the kit's own files (last section).` : ''}`,
    '',
    '## Needs you (critical and high)',
    table(app.filter((f) => rank(f.severity) <= 1)),
    '',
    '## Worth a look (medium)',
    table(app.filter((f) => f.severity === 'medium')),
    '',
    `## Low (${app.filter((f) => f.severity === 'low').length})`,
    app.some((f) => f.severity === 'low') ? table(app.filter((f) => f.severity === 'low').slice(0, 30)) : 'None.',
  ];
  if (kit.length) lines.push('', '## In the kit\'s own files', 'Fixed in the ai-workflow-kit, then `install.mjs --update` here; not in this app\'s code.', table(kit));
  lines.push('', '## What was checked', ...ran.map((r) => `- ${r}`), ...failed.map((r) => `- **did not run**: ${r} (the report is incomplete for that part)`),
    '', '## What to do', 'Library fixes that exist come as pull requests by themselves (Renovate, or Dependabot security updates). For the rest, open a',
    'session and run `/secops`: it reads this report and proposes each fix; a yes makes it a card or a fix.');
  return { title, body: lines.join('\n') };
}
