// The gate's policy checks, kept apart so gate.mjs stays small: no spike code on main, an image that holds only what runs, model calls only through one wrapper,
// outbound hosts and IP rules as code, a person's sign-off on sensitive files, migrations that never change once they ran, and docs that change with what they cover.
// Each entry is [name, () => { ok, out?, note? }] or false when it does not apply, the same shape as the gate's own steps.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { staleDocs, parseNameStatus } from './doccovers.mjs';
import { imageProblems } from './dockercheck.mjs';
import { ipRuleProblems, unlistedEgress } from './network.mjs';
import { signoffVerdict } from './signoff.mjs';
import { aiProblems } from './aicheck.mjs';
import { editedMigrations } from './datacheck.mjs';

export { dataAdvice } from './datacheck.mjs';

/** The steps, from what the gate already knows: the config, git, the base commit, the code files, the docs. */
export function policySteps({ config, git, gitOk, base, files, isTest, matchesAny, readText, docTexts }) {
  return [
  ['spikes', () => {
    // a spike's code is thrown away (node scripts/session.mjs --drop spike-<topic>); what it taught is in docs/decisions/
    if (/^spike-/.test(gitOk('branch', '--show-current') ?? '')) return { ok: true, note: 'a spike: its code never lands' };
    const kept = git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'spikes').split('\n').filter(Boolean);
    return kept.length ? { ok: false, out: `${kept.slice(0, 5).join(', ')}${kept.length > 5 ? ` and ${kept.length - 5} more` : ''}: spike code outside a spike session. A spike is thrown away; build the idea properly from a card (its decision note says what it proved).` } : { ok: true };
  }],
  existsSync('Dockerfile') && ['image', () => {
    // the image holds only what runs, as a user who is not root, from a pinned base; no secret in its history
    const p = imageProblems(readText('Dockerfile'), existsSync('.dockerignore') ? readText('.dockerignore') : null);
    return p.length ? { ok: false, out: `${p.join('\n')}\nThe rules and why: docs/run/INFRA.md, *Container images*.` } : { ok: true };
  }],
  (Array.isArray(config.security?.egress) || config.security?.ipRules?.length) && ['network', () => {
    // every outside host the code calls is on the allowlist; every IP rule is a real range with a reason and an end date
    const code = new Map([...files].filter(([f]) => !isTest(f) && matchesAny(f, config.settings?.include ?? ['src/**'])));
    const p = [...(Array.isArray(config.security.egress) ? unlistedEgress(code, config.security.egress) : []),
      ...ipRuleProblems(config.security.ipRules).filter((x) => !/^ended on/.test(x.what)).map((x) => `${x.where} ${x.what}`)];
    return p.length ? { ok: false, out: p.join('\n') } : { ok: true, note: Array.isArray(config.security.egress) ? `${config.security.egress.length} hosts allowed out` : '' };
  }],
  config.sensitive?.paths?.length && ['signoff', () => {
    // a change to money, health, legal or personal-data files needs a person's sign-off for this exact version (npm run signoff)
    const all = [...git('diff', '--name-only', base).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean);
    const v = signoffVerdict({ changed: all, paths: config.sensitive.paths, matches: matchesAny, read: (f) => readText(f) ?? undefined, signoffs: readText('docs/company/SIGNOFFS.md') });
    return v.ok ? { ok: true, note: v.files.length ? `${v.files.length} signed` : '' } : { ok: false, out: v.line };
  }],
  config.data?.migrations?.length && ['migrations', () => {
    // a migration that was there before this change has run somewhere: it is never edited, renamed or deleted (docs/workflow/DATA.md)
    const hit = editedMigrations(gitOk('diff', '--name-status', '-M', base) ?? '', config.data.migrations, matchesAny);
    return hit.length ? { ok: false, out: `${hit.map((m) => `${m.file} is a migration that was ${m.how}`).join('\n')}\nA migration that has run is never changed: put it back and write a new one (docs/workflow/DATA.md, *Migrations*).` } : { ok: true };
  }],
  ['covers', () => {
    // a doc that names what it covers (<!-- covers: infra/** -->) changes with it, or the spec or a commit says why not
    const changes = parseNameStatus(gitOk('diff', '--name-status', '-M', base) ?? '', git('ls-files', '--others', '--exclude-standard').split('\n'));
    const specs = existsSync('specs') ? readdirSync('specs').filter((f) => f.endsWith('.md')).map((f) => readFileSync(`specs/${f}`, 'utf8')).join('\n') : '';
    const waivers = `${specs}\n${gitOk('log', `${base}..HEAD`, '--format=%B') ?? ''}`;
    const stale = staleDocs({ docs: docTexts, changes, matches: matchesAny, waivers, ignore: [config.map?.out, config.map?.infraOut ?? 'docs/run/INFRA-MAP.md', config.baseline].filter(Boolean) });
    if (stale.length) return { ok: false, out: `${stale.map((s) => `${s.doc} covers ${s.files.slice(0, 5).join(', ')}${s.files.length > 5 ? ` and ${s.files.length - 5} more` : ''}, which changed; the doc did not`).join('\n')}\nUpdate the doc in the same change. If it truly needs nothing, write in the spec (or the commit body) one line: "Docs: no change to <doc> (<why>)".` };
    return { ok: true };
  }],
  ['ai', () => {
    // every model call goes through the one wrapper file, where the guards live (docs/workflow/AI-SECURITY.md)
    const code = new Map([...files].filter(([f]) => !isTest(f)));
    const p = aiProblems(code, config.ai?.wrapper);
    return p.length ? { ok: false, out: p.join('\n') } : { ok: true, note: config.ai?.wrapper ? `models only through ${config.ai.wrapper}` : '' };
  }],
  ];
}
