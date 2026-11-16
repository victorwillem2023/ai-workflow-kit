#!/usr/bin/env node
// How much of the code the tests run: the whole suite once with Node's own coverage (TypeScript through tsx, read back through
// its source maps), then the share of lines run in total and the files with the most lines no test runs (lib/coverage.mjs).
// Slower than the gate (the whole suite), so it is its own command: /retro shows it once a month. Advice, never a failure.
//   node workflow/tools/coverage.mjs                 the code under src/
//   node workflow/tools/coverage.mjs --include "src/core/**"
// Another language: "commands.coverage" in workflow/config.json, a command that writes an lcov file, and "coverageFile" its path.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coverageLines, coverageSummary, readLcov } from './lib/coverage.mjs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const at = process.argv.indexOf('--include');
const include = at >= 0 ? process.argv[at + 1] : 'src/**';
const tmp = mkdtempSync(join(tmpdir(), 'coverage-'));
let lcov = null;
try {
  if (config.commands?.coverage) {
    // a shell only on Windows, where npm is a .cmd file; the command is the project's own, from its config
    // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
    const r = spawnSync(config.commands.coverage, { shell: true, stdio: 'inherit' });
    if (r.status !== 0) { console.log('coverage: the coverage command failed (commands.coverage)'); process.exit(1); }
    lcov = config.coverageFile && existsSync(config.coverageFile) ? readFileSync(config.coverageFile, 'utf8') : null;
  } else if (/\.tsx?$|\.m?js$/.test(String(config.tests ?? ''))) {
    const out = join(tmp, 'lcov.info');
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', 'tsx', '--enable-source-maps', '--experimental-test-coverage',
      `--test-coverage-include=${include}`, '--test-reporter=lcov', `--test-reporter-destination=${out}`, '--test-reporter=dot', '--test-reporter-destination=stdout',
      '--test', config.tests], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.status !== 0) { console.log('coverage: the tests failed, so there is no figure (npm test says which)'); process.exit(1); }
    lcov = existsSync(out) ? readFileSync(out, 'utf8') : null;
  }
  if (!lcov) { console.log('coverage: not measured for this project\'s language yet ("commands.coverage" and "coverageFile" in workflow/config.json: a command that writes lcov)'); process.exit(0); }
  console.log(coverageLines(coverageSummary(readLcov(lcov), { root: root.replace(/\\/g, '/') })).join('\n'));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
