#!/usr/bin/env node
// The size of what agents read, kept from growing by itself. Every skill, the rules a project starts with (CLAUDE.md and the
// modules' sections of it), the tools README and the guides have a recorded size (scripts/text-sizes.json). A text may shrink
// freely; it may grow past its recorded size only with a reason written down, so every addition is a choice someone made, and
// each release sees what it added. A few words more (2%, at least 150 bytes) pass without one.
//   node scripts/text-sizes.mjs                          what grew, what is new, what shrank, and the total; fails when a text grew with no reason
//   node scripts/text-sizes.mjs --accept <file> "<why>"  record a text's new size with the reason it grew (--accept all "<why>": every one that grew)
//   node scripts/text-sizes.mjs --update                 record the smaller size of every text that shrank, and drop the ones that are gone
// npm run test:quick checks it (tests/text-sizes.test.mjs), so a release cannot go out with a text that grew unseen.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FILE = 'scripts/text-sizes.json';
const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);

/** The texts agents read, as paths from the kit's folder: the skills, the starting rules, the tools README, the guides. */
export function textsOf(root = kit) {
  const rel = (f) => f.slice(root.length + 1).replace(/\\/g, '/');
  const all = [join(root, 'payload'), join(root, 'starter'), join(root, 'modules')].flatMap(walk).map(rel);
  return all.filter((f) => /\.claude\/skills\/.+\.md$/.test(f) || /(^|\/)(CLAUDE|claude-section[^/]*)\.md$/.test(f) || f === 'payload/workflow/tools/README.md' || /\/workflow\/guides\/[^/]+\.md$/.test(f)).sort();
}

/** A text's size as committed (\r\n counts as \n, so Windows and Linux measure the same). */
export const sizeOf = (root, f) => Buffer.byteLength(readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n'));

/** How far a text may grow past its recorded size with no reason: a few words. */
export const slack = (bytes) => Math.max(150, Math.round(bytes * 0.02));

/**
 * The texts against their recorded sizes: { grown: [{ file, was, now }], fresh: [{ file, now }] (not recorded yet), shrunk,
 * gone: [file], total, recorded }. `sizes`: { file: bytes } as recorded; `now`: { file: bytes } as they are.
 */
export function compare(sizes, now) {
  const grown = [], fresh = [], shrunk = [];
  for (const [file, n] of Object.entries(now)) {
    if (!(file in sizes)) fresh.push({ file, now: n });
    else if (n > sizes[file] + slack(sizes[file])) grown.push({ file, was: sizes[file], now: n });
    else if (n < sizes[file]) shrunk.push({ file, was: sizes[file], now: n });
  }
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  return { grown, fresh, shrunk, gone: Object.keys(sizes).filter((f) => !(f in now)), total: sum(now), recorded: sum(sizes) };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
/** The report's lines; the first says the total. */
export function report(c) {
  const out = [`What agents read: ${kb(c.total)} in all (recorded: ${kb(c.recorded)}).`];
  for (const g of c.grown) out.push(`  grew: ${g.file} ${g.was} -> ${g.now} bytes (+${g.now - g.was}): shorten it or move what only some work needs into a file it points to; or keep it, with why: node scripts/text-sizes.mjs --accept ${g.file} "<why it grew>"`);
  for (const f of c.fresh) out.push(`  new: ${f.file} (${f.now} bytes): node scripts/text-sizes.mjs --accept ${f.file} "<what it is for>"`);
  if (c.shrunk.length) out.push(`  shrank (${c.shrunk.length}, ${c.shrunk.reduce((a, s) => a + s.was - s.now, 0)} bytes less): node scripts/text-sizes.mjs --update records it`);
  return out;
}

export const readRecord = (root = kit) => { try { return JSON.parse(readFileSync(join(root, FILE), 'utf8')); } catch { return { sizes: {}, reasons: {} }; } };
export const measure = (root = kit) => Object.fromEntries(textsOf(root).map((f) => [f, sizeOf(root, f)]));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rec = readRecord();
  const now = measure();
  const c = compare(rec.sizes, now);
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const save = () => writeFileSync(join(kit, FILE), `${JSON.stringify({ $comment: 'The recorded size of every text agents read (scripts/text-sizes.mjs): a text may shrink freely and grows only with a reason. Written by that script, never by hand.', sizes: sorted(rec.sizes), reasons: sorted(rec.reasons) }, null, 2)}\n`);
  const version = readFileSync(join(kit, 'VERSION'), 'utf8').trim();
  if (args[0] === '--accept') {
    const [, which, why] = args;
    if (!which || !why?.trim()) { console.error('text-sizes: --accept <file|all> "<why it grew>" (the reason is kept next to the size)'); process.exit(1); }
    const files = which === 'all' ? [...c.grown, ...c.fresh].map((x) => x.file) : [which.replace(/\\/g, '/')];
    for (const f of files) {
      if (!(f in now)) { console.error(`text-sizes: ${f} is not one of the texts (a skill, CLAUDE.md, the tools README, a guide)`); process.exit(1); }
      rec.sizes[f] = now[f];
      rec.reasons[f] = `${version}: ${why.trim()}`;
    }
    save();
    console.log(`text-sizes: recorded ${files.length} text${files.length === 1 ? '' : 's'} with the reason.`);
  } else if (args[0] === '--update') {
    for (const s of c.shrunk) rec.sizes[s.file] = s.now;
    for (const f of c.gone) { delete rec.sizes[f]; delete rec.reasons[f]; }
    save();
    console.log(`text-sizes: ${c.shrunk.length} smaller size${c.shrunk.length === 1 ? '' : 's'} recorded, ${c.gone.length} gone.`);
  } else {
    console.log(report(c).join('\n'));
    process.exit(c.grown.length || c.fresh.length ? 1 : 0);
  }
}
