// Which tests the gate runs (no I/O here). The kit's own tests (workflow/tests/**) prove the kit's tools, which the kit's self-test
// proves before every release; in a project they are most of the suite's time (49 of 53 s on a real one), so they run only when
// what they test may have changed: a kit update, the tools, the scripts, the config, the packages, the skills. Forced on GitHub
// (CI), with --kit, by WORKFLOW_KIT_TESTS (the kit's self-test), and for a language whose tests cannot be picked by file.

export const KIT_TESTS = ['workflow/tests/**'];
export const KIT_MACHINERY = ['workflow/**',
  'package.json', 'package-lock.json', '.claude/**', '.opencode/**', 'docs/flow/**'];
const SKIPPED = 'the kit\'s own tests skipped: no machinery changed (GitHub runs them)';

/**
 * @param {{ whole: boolean, unknown: boolean, reached: string[], allTests: string[], changed: string[], forced: boolean,
 *   matches: (f: string, globs: string[]) => boolean, kitTests?: string[], kitMachinery?: string[], maxFiles?: number }} o
 *   whole: --all; unknown: a changed file the import graph does not understand; reached: the tests the change reaches
 * @returns {{ mode: 'suite' | 'files' | 'none', files: string[], whole: boolean, note: string }}
 */
// (`skipKit`: the kit's self-test runs them once itself, WORKFLOW_KIT_TESTS=0 on its other gates: never due then)
export function testPlan({ whole, unknown, reached, allTests, changed, forced, matches, kitTests = KIT_TESTS, kitMachinery = KIT_MACHINERY, maxFiles = 300, skipKit = false }) {
  const kitDue = !skipKit && (forced || changed.some((f) => matches(f, kitMachinery)));
  const why = unknown && !whole ? ' (an unknown file changed)' : '';
  if (whole || unknown) {
    const own = allTests.filter((f) => !matches(f, kitTests)).sort();
    // every one of the project's own tests; the whole suite when the kit's are due, or when the list is too long for one command
    if (kitDue || own.length > maxFiles) return { mode: 'suite', files: [], whole: true, note: `whole suite${why}` };
    if (!own.length) return { mode: 'none', files: [], whole: true, note: `no tests of the project's own; ${SKIPPED}` };
    return { mode: 'files', files: own, whole: true, note: `all ${own.length} of the project's test files${why}; ${SKIPPED}` };
  }
  const picked = kitDue ? reached : reached.filter((f) => !matches(f, kitTests));
  const left = picked.length < reached.length ? `; ${SKIPPED}` : '';
  if (!picked.length) return { mode: 'none', files: [], whole: false, note: `no tests reached by this change${left}` };
  return { mode: 'files', files: picked, whole: false, note: `${picked.length} test files${left}` };
}
