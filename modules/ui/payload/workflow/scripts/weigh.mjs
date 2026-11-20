#!/usr/bin/env node
// What makes the page heavy: builds the app with Vite as production does, into a temporary folder, and lists what each part
// weighs gzipped, by folder and package and then the biggest files. The page-weight check (perfbudget) says the total is too
// big; this says where the weight is, so a card can name what to split, load later or drop. Changes nothing in the project.
// Usage: node workflow/scripts/weigh.mjs [--chunk <file name, default: every chunk>] [--top 25]
import '../tools/lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Where a module belongs: its package under node_modules (with its scope), else its folder up to three deep. */
export function areaOf(id) {
  const p = id.replace(/\\/g, '/').replace(/^.*?\/node_modules\//, 'node_modules/');
  if (p.startsWith('node_modules/')) { const parts = p.split('/'); return parts.slice(0, parts[1].startsWith('@') ? 3 : 2).join('/'); }
  const parts = p.split('/');
  // a file at the top, or in a folder of the first level, stands alone; deeper ones by their first three folders
  return parts.slice(0, Math.min(parts.length - 1, 3)).join('/') || p;
}

/** The rows [{ id, gzip }] as text: by area, then the biggest files, in KB. */
export function weighLines(rows, top = 25) {
  const kb = (n) => (n / 1024).toFixed(1).padStart(7);
  const areas = new Map();
  for (const r of rows) areas.set(areaOf(r.id), (areas.get(areaOf(r.id)) ?? 0) + r.gzip);
  const total = rows.reduce((t, r) => t + r.gzip, 0);
  return [`weigh: ${(total / 1024).toFixed(1)} KB gzipped in ${rows.length} modules (each module gzipped alone, so a little more than the real files)`, 'by folder or package:',
    ...[...areas].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => `${kb(v)}  ${k}`), 'biggest files:',
    ...[...rows].sort((a, b) => b.gzip - a.gzip).slice(0, top).map((r) => `${kb(r.gzip)}  ${r.id.replace(/\\/g, '/').replace(/^.*?\/node_modules\//, 'node_modules/')}`)].join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const vite = join(process.cwd(), 'node_modules', 'vite', 'package.json');
  if (!existsSync(vite)) throw new Error('weigh reads a Vite build, and this project has no vite in node_modules.');
  const { build } = await import(pathToFileURL(join(process.cwd(), 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);
  const out = mkdtempSync(join(tmpdir(), 'workflow-weigh-'));
  const rows = [];
  const root = process.cwd().replace(/\\/g, '/') + '/';
  try {
    await build({ mode: 'production', logLevel: 'error', build: { outDir: out, emptyOutDir: true }, plugins: [{ name: 'workflow-weigh', generateBundle(_, bundle) {
      for (const c of Object.values(bundle)) {
        if (c.type !== 'chunk' || (value('--chunk') && c.fileName !== value('--chunk'))) continue;
        for (const [id, m] of Object.entries(c.modules)) rows.push({ id: id.replace(/\\/g, '/').replace(root, ''), gzip: m.code ? gzipSync(m.code).length : 0 });
      }
    } }] });
  } finally { rmSync(out, { recursive: true, force: true }); }
  console.log(weighLines(rows, Number(value('--top')) || 25));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(`weigh: ${e.message}`); process.exit(1); });
