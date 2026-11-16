#!/usr/bin/env node
// The access review: who and what can reach this repository on GitHub, against docs/company/ACCESS.md, plus the list of places
// to check by hand. Run by the owner (gh signed in), every 90 days; the weekly security report says when it is due.
//   npm run access              print the review
//   npm run access -- --publish open it as an issue labelled "access-review" (a checklist to work through)
//   npm run access -- --done    set "Last review: <today>" in docs/company/ACCESS.md, after every line is settled
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { accessReport, compareAccess, parseAccess } from './lib/access.mjs';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const repo = String(config.board?.repo ?? '').includes('/') ? config.board.repo : `${config.board?.owner}/${config.board?.repo}`;
const args = process.argv.slice(2);
const FILE = 'docs/company/ACCESS.md';
const today = new Date().toISOString().slice(0, 10);

function gh(a, input) {
  const go = (cmd) => spawnSync(cmd, a, { input, encoding: 'utf8', shell: false, windowsHide: true, timeout: 60_000, maxBuffer: 16 << 20 });
  const res = go('gh');
  return res.error?.code === 'ENOENT' && process.platform === 'win32' ? go('C:\\Program Files\\GitHub CLI\\gh.exe') : res;
}
const list = (path, pick) => { const r = gh(['api', '--paginate', path]); if (r.status !== 0) return null; try { return pick(JSON.parse(r.stdout)); } catch { return null; } };

if (!existsSync(FILE)) { console.log(`access: ${FILE} is missing (install.mjs --update writes it): list who should have access there first`); process.exit(1); }
const text = readFileSync(FILE, 'utf8');

if (args.includes('--done')) {
  writeFileSync(FILE, /Last review:\s*\S+/.test(text) ? text.replace(/Last review:\s*\S+/, `Last review: ${today}`) : text.replace(/\n/, `\n\nLast review: ${today}\n`));
  console.log(`access: last review set to ${today} in ${FILE}; commit it`);
  process.exit(0);
}

const people = list(`repos/${repo}/collaborators?affiliation=all&per_page=100`, (j) => j.map((p) => ({ kind: 'person', who: p.login, role: p.role_name })));
if (!people) { console.log(`access: GitHub refused the list of people for ${repo} (gh signed in as an admin of it? gh auth status)`); process.exit(1); }
const keys = list(`repos/${repo}/keys?per_page=100`, (j) => j.map((k) => ({ kind: 'deploy key', who: k.title, role: k.read_only ? 'read' : 'write' }))) ?? [];
const secrets = list(`repos/${repo}/actions/secrets?per_page=100`, (j) => j.secrets.map((s) => ({ kind: 'secret', who: s.name }))) ?? [];
const body = accessReport(compareAccess([...people, ...keys, ...secrets], parseAccess(text)), today);

if (args.includes('--publish')) {
  gh(['label', 'create', 'access-review', '--repo', repo, '--color', '5319E7', '--description', 'The access review, every 90 days', '--force']);
  const r = gh(['issue', 'create', '--repo', repo, '--title', `Access review, ${today}`, '--label', 'access-review', '--body-file', '-'], body.split('\n').slice(2).join('\n'));
  console.log(r.status === 0 ? `access: opened ${r.stdout.trim()}` : `access: the issue was not made (${String(r.stderr).trim().slice(0, 160)})`);
} else console.log(body);
