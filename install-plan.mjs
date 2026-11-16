// install.mjs --dry-run: what the installer would do, without touching the project. The same installer runs on a copy of the
// project in a temporary folder (its files as git sees them, not the ignored ones; its record; its origin, so the same choices are
// found), and what changed there is the plan: the files it would add, change, move and remove, and the installer's own report.
// Exact by construction (it is the same code, not a second idea of it). The copy is removed after.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';

const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });

/** The project's files as git sees them (tracked, and new ones that are not ignored); without git, every file but node_modules. */
function projectFiles(target) {
  const listed = git(target, 'ls-files', '--cached', '--others', '--exclude-standard');
  if (listed.status === 0) return listed.stdout.split('\n').filter((f) => f && existsSync(join(target, f)) && statSync(join(target, f)).isFile());
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name === '.git' ? []
    : e.isDirectory() ? walk(join(d, e.name)) : [relative(target, join(d, e.name)).replace(/\\/g, '/')]));
  return walk(target);
}

/** Runs the installer on a copy and prints the plan. `args`: the command line without --dry-run. Returns the exit code. */
export function dryRun({ kit, target, args }) {
  const tmp = mkdtempSync(join(tmpdir(), 'kit-plan-'));
  // the same folder name, so a prefix or a name found from it is the same
  const copy = join(tmp, basename(target));
  try {
    for (const f of projectFiles(target)) { mkdirSync(dirname(join(copy, f)), { recursive: true }); copyFileSync(join(target, f), join(copy, f)); }
    mkdirSync(copy, { recursive: true });
    git(copy, 'init', '-q', '-b', 'main');
    const origin = git(target, 'remote', 'get-url', 'origin').stdout?.trim();
    if (origin) git(copy, 'remote', 'add', 'origin', origin);
    git(copy, 'add', '-A');
    git(copy, '-c', 'user.name=plan', '-c', 'user.email=plan@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'as it is');
    const run = spawnSync(process.execPath, [join(kit, 'install.mjs'), copy, ...args.slice(1)], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const said = `${run.stdout}${run.stderr}`.replaceAll(copy, target).trim();
    git(copy, 'add', '-A');
    const changes = git(copy, 'diff', '--cached', '--name-status', '-M', 'HEAD').stdout.split('\n').filter(Boolean).map((l) => l.split('\t'));
    const group = (code) => changes.filter(([c]) => c.startsWith(code));
    // a long list (a first install adds hundreds) by folder, with how many in each; a short one file by file
    const names = (rows, show = (r) => r[1]) => {
      if (rows.length <= 25) return rows.map((r) => `    ${show(r)}`).join('\n');
      const by = new Map();
      for (const r of rows) {
        const parts = r[1].split('/');
        const depth = r[1].startsWith('.') || r[1].startsWith('docs/') ? 2 : 1; // .claude/skills/, workflow/guides/: one level deeper
        const key = parts.length > depth ? `${parts.slice(0, depth).join('/')}/` : r[1];
        by.set(key, (by.get(key) ?? 0) + 1);
      }
      return [...by].map(([d, n]) => `    ${d}${d.endsWith('/') ? `  (${n} file${n === 1 ? '' : 's'})` : ''}`).join('\n');
    };
    const out = [`Dry run: nothing was written to ${target}. The installer would say:`, said.split('\n').map((l) => `  | ${l}`).join('\n')];
    if (!changes.length) out.push('and change no file.');
    for (const [code, what] of [['A', 'add'], ['M', 'change'], ['R', 'move'], ['D', 'remove']]) {
      const rows = group(code);
      if (rows.length) out.push(`It would ${what} ${rows.length} file${rows.length === 1 ? '' : 's'}:\n${names(rows, code === 'R' ? (r) => `${r[1]} -> ${r[2]}` : undefined)}`);
    }
    console.log(out.join('\n'));
    return run.status ?? 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
