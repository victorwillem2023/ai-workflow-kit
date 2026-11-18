// workflow/scripts/session.mjs --finish and the pages `npm run map` writes besides the file map (the docs index, the infra map):
// whatever the map changes after the rebase goes into the feature's commit, so the folder is clean and can be removed; a conflict
// only in those pages is solved by writing them again; and a folder that cannot be removed still lets the card be told.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { addFile, commitIn, ghCalls, ghCmd, git, makeRepo, roots, run, type Repo } from './session-repo';

// the tiny map, with a docs index too: docs/README.md counts the .txt files, so any new one changes it
const MAP_WITH_INDEX = `const {execFileSync}=require('child_process'),fs=require('fs');
const f=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).split('\\n').filter(x=>x.endsWith('.txt')).sort();
fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/MAP.md','# map\\n'+f.map(x=>'- '+x+'\\n').join(''));
fs.writeFileSync('docs/README.md','# docs\\n'+f.length+' files\\n');`;

function indexRepo(): Repo {
  const r = makeRepo();
  writeFileSync(join(r.main, 'map.cjs'), MAP_WITH_INDEX);
  const cfg = JSON.parse(readFileSync(join(r.main, 'workflow/config.json'), 'utf8'));
  writeFileSync(join(r.main, 'workflow/config.json'), JSON.stringify({ ...cfg, board: { ...cfg.board, project: 1 } })); // the fake gh's card 42
  execFileSync('node', ['map.cjs'], { cwd: r.main });
  git(r.main, 'add', '-A'); git(r.main, 'commit', '-m', 'docs index'); git(r.main, 'push', 'origin', 'main');
  return r;
}
const page = (dir: string, f: string) => readFileSync(join(dir, f), 'utf8');

after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

describe('finish and the pages the map writes', () => {
  it('puts a docs index the map rewrote into the feature\'s commit, and removes the folder', () => {
    const r = indexRepo();
    assert.ok(run(r, 'idx', '--card', '42').ok);
    commitIn(r.wt('idx'), 'b.txt', 'b\n', 'add b (map not run)');
    const f = run(r, '--finish', 'idx');
    assert.ok(f.ok, f.out);
    assert.ok(!existsSync(r.wt('idx')), `the folder is removed:\n${f.out}`);
    assert.equal(git(r.main, 'status', '--porcelain'), '');
    assert.match(page(r.main, 'docs/README.md'), /2 files/);
    assert.match(page(r.main, 'docs/MAP.md'), /- b\.txt/);
    assert.equal(git(r.main, 'rev-list', '--count', 'origin/main..main'), '1', 'still one commit for the feature');
  });

  it('solves a rebase conflict in the file map while the map rewrites the docs index too', () => {
    const r = indexRepo();
    assert.ok(run(r, 'one').ok);
    addFile(r.wt('one'), 'b.txt', 'add b');
    addFile(r.main, 'c.txt', 'add c on main');
    const f = run(r, '--finish', 'one');
    assert.ok(f.ok, f.out);
    assert.match(page(r.main, 'docs/README.md'), /3 files/);
    assert.match(page(r.main, 'docs/MAP.md'), /- b\.txt\n- c\.txt/);
  });

  it('still tells the card when the folder cannot be removed', () => {
    const r = indexRepo();
    assert.ok(run(r, 'kept', '--card', '42').ok);
    addFile(r.wt('kept'), 'b.txt', 'add b');
    // a check that leaves a stray file behind, as a test that writes into the project would
    writeFileSync(join(r.main, 'check.cjs'), `require('fs').writeFileSync('stray.txt','x');`);
    git(r.main, 'add', '-A'); git(r.main, 'commit', '-m', 'messy check');
    const f = run(r, '--finish', 'kept');
    assert.ok(f.ok, f.out);
    assert.match(f.out, /uncommitted work[\s\S]*--remove kept/);
    assert.ok(existsSync(r.wt('kept')), 'the folder with the stray file is kept');
    assert.ok(ghCalls(r).some((c) => ghCmd(c) === 'issue comment' && /Finished on the local main/.test(c.input)), 'the card is told it is on main');
  });
  it('with the approved subject, commits the work left in the folder into the one commit; without it, refuses', () => {
    const r = indexRepo();
    assert.ok(run(r, 'left').ok);
    addFile(r.wt('left'), 'b.txt', 'add b');
    writeFileSync(join(r.wt('left'), 'c.txt'), 'not committed\n');
    const refused = run(r, '--finish', 'left');
    assert.equal(refused.ok, false);
    assert.match(refused.out, /uncommitted work\. Finish with --subject/);
    const f = run(r, '--finish', 'left', '--subject', 'Plans: b and c');
    assert.ok(f.ok, f.out);
    assert.equal(page(r.main, 'c.txt'), 'not committed\n', 'the left work is on main');
    assert.equal(git(r.main, 'log', '-1', '--format=%s'), 'Plans: b and c');
    assert.equal(git(r.main, 'rev-list', '--count', 'origin/main..main'), '1', 'one commit for the feature');
  });
  it('takes the waiting spec into the new folder, and removes it and its try command from both when finished', () => {
    const r = indexRepo();
    const specs = (dir: string) => join(dir, 'workflow/specs');
    mkdirSync(specs(r.main), { recursive: true });
    writeFileSync(join(specs(r.main), 'plan.md'), '# Spec: plan\n');
    writeFileSync(join(specs(r.main), 'plan-other.md'), '# Spec: plan-other\n');
    assert.ok(run(r, 'plan').ok);
    assert.equal(readFileSync(join(specs(r.wt('plan')), 'plan.md'), 'utf8'), '# Spec: plan\n');
    writeFileSync(join(specs(r.wt('plan')), 'plan.try.ts'), 'try\n');
    addFile(r.wt('plan'), 'p.txt', 'add p');
    const f = run(r, '--finish', 'plan');
    assert.ok(f.ok, f.out);
    assert.equal(existsSync(join(specs(r.main), 'plan.md')), false, 'gone from the main folder');
    assert.ok(existsSync(join(specs(r.main), 'plan-other.md')), 'another topic\'s spec stays');
  });
  it('does not check again what gate:ship passed on, and checks only what the rebase brought in', () => {
    const r = indexRepo();
    const passed = (dir: string) => execFileSync('node', ['--input-type=module', '-e', "import('./workflow/tools/lib/shippass.mjs').then((m) => m.recordShipPass('.'))"], { cwd: dir });
    const checked = () => (existsSync(r.checkLog) ? readFileSync(r.checkLog, 'utf8').length : 0);
    assert.ok(run(r, 'same').ok);
    addFile(r.wt('same'), 'b.txt', 'add b');
    passed(r.wt('same'));
    const f = run(r, '--finish', 'same');
    assert.ok(f.ok, f.out);
    assert.match(f.out, /gate:ship passed on exactly these files: not checked again/);
    assert.equal(checked(), 0, 'no test ran');
    assert.ok(run(r, 'moved').ok);
    addFile(r.wt('moved'), 'c.txt', 'add c');
    passed(r.wt('moved'));
    addFile(r.main, 'd.txt', 'main moves on');
    const g = run(r, '--finish', 'moved');
    assert.ok(g.ok, g.out);
    assert.match(g.out, /changed since \(the rebase\), so those are checked/);
    assert.ok(checked() > 0, 'the checks ran on what came in');
  });
});
