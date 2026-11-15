// Are the packages the project expects installed? The sessions share the main folder's node_modules through a link, so a card
// that adds a package and lands on main leaves the main folder without it until someone installs it, and nothing said so (a
// server card's tests could not run at all). This compares package-lock.json with what is in node_modules: a package missing, or
// at another version than the lock says. session.mjs runs it when it makes a session, before --serve and after --finish, and
// installs what is missing (npm install, which follows the lock).
//   node scripts/packages.mjs            say what is missing or at another version (exit 1 when anything is)
import { existsSync, readFileSync } from 'node:fs';
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

/** One line for a person: how many, and the first few by name. */
export const describeMissing = (list) => `${list.length} package${list.length === 1 ? '' : 's'} not installed as package-lock.json lists ${list.length === 1 ? 'it' : 'them'} (${list.slice(0, 5).map((p) => (p.have ? `${p.name} ${p.have}, wants ${p.want}` : `${p.name} missing`)).join('; ')}${list.length > 5 ? '; ...' : ''})`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const list = checkPackages(process.cwd());
  console.log(list.length ? `${describeMissing(list)}: run npm install` : 'packages: as package-lock.json lists them');
  process.exit(list.length ? 1 : 0);
}
