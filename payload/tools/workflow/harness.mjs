#!/usr/bin/env node
// Writes what other coding agents need to run the skills in .claude/skills (see lib/harness.mjs).
//   node tools/workflow/harness.mjs           writes .opencode/commands/<skill>.md for every skill (replaced each time: they are
//                                             generated), and opencode.jsonc (and AGENTS.md when harness.agentsMd is true) only when
//                                             missing (yours to edit). AGENTS.md is opt-in: OpenCode reads it instead of CLAUDE.md.
//   node tools/workflow/harness.mjs --check   says which command files are missing or out of date, writes nothing (exit 1 when any)
// Settings: the "harness" block of workflow.config.json: { "opencode": { model, cheapModel, smallModel, exploreModel } | false,
// "private": [".env", "data/"], "agentsMd": false }. No "harness" block: OpenCode on with the kit's default models.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commandFile, opencodeConfig, agentsMd } from './lib/harness.mjs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const config = JSON.parse(readFileSync('workflow.config.json', 'utf8'));
const h = config.harness ?? {};
const check = process.argv.includes('--check');
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
const same = (a, b) => a !== null && a.replace(/\r\n/g, '\n') === b;

if (h.opencode === false) { console.log('harness: OpenCode is off in workflow.config.json'); process.exit(0); }
const skillsDir = join('.claude', 'skills');
const skills = existsSync(skillsDir) ? readdirSync(skillsDir).filter((n) => existsSync(join(skillsDir, n, 'SKILL.md'))).sort() : [];
const stale = [];
for (const name of skills) {
  const want = commandFile(name, readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8'), h.opencode || {});
  const file = join('.opencode', 'commands', `${name}.md`);
  if (same(read(file), want)) continue;
  stale.push(file);
  if (!check) { mkdirSync(join('.opencode', 'commands'), { recursive: true }); writeFileSync(file, want); }
}
if (check) {
  if (stale.length) { console.log(`harness: out of date (npm run harness rewrites them): ${stale.join(', ')}`); process.exit(1); }
  console.log(`harness: ${skills.length} OpenCode commands, all current`);
  process.exit(0);
}
const made = [];
if (!existsSync('opencode.jsonc') && !existsSync('opencode.json')) {
  const claudeSettings = JSON.parse(read(join('.claude', 'settings.local.json')) ?? '{}');
  writeFileSync('opencode.jsonc', opencodeConfig({ project: config.name ?? 'this project', cfg: h.opencode || {}, claudeSettings, private: h.private ?? ['.env'] }));
  made.push('opencode.jsonc');
}
if (h.agentsMd === true && !existsSync('AGENTS.md')) { writeFileSync('AGENTS.md', agentsMd(config.name ?? 'This project')); made.push('AGENTS.md'); }
console.log(`harness: ${stale.length ? `wrote ${stale.length} of ${skills.length} OpenCode commands` : `${skills.length} OpenCode commands, all current`}${made.length ? `; made ${made.join(', ')}` : ''}`);
