// Reviewing an infrastructure plan before anything changes (no I/O here). The plan says what the tool would do; the expect file
// (<stack>/plan.expect, written from the spec BEFORE the plan is made) says what was meant. Every change must be expected, every
// expected change must be in the plan, and nothing that holds data is destroyed unless the owner names it on the command line.

// resource kinds that hold data or names: destroying or replacing one loses it (override with launch.protect in the config)
export const PROTECTED = /database|db_instance|sql|volume|disk|bucket|storage|dns_zone|dns_record|zone|key_vault|kms|backup|snapshot|redis|elasticache|filestore|efs/i;
// the settings that hold a startup script (cloud-init and the like) on the usual clouds
const STARTUP_KEYS = ['user_data', 'user_data_base64', 'custom_data', 'metadata_startup_script', 'startup_script', 'cloud_init', 'user_data_replace_on_change'];

const ACTIONS = { 'create': 'create', 'update': 'update', 'delete': 'delete', 'read': 'read', 'delete,create': 'replace', 'create,delete': 'replace' };

/** The changes in `tofu show -json` / `terraform show -json` output: [{ address, type, action, startup }], no-ops left out. */
export function fromTofuPlan(json) {
  const plan = typeof json === 'string' ? JSON.parse(json) : json;
  const out = [];
  for (const rc of plan.resource_changes ?? []) {
    const action = ACTIONS[(rc.change?.actions ?? []).join(',')];
    if (!action || action === 'read') continue;
    const before = rc.change.before ?? {}, after = rc.change.after ?? {};
    const startup = STARTUP_KEYS.some((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]) && (k in before || k in after))
      || JSON.stringify(before.metadata?.['startup-script']) !== JSON.stringify(after.metadata?.['startup-script']);
    const labels = after.labels ?? after.tags ?? after.tags_all ?? null;
    out.push({ address: rc.address, type: rc.type, action, startup: action !== 'delete' && startup, ...(typeof after.name === 'string' ? { name: after.name } : {}), ...(labels && typeof labels === 'object' ? { labels: Object.keys(labels).sort() } : {}) });
  }
  return out;
}

/** The changes in `pulumi preview --json` output, the same shape (a replacement's several steps count once). */
export function fromPulumiPreview(json) {
  const preview = typeof json === 'string' ? JSON.parse(json) : json;
  const byUrn = new Map();
  for (const s of preview.steps ?? []) {
    const op = /replace/.test(s.op) ? 'replace' : s.op;
    if (!['create', 'update', 'delete', 'replace'].includes(op)) continue;
    const address = String(s.urn).split('::').pop();
    const type = s.newState?.type ?? s.oldState?.type ?? String(s.urn).split('::').at(-2) ?? '';
    const keys = [...Object.keys(s.detailedDiff ?? {}), ...(s.diffReasons ?? [])];
    byUrn.set(s.urn, { address, type, action: byUrn.has(s.urn) ? 'replace' : op, startup: keys.some((k) => STARTUP_KEYS.includes(k.split('.')[0])) });
  }
  return [...byUrn.values()];
}

/** plan.expect: one line per change, `<create|update|delete|replace|any> <address>`, `*` matches any part; `#` starts a note. */
export function parseExpect(text) {
  const lines = [];
  for (const [i, raw] of String(text).split('\n').entries()) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [action, address] = line.split(/\s+/);
    if (!['create', 'update', 'delete', 'replace', 'any'].includes(action) || !address) throw new Error(`plan.expect line ${i + 1}: "${raw.trim()}" is not "<create|update|delete|replace|any> <address>"`);
    const re = glob(address);
    lines.push({ action, address, matches: (c) => (action === 'any' || action === c.action) && re.test(c.address) });
  }
  return lines;
}

const glob = (g) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`);

/** Names and labels of what the plan creates or replaces: the final names, however the code built them (variables, a naming
 *  module, Pulumi), against naming.resources in the config ({ pattern, say, except: [address globs] }) and the labels every
 *  resource must carry (launch.labels, e.g. ["app", "env", "managed-by"]) where the resource kind has labels or tags. */
export function namingProblems(changes, { rules = [], labels = [] } = {}) {
  const out = [];
  for (const c of changes.filter((x) => x.action === 'create' || x.action === 'replace')) {
    const rule = rules.find((r) => !(r.except ?? []).some((e) => glob(e).test(c.address)));
    if (rule && c.name != null && !new RegExp(rule.pattern).test(c.name)) out.push(`${c.address} would be named "${c.name}", not ${rule.say ?? rule.pattern}. Names say what, which environment, where and which one (docs/CONVENTIONS.md).`);
    const missing = c.labels ? labels.filter((l) => !c.labels.includes(l)) : [];
    if (missing.length) out.push(`${c.address} has no ${missing.join(', ')} label${missing.length === 1 ? '' : 's'}: every resource carries ${labels.join(', ')}, so it can be found, counted and billed by them.`);
  }
  return out;
}

/** The review: { rows, problems, warnings }. A problem stops the apply; a warning is for the reader. */
export function reviewPlan(changes, { expect = null, protect = PROTECTED, allowDestroy = [], naming = {} } = {}) {
  const problems = [], warnings = [];
  if (changes.length && !expect) problems.push('No plan.expect in the stack: write what you expect the change to do (from the spec) before making the plan, then plan again.');
  const rows = changes.map((c) => ({ ...c, expected: !expect || expect.some((e) => e.matches(c)) }));
  if (expect) {
    for (const r of rows) if (!r.expected) problems.push(`Not expected: ${r.action} ${r.address}. Either the code does more than the spec says, or plan.expect misses it.`);
    for (const e of expect) if (!changes.some((c) => e.matches(c))) problems.push(`Expected but not in the plan: ${e.action} ${e.address}.`);
  }
  for (const c of changes) {
    if ((c.action === 'delete' || c.action === 'replace') && protect.test(c.type) && !allowDestroy.includes(c.address)) {
      problems.push(`Would ${c.action === 'delete' ? 'destroy' : 'destroy and recreate'} ${c.address} (a ${c.type}: data or names live there). If that is really meant, the owner plans again with --allow-destroy ${c.address}, after a backup (docs/RECOVERY.md).`);
    }
    if (c.startup) warnings.push(`${c.address}: the startup script changes. On most clouds it only runs on the first boot, so ${c.action === 'replace' ? 'the server is rebuilt' : 'the running server does NOT get it until it is rebuilt'}.`);
  }
  problems.push(...namingProblems(changes, naming));
  return { rows, problems, warnings };
}

/** What the apply shows before the code is typed: every destroy by name, and which hold data (each of those is typed out). */
export function destroyLines(stack, destroys) {
  if (!destroys.length) return [`This plan destroys nothing in ${stack}.`];
  return [`This plan DESTROYS ${destroys.length} thing${destroys.length === 1 ? '' : 's'} in ${stack}:`,
    ...destroys.map((d) => `  ${d.action === 'replace' ? 'destroy and recreate' : 'DESTROY'}  ${d.address}  (${d.type}${d.data ? ', holds data: whatever is in it is gone unless restored from a backup' : ''})`)];
}

const SIGN = { create: '+', update: '~', delete: '-', replace: '±' };

/** The review as text: counts, one line per change, then the problems and warnings. */
export function renderReview(stack, { rows, problems, warnings }) {
  if (!rows.length) return `${stack}: no changes (the infrastructure already matches the code).`;
  const count = (a) => rows.filter((r) => r.action === a).length;
  const lines = [`${stack}: ${count('create')} to create, ${count('update')} to change, ${count('replace')} to replace, ${count('delete')} to destroy`];
  for (const r of rows) lines.push(`  ${SIGN[r.action]} ${r.address}${r.expected ? '' : '   <- not expected'}`);
  if (warnings.length) lines.push('', ...warnings.map((w) => `warning: ${w}`));
  if (problems.length) lines.push('', ...problems.map((p) => `PROBLEM: ${p}`));
  else lines.push('', 'The plan matches plan.expect. The owner applies it with: npm run infra-apply -- ' + stack);
  return lines.join('\n');
}
