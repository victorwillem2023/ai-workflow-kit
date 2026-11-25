#!/usr/bin/env node
// The page-weight check: builds the app (npm run build) and weighs each built page by what the browser downloads before it
// works (its scripts and styles and all they import at once, compressed), against `performance.maxKb` in workflow/config.json,
// or a page's own (`performance.pages`: [{ "name", "html", "maxKb" }]; without it every .html at the top of the build). No page:
// all the built files together. Runs as a `checks` entry of the gate when screens change. No budget, no build
// script or no built files: it says so and passes, so a project without screens is never blocked.
// Already over the budget the first time (an older project): that weight becomes the baseline (workflow/tools/perf-baseline.json),
// and only heavier than it, with a little room, fails.
//   node workflow/tools/perfbudget.mjs [--no-build] [--update]   (--update: today's weight is the baseline again)
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { matchesAny } from './lib/glob.mjs';
import { buildApp } from './lib/buildapp.mjs';
import { builtPages, startupFiles, weighPages, weightLine } from './lib/perfbudget.mjs';
import { hasWeb, surfacesOf } from './lib/surfaces.mjs';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const perf = config.performance;
if (!perf?.maxKb) { console.log('page weight: no budget ("performance.maxKb" in the config)'); process.exit(0); }
// a product with no web pages (a phone app only, a command line, an API: project.surfaces) has no page to weigh
if (!hasWeb(surfacesOf(config).names)) { console.log(`page weight: no web pages (project.surfaces: ${surfacesOf(config).names.join(', ')})`); process.exit(0); }
if (!process.argv.includes('--no-build')) {
  const b = buildApp();
  if (b.none) { console.log('page weight: no build script, nothing to weigh'); process.exit(0); }
  if (!b.ok) { console.log(`page weight: the build failed\n${b.tail}`); process.exit(1); }
}
// the built files are ignored by git, so they are found by walking the folders the globs start with
const roots = [...new Set(perf.files.map((g) => g.split('/')[0]))];
const walk = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map((f) => `${dir}/${String(f).replace(/\\/g, '/')}`) : []);
const found = roots.flatMap(walk).filter((f) => matchesAny(f, perf.files) && statSync(f).isFile());
if (!found.length) {
  // a build ran and none of its files match: the setting points at the wrong folder, and passing would check nothing at all.
  // Where the build did write (the usual output folders), with the setting that names it.
  const outputs = ['dist', 'build', 'out', '.next/static', 'public/build', 'www'].filter((d) => walk(d).some((f) => /\.(js|css)$/.test(f)));
  if (process.argv.includes('--no-build') || !outputs.length) { console.log(`page weight: no built files match ${perf.files.join(', ')}`); process.exit(0); }
  console.log(`page weight: the build wrote no file that "performance.files" names (${perf.files.join(', ')}), so nothing was weighed. `
    + `Its files are in ${outputs.join(', ')}: set "performance.files" to ${JSON.stringify(outputs.flatMap((d) => [`${d}/**/*.js`, `${d}/**/*.css`]))}`);
  process.exit(1);
}
// each built page on its own, with what it loads at start-up: a phone page that also pulls in the desktop map is caught, and a
// heavy part loaded later (import()) costs nothing at the start. No page found (a framework that builds no HTML): the files together.
const pages = builtPages(perf, roots, (r) => (existsSync(r) && statSync(r).isDirectory() ? readdirSync(r) : []));
const BASELINE = 'workflow/tools/perf-baseline.json';
const saved = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const update = process.argv.includes('--update');
const NOTE = 'The weight when it was first weighed over the budget (kb: all files; pages: each page at start-up); heavier than this (plus a little room) fails. Under the budget: delete the entry.';
const gz = new Map();
const gzipOf = (path) => { if (!gz.has(path)) gz.set(path, gzipSync(readFileSync(path)).length); return gz.get(path); };
if (pages.length) {
  const baselines = { ...(saved.pages ?? {}) };
  let ok = true;
  let wrote = false;
  for (const page of pages) {
    if (!existsSync(page.html)) { console.log(`page weight (${page.name}): ${page.html} was not built; "performance.pages" names it`); ok = false; continue; }
    const top = page.root;
    // a site served under a path (Vite's "base": "/app/") names its files from there
    const base = page.base;
    // without a base given, one is found: "/app/assets/x.js" not in the build, "assets/x.js" is
    const isFile = (f) => existsSync(f) && statSync(f).isFile();
    const fileOf = (p) => {
      const rel = base && p.startsWith(`${base}/`) ? p.slice(base.length + 1) : p;
      const f = top ? `${top}/${rel}` : rel;
      const shorter = top && !base && rel.includes('/') ? `${top}/${rel.split('/').slice(1).join('/')}` : null;
      return !isFile(f) && shorter && isFile(shorter) ? shorter : f;
    };
    const read = (p) => (isFile(fileOf(p)) ? readFileSync(fileOf(p), 'utf8') : null);
    const start = startupFiles(readFileSync(page.html, 'utf8'), top ? page.html.slice(top.length + 1) : page.html, read);
    // a page none of whose files is in the build would weigh nothing: the site's top is elsewhere, so it fails until it is said;
    // one file the server adds when it runs (a /config.js) is said and left out
    if (start.missing.length && !start.files.length) {
      console.log(`page weight (${page.name}): none of its files is in ${top || 'the project'} (${start.missing.slice(0, 3).join(', ')}); give the page its "root" in "performance.pages" (the folder its addresses start from), or its "base" (a site served under a path, "/app/")`);
      ok = false;
      continue;
    }
    if (start.missing.length) console.log(`page weight (${page.name}): not in the build, so not weighed: ${start.missing.slice(0, 3).join(', ')} (a file the server adds, or the wrong "root")`);
    const files = start.files.map((p) => ({ path: fileOf(p), gzipBytes: gzipOf(fileOf(p)) }));
    const today = weighPages(files, page.maxKb).kb;
    if ((baselines[page.name] == null || update) && today > page.maxKb) {
      // a project weighed as one total before keeps that limit: a page never starts heavier than the old baseline allowed
      baselines[page.name] = update || saved.kb == null ? today : Math.min(today, saved.kb);
      wrote = true;
      console.log(`page weight (${page.name}): over the budget when first weighed, so ${today} KB is its baseline (${BASELINE}); make a card to bring it under ${page.maxKb} KB`);
    } else if (baselines[page.name] != null && today <= page.maxKb) { delete baselines[page.name]; wrote = true; }
    const v = weighPages(files, page.maxKb, baselines[page.name] ?? null);
    console.log(weightLine(v, page.name));
    ok &&= v.ok;
  }
  // weighed page by page now: the old total baseline gave each page its ceiling once, and goes
  if (saved.kb != null && ok) { console.log(`page weight: each page has its own baseline now; the total one (${saved.kb} KB) is gone from ${BASELINE}`); wrote = true; }
  if (wrote) writeFileSync(BASELINE, `${JSON.stringify({ note: NOTE, pages: baselines }, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
}
const files = found.map((path) => ({ path, gzipBytes: gzipOf(path) }));
// a page already over the budget the first time it is weighed gets today's weight as its baseline (--update takes it again)
let baselineKb = saved.kb ?? null;
const today = weighPages(files, perf.maxKb).kb;
if ((baselineKb === null || update) && today > perf.maxKb) {
  baselineKb = today;
  writeFileSync(BASELINE, `${JSON.stringify({ ...saved, note: NOTE, kb: today }, null, 2)}\n`);
  console.log(`page weight: over the budget when first weighed, so ${today} KB is the baseline (${BASELINE}); make a card to bring it under ${perf.maxKb} KB`);
}
if (baselineKb !== null && today <= perf.maxKb) console.log(`page weight: under the budget again: the "kb" entry in ${BASELINE} is not needed any more (delete it)`);
const v = weighPages(files, perf.maxKb, baselineKb);
console.log(weightLine(v));
process.exit(v.ok ? 0 : 1);
