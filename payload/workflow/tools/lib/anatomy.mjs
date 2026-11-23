// What the shape of the code says, flow by flow (no I/O here; npm run anatomy reads the project and prints it, /anatomy works
// from it one flow at a time). The kit's other checks stop new duplication; this goes back over code written before them:
//   flows          a kind of request: each value of a field the code asks about (`shape: summit`), the app map's kinds, or
//                  `anatomy.flows` in workflow/config.json; the files it lives in (following imports reaches most of the app)
//   kind checks    a branch on what kind of thing a step handles, in a file that asks about two or more kinds (a shared step),
//                  and the project's ratchet patterns there: how far a kind is spread over steps it should not touch
//   repeated rules a named number or a list of numbers that appears in more than one file, or one name with different values
//   look-alikes    two functions that are close but not the same (the gate's copy check finds only exact copies)
//   fixes          fix commits and shipped bug cards of the last weeks that changed the flow's files
// Each flow gets a score from these, worst first. Pages (docs/anatomy/<flow>.md) say when a flow was last looked at.

const isTestFile = (f) => /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/.test(f);
export const slug = (s) => String(s).toLowerCase().replace(/^area:\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The flows the project names: `named` (anatomy.flows: { name: [file globs] } or { name: { files: [globs], values: ['summit'], flags: ['wayUp'] } },
 * matched by `match`), else the app map's kinds (`kinds` { kind: [part ids] }, `partFiles` { part id: [files] }):
 * [{ name, from, files: Set, values }]. Their own files only: following the imports from a pipeline reaches most of the app.
 */
export function namedFlows(codeFiles, { named = null, match = () => false, kinds = {}, partFiles = {} } = {}) {
  const has = (f) => codeFiles.includes(f);
  if (named && Object.keys(named).length) return Object.entries(named).map(([name, v]) => {
    const globs = Array.isArray(v) ? v : v.files ?? [];
    return { name, from: 'config', files: new Set(codeFiles.filter((f) => match(f, globs))), values: Array.isArray(v) ? [] : v.values ?? [], flags: Array.isArray(v) ? [] : v.flags ?? [] };
  });
  return Object.entries(kinds).map(([kind, parts]) => ({ name: kind, from: 'map', files: new Set(parts.flatMap((p) => partFiles[p] ?? []).filter(has)), values: [] }))
    .filter((f) => f.files.size);
}

// a field compared with a fixed text: `a.b === 'x'`, `'x' == a.b`, Python's `a.b == "x"`, and `case 'x':` under `switch (a.b)`
const CMP = /(typeof\s+)?([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*)\s*[!=]==?\s*(['"`])([\w\- ]{1,40})\3|(['"`])([\w\- ]{1,40})\5\s*[!=]==?\s*(typeof\s+)?([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*)/g;
const field = (expr) => expr.split(/\??\./).at(-1);
// fields that ask about the platform or an event, not about the kind of thing the app handles
const NOT_KINDS = new Set(['key', 'code', 'platform', 'readyState', 'visibilityState', 'NODE_ENV', 'env', 'protocol', 'method', 'arch', 'name']);

/** Every comparison of a field with a fixed text in `files` (Map path -> text): [{ file, line, field, value }]. */
export function comparisons(files) {
  const out = [];
  for (const [file, text] of files) {
    if (isTestFile(file)) continue;
    let sw = null;
    text.split('\n').forEach((l, i) => {
      const s = /\bswitch\s*\(\s*([\w$.?]+)\s*\)/.exec(l);
      if (s) sw = field(s[1]);
      const c = /^\s*case\s+(['"`])([\w\- ]{1,40})\1\s*:/.exec(l);
      if (c && sw && !NOT_KINDS.has(sw)) out.push({ file, line: i + 1, field: sw, value: c[2] });
      for (const m of l.matchAll(CMP)) {
        if (m[1] || m[7]) continue; // typeof x === 'string' asks about a type, not a kind
        const f = field(m[2] ?? m[8]);
        if (!NOT_KINDS.has(f)) out.push({ file, line: i + 1, field: f, value: m[4] ?? m[6] });
      }
    });
  }
  return out;
}

/**
 * The kinds the code asks about: a field compared with two or more values in two or more files (`shape`: summit, loop, trail).
 * Each value is a flow of its own: [{ name: 'shape: summit', from: 'code', field, values: [value], files: Set, checks }]. A file
 * that checks two or more values of the field is a shared step that asks what kind it handles (`shared` on each check).
 */
export function codeKinds(all, { spread = 3 } = {}) {
  const byField = new Map();
  for (const c of all) byField.set(c.field, [...(byField.get(c.field) ?? []), c]);
  const out = [];
  for (const [f, cs] of byField) {
    const values = new Set(cs.map((c) => c.value));
    if (values.size < 2 || new Set(cs.map((c) => c.file)).size < 2) continue;
    const perFile = new Map();
    for (const c of cs) perFile.set(c.file, new Set([...(perFile.get(c.file) ?? []), c.value]));
    for (const v of values) {
      const checks = cs.filter((c) => c.value === v).map((c) => ({ ...c, shared: perFile.get(c.file).size >= 2 }));
      const sharedFiles = new Set(checks.filter((c) => c.shared).map((c) => c.file));
      // a kind is a flow of its own once it is asked about in `spread` shared steps: fewer is a detail, not a shape
      if (sharedFiles.size >= spread) out.push({ name: `${f}: ${v}`, from: 'code', field: f, values: [v], files: new Set(checks.map((c) => c.file)), checks });
    }
  }
  return out;
}

const COND = /\bif\s*\(|\bwhile\s*\(|\?(?![.?])|&&|\|\||\belif\b|\bmatch\b|=>\s*!?[\w$.]+\s*\?/;
// a property read, not a call: `run.wayUp`, `intent?.climb` (`list.forEach(` and `x.then(` are calls)
const WORDS = /(?:\.|\?\.)([A-Za-z_$][\w$]{3,})\b(?!\s*\()/g;

/**
 * The flags a flow is asked about by (`anatomy.flows.<flow>.flags`, named once by the first /anatomy round: `wayUp`, `mustPass`):
 * every line outside the flow's own files that branches on one: [{ file, line, field, value: 'flag' }]. How far its special case
 * has spread into code it does not own. A script cannot tell a flag from any other word, so the project names them.
 */
export function flagsOf(flow, files) {
  const flags = new Set(flow.flags ?? []);
  const out = [];
  if (!flags.size) return out;
  for (const [f, text] of files) {
    if (flow.files.has(f) || isTestFile(f)) continue;
    text.split('\n').forEach((l, i) => {
      if (!COND.test(l)) return;
      for (const w of new Set([...l.matchAll(WORDS)].map((m) => m[1]))) if (flags.has(w)) out.push({ file: f, line: i + 1, field: w, value: 'flag' });
    });
  }
  return out;
}

/** For a flow: the kind checks in shared steps (a kind from the code), or the flags it brings into them (`flags`: flagsOf()). */
export function checksOf(flow, kinds, flags = []) {
  if (flow.checks) return flow.checks.filter((c) => c.shared);
  // its values asked about in shared steps, its flags anywhere else, and in its own files the other kinds they ask about
  return [...kinds.flatMap((k) => k.checks).filter((c) => c.shared && (flow.values?.includes(c.value) || (!flow.values?.length && flow.files.has(c.file)))), ...flags];
}

/**
 * The fixes of the last `days` that changed each flow's files: Map name -> [ids]. `fixes`: [{ id, at, files }] (commits whose
 * subject says fix, shipped records of bug cards).
 */
export function fixesPerFlow(flows, fixes, { days = 28, now = new Date() } = {}) {
  const since = now.getTime() - days * 864e5;
  const recent = fixes.filter((f) => Date.parse(f.at ?? '') >= since);
  return new Map(flows.map((fl) => [fl.name, [...new Set(recent.filter((f) => f.files.some((x) => fl.files.has(x))).map((f) => f.id))]]));
}

/**
 * Each flow with what was found in it, worst first: [{ name, from, files, spread, kindChecks, rules, alikes, fixes, score, page }].
 * `kinds`: codeKinds(); `found`: { flags: Map name -> flagsOf(), ratchets: [{ file, name, n }], rules: repeatedRules(), alikes: lookAlikes(),
 * fixes: fixesPerFlow() };
 * `pages`: pageStates(). The spread is how many files ask about the flow's kind: a kind spread over many shared steps has no home.
 */
export function scoreFlows(flows, kinds, found, pages = []) {
  const touches = (fl, ps) => ps.some((p) => fl.files.has(p.file));
  return flows.map((fl) => {
    const checks = checksOf(fl, kinds, found.flags?.get(fl.name));
    const shared = new Set(checks.map((c) => c.file));
    const ratchets = (found.ratchets ?? []).filter((r) => shared.has(r.file) || fl.files.has(r.file));
    const rules = found.rules.filter((r) => touches(fl, r.places));
    const alikes = found.alikes.filter((x) => fl.files.has(x.a.file) || fl.files.has(x.b.file));
    const fixes = found.fixes.get(fl.name) ?? [];
    const page = pages.find((p) => p.slug === slug(fl.name) || p.slug === slug(fl.values?.[0] ?? '')) ?? null;
    return { name: fl.name, from: fl.from, files: fl.files.size, fileList: [...fl.files], spread: shared.size, kindChecks: checks, ratchets, rules, alikes, fixes,
      score: shared.size * 3 + checks.length + ratchets.reduce((t, r) => t + r.n, 0) + rules.length * 2 + alikes.length * 2 + fixes.length * 2, page };
  }).sort((a, b) => b.score - a.score || b.files - a.files);
}

/** The flow pages (`docs/anatomy/<flow>.md`, [{ name, text }]) with the date each was last looked at: [{ slug, lookedAt }]. */
export const pageStates = (pages) => pages.filter((p) => !/^readme$/i.test(p.name)).map((p) => ({ slug: slug(p.name), lookedAt: /^-\s*Looked at:\s*(\d{4}-\d{2}-\d{2})/im.exec(p.text)?.[1] ?? null }));

/**
 * The line /next says about the shape of the code, or null: no flow drawn yet once there is code enough (`codeFiles` from 15),
 * or the flow looked at longest ago when that was `every` (60) days or more.
 */
export function anatomyLine(pages, codeFiles, { every = 60, now = new Date() } = {}) {
  if (!pages.length) return codeFiles >= 15 ? `anatomy: no flow of the code has been looked at yet (${codeFiles} code files): one round of /anatomy draws the worst one and plans its clean-up (npm run anatomy lists them)` : null;
  const old = pages.filter((p) => !p.lookedAt || now - Date.parse(p.lookedAt) >= every * 864e5).sort((a, b) => String(a.lookedAt).localeCompare(String(b.lookedAt)))[0];
  return old ? `anatomy: ${old.slug} was last looked at ${old.lookedAt ?? 'never'}: a round of /anatomy ${old.slug} compares it with its page` : null;
}

/** The table, worst first: one line per flow, and what to look at next. */
export function anatomyTable(rows, n = 12) {
  if (!rows.length) return 'anatomy: no flows found: no kind the code asks about, no app map; name them in workflow/config.json, "anatomy": { "flows": { "<flow>": { "files": ["<glob>"], "values": ["<kind>"] } } }';
  const cell = (r) => [`${r.files} files`, `asked about in ${r.spread} shared step${r.spread === 1 ? '' : 's'} (${r.kindChecks.length + r.ratchets.reduce((t, x) => t + x.n, 0)} checks)`,
    `${r.rules.length} repeated rules`, `${r.alikes.length} look-alikes`, `${r.fixes.length} fixes in 4 weeks`].join(', ');
  return ['flows, worst first (npm run anatomy -- --flow <name> for one):',
    ...rows.slice(0, n).map((r, i) => `${i + 1}. ${r.name} (${r.from}): ${cell(r)}; ${r.page ? `page looked at ${r.page.lookedAt ?? '?'}` : 'no page yet'}`),
    ...(rows.length > n ? [`and ${rows.length - n} more`] : [])].join('\n');
}

/** The checks grouped by what they ask: "  wayUp (flag), 9 files: a.ts:12, b.ts:40 ...", most files first. */
function byWord(checks) {
  const g = new Map();
  for (const c of checks) { const k = c.value === 'flag' ? `${c.field} (flag)` : `${c.field} === '${c.value}'`; g.set(k, [...(g.get(k) ?? []), c]); }
  return [...g].map(([k, cs]) => [k, cs, new Set(cs.map((c) => c.file)).size]).sort((a, b) => b[2] - a[2]).slice(0, 15)
    .map(([k, cs, n]) => `  ${k}, ${n} file${n === 1 ? '' : 's'}: ${cs.slice(0, 8).map((c) => `${c.file}:${c.line}`).join(', ')}${cs.length > 8 ? ', ...' : ''}`);
}

/** One flow in full, for the AI's round: each finding with its file and line. */
export function flowDetail(r) {
  const at = (p) => `${p.file}:${p.line}`;
  return [`${r.name} (${r.from}), ${r.files} files, score ${r.score}`,
    `its files (${r.files}): ${r.fileList.slice(0, 30).join(', ') || 'none'}`,
    `kind checks in shared steps (${r.kindChecks.length}):`, ...byWord(r.kindChecks),
    ...r.ratchets.map((x) => `  ${x.file}: ${x.n} of the ratchet "${x.name}"`),
    `repeated rules (${r.rules.length}):`, ...r.rules.slice(0, 20).map((x) => `  ${x.what}: ${x.value} at ${x.places.map((p) => `${at(p)}${p.name ? ` (${p.name})` : ''}`).join(', ')}`),
    `look-alike functions (${r.alikes.length}):`, ...r.alikes.slice(0, 20).map((x) => `  ${x.a.file}:${x.a.line} ${x.a.name} ~ ${x.b.file}:${x.b.line} ${x.b.name} (${Math.round(x.alike * 100)}% alike)`),
    `fixes in 4 weeks (${r.fixes.length}): ${r.fixes.join(', ') || 'none'}`,
    `page: ${r.page ? `docs/anatomy/${r.page.slug}.md, looked at ${r.page.lookedAt ?? '?'}` : 'none yet'}`].join('\n');
}
