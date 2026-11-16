#!/usr/bin/env node
// The kit's library (lib/library.mjs): guides a project does not get from the start, for the moment its app could use one.
//   npm run library -- --list          each guide: what it is, the sign that it may help, and whether this project has it
//   npm run library -- --show <name>   the guide's text, from the kit on this computer: read it to find the right answer
//                                      for this app, before anything is added
//   npm run library -- --add <name>    bring it into the project (the kit's update adds it as a part and keeps it current);
//                                      only on the owner's yes, and committed with the change that needed it
// The skills that plan big parts (/advise, /arch, /launch, /market) look here before proposing one.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIBRARY, libraryLines, libraryTaken } from './lib/library.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
process.chdir(git('rev-parse', '--show-toplevel') ?? '.');
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const mark = existsSync('workflow/record') ? readFileSync('workflow/record', 'utf8') : '';
const taken = libraryTaken(/^library=(.*)$/m.exec(mark)?.[1], (f) => existsSync(f));
const args = process.argv.slice(2);
const named = (flag) => { const n = args[args.indexOf(flag) + 1]; return n && n in LIBRARY ? n : null; };
const unknown = (flag) => { console.error(`library: say which guide: ${flag} <${Object.keys(LIBRARY).join('|')}> (npm run library -- --list)`); process.exit(1); };
// where the kit is on this computer (the installer sets workflow.kit), and how to get it when it is not there
const kit = git('config', 'workflow.kit');
const kitHere = kit && existsSync(join(kit, 'install.mjs'));
const getKit = () => {
  const ref = /^ref=(.+)$/m.exec(mark)?.[1]?.trim(), repo = /^kitRepo=(.+)$/m.exec(mark)?.[1]?.trim();
  return `the kit is not on this computer${kit ? ` (${kit})` : ''}${ref && repo ? `: git clone --branch ${ref} ${repo} <folder>, then git config workflow.kit <folder>` : ''}`;
};

if (args.includes('--show')) {
  const name = named('--show') ?? unknown('--show');
  const [file] = LIBRARY[name].files;
  const from = existsSync(file) ? file : kitHere ? join(kit, 'payload', file) : null;
  if (!from || !existsSync(from)) { console.error(`library: ${getKit()}`); process.exit(1); }
  console.log(readFileSync(from, 'utf8'));
  if (!existsSync(file)) console.log(`\n(from the kit's library; npm run library -- --add ${name} brings it into the project as ${file}, on the owner's yes)`);
} else if (args.includes('--add')) {
  const name = named('--add') ?? unknown('--add');
  if (taken.includes(name)) { console.log(`library: ${name} is in this project already (${LIBRARY[name].files.join(', ')})`); process.exit(0); }
  if (!kitHere) { console.error(`library: ${getKit()}`); process.exit(1); }
  const own = ['--project', config.name, '--repo', config.board?.repo, '--prefix', config.session?.prefix].flatMap((a, i, all) => (i % 2 === 0 && all[i + 1] ? [a, all[i + 1]] : []));
  const r = spawnSync(process.execPath, [join(kit, 'install.mjs'), '.', ...own, '--update', '--with', name], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  spawnSync(process.execPath, ['workflow/tools/map.mjs'], { stdio: 'inherit' });
  console.log(`library: ${name} is in the project: ${LIBRARY[name].files.join(', ')} (read by ${LIBRARY[name].read}). Commit it with the change that needed it.`);
} else {
  console.log(['The kit\'s library: guides a project takes when its app could use one (--show <name> reads one, --add <name> brings it in).', ...libraryLines(taken).map((l) => `  ${l}`)].join('\n'));
}
