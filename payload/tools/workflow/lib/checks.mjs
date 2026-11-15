// The project's own gate steps, from workflow.config.json. Pure: the changed files come in as a list.
//   "checks":   [{ "name": "e2e", "command": "npx playwright test", "when": ["src/web/**"], "all": true, "setup": "npx playwright install --with-deps chromium" }]
//               a command that must pass. `when`: only when a changed file matches; `all`: only with --all (slow checks); `setup`: run first, on GitHub only.
//   "together": [{ "name": "migration", "when": ["src/db/schema.ts"], "needs": ["migrations/**"] }]
//               files that change together: a change to `when` without a change to `needs` fails (a table changed, no migration written).
import { matchesAny } from './glob.mjs';

/** Each check with whether it runs now, and why not when it doesn't: [{ check, due, why }]. */
export function dueChecks(checks = [], changed = [], all = false) {
  return checks.map((check) => {
    if (check.all && !all) return { check, due: false, why: 'only with --all' };
    if (!all && check.when && !changed.some((f) => matchesAny(f, check.when))) return { check, due: false, why: 'not reached by this change' };
    return { check, due: true, why: '' };
  });
}

/** The `together` rules a change breaks: [{ name, changed (the files that matched `when`), needs }]. */
export function missingPartners(rules = [], changed = []) {
  return rules
    .map((r) => ({ name: r.name, changed: changed.filter((f) => matchesAny(f, r.when)), needs: r.needs }))
    .filter((r) => r.changed.length && !changed.some((f) => matchesAny(f, r.needs)));
}
