// The rules that keep a problem findable (lib/errorrules.mjs): no empty catch, no console in server code.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { errorRuleFindings } from '../../tools/workflow/lib/errorrules.mjs';

describe('keeping problems findable', () => {
  it('finds an empty catch, on one line or over several, and lets one with a reason in a comment be', () => {
    const text = 'try { a(); } catch {}\ntry {\n  b();\n} catch (err) {\n}\ntry { c(); } catch {\n  // a missing file is the first run: nothing to read\n}\n';
    assert.deepEqual(errorRuleFindings('src/core/plan.ts', text).map((f) => [f.line, f.rule]), [[1, 'empty catch'], [4, 'empty catch']]);
  });
  it('finds console in server code, but not in the logger, in a comment, on the page or in tests', () => {
    const text = 'export function save() {\n  console.log("saved", goal);\n  // console.log is not for here\n}\n';
    assert.deepEqual(errorRuleFindings('src/server/goal.ts', text).map((f) => [f.line, f.rule]), [[2, 'console in the server']]);
    assert.deepEqual(errorRuleFindings('src/server/log.ts', text), []);
    assert.deepEqual(errorRuleFindings('src/web/main.ts', text), [], 'the page may write to its console (src/web/report.ts does)');
    assert.deepEqual(errorRuleFindings('tests/server/goal.test.ts', 'catch {}'), []);
    assert.deepEqual(errorRuleFindings('docs/x.md', 'catch {}'), []);
  });
});
