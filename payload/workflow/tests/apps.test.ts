// Several apps in one repository (lib/apps.mjs): a change runs the typecheck and tests of the apps it reaches, each in its own
// folder with its own commands; shared code reaches every app.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appSteps, appsReached } from '../tools/lib/apps.mjs';
import { matchesAny } from '../tools/lib/glob.mjs';

const apps = [
  { name: 'web', root: 'apps/web', commands: { typecheck: 'npm run typecheck', testAll: 'npm test' } },
  { name: 'api', root: 'apps/api', commands: { testAll: 'go test ./...' } },
];

describe('several apps in one repository', () => {
  it('reaches the app a change is in, every app for shared code, and none for the rest', () => {
    const reached = (changed: string[], all = false) => appsReached(apps, changed, { all, shared: ['packages/**'], matches: matchesAny }).map((a) => a.name);
    assert.deepEqual(reached(['apps/web/src/main.ts']), ['web']);
    assert.deepEqual(reached(['packages/rules/total.ts']), ['web', 'api']);
    assert.deepEqual(reached(['README.md', 'apps/webby/x.ts']), [], 'a folder that only starts the same way is another one');
    assert.deepEqual(reached([], true), ['web', 'api'], '--all');
  });
  it('runs each reached app\'s own commands in its own folder', () => {
    const ran: string[] = [];
    const steps = appSteps({ config: { apps }, changed: ['apps/api/main.go'], all: false, matches: matchesAny, run: (cmd, cwd) => { ran.push(`${cwd}: ${cmd}`); return { ok: true, out: '' }; } });
    assert.deepEqual(steps.map(([name]) => name), ['tests api'], 'an app with no typecheck command gets none');
    for (const [, fn] of steps) fn();
    assert.deepEqual(ran, ['apps/api: go test ./...']);
    assert.deepEqual(appSteps({ config: {}, changed: ['src/x.ts'], all: true, matches: matchesAny, run: () => ({ ok: true, out: '' }) }), [], 'one app: nothing extra');
  });
});
