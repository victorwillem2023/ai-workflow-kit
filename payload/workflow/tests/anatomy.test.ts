// The shape of the code, flow by flow (lib/anatomy.mjs, lib/likeness.mjs): the kinds the code asks about and where, the flags a
// flow brings into code it does not own, rules written twice, functions that are close but not the same, and when /next says so.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { anatomyLine, codeKinds, comparisons, fixesPerFlow, flagsOf, namedFlows, pageStates, planCards, scoreFlows } from '../../workflow/tools/lib/anatomy.mjs';
import { lookAlikes, repeatedRules } from '../../workflow/tools/lib/likeness.mjs';
import { matchesAny } from '../../workflow/tools/lib/glob.mjs';

const files = new Map([
  ['src/plan/select.ts', "export function pick(intent, run) {\n  if (intent.shape === 'summit') return top(run);\n  if (intent.shape === 'loop') return loop(run);\n  if (run.wayUp) return up(run);\n}\n"],
  ['src/plan/score.ts', "export function score(intent) {\n  return intent.shape === 'summit' ? 2 : intent.shape === 'trail' ? 1 : 0;\n}\n"],
  ['src/plan/notes.ts', "export function notes(intent) {\n  switch (intent.shape) {\n    case 'summit': return 'top';\n    case 'loop': return 'round';\n  }\n}\n"],
  ['src/climb/summit.ts', "export const STEP_BACK = [0, 0.04, 0.1, 0.2];\nexport const NEAR_TOP_M = 80;\nexport function up(run) { if (run.wayUp) return run; }\n"],
  ['src/climb/trip.ts', "const TOWARDS_FOOT = [0, 0.04, 0.1, 0.2];\nconst NEAR_TOP_M = 120;\nexport const t = 1;\n"],
  ['src/web/keys.ts', "if (e.key === 'Enter' || e.key === 'Escape') go();\nif (typeof x === 'string') say();\n"],
  ['tests/select.test.ts', "if (intent.shape === 'summit') x();\n"],
]);

describe('the shape of the code', () => {
  it('finds a kind asked about in several shared steps, and leaves out keys, types and tests', () => {
    const all = comparisons(files);
    assert.ok(!all.some((c) => c.file.startsWith('tests/') || c.field === 'key' || c.value === 'string'));
    const kinds = codeKinds(all);
    const summit = kinds.find((k) => k.name === 'shape: summit');
    assert.deepEqual([...(summit?.files ?? [])].sort(), ['src/plan/notes.ts', 'src/plan/score.ts', 'src/plan/select.ts']);
    assert.ok(summit?.checks?.every((c) => c.shared), 'each file asks about another shape too: a shared step');
    assert.ok(!kinds.some((k) => k.name === 'shape: trail'), 'asked in one shared step only: a detail, not a flow');
  });
  it('counts the flags a flow names wherever code it does not own branches on them', () => {
    const [climb] = namedFlows([...files.keys()], { named: { climb: { files: ['src/climb/**'], flags: ['wayUp'] } }, match: matchesAny });
    assert.deepEqual(flagsOf(climb, files).map((c) => `${c.file}:${c.line}`), ['src/plan/select.ts:4'], 'its own summit.ts is not counted');
    const dotted = { ...climb, flags: ['run.wayUp'] };
    const more = new Map([...files, ['src/plan/other.ts', 'if (trip.wayUp) a();\nif (run?.wayUp) b();\n']]);
    assert.deepEqual(flagsOf(dotted, more).map((c) => `${c.file}:${c.line}`), ['src/plan/select.ts:4', 'src/plan/other.ts:2'], 'run.wayUp, not trip.wayUp');
  });
  it('lists the flows the project names beside the app map\'s, a named one taking the place of the map\'s of that name', () => {
    const flows = namedFlows([...files.keys()], { named: { 'to-a-top': { files: ['src/climb/**'] } }, match: matchesAny,
      kinds: { 'to-a-top': ['plan'], 'hill-repeats': ['plan'] }, partFiles: { plan: ['src/plan/select.ts'] } });
    assert.deepEqual(flows.map((f) => `${f.name} (${f.from})`), ['to-a-top (config)', 'hill-repeats (map)']);
  });
  it('reads a flow page\'s clean-up plan from its "Cards:" line, in order', () => {
    assert.deepEqual(planCards('# A hike to a top\n\n| Job | Home |\n\nCards: #607 -> #609 -> #610 -> #577\n'), [607, 609, 610, 577]);
    assert.deepEqual(planCards('**Cards**: none'), []);
  });
  it('finds a rule written twice: one name in two files, one list of numbers under two names', () => {
    const rules = repeatedRules(files);
    assert.ok(rules.some((r) => r.what === 'NEAR_TOP_M has different values'));
    assert.ok(rules.some((r) => r.what === 'the same list of numbers in two files' && r.places.length === 2));
  });
  it('finds two functions that are close but not the same, never one inside the other', () => {
    const body = (n: string, extra: string) => `export function ${n}(route, top) {\n  const near = distance(route.end, top.point);\n  const below = top.height - route.highest;\n  if (near > 300) return null;\n  if (below > 50) return null;\n  const reached = near < 80 && below < 20;\n  return { near, below, reached${extra} };\n}\n`;
    const pair = new Map([['src/a.ts', body('reachDay', '')], ['src/b.ts', body('reachTrip', ', day: 1')]]);
    const found = lookAlikes(pair, { minLines: 6 });
    assert.equal(found.length, 1);
    assert.deepEqual([found[0].a.name, found[0].b.name].sort(), ['reachDay', 'reachTrip']);
    assert.deepEqual(lookAlikes(new Map([['src/a.ts', body('reachDay', '')], ['src/b.ts', body('reachDay', '')]]), { minLines: 6 }), [], 'an exact copy is the gate\'s copy check');
  });
  it('puts the flow with the most spread first, with its fixes, and says when no flow was looked at', () => {
    const kinds = codeKinds(comparisons(files));
    const fixes = fixesPerFlow(kinds, [{ id: 'abc', at: new Date().toISOString(), files: ['src/plan/score.ts'] }]);
    const rows = scoreFlows(kinds, kinds, { rules: [], alikes: [], fixes }, pageStates([{ name: 'shape-summit', text: '# Up a top\n\n- Looked at: 2026-11-01.\n' }]));
    assert.equal(rows[0].name, 'shape: summit');
    assert.deepEqual(rows[0].fixes, ['abc']);
    assert.equal(rows[0].page?.lookedAt, '2026-11-01');
    assert.match(anatomyLine([], 40) ?? '', /^anatomy: no flow of the code has been looked at yet/);
    assert.equal(anatomyLine([], 5), null, 'too little code to have a shape yet');
    assert.equal(anatomyLine([{ slug: 'shape-summit', lookedAt: '2026-11-01' }], 40, { now: new Date('2026-11-20') }), null);
    assert.match(anatomyLine([{ slug: 'shape-summit', lookedAt: '2026-06-01' }], 40, { now: new Date('2026-11-20') }) ?? '', /shape-summit was last looked at 2026-06-01/);
  });
});
