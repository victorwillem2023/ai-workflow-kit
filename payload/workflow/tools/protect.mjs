#!/usr/bin/env node
// Protects main in two places, so a force push or a deleted branch cannot happen by accident (an agent's, or yours):
//   node workflow/tools/protect.mjs           the guard on this computer (a git pre-push hook) and the rule on GitHub
//   node workflow/tools/protect.mjs --local   only the guard on this computer
//   node workflow/tools/protect.mjs --check   say what is in place; changes nothing
// The GitHub rule needs gh, admin rights, and a public repository or a paid plan; when GitHub refuses, the local guard still works.
// A hook that is already there and is not ours is left alone and named.
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ruleset, verdict, hookText, repoName } from './lib/protect.mjs';
import { ghRun } from './lib/gh.mjs';

const args = process.argv.slice(2);
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
// the hooks folder is shared by every session folder of this repository
const hook = join(resolve(root, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim()), 'hooks', 'pre-push');
const flow = (() => { try { return JSON.parse(readFileSync(join(root, 'workflow/config.json'), 'utf8')).session?.flow; } catch { return undefined; } })();
const ours = () => existsSync(hook) && readFileSync(hook, 'utf8').includes('workflow/tools/protect.mjs');
const gh = (a, input) => ghRun(a, input); // lib/gh.mjs: no shell, gh's Windows place, WORKFLOW_GH in tests

function local() {
  if (existsSync(hook) && !ours()) return `this computer: not set. ${hook} is someone else's hook; add the guard to it by hand (node workflow/tools/protect.mjs --print-hook)`;
  writeFileSync(hook, hookText(flow));
  chmodSync(hook, 0o755);
  return flow === 'pr' ? 'this computer: a direct push to main is refused (git hook pre-push)' : 'this computer: a push that deletes or rewrites main is refused (git hook pre-push)';
}

function github(check) {
  const { board } = JSON.parse(readFileSync(join(root, 'workflow/config.json'), 'utf8'));
  const path = `repos/${repoName(board)}/rulesets`;
  const list = gh(['api', path]);
  if (list.error) return 'GitHub: not set. gh is not installed (https://cli.github.com), then: gh auth login';
  if (list.status === 0 && JSON.parse(list.stdout || '[]').some((r) => r.name === ruleset(flow).name)) return 'GitHub: main is protected already';
  if (check) return list.status === 0 ? 'GitHub: main is not protected (run: npm run protect)' : verdict(list.status, list.stdout + list.stderr).line;
  const made = gh(['api', '-X', 'POST', path, '--input', '-'], JSON.stringify(ruleset(flow)));
  return verdict(made.status, made.stdout + made.stderr).line;
}

if (args.includes('--print-hook')) process.stdout.write(hookText(flow));
else if (args.includes('--check')) console.log([ours() ? 'this computer: the guard is in place' : 'this computer: no guard (run: npm run protect)', github(true)].join('\n'));
else console.log([local(), ...(args.includes('--local') ? [] : [github(false)])].join('\n'));
