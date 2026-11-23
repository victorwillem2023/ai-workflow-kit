#!/usr/bin/env node
// The shape of the code, flow by flow: npm run anatomy (lib/anatomy.mjs, lib/likeness.mjs). Changes nothing.
//   npm run anatomy                    the flows, worst first: shared steps, kind checks in them, repeated rules, look-alikes, fixes
//   npm run anatomy -- --flow <name>   one flow in full, each finding with its file and line (what /anatomy reads)
//   npm run anatomy -- --json          the same as data
// Flows: `anatomy.flows` in workflow/config.json ({ "<flow>": { "files": ["<glob>"], "values": ["<kind>"], "flags": ["<property>"] } }), else the app
// map's kinds; and always each kind the code asks about (`shape === 'summit'` in several files). Pages: docs/anatomy/<flow>.md (/anatomy writes them).
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { matchesAny } from './lib/glob.mjs';
import { codeTest } from './lib/lang.mjs';
import { countPatterns } from './lib/ratchet.mjs';
import { shippedRecords } from './lib/codestate.mjs';
import { anatomyTable, codeKinds, comparisons, fixesPerFlow, flagsOf, flowDetail, namedFlows, pageStates, scoreFlows, slug } from './lib/anatomy.mjs';
import { lookAlikes, repeatedRules } from './lib/likeness.mjs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const argv = process.argv.slice(2);
const value = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const isCode = codeTest(config);
const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n');
const files = new Map(listed.filter((f) => f && isCode(f) && matchesAny(f, config.size.include) && !matchesAny(f, ['workflow/**', 'tools/**', ...(config.skipFiles ?? [])]) && existsSync(f))
  .map((f) => [f, readFileSync(f, 'utf8')]));

/** The app map's kinds and the files of each part (its src and every f: in its tree), when the map module is there. */
async function mapKinds() {
  const lib = join(root, 'workflow', 'tools', 'lib', 'worksheet.mjs');
  if (!existsSync(lib) || !existsSync(join(root, 'docs', 'flow', 'map.js'))) return { kinds: {}, partFiles: {} };
  try {
    const flow = (await import(pathToFileURL(lib).href)).loadFlow(root);
    const partFiles = {};
    const walk = (nodes, out) => { for (const n of nodes ?? []) { if (n.f) out.push(...String(n.f).split(/[,\s]+/).filter(Boolean)); walk(n.yes, out); walk(n.no, out); for (const [, o] of n.opts ?? []) walk(o, out); } return out; };
    for (const part of flow.groups.flatMap((g) => g.stages ?? [g])) if (part.id) partFiles[part.id] = walk(part.tree, part.src ? [part.src] : []);
    return { kinds: flow.kinds, partFiles };
  } catch { return { kinds: {}, partFiles: {} }; }
}

/** Fix commits of the last 4 weeks and the shipped records of bug cards: [{ id, at, files }]. */
function recentFixes() {
  let log = '';
  try { log = execFileSync('git', ['log', '--since=28.days', '--no-merges', '--name-only', '--format=@%h %cI %s'], { encoding: 'utf8', maxBuffer: 64 << 20 }); } catch { /* no history */ }
  const commits = log.split('\n@').map((b) => b.replace(/^@/, '').split('\n')).filter((b) => /\b(fix(es|ed)?|bug|broke|wrong|no longer)\b/i.test(b[0] ?? ''))
    .map(([head, ...fs]) => ({ id: head.split(' ')[0], at: head.split(' ')[1], files: fs.filter(Boolean) }));
  const records = shippedRecords(root).filter((r) => r.type === 'bug').map((r) => ({ id: r.cards.length ? r.cards.map((c) => `#${c}`).join('+') : r.topic, at: r.at, files: r.files }));
  return [...commits, ...records];
}

const { kinds: mapped, partFiles } = await mapKinds();
const kinds = codeKinds(comparisons(files));
const named = namedFlows([...files.keys()], { named: config.anatomy?.flows, match: matchesAny, kinds: mapped, partFiles });
const flows = [...named, ...kinds];
const sharedSet = new Set(kinds.flatMap((k) => k.checks).filter((c) => c.shared).map((c) => c.file));
const ratchets = [...sharedSet].flatMap((f) => Object.entries(countPatterns(new Map([[f, files.get(f) ?? '']]), (config.ratchets ?? []).filter((r) => !/escape/i.test(r.name)))).filter(([, n]) => n > 0).map(([name, n]) => ({ file: f, name, n })));
const flags = new Map(named.map((fl) => [fl.name, flagsOf(fl, files)]));
const found = { flags, ratchets, rules: repeatedRules(files), alikes: lookAlikes(files), fixes: fixesPerFlow(flows, recentFixes()) };
const pagesDir = join(root, 'docs', 'anatomy');
const pages = existsSync(pagesDir) ? pageStates(readdirSync(pagesDir).filter((f) => f.endsWith('.md')).map((f) => ({ name: f.replace(/\.md$/, ''), text: readFileSync(join(pagesDir, f), 'utf8') }))) : [];
const rows = scoreFlows(flows, kinds, found, pages);

const one = value('--flow');
if (argv.includes('--json')) console.log(JSON.stringify(one ? rows.find((r) => slug(r.name) === slug(one)) ?? null : rows));
else if (one) {
  const r = rows.find((x) => slug(x.name) === slug(one));
  console.log(r ? flowDetail(r) : `anatomy: no flow "${one}"; the flows: ${rows.map((x) => x.name).join(', ')}`);
  if (!r) process.exitCode = 1;
} else console.log(anatomyTable(rows));
