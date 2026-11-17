#!/usr/bin/env node
// Where the project is and what stage comes next, in a line or two (/next runs it first): the first version built and nothing
// says where it runs (/launch), a card that must come before the first deploy, a launch plan with nobody to tell (/market), a week
// shipped without a retro (/retro), a working first version nobody asked yet whether AI could make better (/advise ai), and the roadmap's own stage and sign (docs/company/ROADMAP.md). Facts only (the board, docs/decisions/*-launch.md, docs/market/MARKET.md, git); the rules are in
// lib/stage.mjs. A board that cannot be reached leaves its rules out. Prints nothing when there is nothing to say.
//   node workflow/tools/stage.mjs
//   node workflow/tools/stage.mjs --json             the same in a few words each (title, command, time), for the docs portal
//   node workflow/tools/stage.mjs --enter run|market   start a stage: the kit's update brings that stage's folder (docs/run/ with
//                                                      its guides, docs/market/), from the kit on this computer (git config workflow.kit)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listCards } from './lib/board.mjs';
import { shipping } from './lib/retro.mjs';
import { BEFORE_DEPLOY, readRoadmap, stageItems, stageNudges } from './lib/stage.mjs'; import { MAIN, ORIGIN_MAIN } from './lib/branch.mjs';
import { ghRun } from './lib/gh.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim(); } catch { return null; } };
process.chdir(git('rev-parse', '--show-toplevel') ?? '.');
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const board = config.board;

const enterAt = process.argv.indexOf('--enter');
if (enterAt >= 0) {
  const stage = process.argv[enterAt + 1];
  if (!['run', 'market'].includes(stage)) { console.error('Say which stage: --enter run (where it runs, /launch) or --enter market (/market).'); process.exit(1); }
  const mark = existsSync('workflow/record') ? readFileSync('workflow/record', 'utf8') : '';
  // where the kit is on this computer: this clone's git config (workflow.kit, set by the installer); a record from before 2.10 says kit=
  const kit = git('config', 'workflow.kit') || /^kit=(.+)$/m.exec(mark)?.[1]?.trim();
  const args = ['--project', config.name, '--repo', board?.repo, '--prefix', config.session?.prefix].flatMap((a, i, all) => (i % 2 === 0 && all[i + 1] ? [a, all[i + 1]] : []));
  const cmd = (k) => `node ${k}/install.mjs . ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')} --update --stage ${stage}`;
  if (/^stages=.*\b/m.test(mark) && new RegExp(`^stages=.*\\b${stage}\\b`, 'm').test(mark)) { console.log(`stage: ${stage} is entered already.`); process.exit(0); }
  if (!kit || !existsSync(join(kit, 'install.mjs'))) {
    // the version this project is on, and where to get it (workflow/record's ref= and kitRepo=), so the stage comes from the same kit
    const ref = /^ref=(.+)$/m.exec(mark)?.[1]?.trim();
    const repo = /^kitRepo=(.+)$/m.exec(mark)?.[1]?.trim();
    const get = ref && repo ? `Get it: git clone --branch ${ref} ${repo} <kit>, then: ` : 'Run it from the kit\'s folder: ';
    console.error(`stage: the kit is not at ${kit ?? '(no kit= line in workflow/record)'} on this computer. ${get}${cmd('<kit>')}`);
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [join(kit, 'install.mjs'), '.', ...args, '--update', '--stage', stage], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  // the docs index lists the new folder
  spawnSync(process.execPath, ['workflow/tools/map.mjs'], { stdio: 'inherit' });
  console.log(`stage: ${stage} entered: its docs are in docs/${stage}/. Commit them with the change that needed them.`);
  process.exit(0);
}

const run = (args, input) => ghRun(args, input); // lib/gh.mjs
let cards = null;
try { if (board?.project) cards = listCards(board, run, { wholeText: true }).filter((c) => c.column); } catch { cards = null; }

const milestone = board?.labels?.milestone?.[0];
const done = (c) => c.state !== 'open' || c.column === 'Done';
const v1 = cards && milestone ? cards.filter((c) => c.labels.includes(milestone)) : null;
const decisions = existsSync('docs/decisions') ? readdirSync('docs/decisions') : [];
const log = git('log', MAIN, '--first-parent', '--since=9.weeks', '--format=%cI%x09%s') ?? '';
const commits = log.split('\n').filter(Boolean).map((l) => { const [date, ...rest] = l.split('\t'); return { date, subject: rest.join('\t') }; });
const weeks = shipping(commits, new Date()).weeks;
const roadmapAt = 'docs/company/ROADMAP.md';
const roadmapChanged = existsSync(roadmapAt) ? git('log', '-1', '--format=%ct', '--', roadmapAt) : null;
const roadmap = existsSync(roadmapAt) ? { ...readRoadmap(readFileSync(roadmapAt, 'utf8')), daysSinceChange: roadmapChanged ? Math.floor((Date.now() / 1000 - Number(roadmapChanged)) / 86400) : 0 } : null;
const lastRetro = git('log', MAIN, '-1', '--format=%ct', '--grep=retro of week', '-i');

const facts = {
  firstVersion: v1 ? { total: v1.length, open: v1.filter((c) => !done(c)).length } : null,
  beforeDeploy: (cards ?? []).filter((c) => !done(c) && BEFORE_DEPLOY.test(`${c.title}\n${c.body ?? ''}`)).map((c) => ({ number: c.number, title: c.title })),
  launched: decisions.some((f) => /-launch\.md$/.test(f)),
  marketPage: existsSync('docs/market/MARKET.md'),
  aiConsidered: decisions.some((f) => /-ai\.md$/.test(f)),
  installed: Object.fromEntries(['launch', 'market', 'retro', 'advise'].map((p) => [p, existsSync(join('.claude', 'skills', p, 'SKILL.md'))])),
  shippedThisWeek: weeks.at(-1)?.features ?? 0,
  roadmap,
  daysSinceRetro: lastRetro ? Math.floor((Date.now() / 1000 - Number(lastRetro)) / 86400) : null,
};
// --json: the same in a few words each, for the docs portal (lib/stage.mjs, stageItems)
if (process.argv.includes('--json')) console.log(JSON.stringify(stageItems(facts)));
else {
  const lines = stageNudges(facts);
  if (lines.length) console.log(lines.map((l) => `stage: ${l}`).join('\n'));
}
