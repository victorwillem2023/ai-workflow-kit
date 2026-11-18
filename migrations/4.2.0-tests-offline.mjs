// Kit 4.2.0: tests never reach the network. The test commands load workflow/tools/lib/testnet.mjs first, which refuses a
// connection to another computer or to this computer's dev servers and fails the test file naming the address (a stand-in
// browser at http://127.0.0.1:8787/ once loaded a help video from the main folder's running server, and nothing noticed).
// Only test commands still exactly as the kit wrote them change (package.json's test and test:full, the config's testFiles);
// a command the project changed is its own.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rewriteJson } from '../install-config.mjs';

const GUARD = '--import ./workflow/tools/lib/testnet.mjs';
const NODE = 'node --disable-warning=ExperimentalWarning --import tsx --test';
const REPORTER = '--test-reporter=./workflow/tools/lib/quiet-reporter.mjs';
const FILES = '"{tests,workflow/tests}/**/*.test.ts"';
/** The kit's own test commands before 4.2, and the guard put in after tsx. */
export const OLD_TESTS = [`${NODE} ${REPORTER} ${FILES}`, `${NODE} ${FILES}`, `${NODE} ${REPORTER}`];
export const guarded = (cmd) => cmd.replace('--import tsx --test', `--import tsx ${GUARD} --test`);

/** Reads a JSON file, applies `change` (which returns the new object or null), writes it back keeping its layout; true when written. */
function rewrite(at, change) {
  if (!existsSync(at)) return false;
  const was = readFileSync(at, 'utf8');
  let obj;
  try { obj = JSON.parse(was); } catch { return false; }
  const now = change(obj);
  if (!now) return false;
  writeFileSync(at, rewriteJson(was.replace(/\r\n/g, '\n'), now));
  return true;
}

export default {
  version: '4.2.0',
  what: 'tests never reach the network',
  phase: 'config',
  run({ target }) {
    const said = [];
    const pkg = rewrite(join(target, 'package.json'), (p) => {
      const names = ['test', 'test:full'].filter((n) => OLD_TESTS.includes(p.scripts?.[n]));
      return names.length ? { ...p, scripts: { ...p.scripts, ...Object.fromEntries(names.map((n) => [n, guarded(p.scripts[n])])) } } : null;
    });
    if (pkg) said.push('package.json: the tests load workflow/tools/lib/testnet.mjs first, so a test that reaches the network fails and names the address');
    const cfg = rewrite(join(target, 'workflow', 'config.json'), (c) => (OLD_TESTS.includes(c.commands?.testFiles) ? { ...c, commands: { ...c.commands, testFiles: guarded(c.commands.testFiles) } } : null));
    if (cfg) said.push('workflow/config.json: the gate\'s test runs load the same guard');
    return { said };
  },
};
