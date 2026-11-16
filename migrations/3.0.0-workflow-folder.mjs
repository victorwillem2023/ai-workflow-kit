// Kit 3.0.0: the kit's own files moved under workflow/ (kit-layout.mjs has the table). Run by install.mjs before it reads anything,
// because the record and the settings are among what moves (.workflow-kit is workflow/record now). An older project's files move
// with git (their history follows; the waiting specs, which git ignores, are moved as files), and every old kit path in its own
// text is rewritten. A project from before 2.9 gets the 2.9 docs move in the same pass (doc-layout.mjs), so a kit guide at the top
// of docs/ goes straight to workflow/guides/. The changelog and decision records keep their old paths (they are history), and so do
// the waiting specs (the owner approved them as they are: they are named instead). Returns { moved, said, claudeGrowth }.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CORRECTIONS, MOVES, movePaths } from '../doc-layout.mjs';
import { FILE_MOVES, FOLDER_MOVES, moveKitPaths } from '../kit-layout.mjs';

const PROJECT_TEXT = /\.(md|mjs|cjs|js|jsx|ts|tsx|mts|json|jsonc|txt|html|css|toml|cmd|ps1|sh|ya?ml|tpl|py|go|rs)$|(^|\/)(Dockerfile|record|\.gitignore)$/;
const OLD_TESTS = 'tests/**/*.test.ts';
const NEW_TESTS = '{tests,workflow/tests}/**/*.test.ts';

/**
 * The settings as 3.0 needs them, from the text as an older kit left them (the self-test applies it to the "before" too): the
 * kit's tests are found in workflow/tests/ as well, the gate reads workflow/, and the kit's lint command no longer names tests/
 * (a project without tests of its own no longer has it; Biome's own config says what to read).
 */
export function newConfigText(text) {
  return String(text)
    .replace(`"tests": "${OLD_TESTS}"`, `"tests": "${NEW_TESTS}"`)
    .replace(/"roots": \[([^\]]*)\]/, (m, list) => (list.includes('"workflow"') ? m : `"roots": [${list}, "workflow"]`))
    .replace('"npx --no-install biome check --no-errors-on-unmatched src tests"', '"npx --no-install biome check --no-errors-on-unmatched ."');
}

/** True when the project still has the layout from before 3.0 (its record at the root). */
export const beforeWorkflowFolder = (target) => existsSync(join(target, '.workflow-kit')) && !existsSync(join(target, 'workflow', 'record'));

export function moveToWorkflowFolder(target) {
  if (!beforeWorkflowFolder(target)) return { moved: [], said: [], claudeGrowth: 0 };
  const git = (...a) => spawnSync('git', a, { cwd: target, encoding: 'utf8', maxBuffer: 64 << 20 });
  const moved = [];
  const move = (from, to) => {
    const a = join(target, from), b = join(target, to);
    if (!existsSync(a) || existsSync(b)) return;
    mkdirSync(dirname(b), { recursive: true });
    if (git('mv', from, to).status !== 0) renameSync(a, b); // not tracked (the waiting specs): moved as a file
    moved.push(`${from} -> ${to}`);
  };
  // the 2.9 docs move first (a project from before 2.9), then the 3.0 one: a kit guide ends in workflow/guides/
  for (const [from, to] of [...MOVES, ...CORRECTIONS]) move(from, to);
  for (const [from, to] of FILE_MOVES) move(from, to);
  for (const [from, to] of FOLDER_MOVES) {
    const a = join(target, from.slice(0, -1));
    if (!existsSync(a)) continue;
    if (!existsSync(join(target, to.slice(0, -1)))) { move(from.slice(0, -1), to.slice(0, -1)); continue; }
    // the new folder is there already (a kit file landed in it): move what is inside, one by one
    for (const f of readdirSync(a, { recursive: true }).map(String)) if (statSync(join(a, f)).isFile()) move(`${from}${f.replace(/\\/g, '/')}`, `${to}${f.replace(/\\/g, '/')}`);
  }
  // the old paths in the project's own text, the record (its sha lines name the files) and the settings included
  const listed = (git('ls-files', '--cached', '--others', '--exclude-standard').stdout ?? '').split('\n');
  const specs = existsSync(join(target, 'workflow', 'workflow/specs')) ? readdirSync(join(target, 'workflow', 'workflow/specs')).map((f) => `workflow/specs/${f}`) : [];
  const rewritten = [], specsNaming = [];
  let claudeGrowth = 0;
  for (const f of [...new Set([...listed, ...specs, 'workflow/record'])].filter((x) => x && PROJECT_TEXT.test(x) && !x.startsWith('node_modules/'))) {
    if (f === 'CHANGELOG.md' || f.startsWith('docs/decisions/')) continue;
    const p = join(target, f);
    // (a text file over a megabyte is data or generated, never a page that names a kit path)
    if (!existsSync(p) || !statSync(p).isFile() || statSync(p).size > 1_000_000) continue;
    const was = readFileSync(p, 'utf8');
    const now = moveKitPaths(movePaths(was));
    if (now === was) continue;
    if (f.startsWith('workflow/specs/')) { specsNaming.push(f); continue; }
    writeFileSync(p, now);
    if (f !== 'workflow/record') rewritten.push(f);
    if (f === 'CLAUDE.md') claudeGrowth = Buffer.byteLength(now) - Buffer.byteLength(was);
  }
  // the kit's own tests are in workflow/tests/ now: the settings and the test scripts that still name only tests/ find them again
  const cfgAt = join(target, 'workflow', 'config.json');
  if (existsSync(cfgAt)) {
    const before = readFileSync(cfgAt, 'utf8');
    const after = newConfigText(before);
    if (after !== before) writeFileSync(cfgAt, after);
  }
  // and the typecheck reads them (workflow/tests/ was inside "tests"; workflow/ is a folder of its own)
  for (const ts of ['tsconfig.json', 'tsconfig.gate.json']) {
    const at = join(target, ts);
    if (!existsSync(at)) continue;
    const before = readFileSync(at, 'utf8');
    const after = before.replace(/("include"\s*:\s*\[)([^\]]*)\]/, (m, open, list) => (!/"tests"/.test(list) || /"workflow"/.test(list) ? m
      : `${open}${list.replace(/(\s*)$/, (sp) => `,${list.includes('\n') ? list.match(/\n\s*/)?.[0] ?? ' ' : ' '}"workflow"${sp}`)}]`));
    if (after !== before) writeFileSync(at, after);
  }
  // Renovate finds the kit's pinned tool images by a file pattern (a regular expression, which the path rewrite does not read)
  const renovateAt = join(target, 'renovate.json');
  if (existsSync(renovateAt)) {
    const before = readFileSync(renovateAt, 'utf8');
    const after = before.split('(^|/)tools/workflow/(').join('(^|/)workflow/tools/(');
    if (after !== before) writeFileSync(renovateAt, after);
  }
  const pkgAt = join(target, 'package.json');
  if (existsSync(pkgAt)) {
    const before = readFileSync(pkgAt, 'utf8');
    const after = before.replace(/("test(?::full)?": "[^"\n]*--test[^"\n]*)\\"tests\/\*\*\/\*\.test\.ts\\"/g, `$1\\"${NEW_TESTS}\\"`);
    if (after !== before) writeFileSync(pkgAt, after);
  }
  return {
    moved, claudeGrowth,
    said: [
      `the kit's own files moved under workflow/ (${moved.length}, with git): the settings are workflow/config.json, the record workflow/record, the tools workflow/tools/, the guides workflow/guides/, the specs workflow/specs/`,
      ...(rewritten.length ? [`the old kit paths rewritten (look at the diff before committing) in:\n${rewritten.map((f) => `    ${f}`).join('\n')}`] : []),
      ...(specsNaming.length ? [`waiting specs that name a kit file at its old place, left as you approved them:\n${specsNaming.map((f) => `    ${f}`).join('\n')}`] : []),
    ],
  };
}
