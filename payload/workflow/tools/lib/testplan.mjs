// Which tests the gate runs (no I/O here). The kit's own tests (workflow/tests/**) prove the kit's tools, which the kit's self-test
// proves before every release; in a project they are most of the suite's time (49 of 53 s on a real one), so they run only when
// what they test may have changed: a kit update, the tools, the scripts, the config, the packages, the skills. The same on GitHub,
// which sees what a push changed (gate.yml passes the commit before it). Forced with --kit, by WORKFLOW_KIT_TESTS (the kit's
// self-test), and for a language whose tests cannot be picked by file.

export const KIT_TESTS = ['workflow/tests/**'];
export const KIT_MACHINERY = ['workflow/**',
  'package.json', 'package-lock.json', '.claude/**', '.opencode/**', 'docs/flow/**'];
// the owner's settings under workflow/: how strict the gate is, its baseline, the waiting specs. No kit test depends on them,
// so changing one is not a machinery change (it ran the kit's tests, and with no test naming them, the whole suite)
export const KIT_SETTINGS = ['workflow/levels.json', 'workflow/tools/baseline.json', 'workflow/specs/**'];
const SKIPPED = 'the kit\'s own tests skipped: no machinery changed (--kit runs them)';

/**
 * @param {{ whole: boolean, unknown: boolean, reached: string[], allTests: string[], changed: string[], forced: boolean,
 *   matches: (f: string, globs: string[]) => boolean, kitTests?: string[], kitMachinery?: string[] }} o
 *   whole: --all; unknown: a changed file the import graph does not understand; reached: the tests the change reaches
 * @returns {{ mode: 'suite' | 'files' | 'none', files: string[], whole: boolean, note: string }}
 */
// (`skipKit`: the kit's self-test runs them once itself, WORKFLOW_KIT_TESTS=0 on its other gates: never due then)
export function testPlan({ whole, unknown, reached, allTests, changed, forced, matches, kitTests = KIT_TESTS, kitMachinery = KIT_MACHINERY, skipKit = false }) {
  const kitDue = !skipKit && (forced || changed.some((f) => matches(f, kitMachinery) && !matches(f, KIT_SETTINGS)));
  const why = unknown && !whole ? ' (an unknown file changed)' : '';
  if (whole || unknown) {
    const own = allTests.filter((f) => !matches(f, kitTests)).sort();
    // every one of the project's own tests, however many (they run in batches: lib/testrun.mjs); the whole suite when the kit's are due.
    // (A project with more than 300 test files of its own used to get the whole suite here, the kit's tests with it, on every run.)
    if (kitDue) return { mode: 'suite', files: [], whole: true, note: `whole suite${why}` };
    if (!own.length) return { mode: 'none', files: [], whole: true, note: `no tests of the project's own; ${SKIPPED}` };
    return { mode: 'files', files: own, whole: true, note: `all ${own.length} of the project's test files${why}; ${SKIPPED}` };
  }
  const picked = kitDue ? reached : reached.filter((f) => !matches(f, kitTests));
  const left = picked.length < reached.length ? `; ${SKIPPED}` : '';
  if (!picked.length) return { mode: 'none', files: [], whole: false, note: `no tests reached by this change${left}` };
  return { mode: 'files', files: picked, whole: false, note: `${picked.length} test files${left}` };
}
