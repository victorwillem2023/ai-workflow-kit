// workflow/scripts/session.mjs and the files a session holds (lib/claims.mjs): a new session whose spec names a file a running
// session changes does not start (--anyway is the owner's), one stacked on it may, --list shows what each one changes and
// --beside tells a builder what the sessions next to it decide. Runs in throwaway repos (workflow/tests/session-repo.ts).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitIn, makeRepo, ran, roots, run, type Repo } from './session-repo';

const spec = (r: Repo, topic: string, files: string[], rule = 'The rule of the shared thing.') => {
  mkdirSync(join(r.main, 'workflow', 'specs'), { recursive: true });
  writeFileSync(join(r.main, 'workflow', 'specs', `${topic}.md`), `# Spec: ${topic}\n\nCard: #42\n\n## The rule and who shares it\n${rule}\n\n## Files that change\n${files.map((f) => `- \`${f}\`\n`).join('')}`);
};

describe('the files a session holds', () => {
  after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

  it('refuses a session on a file a running one changed, lets one stacked on it start, and --anyway is the owner\'s', () => {
    const r = makeRepo();
    spec(r, 'rules', ['rules.txt'], 'A week never holds more than 30% more than the week before.');
    ran(r, 'rules');
    commitIn(r.wt('rules'), 'rules.txt', 'rules\n', 'Plan: rules');

    spec(r, 'screen', ['rules.txt', 'screen.txt']);
    const refused = run(r, 'screen');
    assert.equal(refused.ok, false);
    assert.match(refused.out, /"screen" would change files another session is changing/);
    assert.match(refused.out, /session "rules"\): rules.txt/);
    assert.match(refused.out, /session.mjs screen --on rules/);
    assert.ok(!existsSync(r.wt('screen')), 'nothing was made');

    const stacked = run(r, 'screen', '--on', 'rules');
    assert.ok(stacked.ok, stacked.out);

    spec(r, 'other', ['rules.txt']);
    const anyway = run(r, 'other', '--anyway');
    assert.ok(anyway.ok, anyway.out);
    assert.match(anyway.out, /Started beside "rules", "screen"/);

    const list = ran(r, '--list').out;
    assert.match(list, /\[rules\][^\n]*\n\s+changes: rules.txt/);

    const beside = ran(r, '--beside', 'other').out;
    assert.match(beside, /2 running sessions change files it changes too/);
    assert.match(beside, /session "rules": shares rules.txt/);
    assert.match(beside, /never holds more than 30% more/);
  });

  it('two sessions stacked on one base do not hold the base\'s files against each other', () => {
    const r = makeRepo();
    ran(r, 'base');
    commitIn(r.wt('base'), 'base.txt', 'base\n', 'Plan: the base');
    spec(r, 's1', ['s1.txt']);
    ran(r, 's1', '--on', 'base');
    spec(r, 's2', ['s2.txt', 'base.txt']);
    const s2 = run(r, 's2', '--on', 'base');
    assert.ok(s2.ok, s2.out);
    assert.doesNotMatch(s2.out, /beside|would change/);
    assert.doesNotMatch(ran(r, '--list').out, /\[s1\][^\n]*\n\s+changes: [^\n]*base.txt/, "s1 holds its own files, not the base's");
  });

  it('a running session with no spec and no change yet holds its card\'s Touches line', () => {
    const r = makeRepo();
    r.env.CARD_BODY = 'Why: x\n\nTouches: geo.txt';
    ran(r, 'a', '--card', '42');
    spec(r, 'b', ['geo.txt']);
    const b = run(r, 'b');
    assert.equal(b.ok, false, b.out);
    assert.match(b.out, /#42 \(session "a"\): geo.txt/);
  });

  it('a spec that names no file leaves the start to the card\'s Touches line, and a session that only brought main in still holds its files', () => {
    const r = makeRepo();
    spec(r, 'a', ['x.txt']);
    ran(r, 'a');
    commitIn(r.main, 'main.txt', 'main moved\n', 'Main: something else');
    ran(r, '--catch-up', 'a');
    mkdirSync(join(r.main, 'workflow', 'specs'), { recursive: true });
    writeFileSync(join(r.main, 'workflow', 'specs', 'b.md'), '# Spec: b\n\n## Files that change\nthe x file, in prose\n');
    r.env.CARD_BODY = 'Touches: x.txt';
    const b = run(r, 'b', '--card', '42');
    assert.equal(b.ok, false, b.out);
    assert.match(b.out, /session "a"\): x.txt/);
  });

  it('counts uncommitted and new files, and says nothing about sessions on other files', () => {
    const r = makeRepo();
    ran(r, 'a');
    writeFileSync(join(r.wt('a'), 'loose.txt'), 'not committed\n');
    writeFileSync(join(r.wt('a'), 'carte-données.txt'), 'a name with an accent\n');
    spec(r, 'accent', ['carte-données.txt']);
    assert.match(run(r, 'accent').out, /session "a"\): carte-données.txt/, 'git gives the name as written, not quoted');
    spec(r, 'b', ['loose.txt']);
    assert.match(run(r, 'b').out, /session "a"\): loose.txt/);
    spec(r, 'c', ['c.txt']);
    const c = run(r, 'c');
    assert.ok(c.ok, c.out);
    assert.doesNotMatch(c.out, /would change|beside/);
    assert.match(ran(r, '--beside', 'c').out, /no running session changes the files it changes/);
  });
});
