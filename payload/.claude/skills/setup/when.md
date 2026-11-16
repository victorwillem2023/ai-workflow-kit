# /setup: what to write for the parts a project has

Read by `/setup` step 3, one section at a time: *Versions*, *Tools*, *Sensitive and access* and *The deploy* for every
project, the others only for a part the project has. The files every project gets (the config, CLAUDE.md, the folder notes, the code notes, the guide and architecture, setup and conventions) are in the
skill itself.

## When the ui module is installed
When the ui module is installed: in `src/web/CLAUDE.md` fill *New feature here* and *Rules here*, and `docs/code/web.md`; leave `docs/STYLE.md` for the first `/ui` board
(its tokens come from there), unless the owner already has a brand: then put its colours in the tokens file (`ui.tokens`, `src/web/styles.css` by default; set it where the project keeps them) and `docs/STYLE.md`.

## When the ui module is **not** installed
When the ui module is **not** installed (no `src/web/CLAUDE.md`): take the *UI style* section, the board and picture lines and
the `docs/design` paths out of `CLAUDE.md`, and the `ui` type out of `workflow/config.json`.

## When the map module is installed
When the map module is installed (`docs/flow/`): the questions and the kinds in `docs/REQUESTS.md` from answer 1, the first
real parts in `docs/flow/map.js` (an end not built yet is `gap`), then `node docs/flow/build-requests.mjs`.

## After a framework starter
**After a framework starter** (Vite, Next.js, SvelteKit): `package.json` needs the scripts `dev.cmd` and `start.cmd` call
(`dev`, `build`, `start`; with Vite `start` is `vite preview`). The installer wrote `tsconfig.gate.json` for `npm run typecheck`
when the starter's own `tsconfig.json` checks nothing by itself: keep its `include` on every folder with code. Keep one
linter: with Biome, take the starter's ESLint config and packages out. With a UI framework, `ui.boards` in the config is
`components`: `/ui` draws its variants as real components (the installer sets it when it finds the framework).

## When the security module is installed
When the security module is installed: the first lines of `docs/SECURITY.md` (how to share a link safely, from answer 3).

## Checks that follow from the stack
**Checks that follow from the stack** (`workflow/config.json`; `workflow/tools/README.md`, *What it checks*): with a database,
`together` keeps table and migration in one change (`{ "name": "migration", "when": ["<the schema file>"], "needs": ["<the migrations folder>/**"] }`);
with screens, the `e2e` entry of `stack.md` part 7 in `checks` (required: a smoke test and an accessibility scan per main
screen) and `performance.files` pointing at the built files (the `page weight` check); `knip.json` when the app starts somewhere else than `src/index.ts`.
With personal data (answer 4 of the product questions), `together` also keeps the tables and `docs/company/PRIVACY.md` in one change
(`{ "name": "privacy", "when": ["<the schema file>"], "needs": ["docs/company/PRIVACY.md"] }`).

## Sensitive and access
**Sensitive and access**: `sensitive.paths` from answer 3 (the gate's *signoff* check; an empty list until there is such code);
with accounts, `security.signIn: true`, the sign-in and permission code under `sensitive.paths`, and the roles table of
`workflow/guides/PERMISSIONS.md` (who may what, and what never) in *Rules for code* of the security page, each rule with its
row in *Rules and where each lives*. With stored data: the folder that owns the queries, a `boundaries` rule so only it uses
the database library (`{ "name": "only the data folder talks to the database", "from": "src/**", "except": ["src/<data folder>/**"],
"forbidUse": ["<the database library>"] }`), and `data.migrations` set to where this stack's migrations are;
in `docs/company/ACCESS.md` a row for the owner and every account the app already depends on (GitHub, the cloud, the domain, the sign-in
provider), then `npm run access` must list nothing unexpected. **`docs/run/ENVIRONMENTS.md`**: the *This project* row for `dev`;
the rest waits for `/launch`. `security.domains`: the app's public addresses once it has any (their certificates are watched).
`security.egress`: every outside host the code calls today (the gate's *network* check), and `docs/run/NETWORK.md` from answer 3.
AI inside the app (stack.md 6b): `ai.wrapper`, the one file that calls the model, and its first hostile cases in `quality`.

## Tools
**Tools**: for each tool the project uses that `workflow/guides/TOOLS.md` lists under *Leaving*, one line to the owner with what replaced it
and what moving costs; never change it without a yes (it becomes a card).

## Versions
**Versions**: `.tool-versions` with the exact Node (and any other tool) the app uses, the same Node in the `Dockerfile` and
`@types/node`; the gate's *versions* check must pass. Renovate: say the owner installs its GitHub app for the repository
(https://github.com/apps/renovate); several repositories: the policy goes to a config repository of their own.

## When the production module is installed
When the production module is installed (`docs/PRODUCTION.md`): fill the first rows of `docs/company/PRIVACY.md` from the product
answers (what is kept, why, where; "not decided" where it is not), and the logger's `personal` list from them. Don't ask
about hosts, clusters or queues now: `workflow/guides/LIFECYCLE.md` says they are decided by `/launch` when the first deploy card comes.
Another language than TypeScript: write the same three parts (checked settings, safe logs, health and stopping) in the
language's own way when the server is first built, and point `docs/PRODUCTION.md` at those files when the run stage starts.

## The deploy is the run stage's
The deploy is the run stage's (`/launch` starts it and brings `docs/run/`): do not fill deploy pages now. Write `.env.example`;
the host chosen in `stack.md` part 6 goes into `docs/STACK.md`, so `/launch` starts from it. An app with no server: take out
`Dockerfile`, `.dockerignore` and the *Deploying* section of `CLAUDE.md`.
