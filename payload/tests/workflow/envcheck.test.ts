// The settings check (tools/workflow/lib/envcheck.mjs): every setting the code reads is listed in .env.example.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { namesListed, namesRead, unlisted } from '../../tools/workflow/lib/envcheck.mjs';

describe('the settings check', () => {
  it('finds the names a file reads, in every language the kit knows', () => {
    assert.deepEqual(namesRead("const a = process.env.PORT; const b = process.env['DATABASE_URL'];").sort(), ['DATABASE_URL', 'PORT']);
    assert.deepEqual(namesRead('import.meta.env.VITE_MAP_KEY'), ['VITE_MAP_KEY']);
    assert.deepEqual(namesRead('let k = std::env::var("API_KEY")?;'), ['API_KEY']);
    assert.deepEqual(namesRead('os.environ["A"]; os.environ.get("B"); os.getenv("C")').sort(), ['A', 'B', 'C']);
    assert.deepEqual(namesRead('os.Getenv("REDIS_URL")'), ['REDIS_URL']);
  });
  it('reads the keys of defineSettings, and not the keys nested inside them', () => {
    const text = "export const settings = defineSettings({\n  PORT: { kind: 'number', default: '8787' },\n  SESSION_SECRET: {\n    kind: 'text', secret: true,\n    MIN: 1,\n  },\n});";
    assert.deepEqual(namesRead(text).sort(), ['PORT', 'SESSION_SECRET']);
  });
  it('leaves out the names a runtime sets by itself', () => {
    assert.deepEqual(namesRead('process.env.NODE_ENV; import.meta.env.DEV; process.env.CI'), []);
  });
  it('counts a commented-out name in .env.example as listed', () => {
    assert.deepEqual([...namesListed('PORT=8787\n# SENTRY_DSN=\n  export DB=x\nnot a line\n')].sort(), ['DB', 'PORT', 'SENTRY_DSN']);
  });
  it('fails a name the code reads that .env.example does not list, naming the file, unless the config ignores it', () => {
    const files = new Map([['src/server/mail.ts', 'process.env.SMTP_HOST; process.env.PORT']]);
    assert.deepEqual(unlisted(files, 'PORT=8787\n'), [{ file: 'src/server/mail.ts', name: 'SMTP_HOST' }]);
    assert.deepEqual(unlisted(files, 'PORT=8787\n', ['SMTP_HOST']), []);
  });
});
