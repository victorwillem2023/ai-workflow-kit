// The settings part of install.mjs: Claude Code's allow and deny rules, workflow.config.json (a UI framework's boards, another
// language's commands, on --update the settings the kit has and the project lacks, each module's own settings, and the CLAUDE.md
// budget the kit's doc move grew), and the project files written once (Dependabot, .gitignore lines, .gitattributes). Each
// function gets what it works on as arguments; install.mjs runs them in order.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { moduleNeeds } from './install-choices.mjs';

// the commands the kit's own checks had before, by name: a project still on one of them gets the new one on --update
export const OLD_COMMANDS = { unused: ['npx --no-install knip --no-progress'] };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * JSON laid out the way the kit's config is written, so writing it back does not reflow it: a short list, or a small object of
 * plain values and lists, stays on one line (up to 170 characters, as the kit's own config); anything longer opens up, one entry a line. The top level
 * always opens up.
 */
export function formatJson(value, indent = '') {
  const inner = `${indent}  `;
  const fits = (s) => !s.includes('\n') && indent.length + s.length <= 170;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const one = `[${value.map((x) => formatJson(x, inner)).join(', ')}]`;
    return indent && fits(one) ? one : `[\n${value.map((x) => `${inner}${formatJson(x, inner)}`).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    const flat = entries.every(([, x]) => x === null || typeof x !== 'object' || Array.isArray(x));
    const one = `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${formatJson(x, inner)}`).join(', ')} }`;
    return indent && flat && fits(one) ? one : `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${formatJson(x, inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}
/** Each top-level key's text in a JSON object, exactly as written ("key": value, without the comma after it). */
function topLevelTexts(text) {
  const out = new Map();
  let depth = 0, inString = false, start = -1, key = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (c === '\\') i++; else if (c === '"') inString = false; continue; }
    if (c === '"') { if (depth === 1 && start < 0) { start = i; key = JSON.parse(text.slice(i, text.indexOf('"', i + 1) + 1)); } inString = true; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0 && start >= 0) { out.set(key, text.slice(start, i).trimEnd()); start = -1; } }
    else if (c === ',' && depth === 1 && start >= 0) { out.set(key, text.slice(start, i).trimEnd()); start = -1; }
  }
  return out;
}

/**
 * The JSON written back without reflowing what did not change: a top-level key whose value is the same keeps its text exactly as
 * it was (its one-line lists, its own layout); only a new or changed key is laid out by formatJson.
 */
export function rewriteJson(before, value) {
  let old;
  try { old = JSON.parse(before); } catch { return `${formatJson(value)}\n`; }
  return `{\n${entriesText(topLevelTexts(before), old, value, '  ').join(',\n')}\n}\n`;
}
/** Each key of `now` as text: unchanged, exactly as it was written (its own spacing too); changed, its value kept where it can be. */
const entriesText = (texts, was, now, inner) => Object.entries(now).map(([k, v]) => (!texts.has(k) ? `${inner}${JSON.stringify(k)}: ${formatJson(v, inner)}`
  : same(was[k], v) ? `${inner}${texts.get(k)}` : `${inner}${JSON.stringify(k)}: ${keepText(valueText(texts.get(k), k), was[k], v, inner)}`));
/** The value's text in a `"key": value` piece. */
const valueText = (piece, key) => piece.slice(piece.indexOf(':', JSON.stringify(key).length) + 1).trim();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/**
 * A value written back from its old text: unchanged, the old text; a list that only grew at its end, the old text with the new
 * entries added in its own layout (one line stays one line); an object, each key the same way; anything else laid out anew.
 */
function keepText(text, was, now, indent) {
  if (same(was, now)) return text;
  if (Array.isArray(was) && Array.isArray(now) && was.length && now.length > was.length && was.every((x, i) => same(x, now[i]))) {
    const end = text.lastIndexOf(']');
    const extra = now.slice(was.length);
    if (!text.includes('\n')) return `${text.slice(0, end).trimEnd()}, ${extra.map((x) => formatJson(x, `${indent}  `)).join(', ')}]`;
    const lastLine = text.slice(0, end).trimEnd().split('\n').at(-1);
    const pad = /^\s*/.exec(lastLine)[0] || `${indent}  `;
    return `${text.slice(0, end).trimEnd()},\n${extra.map((x) => `${pad}${formatJson(x, pad)}`).join(',\n')}${text.slice(text.slice(0, end).trimEnd().length)}`;
  }
  if (was && now && typeof was === 'object' && typeof now === 'object' && !Array.isArray(was) && !Array.isArray(now) && text.includes('\n')) {
    return `{\n${entriesText(topLevelTexts(text), was, now, `${indent}  `).join(',\n')}\n${indent}}`;
  }
  return formatJson(now, indent);
}
const writeJson = (p, v) => writeFileSync(p, existsSync(p) ? rewriteJson(readFileSync(p, 'utf8'), v) : `${formatJson(v)}\n`);

/**
 * Claude Code's settings are the project's own after the first install, but the kit's allow and deny rules it lacks are added, so a
 * project made earlier also gets a new rule (agents never skip the push guard: --no-verify, --force, another hooks path).
 * Returns the rules added.
 */
export function addClaudeRules({ target, kit }) {
  const own = join(target, '.claude', 'settings.local.json');
  if (!existsSync(own)) return [];
  const kitRules = readJson(join(kit, 'starter', 'settings.local.json')).permissions ?? {};
  const mine = readJson(own);
  mine.permissions ??= {};
  const added = [];
  for (const kind of ['allow', 'deny']) {
    const list = (mine.permissions[kind] ??= []);
    for (const r of kitRules[kind] ?? []) if (!list.includes(r)) { list.push(r); added.push(`${kind} ${r}`); }
  }
  if (added.length) writeJson(own, mine);
  return added;
}

/**
 * workflow.config.json, after the files are copied. A config just written: a UI framework draws /ui variants as components, another
 * language gets its commands. On --update: the settings the kit has and the project lacks (a whole key, or a check or import rule
 * by its name; nothing is changed), and the CLAUDE.md budget grows by the bytes the kit's doc move alone added. Always: each
 * module's own settings (modules/<name>/config.json). Returns the settings added, one line each.
 */
export function settleConfig({ target, kit, fill, langConfig, framework, modules, update, justWritten, claudeGrowth }) {
  const cfgPath = join(target, 'workflow.config.json');
  const added = [];
  // (written again only when something changes, so a fresh config keeps the starter's own layout)
  if (justWritten) {
    const cfg = readJson(cfgPath);
    const ui = framework && cfg.ui;
    if (ui) cfg.ui.boards = 'components';
    if (ui || langConfig) writeJson(cfgPath, { ...cfg, ...(langConfig ?? {}) });
  }
  if (update && !justWritten) {
    const mine = readJson(cfgPath);
    const kits = { ...JSON.parse(fill(readFileSync(join(kit, 'starter', 'workflow.config.json'), 'utf8'))), ...(langConfig ?? {}) };
    for (const [k, v] of Object.entries(kits)) {
      if (!(k in mine)) {
        mine[k] = k === 'checks' ? v.filter((c) => c.name !== 'lint') : v;
        // a project that has a UI framework draws its /ui variants as components, as a new install would set it
        if (k === 'ui' && framework) mine.ui = { ...v, boards: 'components' };
        added.push(k === 'ui' && framework ? 'ui (boards: components, because the project has a UI framework)' : k);
        continue;
      }
      // an import rule the kit has and the project lacks, by its name (a folder the project does not have matches nothing)
      if (k === 'boundaries') for (const r of v) {
        const same = mine.boundaries.find((x) => x.name === r.name);
        if (!same) { mine.boundaries.push(r); added.push(`import rule: ${r.name}`); }
        // the kit's own rule, by its name, that the kit has since given a stated exception: the exception is added, nothing else
        else if (r.except && !same.except) { same.except = r.except; added.push(`import rule "${r.name}": except ${r.except.join(', ')}`); }
      }
      if (k === 'checks') for (const c of v) if (c.name !== 'lint' && !mine.checks.some((x) => x.name === c.name)) { mine.checks.push(c); added.push(`checks: ${c.name}`); }
      // a card type the skills offer (spike, say) that the project's board does not know yet: added, never one taken away
      if (k === 'board' && Array.isArray(v.types) && Array.isArray(mine.board?.types)) for (const t of v.types) {
        if (!mine.board.types.includes(t)) { mine.board.types.push(t); added.push(`board.types: ${t} (its label goes on GitHub with npm run board -- --init)`); }
      }
      // kit 2.9: the docs' subject folders are checked like the top of docs/ (the doc-layout folders the kit's include names)
      if (k === 'docs' && Array.isArray(mine.docs?.include)) for (const g of v.include.filter((x) => /^docs\/[a-z]+\/\*\.md$/.test(x))) {
        if (!mine.docs.include.includes(g)) { mine.docs.include.push(g); added.push(`docs.include: ${g}`); }
      }
      if (v && typeof v === 'object' && !Array.isArray(v) && typeof mine[k] === 'object') for (const [kk, vv] of Object.entries(v)) if (!(kk in mine[k]) && ['functions', 'copies', 'session'].includes(k)) { mine[k][kk] = vv; added.push(`${k}.${kk}`); }
    }
    // the kit's own doc move made CLAUDE.md longer (its paths): when that takes it over its budget, the budget grows by exactly that
    // much, so the gate fails a project for what it wrote, never for the kit's move
    const budget = mine.budget?.['CLAUDE.md'];
    const claudeSize = existsSync(join(target, 'CLAUDE.md')) ? Buffer.byteLength(readFileSync(join(target, 'CLAUDE.md'), 'utf8')) : 0;
    if (claudeGrowth > 0 && typeof budget === 'number' && claudeSize > budget && claudeSize - claudeGrowth <= budget) {
      mine.budget['CLAUDE.md'] = budget + claudeGrowth;
      added.push(`budget.CLAUDE.md ${budget} -> ${budget + claudeGrowth} (the ${claudeGrowth} bytes the longer doc paths of kit 2.9 added)`);
    }
    if (added.length) writeJson(cfgPath, mine);
  }
  // a module's own settings, on a new install and an update alike: a key the project lacks is added whole; "egress" adds its hosts
  // to security.egress when the project keeps an outbound allowlist
  const mine = readJson(cfgPath);
  let changed = false;
  for (const m of modules) {
    const file = join(kit, 'modules', m, 'config.json');
    if (!existsSync(file)) continue;
    const { egress = [], ...rest } = readJson(file);
    for (const [k, v] of Object.entries(rest)) if (!(k in mine)) { mine[k] = v; added.push(`${k} (the ${m} module)`); changed = true; }
    if (Array.isArray(mine.security?.egress)) for (const h of egress) if (!mine.security.egress.includes(h)) { mine.security.egress.push(h); added.push(`security.egress: ${h} (the ${m} module)`); changed = true; }
  }
  if (changed) writeJson(cfgPath, mine);
  return added;
}

/**
 * The project files written once, then the project's: Dependabot (only without Renovate, which would double every pull request),
 * the kit's .gitignore lines it lacks, and .gitattributes (LF everywhere, Windows scripts CRLF). Returns a hint when an existing
 * .gitattributes lacks LF, else ''.
 */
const KNIP_CONFIGS = ['knip.json', 'knip.jsonc', '.knip.json', '.knip.jsonc', 'knip.ts', 'knip.js', 'knip.config.ts', 'knip.config.js'];
/**
 * knip's start files, read from the build (a TypeScript project with no knip config of its own): the files a script that
 * package.json runs or vite.config names as entry points, and index.html's module script. Without them knip calls the whole app
 * unused. Written once as knip.json (with knip's usual start files beside them); never over a config the project has.
 */
export function knipEntries(target) {
  const read = (f) => { try { return readFileSync(join(target, f), 'utf8'); } catch { return ''; } };
  const pkg = (() => { try { return JSON.parse(read('package.json')); } catch { return {}; } })();
  if (pkg.knip || KNIP_CONFIGS.some((f) => existsSync(join(target, f)))) return null;
  const scripts = Object.values(pkg.scripts ?? {}).join('\n');
  const ran = [...scripts.matchAll(/\bnode\s+([\w./-]+\.m?[jt]s)\b/g)].map((m) => m[1]).filter((f) => !f.startsWith('tools/workflow/'));
  const texts = [scripts, ...ran.map(read), ...['vite.config.ts', 'vite.config.js', 'vite.config.mjs'].map(read)];
  const found = new Set();
  for (const t of texts) for (const m of t.matchAll(/['"`](?:\.\/)?((?:src|app|web|client|server)\/[\w./-]+\.(?:m?[jt]sx?))['"`]/g)) found.add(m[1]);
  for (const m of read('index.html').matchAll(/<script[^>]*type=["']module["'][^>]*src=["']\/?([\w./-]+)["']/g)) found.add(m[1]);
  const entries = [...found].filter((f) => existsSync(join(target, f))).sort();
  return entries.length ? entries : null;
}

export function writeProjectFiles({ target, kit, lang, langs, modules, update, done, projectNode }) {
  let knipNote = '';
  const entries = lang === 'ts' ? knipEntries(target) : null;
  if (entries) {
    const usual = ['{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}', 'src/{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'];
    writeFileSync(join(target, 'knip.json'), `${formatJson({ entry: [...entries, ...usual] })}\n`);
    done.added.push('knip.json');
    knipNote = `  knip.json: the unused check starts from the files the build starts from (${entries.join(', ')}); add any it missed`;
  }
  const hint = writeProjectFilesRest({ target, kit, lang, langs, modules, update, done, projectNode });
  return [knipNote, hint].filter(Boolean).join('\n');
}

function writeProjectFilesRest({ target, kit, lang, langs, modules, update, done, projectNode }) {
  // the kit's .tool-versions, just written, never contradicts the Node the project already names (engines, Dockerfile, .nvmrc)
  const tv = join(target, '.tool-versions');
  if (projectNode && done.added.includes('.tool-versions') && existsSync(tv)) {
    const kitMajor = Number(/nodejs\s+(\d+)/.exec(readFileSync(tv, 'utf8'))?.[1]);
    // engines ">=24" is a floor the kit's Node keeps: only a version the project names, or a floor above the kit's, changes it
    let floor = false;
    try { floor = projectNode.from === 'package.json engines' && /^\s*>=?\s*\d/.test(JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).engines.node); } catch { /* none */ }
    if (kitMajor && kitMajor !== projectNode.major && !(floor && kitMajor > projectNode.major)) writeFileSync(tv, readFileSync(tv, 'utf8').replace(/^nodejs\s+\S+/m, `nodejs ${projectNode.major}`));
  }
  const botPath = join(target, '.github', 'dependabot.yml');
  if (!existsSync(botPath) && !existsSync(join(target, 'renovate.json'))) {
    const kinds = [langs[lang].dependabot ?? 'npm', 'github-actions', ...moduleNeeds(modules).dependabot];
    mkdirSync(dirname(botPath), { recursive: true });
    writeFileSync(botPath, '# Dependency updates: one small pull request a week per kind; the gate runs on each. Merge it on GitHub when it is green.\nversion: 2\nupdates:\n'
      + kinds.map((k) => `  - package-ecosystem: ${k}\n    directory: /\n    schedule:\n      interval: weekly\n    cooldown:\n      default-days: 7\n    groups:\n      all:\n        patterns: ["*"]\n`).join(''));
    done.added.push('.github/dependabot.yml');
  }
  const giPath = join(target, '.gitignore');
  const have = new Set((existsSync(giPath) ? readFileSync(giPath, 'utf8') : '').split(/\r?\n/).map((l) => l.trim()));
  const lines = [...readFileSync(join(kit, 'starter', 'gitignore.txt'), 'utf8').split(/\r?\n/), ...(langs[lang].gitignore ?? [])].filter((l) => l.trim());
  // a comment goes in only with a line of its own group (the lines under it, up to the next comment) that is added too
  const add = lines.filter((l, i) => {
    if (!l.startsWith('#')) return !have.has(l.trim());
    for (let j = i + 1; j < lines.length && !lines[j].startsWith('#'); j++) if (!have.has(lines[j].trim())) return !have.has(l.trim());
    return false;
  });
  if (add.length) writeFileSync(giPath, `${existsSync(giPath) ? readFileSync(giPath, 'utf8').replace(/\n?$/, '\n') : ''}${add.join('\n')}\n`);
  // line endings: LF everywhere, in the repository and on disk, whatever git's own setting says (Git for Windows sets
  // core.autocrlf=true, which made every `git add` warn "LF will be replaced by CRLF"); Windows scripts are the one exception
  const gaPath = join(target, '.gitattributes');
  if (!existsSync(gaPath)) {
    writeFileSync(gaPath, '# Line endings: LF in the repository and on disk on every computer, whatever git\'s own core.autocrlf says.\n'
      + '# Windows scripts are the exception: cmd.exe wants CRLF.\n* text=auto eol=lf\n*.cmd text eol=crlf\n*.bat text eol=crlf\n'
      + '*.png binary\n*.jpg binary\n*.gif binary\n*.ico binary\n*.webp binary\n*.woff2 binary\n*.pdf binary\n');
    done.added.push('.gitattributes');
    return '';
  }
  return update && !/eol=lf/.test(readFileSync(gaPath, 'utf8')) ? '  .gitattributes has no `* text=auto eol=lf`: without it git on Windows warns "LF will be replaced by CRLF" on every add' : '';
}

/**
 * --check: the machinery files of the kit (its payload and the modules') that are missing in the project or differ, line endings
 * aside; `chosenOut` leaves out what the project chose not to have.
 */
export function machineryDiffs({ kit, target, modules, fill, text, walk, chosenOut = () => false }) {
  const same = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
  const roots = [join(kit, 'payload'), ...modules.map((m) => join(kit, 'modules', m, 'payload')).filter((d) => existsSync(d))];
  const lines = [];
  for (const from of roots) for (const src of walk(from)) {
    const rel = relative(from, src).replace(/\\/g, '/');
    // what the project chose not to have (a part left out, a stage not reached, a file it skips) is not missing
    if (chosenOut(rel)) continue;
    const dest = join(target, rel);
    if (!existsSync(dest)) lines.push(`missing  ${rel}`);
    else if (text.test(src) && !same(fill(readFileSync(src, 'utf8'), src), readFileSync(dest, 'utf8'))) lines.push(`differs  ${rel}`);
  }
  return lines;
}
