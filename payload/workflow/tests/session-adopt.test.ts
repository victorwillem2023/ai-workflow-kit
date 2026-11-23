// workflow/scripts/session.mjs with an orchestrator: --adopt makes a worktree someone else made into a session where it is,
// --release lets one go before it is deleted, and with "orchestrator": "orca" a new session's folder is made by Orca (a stand-in
// here) and falls back to the kit's own when Orca cannot. Run in throwaway git repos (workflow/tests/session-repo.ts).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { ENV, PORTS, commitIn, ghCalls, git, makeRepo, ran, roots, run, type Repo } from './session-repo';
import { withOrchestrator } from '../scripts/session-adopt.mjs';

/** The session script run from inside a folder, as an orchestrator's setup script runs it. */
const runIn = (r: Repo, dir: string, args: string[], env: Record<string, string> = {}) => {
  try { return { ok: true, out: execFileSync('node', [join(r.main, 'workflow', 'scripts', 'session.mjs'), ...args], { cwd: dir, env: { ...ENV, ...r.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { const x = e as { stdout?: string; stderr?: string }; return { ok: false, out: `${x.stdout ?? ''}${x.stderr ?? ''}` }; }
};
/** A worktree made without the kit, in a folder of its own choosing (as an orchestrator keeps them). */
const foreign = (r: Repo, branch: string) => { const dir = join(r.root, 'elsewhere', branch); git(r.main, 'worktree', 'add', '-b', branch, dir, 'main'); return dir; };
const portOf = (dir: string) => /^PORT=(\d+)\s*$/m.exec(readFileSync(join(dir, '.env'), 'utf8'))?.[1];

// A stand-in for the orca command: records every call, and makes a worktree the way Orca does: in a folder of its own, on a
// branch it names itself. ORCA_FAIL: it answers like an Orca that is not running.
const FAKE_ORCA = `const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');const a=process.argv.slice(2);
fs.appendFileSync(process.env.ORCA_LOG,JSON.stringify(a)+'\\n');
if(process.env.ORCA_FAIL){console.error('Orca is not running');process.exit(1)}
const val=(f)=>a[a.indexOf(f)+1];const cmd=a.slice(0,2).join(' ');
if(cmd==='repo list')console.log(JSON.stringify({result:{repos:[{id:'r1',path:process.env.ORCA_MAIN}]}}));
else if(cmd==='worktree create'){const dir=path.join(process.env.ORCA_HOME,val('--name'));
execFileSync('git',['worktree','add','-b','orca/'+val('--name'),dir,'origin/main'],{cwd:process.env.ORCA_MAIN,stdio:'ignore'});console.log(JSON.stringify({result:{id:'r1::'+dir}}))}
else console.log('{}');`;
const withOrca = () => {
  const r = makeRepo();
  writeFileSync(join(r.root, 'fake-orca.cjs'), FAKE_ORCA);
  const at = join(r.main, 'workflow/config.json');
  const config = JSON.parse(readFileSync(at, 'utf8'));
  writeFileSync(at, JSON.stringify({ ...config, session: { ...config.session, orchestrator: 'orca' } }));
  git(r.main, 'add', '-A'); git(r.main, 'commit', '-m', 'orca'); git(r.main, 'push', 'origin', 'main');
  const log = join(r.root, 'orca.log');
  r.env = { ...r.env, WORKFLOW_ORCA: join(r.root, 'fake-orca.cjs'), ORCA_LOG: log, ORCA_MAIN: r.main, ORCA_HOME: join(r.root, 'orca-home') };
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]) : []);
  return { r, calls };
};

describe('sessions in folders an orchestrator makes', () => {
  after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

  it('--adopt gives a worktree made elsewhere its own port, the packages and its card, and twice changes nothing', () => {
    const r = makeRepo();
    writeFileSync(join(r.main, '.env'), 'PORT=1\nKEY=kept\n');
    const dir = foreign(r, 'hill-repeats');
    const first = runIn(r, dir, ['--adopt', '--card', '42']);
    assert.ok(first.ok, first.out);
    assert.match(first.out, /Session "hill-repeats" is ready/);
    const port = portOf(dir);
    assert.ok(port && port !== '1', 'a port of its own, not the main folder\'s');
    assert.match(readFileSync(join(dir, '.env'), 'utf8'), /^KEY=kept$/m);
    assert.ok(lstatSync(join(dir, 'node_modules')).isSymbolicLink() || lstatSync(join(dir, 'node_modules')).isDirectory());
    assert.equal(git(r.main, 'config', '--get', 'branch.hill-repeats.card'), '42');
    assert.ok(ghCalls(r).length > 0, 'the board is asked to move the card');
    const moves = ghCalls(r).length;
    const again = runIn(r, dir, ['--adopt', '--card', '42']);
    assert.ok(again.ok, again.out);
    assert.match(again.out, /was ready already/);
    assert.equal(portOf(dir), port);
    assert.equal(ghCalls(r).length, moves, 'the card is not told twice');
  });

  it('an .env an orchestrator copied in from the main folder is written again with the session\'s own port', () => {
    const r = makeRepo();
    writeFileSync(join(r.main, '.env'), 'PORT=1\nKEY=kept\n');
    const dir = foreign(r, 'copied');
    writeFileSync(join(dir, '.env'), 'PORT=1\nKEY=kept\n');
    assert.ok(runIn(r, dir, ['--adopt']).ok);
    const env = readFileSync(join(dir, '.env'), 'utf8');
    assert.equal(env.match(/^PORT=/gm)?.length, 1);
    assert.notEqual(portOf(dir), '1');
  });

  it('an adopted session is listed, served from and finished like any other, wherever its folder is', () => {
    const r = makeRepo();
    const dir = foreign(r, 'far-away');
    assert.ok(runIn(r, dir, ['--adopt', '--card', '42']).ok);
    assert.match(ran(r, '--list').out, /far-away\b.*port \d+.*card #42/);
    commitIn(dir, 'far.txt', 'x\n', 'Far: a file');
    const done = run(r, '--finish', 'far-away', '--no-checks');
    assert.ok(done.ok, done.out);
    assert.equal(git(r.main, 'log', '-1', '--format=%s', 'main'), 'Far: a file');
  });

  it('--adopt does nothing in the main folder and refuses a folder on main or on no branch', () => {
    const r = makeRepo();
    const inMain = runIn(r, r.main, ['--adopt']);
    assert.ok(inMain.ok, inMain.out);
    assert.match(inMain.out, /main folder: nothing to adopt/);
    assert.ok(!existsSync(join(r.main, '.env')));
    const dir = join(r.root, 'elsewhere', 'loose');
    git(r.main, 'worktree', 'add', '--detach', dir, 'main');
    const refused = runIn(r, dir, ['--adopt']);
    assert.ok(!refused.ok);
    assert.match(refused.out, /no branch/);
  });

  it('--release unlinks the packages before the folder is deleted, and the main folder keeps its own', () => {
    const r = makeRepo();
    mkdirSync(join(r.main, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(r.main, 'node_modules', '.bin', 'tsc'), 'x');
    const dir = foreign(r, 'going');
    assert.ok(runIn(r, dir, ['--adopt']).ok);
    const out = runIn(r, dir, ['--release']);
    assert.ok(out.ok, out.out);
    assert.ok(!existsSync(join(dir, 'node_modules')), 'the link is gone');
    assert.ok(existsSync(join(r.main, 'node_modules', '.bin', 'tsc')), 'the main folder\'s packages stay');
  });

  it('with "orchestrator": "orca" a new session\'s folder is Orca\'s, on the kit\'s branch name, from the local main', () => {
    const { r, calls } = withOrca();
    commitIn(r.main, 'unpushed.txt', 'x\n', 'a finished feature that is not pushed');
    const made = run(r, 'hill-repeats', '--card', '42', '--start', '/build hill-repeats');
    assert.ok(made.ok, made.out);
    const dir = join(r.root, 'orca-home', 'hill-repeats');
    assert.match(made.out, /orca-home/);
    assert.equal(git(dir, 'branch', '--show-current'), 'hill-repeats');
    assert.ok(existsSync(join(dir, 'unpushed.txt')), 'it starts from the local main, unpushed features included');
    assert.ok(portOf(dir));
    const create = calls().find((c) => c.slice(0, 2).join(' ') === 'worktree create') ?? [];
    assert.deepEqual([create[create.indexOf('--repo') + 1], create[create.indexOf('--setup') + 1]], ['id:r1', 'skip']);
    assert.ok(calls().some((c) => c.includes('--workspace-status') && c.includes('in-progress')), 'Orca is told it is in progress');
    assert.ok(calls().some((c) => c.slice(0, 2).join(' ') === 'reference add' && /\/issues\/42$/.test(c[2]) && c.includes(`path:${dir}`)), 'the card is a link on the session');
    const terminal = calls().find((c) => c.slice(0, 2).join(' ') === 'terminal create') ?? [];
    assert.equal(terminal[terminal.indexOf('--command') + 1], 'claude "/build hill-repeats"');
    commitIn(dir, 'h.txt', 'x\n', 'Hills: repeats');
    assert.ok(run(r, '--finish', 'hill-repeats', '--no-checks').ok);
    assert.equal(git(r.main, 'log', '-1', '--format=%s', 'main'), 'Hills: repeats');
    assert.ok(ran(r, '--clean', '--yes').ok);
    assert.ok(!existsSync(dir), 'finished: the folder is taken away, wherever it was');
  });

  it('--serve opens the link in the session\'s own browser tab in Orca, and --phone as a phone', async () => {
    const { r, calls } = withOrca();
    ran(r, 'screen');
    const dir = join(r.root, 'orca-home', 'screen');
    let port = 8990 + PORTS;
    while (!(await new Promise<boolean>((ok) => { const s = createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))); s.listen(port, '127.0.0.1'); }))) port++;
    writeFileSync(join(dir, '.env'), readFileSync(join(dir, '.env'), 'utf8').replace(/^PORT=\d+\s*$/m, `PORT=${port}`));
    const pid = join(r.root, 'server.pid');
    writeFileSync(join(dir, 'server.cjs'), `require('fs').writeFileSync(process.argv[2],String(process.pid));require('http').createServer((q,s)=>s.end('ok')).listen(${port},'127.0.0.1');`);
    commitIn(dir, 'package.json', JSON.stringify({ scripts: { dev: `node server.cjs "${pid.replace(/\\/g, '/')}"` } }), 'dev script');
    try {
      const out = run(r, '--serve', 'screen', '--phone');
      assert.ok(out.ok, out.out);
      assert.match(out.out, /Orca: {3}open in the session's own browser tab, as iPhone 12/);
      const tab = calls().find((c) => c.slice(0, 2).join(' ') === 'tab create') ?? [];
      assert.deepEqual([tab[tab.indexOf('--url') + 1], tab[tab.indexOf('--worktree') + 1]], [`http://127.0.0.1:${port}`, `path:${dir}`]);
      assert.ok(calls().some((c) => c.slice(0, 2).join(' ') === 'set device' && c.includes('iPhone 12')));
    } finally { try { process.kill(Number(readFileSync(pid, 'utf8'))); } catch { /* not started */ } }
  });

  it('an Orca that does not answer is one warning line: the folder is made next to the main one', () => {
    const { r } = withOrca();
    r.env = { ...r.env, ORCA_FAIL: '1' };
    const made = run(r, 'no-orca');
    assert.ok(made.ok, made.out);
    assert.equal(made.out.match(/Orca warning:/g)?.length, 1);
    assert.ok(existsSync(r.wt('no-orca')));
    assert.equal(git(r.wt('no-orca'), 'branch', '--show-current'), 'no-orca');
  });

  it('--connect orca writes the setting, shows the project\'s other worktrees in Orca and tells it each session\'s card', () => {
    const { r, calls } = withOrca();
    const at = join(r.main, 'workflow/config.json');
    writeFileSync(at, readFileSync(at, 'utf8').replace('"orchestrator":"orca"', '"orchestrator":"none"'));
    assert.ok(runIn(r, r.main, ['old-one', '--card', '42']).ok);
    const out = run(r, '--connect', 'orca');
    assert.ok(out.ok, out.out);
    assert.match(readFileSync(at, 'utf8'), /"orchestrator":\s*"orca"/);
    assert.ok(calls().some((c) => c.includes('--external-worktree-visibility') && c.includes('show')));
    assert.ok(calls().some((c) => c.includes(`path:${r.wt('old-one')}`) && c.some((x) => /card #42/.test(x))));
    assert.match(out.out, /shows its 1 open session: old-one/);
  });

  it('the setting is added to a config that lacks it and left alone when it is there', () => {
    assert.match(withOrchestrator('{\n  "session": {\n    "prefix": "app"\n  }\n}', 'orca') ?? '', /"session": \{\n    "orchestrator": "orca",\n    "prefix": "app"/);
    assert.equal(withOrchestrator('{ "session": { "orchestrator": "orca" } }', 'orca'), null);
    assert.equal(withOrchestrator('{}', 'orca'), null);
  });
});
