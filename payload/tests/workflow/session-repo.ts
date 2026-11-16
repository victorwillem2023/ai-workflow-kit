// The throwaway repos the session-script tests run in: a bare "origin" and a clone in the shape of the project (the
// session scripts, a tiny map and check script, a fake `gh` that records its calls), so no test touches the real folders.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const SCRIPTS = ['session.mjs', 'session-core.mjs', 'session-extras.mjs', 'session-stop.mjs', 'packages.mjs'].map((f) => resolve('scripts', f));
export const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
export const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const roots: string[] = [];
/** Added to every port these tests use (WORKFLOW_TEST_PORTS): the kit's self-test runs projects side by side, each in its own range,
 *  because a session's --finish stops whatever listens on its port. */
export const PORTS = Number(process.env.WORKFLOW_TEST_PORTS ?? 0);

export interface Repo { root: string; main: string; origin: string; wt: (t: string) => string; env: Record<string, string>; ghLog: string; checkLog: string }

// The project's own map script is replaced by a tiny one: docs/MAP.md lists the .txt files, so two sessions that each add one conflict.
const MAP_SCRIPT = `const {execFileSync}=require('child_process'),fs=require('fs');
const f=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).split('\\n').filter(x=>x.endsWith('.txt')).sort();
fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/MAP.md','# map\\n'+f.map(x=>'- '+x+'\\n').join(''));`;
const CHECK_SCRIPT = `if(process.env.CHECK_LOG)require('fs').appendFileSync(process.env.CHECK_LOG,'t');`;
// A fake gh: records every call, answers like a board with the project's columns, and fails like a dead network when GH_FAIL is set.
const FAKE_GH = `const fs=require('fs');const a=process.argv.slice(2);let input='';try{input=fs.readFileSync(0,'utf8')}catch{}
fs.appendFileSync(process.env.GH_LOG,JSON.stringify({args:a,input})+'\\n');
if(process.env.GH_FAIL){console.error('error connecting to api.github.com');process.exit(1)}
const cols=['Backlog','Needs a board or decision','Ready','In progress','Waiting for your check','Done'];
const cmd=a.slice(0,2).join(' ');const out=(o)=>console.log(JSON.stringify(o));
if(cmd==='project field-list')out({fields:[{id:'F',name:'Status',options:cols.map((name,i)=>({id:'o'+i,name}))}]});
else if(cmd==='project view')out({id:'P'});
else if(cmd==='api graphql')out({data:{repository:{issue:{projectItems:{nodes:[{id:'I42',project:{number:1}}]}}}}});
else if(cmd==='issue view')out({number:42,projectItems:[{status:{name:process.env.CARD_COLUMN||'In progress'}}]});
else out({});`;
export const OPTION = { 'In progress': 'o3', 'Waiting for your check': 'o4' };
/** A throwaway project with its origin; `prefix` names the session folders (<prefix>-<topic>), as `session.prefix` does in a project. */
export function makeRepo({ prefix = 'app' }: { prefix?: string } = {}): Repo {
  // a space and a "~" in the path, as in C:\Users\John Smith or a Windows short name (RUNNER~1): paths must survive both
  const root = mkdtempSync(join(tmpdir(), 'session ~'));
  roots.push(root);
  const origin = join(root, 'origin.git');
  git(root, 'init', '--bare', '-b', 'main', origin);
  const main = join(root, 'app');
  git(root, 'clone', origin, main);
  git(main, 'checkout', '-b', 'main');
  mkdirSync(join(main, 'scripts')); mkdirSync(join(main, 'node_modules'));
  for (const s of SCRIPTS) copyFileSync(s, join(main, 'scripts', basename(s)));
  mkdirSync(join(main, 'tools', 'workflow', 'lib'), { recursive: true });
  // the board library and what it imports (a missing one fails every card move in these repos, silently: the board is only a warning)
  for (const lib of ['board.mjs', 'cardgraph.mjs']) copyFileSync(resolve('tools/workflow/lib', lib), join(main, 'tools', 'workflow', 'lib', lib));
  // the project's own config, with the session folders named app-<topic> whatever the project calls its own
  const config = JSON.parse(readFileSync(resolve('workflow.config.json'), 'utf8'));
  writeFileSync(join(main, 'workflow.config.json'), JSON.stringify({ ...config, session: { prefix, firstPort: 8788 + PORTS, mainPort: 8787 + PORTS, env: {} } }));
  writeFileSync(join(main, 'package.json'), JSON.stringify({ scripts: { map: 'node map.cjs', test: 'node check.cjs' } }));
  writeFileSync(join(main, 'map.cjs'), MAP_SCRIPT); writeFileSync(join(main, 'check.cjs'), CHECK_SCRIPT);
  writeFileSync(join(root, 'fake-gh.cjs'), FAKE_GH);
  writeFileSync(join(main, '.gitignore'), 'node_modules/\n.env\n# waiting specs are local\nspecs/\n');
  writeFileSync(join(main, 'a.txt'), 'one\n');
  execFileSync('node', ['map.cjs'], { cwd: main });
  git(main, 'add', '-A'); git(main, 'commit', '-m', 'start'); git(main, 'push', '-u', 'origin', 'main');
  const ghLog = join(root, 'gh.log'); const checkLog = join(root, 'check.log');
  return { root, main, origin, wt: (t) => join(root, `${prefix}-${t}`), ghLog, checkLog,
    env: { WORKFLOW_GH: join(root, 'fake-gh.cjs'), GH_LOG: ghLog, CHECK_LOG: checkLog } };
}
export const run = (r: Repo, ...args: string[]) => {
  try { return { ok: true, out: execFileSync('node', [join(r.main, 'scripts', 'session.mjs'), ...args], { cwd: r.main, env: { ...ENV, ...r.env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { const x = e as { stdout?: string; stderr?: string }; return { ok: false, out: `${x.stdout ?? ''}${x.stderr ?? ''}` }; }
};
export const commitIn = (dir: string, file: string, text: string, msg: string) => { writeFileSync(join(dir, file), text); git(dir, 'add', file); git(dir, 'commit', '-m', msg); };
/** A session's new file, with the file map brought up to date as the project's own gate would. */
export const addFile = (dir: string, file: string, msg: string) => { writeFileSync(join(dir, file), `${file}\n`); execFileSync('node', ['map.cjs'], { cwd: dir }); git(dir, 'add', '-A'); git(dir, 'commit', '-m', msg); };
export const ghCalls = (r: Repo) => (existsSync(r.ghLog) ? readFileSync(r.ghLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { args: string[]; input: string }) : []);
export const ghCmd = (c: { args: string[] }) => c.args.slice(0, 2).join(' ');
export const fileMap = (dir: string) => readFileSync(join(dir, 'docs', 'MAP.md'), 'utf8');
export const originMain = (r: Repo) => git(r.origin, 'rev-parse', 'main');
export const originHas = (r: Repo, file: string) => { try { git(r.origin, 'cat-file', '-e', `main:${file}`); return true; } catch { return false; } };
