// Which phase the project is in and which one the facts fit (lib/phase.mjs has the rules; lib/levels.mjs what each phase holds to).
// The facts are read from the project, never asked: an address in deploy, personal data on docs/company/PRIVACY.md, a payment
// package, a production environment or a launch decision record. /next runs it with --next: one quiet line, and a fact that calls
// for a stricter phase is said once (remembered in git's folder, this computer only). The owner switches; this never does.
//   npm run phase                  the phase, the facts, and what the next one still needs
//   npm run phase -- --next        the line for /next (prints nothing more than the status once a fact is said)
//   npm run phase -- --ready [pilot|production]   what that phase still needs (default: the next one up)
//   npm run phase -- --json        the phase, the facts and every need of the next phase, done or not (the docs portal)
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FILE, PHASES, readLevels } from './lib/levels.mjs';
import { PAYMENT, fitPhase, missingFor, needsFor, phaseLines } from './lib/phase.mjs';
import { isProductionEnv } from './lib/production.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const root = git('rev-parse', '--show-toplevel');
if (root) process.chdir(root);
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
const config = JSON.parse(read('workflow/config.json') ?? '{}');
const args = process.argv.slice(2);
const levels = readLevels(read(FILE), (config.checks ?? []).map((c) => c.name));
const phase = levels.phase;

/** The facts and what is in place, from the files. */
function gather() {
  const d = config.deploy ?? {};
  const envs = Object.entries(d.environments ?? {});
  const decisions = existsSync('docs/decisions') ? readdirSync('docs/decisions') : [];
  const privacy = read('docs/company/PRIVACY.md') ?? '';
  // a real row under "What is kept" (the template's own row starts with "<e.g.")
  const kept = /## What is kept[\s\S]*?(?=\n## |$)/.exec(privacy)?.[0] ?? '';
  const privacyRows = kept.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*(Data|-{3}|<)/.test(l)).length > 0;
  const privacyRule = (config.together ?? []).some((t) => (t.needs ?? []).includes('docs/company/PRIVACY.md'));
  const manifests = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml'].map(read).filter(Boolean);
  const deps = (() => { try { const p = JSON.parse(read('package.json') ?? '{}'); return Object.keys({ ...p.dependencies, ...p.devDependencies }); } catch { return []; } })();
  const money = deps.some((n) => PAYMENT.test(` ${n} `)) || manifests.slice(1).some((m) => PAYMENT.test(m));
  const facts = {
    reachable: Boolean(d.url || envs.some(([, e]) => e?.url)),
    personal: privacyRows || privacyRule,
    money,
    relied: envs.some(([n, e]) => isProductionEnv(n) && e?.url) || decisions.some((f) => /-launch\.md$/.test(f)),
  };
  const has = {
    personal: facts.personal, privacyDoc: privacyRows,
    errorsSeen: existsSync('docs/PRODUCTION.md') || existsSync('docs/run/MONITORING.md'),
    securityDoc: existsSync('docs/SECURITY.md'), secops: existsSync('.github/workflows/secops.yml'),
    drill: /^\| Last restore drill \| \d{4}-\d{2}-\d{2}/m.test(read('docs/run/RECOVERY.md') ?? ''),
    rollback: Boolean(d.rollback || envs.some(([n, e]) => isProductionEnv(n) && e?.rollback)),
    monitoring: existsSync('docs/run/MONITORING.md'), runDocs: existsSync('docs/run'),
  };
  return { facts, has };
}

const { facts, has } = gather();
const { facts: trueFacts, fit } = fitPhase(facts);
const up = PHASES[Math.min(PHASES.indexOf(phase) + 1, PHASES.length - 1)];
const list = (target) => missingFor(target, has).map((m) => `  - ${m.what}`).join('\n');

if (args.includes('--json')) {
  // for the docs portal: the phase, the facts, what fits, and every need of the next phase, done or not
  const status = phaseLines({ phase, facts: trueFacts }).status;
  console.log(JSON.stringify({ phase, fit, status, facts: trueFacts.map((f) => f.id), next: phase === 'production' ? null : up, needs: phase === 'production' ? [] : needsFor(up, has) }));
} else if (args.includes('--next')) {
  // remembered per computer in git's own folder, shared by the session folders; never committed
  const at = join(git('rev-parse', '--git-common-dir') ?? '.git', 'workflow-phase-said');
  const said = (read(at) ?? '').split('\n').filter(Boolean);
  const out = phaseLines({ phase, facts: trueFacts, said });
  console.log(out.status);
  if (out.notice) console.log(out.notice);
  try { writeFileSync(at, `${out.said.join('\n')}\n`); } catch { /* a read-only checkout: said again next time */ }
} else if (args.includes('--ready')) {
  const asked = args[args.indexOf('--ready') + 1];
  const target = PHASES.includes(asked) ? asked : up;
  const missing = list(target);
  console.log(missing ? `For the ${target} phase, still missing:\n${missing}` : `Nothing missing for the ${target} phase.`);
} else {
  console.log(phaseLines({ phase, facts: trueFacts }).status);
  if (PHASES.indexOf(fit) > PHASES.indexOf(phase)) console.log(`The facts fit the ${fit} phase. The switch is yours: "phase" in ${FILE}.`);
  if (phase !== 'production') { const missing = list(up); console.log(missing ? `For the ${up} phase, still missing:\n${missing}` : `Nothing missing for the ${up} phase.`); }
}
