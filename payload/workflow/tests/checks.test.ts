// The project's own gate steps (workflow/tools/lib/checks.mjs) and the secret scan (lib/secrets.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dueChecks, missingPartners } from '../../workflow/tools/lib/checks.mjs';
import { secretsIn, envFiles } from '../../workflow/tools/lib/secrets.mjs';

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
  it('refuses a password in a connection string and a signed token (JWT)', () => {
    const url = 'postgres' + '://app:' + 'password' + '@db.internal:5432/app';
    assert.deepEqual(scan(`const url = "${url}";`), [{ file: 'src/a.ts', kind: 'a password in a connection string' }]);
    const jwt = ['eyJ' + 'hbGciOiJIUzI1NiJ9', 'eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0', 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'].join('.');
    assert.deepEqual(scan(`Authorization: Bearer ${jwt}`), [{ file: 'src/a.ts', kind: 'a signed token (JWT)' }]);
  });
  it('a connection string filled in from the environment, a placeholder or one on this computer passes', () => {
    for (const ok of ['postgres' + '://app:${DB_PASSWORD}@db/app', 'postgres' + '://app:<password>@host/app', 'postgres' + '://postgres:postgres@localhost:5432/dev', 'https://example.com/a:b@c']) {
      assert.deepEqual(scan(`const url = "${ok}";`), [], ok);
    }
  });
  it('a dev database passes: user and password the same on a compose service, in any file; a real password never', () => {
    const dev = 'postgres' + '://postgres:postgres' + '@db:5432/app';
    assert.deepEqual(scan(`const url = "${dev}";`), []);
    assert.deepEqual(scan(`DATABASE_URL: ${dev}`, 'docker-compose.yml'), []);
    // the file is no pass: a real password in a production compose file or an example env file still counts
    const real = 'postgres' + '://app:' + 'Sup3rS3cret' + '@db.prod.internal/app';
    assert.equal(scan(`DATABASE_URL=${real}`, '.env.example').length, 1);
    assert.equal(scan(`DATABASE_URL: ${'postgres' + '://app:' + 'Sup3rS3cret' + '@db:5432/app'}`, 'docker-compose.prod.yml').length, 1);
    assert.deepEqual(scan(`const url = "${'postgres' + '://postgres:postgres' + '@db.example.com/app'}";`).length, 1, 'a real host still counts');
  });
  it('a tracked .env is named; .env.example is not', () => {
    assert.deepEqual(envFiles(['.env', '.env.example', 'apps/api/.env.local', 'src/env.ts']), ['.env', 'apps/api/.env.local']);
  });
});

describe("the kit's own settings are not secrets", () => {
  it('a file path after a key named like a token passes (ui.tokens is src/web/styles.css)', () => {
    assert.deepEqual(secretsIn(new Map([['workflow/config.json', ['  "ui": { "boards": "html", "tokens": "src/web/styles.css" },']]])), []);
    assert.equal(secretsIn(new Map([['src/a.ts', ['const token = "' + 'ab12cd34ef56gh78ij90kl' + '";']]])).length, 1, 'a long literal still counts');
  });
});
