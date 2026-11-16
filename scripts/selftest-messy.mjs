// The self-test's old, messy project: what a real project looks like when it updates (Trailsmith at 2.8 was the model), because
// the clean variants passed bugs that only a real project showed (a board already set, debt on day one, settings of its own).
// It is made with the kit of an older tag (git archive of OLD_TAG, the real installer of then), given debt the checks find, its
// own settings, a board, a rule of its own in CLAUDE.md, an ignore rule of its own and Node named only in package.json; then it is
// updated with this kit and does what the update says, and from there every check must pass and nothing it had may be lost.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const OLD_TAG = 'v2.8.5';

// a page that is heavy on purpose: text gzip cannot shrink (a fixed pseudo-random sequence, the same every run)
const heavy = (kb) => {
  let x = 12345, s = '';
  while (s.length < kb * 1024 * 1.4) { x = (x * 1103515245 + 12345) % 2147483648; s += x.toString(36); }
  return s;
};

/** The app before any kit: a build that writes dist/app.js from src/web/main.ts, debt, and Node named in engines only. */
const APP = {
  'package.json': `${JSON.stringify({ name: 'messy-app', private: true, type: 'module', engines: { node: '>=26' }, scripts: { build: 'node scripts/build.mjs' } }, null, 2)}\n`,
  // the build names its entry point the way esbuild scripts do (knip's start files are read from here)
  'scripts/build.mjs': `// Builds the page: dist/app.js from the entry point, with the map tiles inlined (heavy, on purpose).\nimport { mkdirSync, readFileSync, writeFileSync } from 'node:fs';\nconst entryPoints = ['src/web/main.ts'];\nmkdirSync('dist', { recursive: true });\nwriteFileSync('dist/app.js', entryPoints.map((f) => readFileSync(f, 'utf8')).join('\\n') + '\\nconst TILES = ' + JSON.stringify(readFileSync('src/web/tiles.txt', 'utf8')) + ';\\n');\n`,
  'src/web/main.ts': 'import { greet } from \'../core/greet\';\n\nexport function start(): string {\n  return greet(\'rider\');\n}\n',
  'src/web/tiles.txt': heavy(300),
  'src/core/greet.ts': 'export function greet(name: string): string {\n  return `Hello, ${name}`;\n}\n\n// debt: nothing uses this\nexport function farewell(name: string): string {\n  return `Bye, ${name}`;\n}\n',
  // debt: a file nothing imports
  'src/core/old-routes.ts': 'export const OLD = [1, 2, 3];\n',
  'tests/greet.test.ts': 'import assert from \'node:assert/strict\';\nimport { test } from \'node:test\';\nimport { greet } from \'../src/core/greet\';\n\ntest(\'greets\', () => assert.equal(greet(\'a\'), \'Hello, a\'));\n',
  '.gitignore': 'node_modules/\ndist/\n# the owner\'s own: drafts\n*.draft.md\n',
};

/** What the owner did with the project after the old install: settings, a board, a rule, pages of their own. */
function makeItTheirs(dir) {
  const at = join(dir, 'workflow.config.json');
  const cfg = JSON.parse(readFileSync(at, 'utf8'));
  cfg.board = { ...cfg.board, project: 1 };
  if (cfg.board.labels?.areas) cfg.board.labels.areas = [...cfg.board.labels.areas, 'area: Routes'];
  if (cfg.security?.inputFolders) cfg.security.inputFolders = [...cfg.security.inputFolders, 'src/races/'];
  if (cfg.docs?.include) cfg.docs.include = [...cfg.docs.include, 'notes/*.md'];
  cfg.performance = { files: ['dist/*.js'], maxKb: 250 };
  cfg.house = { note: 'a setting the kit has never heard of' };
  writeFileSync(at, `${JSON.stringify(cfg, null, 2)}\n`);
  appendFileSync(join(dir, 'CLAUDE.md'), '\n## Our own rules\n- Routes are checked by hand on the map before a release.\n');
  mkdirSync(join(dir, 'notes'), { recursive: true });
  writeFileSync(join(dir, 'notes', 'ROUTES.md'), '# Routes\n\nHow we pick a route, in our own words.\n');
}

/**
 * The messy project in `dir` (a git repository already), at OLD_TAG: returns the config as it was before the update.
 * `step(label, cmd, args)` runs and reports a command; `installArgs` are the --project/--repo/--prefix the kit is installed with.
 */
export async function messyAtOldKit({ dir, kit, step, git, installArgs }) {
  for (const [path, text] of Object.entries(APP)) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); }
  git('add', '-A'); git('commit', '-q', '-m', 'The app before any kit');
  // the older kit as it was tagged, unpacked next to the project
  const old = mkdtempSync(join(tmpdir(), 'kit-old-'));
  try {
    const tar = join(old, 'kit.tar');
    execFileSync('git', ['archive', '--format=tar', '-o', tar, OLD_TAG], { cwd: kit });
    // relative names, in its folder: GNU tar takes "C:" in a path for a remote host
    execFileSync('tar', ['-xf', 'kit.tar'], { cwd: old });
    const said = await step(`install kit ${OLD_TAG}`, process.execPath, [join(old, 'install.mjs'), dir, ...installArgs]);
    const line = /^\s*(?:1\.|step 1:)\s*(npm i [^\n]+)$/m.exec(said)?.[1];
    for (const part of line ? line.split('&&').map((p) => p.trim().split(/\s+/).slice(2)) : []) await step(`npm i ${part.join(' ')} (for ${OLD_TAG})`, 'npm', ['install', '--no-audit', '--no-fund', '--silent', ...part]);
  } finally {
    rmSync(old, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  git('add', '-A'); git('commit', '-q', '-m', `Kit ${OLD_TAG}`);
  // as its owner did then: the old kit's map and baseline (the debt is known from here), and its full gate passed, so anything
  // that fails after the update is the update's doing, not the fixture's
  // the old unused check had no baseline, so the debt failed it for good: the owner switched it off (Trailsmith did); the update
  // brings it back, and it must start from what is there
  const cfgAt = join(dir, 'workflow.config.json');
  const cfg = JSON.parse(readFileSync(cfgAt, 'utf8'));
  cfg.checks = cfg.checks.filter((c) => c.name !== 'unused');
  writeFileSync(cfgAt, `${JSON.stringify(cfg, null, 2)}\n`);
  await step(`file map (${OLD_TAG})`, process.execPath, ['tools/workflow/map.mjs']);
  await step(`baseline (${OLD_TAG})`, process.execPath, ['tools/workflow/gate.mjs', '--update-baseline']);
  await step(`full gate (${OLD_TAG})`, process.execPath, ['tools/workflow/gate.mjs', '--all']);
  git('add', '-A'); git('commit', '-q', '-m', 'The first baseline');
  makeItTheirs(dir);
  git('add', '-A'); git('commit', '-q', '-m', 'Our own settings, board and rules');
  return JSON.parse(readFileSync(join(dir, 'workflow.config.json'), 'utf8'));
}

/** What the update must leave of the project's own: the CLAUDE.md rule, the notes page, the setting the kit does not know. */
export function ownWorkLost(dir) {
  const lost = [];
  if (!readFileSync(join(dir, 'CLAUDE.md'), 'utf8').includes('Routes are checked by hand on the map')) lost.push('CLAUDE.md: the project\'s own rule');
  if (!existsSync(join(dir, 'notes', 'ROUTES.md'))) lost.push('notes/ROUTES.md');
  if (!JSON.parse(readFileSync(join(dir, 'workflow.config.json'), 'utf8')).house) lost.push('workflow.config.json: house');
  return lost;
}
