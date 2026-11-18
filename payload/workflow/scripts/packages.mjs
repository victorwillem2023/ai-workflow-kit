// Are the packages the project expects installed? The sessions share the main folder's node_modules through a link, so a card
// that adds a package and lands on main leaves the main folder without it until someone installs it, and nothing said so (a
// server card's tests could not run at all). This compares package-lock.json with what is in node_modules: a package missing, or
// at another version than the lock says. session.mjs runs it when it makes a session, before --serve and after --finish, and
// installs what is missing (npm install, which follows the lock).
//   node workflow/scripts/packages.mjs            say what is missing or at another version (exit 1 when anything is)
//   node workflow/scripts/packages.mjs --own      in a session folder: its own packages (npm ci there) instead of the main folder's
import '../tools/lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The packages the lock lists that are not installed as listed: [{ name, want, have }] (have null when missing). Optional
 * packages for another system (a native build for macOS on Windows) are not counted: npm leaves them out on purpose.
 * @param {string} lockText package-lock.json
 * @param {(name: string) => string | null} installedVersion the version in node_modules/<name>/package.json, or null
 */
export function packagesOutOfDate(lockText, installedVersion) {
  let lock;
  try { lock = JSON.parse(lockText); } catch { return []; }
  const out = [];
  for (const [key, p] of Object.entries(lock.packages ?? {})) {
    // only the top level of node_modules: what a nested folder holds is npm's own business
    const m = /^node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(key);
    if (!m || p.optional || p.link) continue;
    const have = installedVersion(m[1]);
    if (have !== p.version) out.push({ name: m[1], want: p.version, have });
  }
  return out;
}

/** The same for a project folder: its package-lock.json against its node_modules (empty when it has no lock). */
export function checkPackages(dir) {
  const lock = join(dir, 'package-lock.json');
  if (!existsSync(lock)) return [];
  return packagesOutOfDate(readFileSync(lock, 'utf8'), (name) => {
    try { return JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8')).version ?? null; } catch { return null; }
  });
}

/**
 * The commands the project's own packages give that have no shortcut in node_modules/.bin: [{ pkg, bin }]. Removing a session
 * folder once emptied the main folder's .bin through its link (tsc, tsx gone: "'tsc' is not recognized" in every gate) while the
 * packages themselves stayed, so checkPackages saw nothing; `npm rebuild` puts the shortcuts back.
 * @param {Record<string, unknown>} pkg package.json
 * @param {(name: string) => Record<string, unknown> | null} manifest node_modules/<name>/package.json, or null when not installed
 * @param {(bin: string) => boolean} hasShortcut whether node_modules/.bin/<bin> is there
 */
export function missingShortcuts(pkg, manifest, hasShortcut) {
  const names = Object.keys({ ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) });
  return names.flatMap((name) => {
    const m = manifest(name);
    if (!m?.bin) return [];
    // "bin": "./cli.js" is named after the package (its last part, for a scoped one); an object names each command
    const bins = typeof m.bin === 'string' ? [String(m.name ?? name).split('/').pop()] : Object.keys(m.bin);
    return bins.filter((bin) => !hasShortcut(bin)).map((bin) => ({ pkg: name, bin }));
  });
}

/** The same for a project folder (empty when it has no package.json or no node_modules). */
export function checkShortcuts(dir) {
  const read = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
  const pkg = read(join(dir, 'package.json'));
  if (!pkg || !existsSync(join(dir, 'node_modules'))) return [];
  return missingShortcuts(pkg, (name) => read(join(dir, 'node_modules', name, 'package.json')), (bin) => existsSync(join(dir, 'node_modules', '.bin', bin)));
}

/**
 * What to run for the missing ones. In a session folder node_modules is a link to the main folder's, so a package the session
 * added goes into that shared folder without touching the main folder's package.json or lock (--no-save); it lands there for real
 * when the session is finished. Elsewhere: npm install.
 */
export function packagesFix(dir, list) {
  let linked = false;
  try { linked = lstatSync(join(dir, 'node_modules')).isSymbolicLink(); } catch { /* no node_modules at all: npm install */ }
  if (!linked) return 'run npm install';
  const target = realpathSync(join(dir, 'node_modules')).replace(/[\\/]node_modules$/, '');
  return `this session shares the main folder's packages. Either the main folder gets them: cd "${target}" && npm install --no-save `
    + `${list.map((p) => `${p.name}@${p.want}`).join(' ')} (it writes in the main folder, so a permission rule may ask the owner), `
    + 'or this session gets its own copy and nothing outside it changes: node workflow/scripts/packages.mjs --own (slower: a full npm ci here)';
}

/** --own: the session's link to the main folder's packages is taken away (never followed) and npm ci installs its own copy. */
function ownPackages(dir) {
  const link = join(dir, 'node_modules');
  let linked = false;
  try { linked = lstatSync(link).isSymbolicLink(); } catch { /* none */ }
  if (linked) unlinkSync(link);
  // a shell only on Windows, where npm is a .cmd file; the arguments are fixed, never outside input
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const r = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status ?? 1;
}

/** One line for a person: how many, and the first few by name. */
export const describeMissing = (list) => `${list.length} package${list.length === 1 ? '' : 's'} not installed as package-lock.json lists ${list.length === 1 ? 'it' : 'them'} (${list.slice(0, 5).map((p) => (p.have ? `${p.name} ${p.have}, wants ${p.want}` : `${p.name} missing`)).join('; ')}${list.length > 5 ? '; ...' : ''})`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--own')) process.exit(ownPackages(process.cwd()));
  const list = checkPackages(process.cwd());
  console.log(list.length ? `${describeMissing(list)}: ${packagesFix(process.cwd(), list)}` : 'packages: as package-lock.json lists them');
  process.exit(list.length ? 1 : 0);
}
