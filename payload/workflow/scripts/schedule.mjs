#!/usr/bin/env node
// The weekly runs nobody should have to remember, started by the orchestrator on a schedule: the security report read
// (/secops), the retro (/retro), the dependency updates (npm run updates). Each is a chat in the main folder that reports and
// then waits: none of them builds, commits or pushes without the owner's yes, so nothing happens while nobody looks.
//   npm run schedule            what would run and when, and which of them Orca has already
//   npm run schedule -- --on    makes the ones Orca lacks (Orca's own Automations page switches one off or changes its time)
// Off in a prototype (workflow/levels.json): there is no week to look back on and nobody relies on it yet; from pilot on.
// Needs "orchestrator": "orca" under "session" in workflow/config.json. The runs are "schedule" there: a list of
// { "name", "trigger" (hourly, daily, weekdays, weekly, or a cron line), "time" ("09:00", with a word as trigger), "prompt" }
// replaces the three below, false switches them off. A run whose command (/retro) the project did not install is left out.
// ORCA: not yet tried in a real project (workflow/guides/ORCHESTRATOR.md).
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RUNS = [
  { name: 'security report', trigger: '0 9 * * 1', prompt: '/secops' },
  { name: 'retro', trigger: '0 16 * * 5', prompt: '/retro' },
  { name: 'updates', trigger: '0 9 * * 3', prompt: 'Run npm run updates and say each verdict in one line. Change nothing; ask before any fix.' },
];

/**
 * What is scheduled for a project: { off: why nothing is ('' when on), runs: [{ name, trigger, time, prompt }] }. `config` is
 * workflow/config.json, `levels` the text of workflow/levels.json, `hasSkill(name)` whether a command is installed. Each run's
 * name starts with the project's, so two projects in one Orca never share one.
 */
export function planOf({ config, levels, hasSkill, project }) {
  const session = config?.session ?? {};
  let phase = 'prototype';
  try { phase = JSON.parse(levels ?? '{}').phase ?? 'prototype'; } catch { /* unreadable: the strictest reading, off */ }
  const runs = (Array.isArray(session.schedule) ? session.schedule : RUNS)
    .filter((r) => r?.name && r.trigger && r.prompt && (!/^\/[a-z-]+/.test(r.prompt) || hasSkill(/^\/([a-z-]+)/.exec(r.prompt)[1])))
    .map((r) => ({ name: `${project}: ${r.name}`, trigger: String(r.trigger), time: r.time ? String(r.time) : undefined, prompt: String(r.prompt) }));
  const off = String(session.orchestrator ?? '').toLowerCase() !== 'orca' ? 'they are the orchestrator\'s work: "orchestrator": "orca" under "session" in workflow/config.json (node workflow/scripts/session.mjs --connect orca)'
    : session.schedule === false ? '"schedule": false under "session" in workflow/config.json'
      : phase === 'prototype' ? 'the project is a prototype (workflow/levels.json); they start at pilot'
        : !runs.length ? 'no run is left: none of their commands is installed' : '';
  return { off, runs };
}

async function main(argv) {
  const { main: root, sessionCfg } = await import('./session-core.mjs');
  const { orca, objectsIn } = await import('./session-adopt.mjs');
  const read = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null);
  const config = JSON.parse(read('workflow/config.json') ?? '{}');
  const plan = planOf({ config, levels: read('workflow/levels.json'), hasSkill: (n) => existsSync(join(root, '.claude', 'skills', n)), project: sessionCfg.prefix ?? basename(root) });
  if (plan.off) { console.log(`Scheduled runs: off, ${plan.off}.`); return 0; }
  const why = {};
  const listed = orca(['automations', 'list'], why);
  if (!listed) throw new Error(`Orca did not answer${why.said ? `: ${why.said}` : ''}. Open Orca and run this again; nothing was scheduled.`);
  const there = new Set([...objectsIn(listed)].map((o) => o.name).filter((n) => typeof n === 'string'));
  const when = (r) => `${r.trigger}${r.time ? ` ${r.time}` : ''}`;
  const make = argv.includes('--on');
  for (const r of plan.runs) {
    if (there.has(r.name)) { console.log(`  ${r.name}  (${when(r)})  in Orca already`); continue; }
    if (!make) { console.log(`  ${r.name}  (${when(r)})  not in Orca yet: ${r.prompt}`); continue; }
    const made = orca(['automations', 'create', '--name', r.name, '--trigger', r.trigger, ...(r.time ? ['--time', r.time] : []), '--prompt', r.prompt, '--provider', 'claude', '--workspace', `path:${root}`], why, { extra: true });
    console.log(made ? `  ${r.name}  (${when(r)})  made: a chat in the main folder, which reports and waits for you` : `  ${r.name}  NOT made: ${why.said ?? 'Orca refused'}`);
    if (!made) return 1;
  }
  if (!make && plan.runs.some((r) => !there.has(r.name))) console.log('Make the missing ones: npm run schedule -- --on');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
}
