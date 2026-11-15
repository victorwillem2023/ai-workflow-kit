#!/usr/bin/env node
// Where the project is and what stage comes next, in a line or two (/next runs it first): the first version built and nothing
// says where it runs (/launch), a card that must come before the first deploy, a launch plan with nobody to tell (/market), a week
// shipped without a retro (/retro), and the roadmap's own stage and sign (docs/company/ROADMAP.md). Facts only (the board, docs/decisions/*-launch.md, docs/market/MARKET.md, git); the rules are in
// lib/stage.mjs. A board that cannot be reached leaves its rules out. Prints nothing when there is nothing to say.
//   node tools/workflow/stage.mjs
//   node tools/workflow/stage.mjs --enter run|market   start a stage: the kit's update brings that stage's folder (docs/run/ with
//                                                      its guides, docs/market/), from the kit on this computer (.workflow-kit, kit=)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listCards } from './lib/board.mjs';
import { shipping } from './lib/retro.mjs';
import { BEFORE_DEPLOY, readRoadmap, stageNudges } from './lib/stage.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim(); } catch { return null; } };
process.chdir(git('rev-parse', '--show-toplevel') ?? '.');
const config = JSON.parse(readFileSync('workflow.config.json', 'utf8'));
const board = config.board;

const enterAt = process.argv.indexOf('--enter');
if (enterAt >= 0) {
  const stage = process.argv[enterAt + 1];
  if (!['run', 'market'].includes(stage)) { console.error('Say which stage: --enter run (where it runs, /launch) or --enter market (/market).'); process.exit(1); }
  const mark = existsSync('.workflow-kit') ? readFileSync('.workflow-kit', 'utf8') : '';
  const kit = /^kit=(.+)$/m.exec(mark)?.[1]?.trim();
  const args = ['--project', config.name, '--repo', board?.repo, '--prefix', config.session?.prefix].flatMap((a, i, all) => (i % 2 === 0 && all[i + 1] ? [a, all[i + 1]] : []));
  const cmd = (k) => `node ${k}/install.mjs . ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')} --update --stage ${stage}`;
  if (/^stages=.*\b/m.test(mark) && new RegExp(`^stages=.*\\b${stage}\\b`, 'm').test(mark)) { console.log(`stage: ${stage} is entered already.`); process.exit(0); }
  if (!kit || !existsSync(join(kit, 'install.mjs'))) { console.error(`stage: the kit is not at ${kit ?? '(no kit= line in .workflow-kit)'} on this computer. Run it from the kit's folder: ${cmd('<kit>')}`); process.exit(1); }
  const r = spawnSync(process.execPath, [join(kit, 'install.mjs'), '.', ...args, '--update', '--stage', stage], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  // the docs index lists the new folder
  spawnSync(process.execPath, ['tools/workflow/map.mjs'], { stdio: 'inherit' });
  console.log(`stage: ${stage} entered: its docs are in docs/${stage}/. Commit them with the change that needed them.`);
  process.exit(0);
}

// gh with an argument list and no shell; on Windows also where its installer puts it
let ghPath = 'gh';
const run = (args, input) => {
  const go = () => spawnSync(ghPath, args, { input, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 64 << 20 });
  let res = go();
  if (res.error?.code === 'ENOENT' && process.platform === 'win32' && ghPath === 'gh') { ghPath = 'C:\\Program Files\\GitHub CLI\\gh.exe'; res = go(); }
  return res;
};
let cards = null;
try { if (board?.project) cards = listCards(board, run, { wholeText: true }).filter((c) => c.column); } catch { cards = null; }

const milestone = board?.labels?.milestone?.[0];
const done = (c) => c.state !== 'open' || c.column === 'Done';
const v1 = cards && milestone ? cards.filter((c) => c.labels.includes(milestone)) : null;
const decisions = existsSync('docs/decisions') ? readdirSync('docs/decisions') : [];
const log = git('log', 'main', '--first-parent', '--since=9.weeks', '--format=%cI%x09%s') ?? '';
const commits = log.split('\n').filter(Boolean).map((l) => { const [date, ...rest] = l.split('\t'); return { date, subject: rest.join('\t') }; });
const weeks = shipping(commits, new Date()).weeks;
const roadmapAt = 'docs/company/ROADMAP.md';
const roadmapChanged = existsSync(roadmapAt) ? git('log', '-1', '--format=%ct', '--', roadmapAt) : null;
const roadmap = existsSync(roadmapAt) ? { ...readRoadmap(readFileSync(roadmapAt, 'utf8')), daysSinceChange: roadmapChanged ? Math.floor((Date.now() / 1000 - Number(roadmapChanged)) / 86400) : 0 } : null;
const lastRetro = git('log', 'main', '-1', '--format=%ct', '--grep=retro of week', '-i');

const lines = stageNudges({
  firstVersion: v1 ? { total: v1.length, open: v1.filter((c) => !done(c)).length } : null,
  beforeDeploy: (cards ?? []).filter((c) => !done(c) && BEFORE_DEPLOY.test(`${c.title}\n${c.body ?? ''}`)).map((c) => ({ number: c.number, title: c.title })),
  launched: decisions.some((f) => /-launch\.md$/.test(f)),
  marketPage: existsSync('docs/market/MARKET.md'),
  installed: Object.fromEntries(['launch', 'market', 'retro'].map((p) => [p, existsSync(join('.claude', 'skills', p, 'SKILL.md'))])),
  shippedThisWeek: weeks.at(-1)?.features ?? 0,
  roadmap,
  daysSinceRetro: lastRetro ? Math.floor((Date.now() / 1000 - Number(lastRetro)) / 86400) : null,
});
if (lines.length) console.log(lines.map((l) => `stage: ${l}`).join('\n'));
