// The setup check (workflow/tools/lib/setupcheck.mjs): which blocks of docs/SETUP.md are run, and what is refused.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readSetup } from '../../workflow/tools/lib/setupcheck.mjs';

describe('the setup check', () => {
  it('runs the setup blocks in order and the one start block, and leaves examples alone', () => {
    const plan = readSetup('# Setup\n```sh setup\nnpm ci\n```\n```sh\nnpm run something\n```\n```sh setup\ncp -n .env.example .env\n```\n```sh start\nnpm run dev\n```\n<!-- ready: http://127.0.0.1:8787/ -->\n');
    assert.deepEqual(plan.setup.map((s) => s.script), ['npm ci', 'cp -n .env.example .env']);
    assert.deepEqual(plan.start, { line: 11, script: 'npm run dev', ready: 'http://127.0.0.1:8787/' });
    assert.deepEqual(plan.problems, []);
  });
  it('refuses a start block without a ready address, or one that is not on this computer', () => {
    assert.match(readSetup('```sh start\nnpm start\n```\n').problems[0], /needs <!-- ready/);
    assert.match(readSetup('```sh start\nnpm start\n```\n<!-- ready: https://example.com/ -->').problems[0], /on this computer/);
  });
  it('refuses a second start block, an empty block, and a guide with nothing marked', () => {
    const two = readSetup('```sh start\na\n```\n<!-- ready: http://localhost:1/ -->\n```sh start\nb\n```\n<!-- ready: http://localhost:1/ -->');
    assert.match(two.problems[0], /second start block/);
    assert.match(readSetup('```sh setup\n\n```').problems[0], /empty setup block/);
    assert.match(readSetup('# nothing here').problems[0], /no ```sh setup/);
  });
});
