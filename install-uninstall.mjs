// install.mjs --uninstall: the kit taken out of a project again, and nothing of the project's with it. What goes: every kit file
// that is still exactly as the kit wrote it (its stamp in workflow/record), the OpenCode commands made from the kit's skills, the
// kit's marked parts of CLAUDE.md, the kit's rules and hooks in .claude/settings.local.json, the kit's npm scripts that still
// run the kit's command, the record and the git config line. What stays, and is named: a kit file the project changed, and the
// files the kit wrote once that became the project's (the config, CLAUDE.md's own text, the docs it filled, specs).
// --dry-run (install-plan.mjs) shows all of it first. Returns the report's lines.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { rewriteJson } from './install-config.mjs';

const TEXT = /(\.(md|mjs|js|ts|json|mts|txt|html|css|toml|cmd|ya?ml|tpl)|Dockerfile)$/;
const hash = (text) => createHash('sha1').update(String(text).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/** Removes a file and the folders it leaves empty, never the project folder itself. */
function remove(target, path) {
  rmSync(path);
  for (let d = dirname(path); d.startsWith(target) && d !== target && existsSync(d) && readdirSync(d).length === 0; d = dirname(d)) rmSync(d, { recursive: true });
}

export function uninstall({ target, kit }) {
  const markFile = join(target, 'workflow/record');
  if (!existsSync(markFile)) return ['Nothing to take out: this project has no workflow/record (the kit was never installed here, or is gone already).'];
  const mark = readFileSync(markFile, 'utf8');
  const stamps = mark.split(/\r?\n/).map((l) => /^sha (\S+) (.+)$/.exec(l)).filter(Boolean).map((m) => [m[2], m[1]]);
  const removed = [], changed = [], cleaned = [];
  // 1. the kit's files, as it wrote them
  for (const [f, h] of stamps) {
    const p = join(target, f);
    if (!existsSync(p)) continue;
    if (hash(readFileSync(p, TEXT.test(f) ? 'utf8' : 'latin1')) === h) { remove(target, p); removed.push(f); } else changed.push(f);
  }
  // 2. the OpenCode commands made from the kit's skills (npm run harness writes them again from the skills each time)
  const kitSkills = new Set([join(kit, 'payload', '.claude', 'skills'), ...readdirSync(join(kit, 'modules')).map((m) => join(kit, 'modules', m, 'payload', '.claude', 'skills'))]
    .filter((d) => existsSync(d)).flatMap((d) => readdirSync(d)));
  const oc = join(target, '.opencode', 'commands');
  if (existsSync(oc)) for (const f of readdirSync(oc)) if (kitSkills.has(f.replace(/\.md$/, ''))) { remove(target, join(oc, f)); removed.push(`.opencode/commands/${f}`); }
  // and the stop-point plugin npm run harness writes (generated too: the kit's own whatever is in it)
  const plugin = join(target, '.opencode', 'plugins', 'stop-points.js');
  if (existsSync(plugin)) { remove(target, plugin); removed.push('.opencode/plugins/stop-points.js'); }
  // 3. the kit's parts of every CLAUDE.md (the root one and the folder notes), between their markers; the project's own text stays
  const notes = (spawnSync('git', ['-C', target, 'ls-files', '--cached', '--others', '--exclude-standard', 'CLAUDE.md', '*/CLAUDE.md'], { encoding: 'utf8' }).stdout ?? '')
    .split('\n').filter((f) => f && existsSync(join(target, f)));
  for (const f of new Set(['CLAUDE.md', ...notes].filter((x) => existsSync(join(target, x))))) {
    const was = readFileSync(join(target, f), 'utf8');
    const now = was.replace(/\r?\n?<!-- kit:([\w-]+) -->[\s\S]*?<!-- \/kit:\1 -->\r?\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
    if (now !== was) { writeFileSync(join(target, f), now); cleaned.push(`${f}: the kit's marked parts taken out, your own text kept`); }
  }
  // 4. the kit's rules and hooks in Claude Code's settings; the project's own stay (the file goes when nothing is left)
  const settingsAt = join(target, '.claude', 'settings.local.json');
  const mine = readJson(settingsAt), kits = readJson(join(kit, 'starter', 'settings.local.json'));
  if (mine && kits) {
    for (const kind of ['allow', 'deny']) if (mine.permissions?.[kind]) mine.permissions[kind] = mine.permissions[kind].filter((r) => !(kits.permissions?.[kind] ?? []).includes(r));
    const kitHooks = new Set(Object.values(kits.hooks ?? {}).flat().flatMap((g) => (g.hooks ?? []).map((h) => h.command)));
    for (const [event, groups] of Object.entries(mine.hooks ?? {})) {
      mine.hooks[event] = groups.map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !kitHooks.has(h.command)) })).filter((g) => g.hooks.length);
      if (!mine.hooks[event].length) delete mine.hooks[event];
    }
    if (mine.hooks && !Object.keys(mine.hooks).length) delete mine.hooks;
    const empty = !mine.hooks && Object.keys(mine).every((k) => k === 'permissions' || k === 'hooks') && !(mine.permissions?.allow?.length || mine.permissions?.deny?.length);
    if (empty) { remove(target, settingsAt); removed.push('.claude/settings.local.json'); } else { writeFileSync(settingsAt, `${JSON.stringify(mine, null, 2)}\n`); cleaned.push('.claude/settings.local.json: the kit\'s rules and hooks taken out'); }
  }
  // 5. the kit's npm scripts, where they still run the kit's own command
  const pkgAt = join(target, 'package.json');
  const pkg = readJson(pkgAt);
  if (pkg?.scripts) {
    const kitScripts = { ...readJson(join(kit, 'starter', 'package-scripts.json')) };
    for (const m of readdirSync(join(kit, 'modules'))) Object.assign(kitScripts, readJson(join(kit, 'modules', m, 'package-scripts.json')) ?? {});
    const gone = Object.keys(pkg.scripts).filter((k) => kitScripts[k] === pkg.scripts[k]);
    if (gone.length) {
      const was = readFileSync(pkgAt, 'utf8');
      for (const k of gone) delete pkg.scripts[k];
      writeFileSync(pkgAt, rewriteJson(was.replace(/\r\n/g, '\n'), pkg));
      cleaned.push(`package.json: the kit's scripts taken out (${gone.join(', ')})`);
    }
  }
  // 6. the record and this clone's note of where the kit is
  remove(target, markFile);
  removed.push('workflow/record');
  spawnSync('git', ['-C', target, 'config', '--unset', 'workflow.kit'], { stdio: 'ignore' });
  const left = ['workflow/config.json', 'docs', 'workflow/specs', 'opencode.jsonc', 'renovate.json', '.github/dependabot.yml'].filter((f) => existsSync(join(target, f)));
  return [
    `The kit is out of ${target}: ${removed.length} of its files removed, as it wrote them.`,
    ...cleaned.map((l) => `  ${l}`),
    ...(changed.length ? [`  kept, because you changed them (delete them if you do not need them):\n${changed.map((f) => `    ${f}`).join('\n')}`] : []),
    ...(left.length ? [`  yours now, left as they are (the kit wrote them once; delete what you do not want): ${left.join(', ')}`] : []),
    '  Commit the change when it looks right (git status shows it); the packages the kit asked for (tsx, knip, biome) are still in package.json.',
  ];
}
