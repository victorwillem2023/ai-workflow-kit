#!/usr/bin/env node
// The launch check: is the landing page ready for people to be sent to it? Checks one page (an address, or a built HTML file):
// the title and description, the share preview (Open Graph), one main heading, image texts, the language and viewport, the
// privacy link, trackers that need consent in the EU, robots.txt and the sitemap, and the page's weight (lib/launchcheck.mjs).
//   node tools/workflow/launchcheck.mjs https://example.com      the live page: also robots.txt, the sitemap, and the weight
//   node tools/workflow/launchcheck.mjs dist/index.html          a built page: robots.txt and sitemap.xml beside it
// Reads only public pages; sends nothing anywhere else. Exit 1 when a problem is found; warnings are for the owner to judge.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pageProblems, robotsProblems, sitemapUrls } from './lib/launchcheck.mjs';

const target = process.argv[2];
if (!target) { console.log('Name the page: npm run launch-check -- <https address, or a built .html file>'); process.exit(1); }
const live = /^https?:\/\//.test(target);
const get = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(15_000), redirect: 'follow' }); return r.ok ? { body: await r.text(), bytes: Number(r.headers.get('content-length')) || 0 } : null; } catch { return null; } };
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);

const page = live ? (await get(target))?.body : read(target);
if (page == null) { console.log(`Could not ${live ? 'load' : 'read'} ${target}.`); process.exit(1); }
const base = live ? new URL('/', target).href : dirname(target);
const robots = live ? (await get(new URL('/robots.txt', target).href))?.body ?? null : read(join(base, 'robots.txt'));
const sitemapAt = /^\s*sitemap:\s*(\S+)/im.exec(robots ?? '')?.[1] ?? (live ? new URL('/sitemap.xml', target).href : join(base, 'sitemap.xml'));
const sitemap = live ? (await get(sitemapAt))?.body ?? null : read(sitemapAt.startsWith('http') ? join(base, 'sitemap.xml') : sitemapAt);

const { problems, warnings } = pageProblems(page);
const r = robotsProblems(robots);
problems.push(...r.problems); warnings.push(...r.warnings);
const urls = sitemapUrls(sitemap);
if (urls == null) problems.push(`no sitemap at ${sitemapAt}: it tells search engines which pages exist`);
else if (!urls.length) warnings.push('the sitemap lists no pages');

// the weight: the page and the scripts, styles and images it loads from its own site (live only)
let kb = Buffer.byteLength(page) / 1024;
if (live) {
  const refs = [...page.matchAll(/<(?:script|img)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']|<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1] ?? m[2]);
  const own = [...new Set(refs.map((u) => new URL(u, target)).filter((u) => u.host === new URL(target).host).map((u) => u.href))].slice(0, 40);
  for (const u of own) { const got = await get(u); kb += got ? (got.bytes || Buffer.byteLength(got.body)) / 1024 : 0; }
  if (kb > 1024) warnings.push(`the page and its own files weigh ${Math.round(kb)} KB; under 1 MB loads fast on a phone (docs/run/PERFORMANCE.md)`);
}

for (const w of warnings) console.log(`warning: ${w}`);
for (const p of problems) console.log(`PROBLEM: ${p}`);
console.log(problems.length ? `\n${problems.length} problem${problems.length === 1 ? '' : 's'} to fix before launch (docs/market/GROWTH.md, The landing page).` : `launch check: ${target} is ready${warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? '' : 's'} to judge` : ''}${live ? ` (${Math.round(kb)} KB)` : ''}.`);
process.exit(problems.length ? 1 : 0);
