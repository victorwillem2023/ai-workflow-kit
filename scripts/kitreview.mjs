#!/usr/bin/env node
// A second pair of eyes on a change to the kit, before it is committed: a fresh agent that had no part in the change reads the
// diff and the code around it, looking for bugs only (a case that breaks, a test that would not catch its mistake, a doc that
// says what the code does not do, an update that breaks an existing project). It can read the repository but not change it.
// The author fixes each finding or tells the owner why not (CLAUDE.md at the root). Costs a review's tokens: by hand, before a commit.
//   npm run review                      what is not committed yet (staged, unstaged and new files)
//   npm run review -- --since <ref>     everything since a commit or tag (--release: since the latest tag)
//   --json   the findings as data      --agent <command>   another CLI that takes -p (tests/kitreview.test.mjs uses a stand-in)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const git = (...a) => execFileSync('git', a, { cwd: kit, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });

/** The change to review: { label, diff, files } since \`since\`, or what is not committed yet (new files in full). */
export function changeOf({ since = null, run = git } = {}) {
  // file names with -z: as written, never quoted and escaped (a new docs/café.md would otherwise be missed)
  const names = (...a) => run(...a).split('\0').map((f) => f.trim()).filter(Boolean);
  if (since) return { label: `everything since ${since}`, diff: run('diff', '--no-color', `${since}..HEAD`), files: names('diff', '--name-only', '-z', `${since}..HEAD`) };
  const tracked = run('diff', '--no-color', 'HEAD');
  const fresh = names('ls-files', '-z', '--others', '--exclude-standard').filter((f) => !/^Claude outputs\//.test(f));
  const added = fresh.map((f) => { const p = join(kit, f); return existsSync(p) ? `\n--- a new file: ${f} ---\n${readFileSync(p, 'utf8').slice(0, 40000)}` : ''; }).join('');
  return { label: 'what is not committed yet', diff: tracked + added, files: [...names('diff', '--name-only', '-z', 'HEAD'), ...fresh] };
}

/** The reviewer's brief: who it is, what to look for, what not to, and the shape of its answer. */
export function brief({ label, diff, files }) {
  return ['You review a change to the AI workflow kit (this repository) that someone else made. You had no part in it. Look for',
    'bugs only: code that breaks on some input or platform (Windows paths and shells too), a test that would pass even with',
    'the mistake it is named for, a doc or skill text that says something the code does not do, an installed project that',
    'an update (--update) would break, a lean install pointed at a command it does not have, a check that can never fail.',
    'Read the code around each change before you judge it (the repository is here; you cannot change it). No style remarks,',
    'no "consider", nothing you have not checked: each finding names a concrete input or state that goes wrong.',
    'Reply with JSON only: {"findings":[{"file":"<path>","line":<n>,"bug":"<one sentence>","fails_when":"<the concrete case>",',
    '"sure":"high|medium"}]}, most serious first, at most 10, an empty list when you find none.',
    '', `The change (${label}; ${files.length} files: ${files.slice(0, 40).join(', ')}):`, '', diff.slice(0, 150000)].join('\n');
}

/**
 * The JSON object that holds `key` in a model's answer, or null: found where `{"<key>"` starts and read to its own closing
 * brace (strings and escapes skipped), so prose with braces before or after it, or a code fence round it, does no harm.
 */
export function jsonAt(text, key) {
  const s = String(text ?? '');
  for (const m of s.matchAll(new RegExp(`\\{\\s*"${key}"`, 'g'))) {
    let depth = 0, inString = false;
    for (let i = m.index; i < s.length; i++) {
      const ch = s[i];
      if (inString) { if (ch === '\\') i++; else if (ch === '"') inString = false; continue; }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) { try { return JSON.parse(s.slice(m.index, i + 1)); } catch { break; } }
    }
  }
  return null;
}

/** The findings out of the reviewer's answer, or null when it gave none in the shape asked for. */
export function findingsOf(text) {
  const f = jsonAt(text, 'findings')?.findings;
  return Array.isArray(f) ? f : null;
}

/** The findings as lines for the author: file:line, the bug, when it fails. */
export const findingLines = (list) => (list.length ? list.map((f, i) => `${i + 1}. ${f.file}${f.line ? `:${f.line}` : ''} (${f.sure ?? '?'}): ${f.bug}\n   fails when: ${f.fails_when}`).join('\n') : 'review: no bugs found');

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const since = args.includes('--release') ? git('describe', '--tags', '--abbrev=0').trim() : opt('--since');
  // --since with nothing after it would review the uncommitted change instead, under the wrong name
  if (args.includes('--since') && (!since || since.startsWith('--'))) { console.error('review: --since needs a commit or a tag (npm run review -- --since v4.14.1)'); process.exit(1); }
  const change = changeOf({ since });
  if (!change.diff.trim()) { console.log(`review: nothing to review (${change.label} is empty)`); process.exit(0); }
  const agent = opt('--agent') ?? 'claude';
  const [cmd, ...pre] = agent.split(' ');
  if (spawnSync(cmd, [...pre, '--version'], { stdio: 'ignore', shell: win }).status !== 0) { console.log(`review: no "${agent}" here. Claude Code's CLI: npm i -g @anthropic-ai/claude-code.`); process.exit(0); }
  // read-only: it may read and search the repository and run git's reading commands, never edit, write or run anything else
  // through a shell (Windows, where the CLI is a .cmd file) an argument with a space or a bracket is quoted, or it arrives cut
  const quote = (a) => (win && /[\s"&|<>^()*]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const r = spawnSync(cmd, [...pre, '-p', '--output-format', 'json', '--model', 'opus', '--max-turns', '60',
    '--allowedTools', 'Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git show:*)', '--disallowedTools', 'Edit,Write,NotebookEdit'].map(quote),
  { cwd: kit, input: brief(change), encoding: 'utf8', shell: win, maxBuffer: 64 << 20, timeout: 20 * 60 * 1000 });
  let out = {};
  try { out = JSON.parse(r.stdout); } catch { console.error(`review: the reviewer gave no answer: ${String(r.stdout || r.stderr).slice(0, 300)}`); process.exit(1); }
  const list = findingsOf(out.result);
  if (!list) { console.error(`review: the reviewer's answer was not the findings asked for:\n${String(out.result).slice(0, 1500)}`); process.exit(1); }
  if (args.includes('--json')) console.log(JSON.stringify(list));
  else console.log(`${findingLines(list)}\n(${change.label}, ${change.files.length} files${out.total_cost_usd != null ? `, $${out.total_cost_usd.toFixed(2)}` : ''}; fix each, or tell the owner why not)`);
  process.exit(list.length ? 2 : 0);
}
