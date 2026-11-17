// Which phase the facts fit (no I/O here; workflow/tools/phase.mjs gathers them). Not a reminder on a timer: the phase follows
// who depends on the product. Prototype while nothing outside does; pilot once other people can open it or it keeps their personal
// data; production once it takes money or has a production address people rely on. The owner sets the phase in
// workflow/levels.json (lib/levels.mjs: what each one holds to); this file only says what fits, once per new fact, what is still
// missing for a phase, and whether a production deploy may go.

import { PHASES } from './levels.mjs';

/** The facts, each with the phase it calls for and the words that say it. */
export const FACTS = [
  { id: 'reachable', phase: 'pilot', says: 'other people can open it (an address in deploy, workflow/config.json)' },
  { id: 'personal', phase: 'pilot', says: 'it keeps other people\'s personal data (docs/company/PRIVACY.md, or its rule in "together")' },
  { id: 'money', phase: 'production', says: 'it takes money (a payment package among the dependencies)' },
  { id: 'relied', phase: 'production', says: 'it has a production address people rely on (deploy.environments.production, or a launch decision record)' },
];

/** The payment providers a dependency name or a manifest line gives away. */
export const PAYMENT = /(?:^|[\s"'/@:=])(stripe|paddle|lemonsqueezy|lemon-squeezy|mollie|braintree|paypal|adyen|chargebee|recurly)(?=[\s"'/:@=-]|$)/im;

const rank = (p) => PHASES.indexOf(p);

/**
 * The facts that are true, and the phase they fit (the strictest one any calls for).
 * @param {{ reachable?: boolean, personal?: boolean, money?: boolean, relied?: boolean }} f
 */
export function fitPhase(f) {
  const facts = FACTS.filter((x) => f[x.id]);
  const fit = facts.reduce((p, x) => (rank(x.phase) > rank(p) ? x.phase : p), 'prototype');
  return { facts, fit };
}

/**
 * The /next line: the phase in a few words, quiet; and, only for a fact not said before that calls for more than the phase set,
 * what it means and how to switch. Returns { status, notice, said } (said: every fact id said so far, to keep).
 */
export function phaseLines({ phase, facts, said = [] }) {
  const why = facts.length ? facts.map((x) => x.says.replace(/ \(.*\)$/, '')).join('; ') : 'nothing outside depends on it yet';
  const status = `phase: ${phase} (${why})`;
  const fresh = facts.filter((x) => !said.includes(x.id) && rank(x.phase) > rank(phase));
  const { fit } = fitPhase(Object.fromEntries(facts.map((x) => [x.id, true])));
  // the other way, once too: a phase stricter than anything depends on (production from before the phases) slows building down
  const lighter = rank(fit) < rank(phase) && !said.includes(`lighter:${fit}`);
  const notice = fresh.length
    ? `New: ${fresh.map((x) => x.says.replace(/ \(.*\)$/, '')).join('; ')}. That fits the ${fresh.reduce((p, x) => (rank(x.phase) > rank(p) ? x.phase : p), phase)} phase: `
      + 'the gate gets stricter and /ship runs the whole suite. npm run phase -- --ready says what is missing; the switch is yours: '
      + '"phase" in workflow/levels.json. This is said once.'
    : lighter
      ? `The facts fit the ${fit} phase, lighter than ${phase}: ${fit === 'prototype' ? 'the structure checks would only advise and /ship would run the tests the change reaches' : 'the structure checks would only advise'}, `
        + 'the safety stops stay. The switch is yours: "phase" in workflow/levels.json. This is said once.'
      : '';
  return { status, notice, said: [...new Set([...said, ...facts.map((x) => x.id), ...(lighter ? [`lighter:${fit}`] : [])])] };
}

/**
 * What a phase still needs, from what is in the project: [{ id, what }] of the missing ones (nothing missing: []).
 * @param {string} phase pilot or production (prototype needs nothing)
 * @param {{ personal?: boolean, privacyDoc?: boolean, errorsSeen?: boolean, securityDoc?: boolean, secops?: boolean,
 *   drill?: boolean, rollback?: boolean, monitoring?: boolean, runDocs?: boolean }} has
 */
export function missingFor(phase, has) {
  return needsFor(phase, has).filter((n) => !n.done).map(({ id, what }) => ({ id, what }));
}

/** Everything a phase needs, done or not: [{ id, what, done }] (the portal shows "2 of 5 done"). */
export function needsFor(phase, has) {
  const need = [
    ['privacy', ['pilot', 'production'], has.personal && !has.privacyDoc, 'what personal data is kept, why and where (docs/company/PRIVACY.md)'],
    ['errors', ['pilot', 'production'], !has.errorsSeen, 'errors you get to see: the logger and docs/PRODUCTION.md (the production module) or docs/run/MONITORING.md'],
    ['security', ['pilot', 'production'], !has.securityDoc, 'what is protected and what is open (docs/SECURITY.md, the security module)'],
    ['backups', ['production'], !has.drill, 'backups that were restored once: a restore drill on record (npm run drill, docs/run/RECOVERY.md)'],
    ['rollback', ['production'], !has.rollback, 'a way back: deploy.rollback (or the production environment\'s) in workflow/config.json'],
    ['monitoring', ['production'], !has.monitoring, 'who hears about it when it breaks, and how (docs/run/MONITORING.md)'],
    ['scan', ['production'], !has.secops, 'the weekly security scan (.github/workflows/secops.yml, /secops)'],
    ['run', ['production'], !has.runDocs, 'where and how it runs (docs/run/, /launch)'],
  ];
  // the privacy page is a need only for a project that keeps personal data: without any, it is not "done", it does not apply
  return need.filter(([id, phases]) => phases.includes(phase) && (id !== 'privacy' || has.personal))
    .map(([id, , missing, what]) => ({ id, what, ...SHORT[id], done: !missing }));
}

/** Each need in a few words, and where it is done (the docs portal's list; `what` says it in full for npm run phase). */
const SHORT = {
  privacy: { short: 'Personal data written down', how: 'docs/company/PRIVACY.md' },
  errors: { short: 'Errors you can see', how: 'the production module, or docs/run/MONITORING.md' },
  security: { short: 'What is protected, and what is open', how: 'docs/SECURITY.md' },
  backups: { short: 'A restore that worked once', how: 'npm run drill' },
  rollback: { short: 'A way back', how: 'deploy.rollback in workflow/config.json' },
  monitoring: { short: 'Someone hears when it breaks', how: 'docs/run/MONITORING.md' },
  scan: { short: 'The weekly security scan', how: '/secops' },
  run: { short: 'Where and how it runs', how: '/launch' },
};

/** Who depends on it, in a few words per fact (the portal's phase tile). */
export const FACT_SHORT = { reachable: 'Others can open it', personal: 'Keeps personal data', money: 'Takes money', relied: 'People rely on it' };

/** A production deploy goes only in the production phase: null when it may, else the line that says why not. */
export function deployRefusal(phase) {
  if (phase === 'production') return null;
  return `Refused: this is a production deploy and the phase is ${phase} (workflow/levels.json). Production means people rely on it, `
    + 'so the stricter checks come first: npm run phase -- --ready says what is missing, then the owner sets "phase": "production".';
}
