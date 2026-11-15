// The project's own gate steps (tools/workflow/lib/checks.mjs) and the secret scan (lib/secrets.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dueChecks, missingPartners } from '../../tools/workflow/lib/checks.mjs';
import { secretsIn, envFiles } from '../../tools/workflow/lib/secrets.mjs';

describe('the project\'s own checks', () => {
  const e2e = { name: 'e2e', command: 'x', when: ['src/web/**'] };
  const audit = { name: 'audit', command: 'y', all: true };
  it('a check with `when` runs only when a changed file matches, and always with --all', () => {
    assert.equal(dueChecks([e2e], ['src/core/a.ts'])[0].due, false);
    assert.equal(dueChecks([e2e], ['src/web/a.tsx'])[0].due, true);
    assert.equal(dueChecks([e2e], [], true)[0].due, true);
  });
  it('a check marked `all` waits for --all and says so', () => {
    assert.deepEqual(dueChecks([audit], ['src/a.ts']).map((c) => [c.due, c.why]), [[false, 'only with --all']]);
    assert.equal(dueChecks([audit], [], true)[0].due, true);
  });
});

describe('files that change together', () => {
  const rule = [{ name: 'migration', when: ['src/db/schema.ts'], needs: ['migrations/**'] }];
  it('a changed table without a new migration is named', () => {
    assert.deepEqual(missingPartners(rule, ['src/db/schema.ts', 'src/a.ts']), [{ name: 'migration', changed: ['src/db/schema.ts'], needs: ['migrations/**'] }]);
  });
  it('a changed table with a migration passes, and so does a change that touches neither', () => {
    assert.deepEqual(missingPartners(rule, ['src/db/schema.ts', 'migrations/0002_weight.sql']), []);
    assert.deepEqual(missingPartners(rule, ['src/a.ts']), []);
  });
});

describe('secrets in a change', () => {
  // made here from parts, so this file holds no line that looks like a key
  const aws = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  const pw = 'pass' + 'word = "' + 'correct-horse-battery-staple' + '"';
  const scan = (line: string, file = 'src/a.ts') => secretsIn(new Map([[file, [line]]]));
  it('refuses a cloud key and a password written into the code, naming the file and the kind, never the value', () => {
    assert.deepEqual(scan(`const k = "${aws}";`), [{ file: 'src/a.ts', kind: 'an AWS access key' }]);
    assert.deepEqual(scan(`const ${pw};`), [{ file: 'src/a.ts', kind: 'a password or key written into the code' }]);
    assert.ok(!JSON.stringify(scan(`const k = "${aws}";`)).includes(aws));
  });
  it('a value from the environment, a placeholder, a marked line and a lock file pass', () => {
    assert.deepEqual(scan('const token = process.env.API_TOKEN;'), []);
    assert.deepEqual(scan('api_key: "<your key from the dashboard>"'), []);
    assert.deepEqual(scan(`const ${pw}; // not a secret: a test value`), []);
    assert.deepEqual(scan(`"integrity": "${aws}"`, 'package-lock.json'), []);
  });
  it('a tracked .env is named; .env.example is not', () => {
    assert.deepEqual(envFiles(['.env', '.env.example', 'apps/api/.env.local', 'src/env.ts']), ['.env', 'apps/api/.env.local']);
  });
});
