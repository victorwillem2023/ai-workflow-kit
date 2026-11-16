// The naming check (workflow/tools/lib/naming.mjs): file names and exported names follow the project's conventions.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesAny } from '../../workflow/tools/lib/glob.mjs';
import { badExports, badFileNames, badResourceNames, baseName, hasStyle, namingProblems, unsortedKeys } from '../../workflow/tools/lib/naming.mjs';

describe('the naming check', () => {
  it('knows each style, and lets an unknown style through so a typo never blocks work', () => {
    assert.ok(hasStyle('quiet-reporter', 'kebab') && hasStyle('guards', 'kebab') && !hasStyle('safeFetch', 'kebab'));
    assert.ok(hasStyle('App', 'pascal') && !hasStyle('app', 'pascal'));
    assert.ok(hasStyle('net_guard', 'snake') && hasStyle('MAX_SIZE', 'upper'));
    assert.ok(hasStyle('anything', 'kebob'));
  });
  it('names a file by the part before its first dot', () => {
    assert.equal(baseName('workflow/tools/lib/quiet-reporter.d.mts'), 'quiet-reporter');
    assert.equal(baseName('tests/clock.test.ts'), 'clock');
  });
  it('fails a file name that breaks the first rule its path matches, and skips the exceptions', () => {
    const rules = [{ glob: 'src/**/*.tsx', style: 'pascal', except: ['main.tsx'] }, { glob: 'src/**/*.ts', style: 'kebab' }];
    const bad = badFileNames(['src/web/App.tsx', 'src/web/main.tsx', 'src/web/planCard.tsx', 'src/server/safeFetch.ts', 'src/core/guards.ts'], rules, matchesAny);
    assert.deepEqual(bad.map((b) => b.key), ['file|src/web/planCard.tsx', 'file|src/server/safeFetch.ts']);
    assert.match(bad[1].line, /"safeFetch" is not kebab-case/);
  });
  it('wants camelCase functions and values, PascalCase types, and PascalCase components in a .tsx file', () => {
    const ts = 'export function make_plan() {}\nexport const MAX_WEEKS = 30;\nexport const weekLoad = 1;\nexport interface plan {}\nexport class RefusedError {}\nexport async function readSettings() {}';
    assert.deepEqual(badExports('src/core/plan.ts', ts).map((b) => b.line), [
      'src/core/plan.ts:1: the function "make_plan" is not camelCase',
      'src/core/plan.ts:4: the interface "plan" is not PascalCase',
    ]);
    assert.deepEqual(badExports('src/web/PlanCard.tsx', 'export function PlanCard() {}\nexport function usePlan() {}\nexport const Week_Row = () => null;').map((b) => b.key), ['export|src/web/PlanCard.tsx|Week_Row']);
  });
  it('keeps the listed parts of a JSON file in alphabetical order, keys or lists of strings, case aside', () => {
    const pkg = JSON.stringify({ dependencies: { hono: '1', Zod: '1', drizzle: '1' }, devDependencies: { biome: '1', knip: '1' }, labels: ['api', 'Core', 'web'] });
    const bad = unsortedKeys('package.json', pkg, ['dependencies', 'devDependencies', 'labels', 'missing']);
    assert.deepEqual(bad.map((b) => b.key), ['sorted|package.json|dependencies']);
    assert.match(bad[0].line, /"drizzle" comes before "Zod"/);
    assert.deepEqual(unsortedKeys('x.json', 'not json', ['a']), []);
  });
  it('checks the names given to infrastructure against the pattern, and leaves names built from variables alone', () => {
    const tf = 'resource "hcloud_server" "web" {\n  name = "coach-prod-hel1-web-01"\n}\nresource "hcloud_network" "n" {\n  name = "harry"\n}\nresource "x" "y" {\n  name = "${var.app}-net"\n}';
    const rule = { glob: 'infra/**/*.tf', pattern: '^coach-(dev|test|uat|prod)-[a-z]+[0-9]*-[a-z0-9-]+$', say: '<app>-<env>-<place>-<part>' };
    assert.deepEqual(badResourceNames('infra/main.tf', tf, rule).map((b) => b.line), ['infra/main.tf:5: the name "harry" does not fit <app>-<env>-<place>-<part>']);
    assert.deepEqual(badResourceNames('k8s/app.yaml', 'metadata:\n  name: coach-uat-fsn1-api\n', rule), []);
  });
  it('reads the sorted and resource rules through the same call as the rest', () => {
    const files = { 'package.json': '{"dependencies":{"b":"1","a":"1"}}', 'infra/main.tf': 'name = "pet-server"' };
    const out = namingProblems({ sorted: [{ file: 'package.json', keys: ['dependencies'] }], resources: [{ glob: 'infra/**/*.tf', pattern: '^app-' }] }, Object.keys(files), new Map(), matchesAny, (p) => files[p as keyof typeof files]);
    assert.deepEqual(out.map((p) => p.key), ['sorted|package.json|dependencies', 'name|infra/main.tf|pet-server']);
  });
});
