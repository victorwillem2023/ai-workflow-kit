// Several apps in one repository (a monorepo): each app's typecheck and tests run in its own folder with its own commands, for the
// apps a change reaches. `apps` in workflow/config.json:
//   "apps": [{ "name": "web", "root": "apps/web", "commands": { "typecheck": "npm run typecheck", "testAll": "npm test" } }, ...]
//   "shared": ["packages/**"]   code every app uses: a change there runs every app
// A change inside an app's root reaches that app; one in shared code reaches all of them; --all runs them all. The other checks
// (secrets, size, layers, docs...) stay once for the whole repository, and the root's own typecheck and tests still run for the
// code outside the apps (the kit's own tools among it). No I/O here: the gate passes `run`.

/** The apps a change reaches: [app], in the config's order. */
export function appsReached(apps, changed, { all = false, shared = [], matches }) {
  if (all) return [...apps];
  const inShared = changed.some((f) => matches(f, shared));
  return apps.filter((a) => inShared || changed.some((f) => f === a.root || f.startsWith(`${a.root.replace(/\/$/, '')}/`)));
}

/** The gate's steps for the apps a change reaches: ['typecheck web', fn], ['tests web', fn], ... */
export function appSteps({ config, changed, all, run, matches }) {
  const apps = Array.isArray(config.apps) ? config.apps : [];
  return appsReached(apps, changed, { all, shared: config.shared ?? [], matches }).flatMap((a) => {
    const cmd = a.commands ?? {};
    return [
      cmd.typecheck && [`typecheck ${a.name}`, () => run(cmd.typecheck, a.root)],
      cmd.testAll && [`tests ${a.name}`, () => ({ ...run(cmd.testAll, a.root), note: `${a.root}, its whole suite` })],
    ].filter(Boolean);
  });
}
