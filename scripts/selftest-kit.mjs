// Checks of the kit's own files that need no installed project (scripts/selftest.mjs runs them first):
//   longTopLevel   the 60-line rule the kit holds a project's functions to, for the kit's own top-level code too (a script run top
//                  to bottom has no function the function check could see): the longest stretch of code outside any function.
//                  Today's longer ones are named with their size and may shrink, never grow; a table of data at the left edge is not counted.
//   agedFacts      a guide with prices or free tiers says when they were last checked ("Facts checked: 2026-11" or "Reviewed:
//                  2026-11"); older than six months fails, so a release looks again; one with no date is listed
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const KNOWN = { 'payload/workflow/tools/gate.mjs': 96, 'scripts/selftest.mjs': 71, 'payload/workflow/tools/signoff.mjs': 66, 'payload/workflow/tools/infracheck.mjs': 61 };

/** The kit scripts whose top-level code runs longer than the rule allows: ['<file> <lines> (at most <n>: ...)']. */
export async function longTopLevel(kit, kitScripts) {
  const { functionsIn } = await import(pathToFileURL(join(kit, 'payload', 'workflow', 'tools', 'lib', 'funclen.mjs')).href);
  const tools = readdirSync(join(kit, 'payload', 'workflow', 'tools')).filter((f) => f.endsWith('.mjs')).map((f) => `payload/workflow/tools/${f}`);
  const stretch = (f) => {
    const text = readFileSync(join(kit, f), 'utf8').replace(/\r\n/g, '\n');
    const inFn = new Set(functionsIn(f, text).flatMap((fn) => Array.from({ length: fn.to - fn.from + 1 }, (_, i) => fn.from + i)));
    // a table of data (`const SCENARIOS = {` ... `};` at the left edge) is a declaration, not steps: it does not count
    let run = 0, longest = 0, inTable = false;
    text.split('\n').forEach((l, i) => {
      if (inTable) { if (/^[}\]];?\s*$/.test(l)) inTable = false; return; }
      if (!inFn.has(i) && /^(?:export\s+)?const\s+[\w$]+\s*=\s*[{[]\s*$/.test(l)) { inTable = true; return; }
      if (inFn.has(i)) run = 0;
      else if (l.trim() && !/^\s*(?:\/\/|\*|\/\*|import\b)/.test(l)) longest = Math.max(longest, ++run);
    });
    return longest;
  };
  return [...kitScripts, ...tools].map((f) => [f, stretch(f)]).filter(([f, n]) => n > (KNOWN[f] ?? 60))
    .map(([f, n]) => `${f} ${n} (at most ${KNOWN[f] ?? 60}: move steps into named functions)`);
}

/** The guides whose prices are older than six months, and the ones with prices but no date: { stale, undated }. */
export function agedFacts(kit, now = new Date()) {
  const roots = [join(kit, 'payload', 'docs'), join(kit, 'payload', 'workflow', 'guides'),
    ...readdirSync(join(kit, 'modules')).flatMap((m) => [join(kit, 'modules', m, 'payload', 'docs'), join(kit, 'modules', m, 'payload', 'workflow', 'guides')])];
  const guides = roots.filter((d) => existsSync(d)).flatMap((d) => readdirSync(d, { recursive: true }).map((f) => join(d, String(f)))).filter((f) => f.endsWith('.md'));
  const months = (y, m) => (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  const rel = (f) => f.slice(kit.length + 1).replace(/\\/g, '/');
  const stale = [], undated = [];
  for (const f of guides.filter((g) => /[€$] ?\d|free tier/i.test(readFileSync(g, 'utf8')))) {
    const m = /(?:Facts checked|Reviewed): (\d{4})-(\d{2})/.exec(readFileSync(f, 'utf8'));
    if (!m) undated.push(rel(f));
    else if (months(Number(m[1]), Number(m[2])) > 6) stale.push(`${rel(f)} (checked ${m[1]}-${m[2]})`);
  }
  return { stale, undated };
}
