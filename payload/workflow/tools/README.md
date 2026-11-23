# Workflow gate

Scripts that check a change so an AI session doesn't have to. No packages; plain Node ESM.
Project settings are in `workflow/config.json` at the repo root, the rest is generic.
How to use the whole flow day to day (`/idea`, `/work`, `/ui`): `workflow/guides/WORKFLOW.md`. This file is the reference, read by the
section (`grep -n '^## '` lists them), never whole. The flow runs in Claude Code and in OpenCode (see *Agents and models*).

| Command | What it does |
|---|---|
| `npm run gate` | layer rules, file size, doc references, typecheck, then only the tests the change can reach. A pass is recorded: the same files, base, flags and `.env` again stop at once (`--fresh` runs it). An advised step says whose it is; in a prototype, advice on untouched files is one count |
| `npm run gate:all` | the same with the whole suite |
| `npm run test:one -- <file>` | one test file through the quiet reporter, as `npm test` prints (React act() warnings counted, not printed) |
| `npm run gate -- --fresh` | the picked tests even when they passed before with the same code (skipped otherwise) |
| `npm run gate:ship` | what `/ship` runs before `--finish`: the whole suite in the pilot and production phases, the tests the change reaches in a prototype (`workflow/levels.json`). A pass is recorded: a second run on the same files stops at once, and `--finish` checks only what changed since (`--fresh` runs it anyway) |
| `npm run gate -- --only <files>` | one builder of several (work packages): the type errors in these files only, and the tests that reach them; the neighbours' errors are counted and left |
| `npm run health` | the numbers that say whether the code stays healthy, and under them **what the state of the code says to work on** (`lib/hotspots.mjs`), each with the principle behind it: a file changed often that is too big (refactor where you work), files changed often with no test (a test before the change), flaky tests, import circles, a file the builders of two shipped cards said got in their way (`npm run shipped`); the board's code health goal names the same, and adds an area where three or more bugs are open as a goal of its own (stabilise before building on it) |
| `npm run shipped` | **what each shipped card took**, against its effort label (`lib/shipped.mjs`). `session.mjs --finish` keeps a record per feature by itself: the lines and files of the change (without lock files and the generated pages), the days since the session started, the cards' effort, area and type, the tokens of the answers given in its session folder. `/ship` adds what only the builder knows (`-- --note <topic> --rounds <n> --review "<kind>=<n>, ..." --hard "<file>: <why>"`): the rounds with the owner, the review's findings by kind, the files that got in the way. With no flag it says what the records show: the usual size per label, **a medium and a large card measured in small ones** once small and one other label have five shipped cards each (the ranking then counts effort with them, kept between 1.2 and 4, and 2 and 8), the areas whose cards run 1.4 times their label or more, the cards two and a half times their label, a kind of finding the review made on three of the last eight reviewed cards, the files in the way of two cards. `/retro` reads it (`-- --weeks <n>` names only the recent cards). The records are a line each in git's common folder (`workflow-shipped.jsonl`): no commit, one file for every session folder, and they stay on this computer |
| `node workflow/scripts/memory.mjs <url> --step "<js>"` (ui module) | does the page keep growing: one round of what the owner does, repeated (`--rounds 20`), with elements, event listeners and heap compared after one round and after all; exit 1 when it grows every round, `--detached` lists what is held off the page. `workflow/scripts/browser.mjs` is the headless browser under it (`openBrowser`: `go`, `ev`, `until`, `shot`), for any one-off page script. `node workflow/scripts/weigh.mjs`: what a Vite build weighs, by folder and package, and the biggest files |
| `npm run portal` | every doc in one page in the browser, in the project's own style sheet (`docs/STYLE.md`: its colours by what each token's use says, its font from `node_modules/@fontsource`, its sizes and radii; a plain look until there is one, `lib/portaltheme.mjs`), with at the top the product itself (the README's pitch and first paragraph, and what it does: the parts of `docs/GUIDE.md`), what you are on (the focus block, the cards in progress), then four numbers, the board (a tie as a question, the next cards with value, effort, feasibility and score, what waits, what needs a decision: `npm run board -- --next 3 --json`), the next phase's needs with how far along (`npm run phase -- --json`), what is worth doing now, the latest decisions and what changed since your last visit: started in the background when it is not running (127.0.0.1, `portal.port` or the main port - 1, outside the session range), a new tab opened; each page is made when it is opened and an open tab reloads when a doc changes; only files git knows are served (`--stop`, `--serve` in the foreground, `--no-open`). `/portal` |
| `npm run phase` | the phase, the facts it is read from, and what the next phase still needs (`--ready [pilot|production]`; `--next` is /next's line) |
| `npm run map` | rewrite `docs/MAP.md`, the file map: one line per source file (opening comment + imports); `--check` fails if it is out of date; `-- --find <words>` prints only the map lines whose description has every word, under their folder; `-- --uses <file>` (e.g. `config/vibes`) prints the lines that import that file; both print at most 25 lines |
| `node workflow/tools/gate.mjs --list` | only print the tests the change reaches |
| `node workflow/tools/gate.mjs --update-baseline` | accept today's exceptions; sizes may only drop (see *size*) |
| `npm run board -- --show <n>` | the backlog board: read, add and move cards (see *Board*) |

Quiet on success (one line per check); after the checks it prints one `advice:` line per changed `src/` file whose added lines open a server route, read a file or make an outbound fetch ("run the security-review skill before --finish"). It also prints `advice: <file> reads input but no new test says what it refuses` when added code in the `security.inputFolders` of the config (default `src/core`, `src/server`) reads input (JSON.parse, a file read, a fetch, a request body) and the change adds no test named with "refuses", "rejects", "caps", "too large" or "hostile" (names only; `workflow/tools/lib/hostilecheck.mjs`). Advice never fails the gate; `node workflow/tools/gate.mjs --advice` prints only those lines. On a failure it prints the last lines that explain it.

## What it checks
- **layers**: `boundaries` in the config says which folders may not import which (`src/core` is pure, no
  `node:` modules). Imports are read from `import ... from`, `import('...')`, `require('...')` and a folder's index file; a rule's
  `except` names files it does not apply to, on purpose (the start file that loads the dev-only variants page). A violation already in `baseline.json` is accepted, a new one fails.
- **size**: counts the lines that hold work (`lib/size.mjs`): blank lines, comments, imports, braces, fields, `x = new X(ctx)` and
  one-line pass-throughs are plumbing and not counted (an older baseline counts every line until `--update-baseline` switches it).
  A new file over the limit fails (`size.maxLines`; for work lines `size.maxWorkLines`, by default 60% of it: 240). A big file in the baseline may stay but must not grow, except by `size.allowance` (5) lines
  a card: `gate:ship` writes the new size into the baseline with the card number, `npm run health` adds it up, and past
  `size.allowanceTotal` (25) the file needs its split card. A failure names the file, how many new lines hold work and how many
  are plumbing, and the next step (its split card, or one to make). `--update-baseline` only lowers or removes numbers; a raised
  or new one is refused (files named, exit 1) unless `--allow-growth "<reason>"` is given (for a pure refactor such as an import
  rewrite), and the reason is printed. Splitting a file and re-running `--update-baseline` shrinks the list. An optional `reasons`
  map in `baseline.json` (`"<file>": "<why it stays>"`) is kept for files still in the list and dropped for the rest; a reason
  for a file not in the list fails as a stale reason.
- **waits**: a test line the change adds (a new test file: all of it) that waits a fixed time (`setTimeout(r, 20)`, `sleep(50)`, `time.sleep(0.1)`, `time.Sleep`)
  holds on an idle computer and fails on a busy one: wait for the thing itself, or use a fake clock. A wait that must stay says
  why with `wait-ok: <reason>` on its line. The waits an old test already had are not the change's: touching it never fails on
  them. Advice in a prototype, fails from pilot (`lib/waits.mjs`).
- **functions** (when `functions` is in the config): a new function of `functions.maxLines` lines or more fails, and a long one in
  the baseline may not grow. Found by counting braces, so it reads TypeScript, JavaScript, Rust, Go and the like.
- **ratchets** (when `ratchets` is in the config): each counts patterns in some files, for example checks on what kind a thing is
  (`{ "name": "kind checks", "include": ["src/plan/**"], "patterns": ["shape === '", "isBike\\("] }`); a count above the baseline fails,
  with the ratchet's own `say` line. The kit sets one per language, *escape hatches*: `any`, `@ts-ignore`, an empty `catch`,
  a `TODO` with no card number, and the like.
- **nesting** (when `functions.maxDepth` is set): an `if`, loop or `try` nested deeper than that inside a function fails (read from
  the indentation); a deep one in the baseline may not get deeper.
- **circles**: files that import each other in a circle fail, unless the circle is in the baseline: move what they share into a
  file both import.
- **untested** (when `untested` is in the config; TypeScript and JavaScript): a source file no test reaches through imports fails,
  unless it is in the baseline. A file that only starts the app goes in `untested.ignore`.
- **variants** (with `"ui": { "boards": "components" }`, only with `--all`): a file left in `ui.variants` (`src/variants`) fails. With a
  UI framework `/ui` draws its variants A, B, C there as real components; once the pick is built they are deleted.
- **budget** (when `budget` is in the config): `{ "CLAUDE.md": 14000 }` in bytes. A rules file over its budget fails: every agent
  reads it in every chat, so a new rule becomes a check or replaces a line.
- **lint** (TypeScript, a `checks` entry): Biome's recommended rules and its formatter on `src` and `tests` (`biome.json`;
  `npx biome check --write src tests` fixes what it can).
- **copies** (when `copies` is in the config): two functions with the same body (`copies.minLines` lines or more, 6 by default)
  fail with both names, unless the pair is in the baseline: keep one and call it from both places. With `copies.tests` (globs),
  tests that are the same once their texts and numbers are blanked fail too: make it one test over a list of cases.
- **secrets**: a key or password in the added lines of a change (cloud and API keys, a private key, `password = "..."` with a
  real-looking value) fails with the file and the kind, never the value; so does a tracked `.env`. A made-up value in a test
  passes with `not a secret` in a comment on its line.
- **settings** (when `.env.example` exists): every setting the code reads from the environment is listed there (commented out
  is fine for an optional one), in any language the kit knows, and the keys of a `defineSettings({ ... })` call. Reads
  `settings.include` (default `src/**`); `settings.ignore` names any to leave out. A new server then knows every name it needs.
- **versions**: every tool in `.tool-versions` pinned to an exact version (read by mise, asdf, GitHub's setup-node and Renovate);
  Node one major version in `.tool-versions`, the `Dockerfile` and `engines.node`, and `@types/node` never newer; every
  OpenTofu/Terraform folder with a `terraform` block names `required_version`, a version per provider, and has its
  `.terraform.lock.hcl` in git.
- **naming** (when `naming` is in the config): file names by glob (`kebab`, `camel`, `pascal`, `snake`, `upper`; `except` for
  `main.tsx` and the like), and in TypeScript and JavaScript what a file exports (functions and values camelCase or UPPER_CASE,
  types and classes PascalCase, components in a `.tsx` file PascalCase). What breaks a rule today is in the baseline and may
  only shrink. The reasons are in `docs/CONVENTIONS.md`. `naming.sorted` keeps listed parts of JSON files alphabetical
  (`{ "file": "package.json", "keys": ["dependencies"] }`, a dotted path to an object or a list of strings); `naming.resources`
  checks the names given in infrastructure files (`name = "..."`, `name: ...`) against a pattern, so a server or bucket name says
  what, which environment and where (`<app>-<env>-<place>-<part>`); a name built from variables is left alone.
- **ai**: a language-model SDK (Anthropic, OpenAI, Google, Mistral, the AI SDK, LangChain, Ollama and others) or a model API
  address used in the app's code anywhere but the one wrapper file, `ai.wrapper` in the config, fails; so does any use when no
  wrapper is named. The wrapper holds the spend cap, the limits, the untrusted-content markers, the output schema and the log
  (`workflow/guides/AI-SECURITY.md`).
- **spikes**: no file under `spikes/` outside a `spike-<topic>` session: a spike's code is thrown away, what it taught is in
  `docs/decisions/`.
- **page weight** (a `checks` entry, when screens or the build change): `node workflow/tools/perfbudget.mjs` builds the app and
  adds up the compressed size of `performance.files` against `performance.maxKb` (250 KB to start), naming the biggest files
  when over. No budget, no build script or nothing built: it passes and says so.
- **image** (when there is a `Dockerfile`): every base pinned to a version (no bare name, no `:latest`); the image that runs
  has a `USER` that is not root (or a `:nonroot` base) and copies only what runs, never `COPY . .` or a whole earlier stage;
  no `ARG`/`ENV` named like a secret (they stay in the image's history: `RUN --mount=type=secret` instead); no `ADD` from a URL;
  a `.dockerignore` that leaves out `.git` and `.env`. Which base to run on: `docs/run/INFRA.md`, *Container images*.
- **network** (when `security.egress` or `security.ipRules` is set): every `https://` host the code calls (strings in the code
  under `settings.include`, not tests, comments, local or schema addresses) is in `security.egress` (exact, or `*.domain`); every
  IP rule is a real address or range, has a `why` and an `until`, and no allowlist lets all of the internet in. A rule past its
  `until` is raised by the weekly security report, not the gate. `docs/run/NETWORK.md` shows both lists (generated blocks).
- **signoff** (when `sensitive.paths` is set; an entry is a glob, a file or a folder, and a folder (`src/accounts/`) covers every
  file under it; an entry that covers no file is said on the check's line in a prototype and fails the check in a pilot and in production): a change to a sensitive file (money, health, legal texts, personal data) passes
  only when `docs/company/SIGNOFFS.md` holds a row whose fingerprint matches those files as they are now. The owner writes it with
  `npm run signoff` in their own terminal after checking the change against its sources: it refuses input from a pipe, an agent
  or CI, asks the checklist (`sensitive.checklist` replaces the kit's four questions) and a typed-back code, and agents are
  denied the command and the files. Each row is signed with the signer's private key (encrypted with their passphrase, on their
  computer) and checked with the public keys in `docs/company/SIGNERS.md` as they are on main, the same on every computer and on
  CI; `npm run signoff -- --list` only reads (the entries, the sensitive files this change touches, whether it is signed); `npm run signoff -- --init` makes a person's key, `--add-signer` endorses another. Any later edit needs a new sign-off.
  Why: `workflow/guides/SENSITIVE.md`.
- **migrations** (when `data.migrations` lists where they are): a migration file that was there before the change and is edited,
  renamed or deleted fails; it has run somewhere, so a mistake is a new migration (`workflow/guides/DATA.md`). A new one passes.
- **data and permissions** (advice): a changed file that builds SQL text from a value (a filled-in or joined string in
  TypeScript, JavaScript, Python, Go or Rust; a tagged template like sql`...` and a parameter pass; a name from a fixed list says
  "fixed list" in a comment on that line) gets an `advice:` line. With `security.signIn` true, so does a new route in the
  server folder when the change adds no test named for who is refused (signed out, another user's).
- **together** (when `together` is in the config): files that change together.
  `{ "name": "migration", "when": ["src/db/schema.ts"], "needs": ["migrations/**"] }` fails a change to the tables that adds no migration.
- **your own checks** (`checks` in the config), after the tests, each a command that must pass:
  `{ "name": "e2e", "command": "npx playwright test", "when": ["src/web/**"], "all": true, "setup": "npx playwright install --with-deps chromium" }`.
  `when`: only when a changed file matches; `all`: only with `--all` (slow ones); `setup`: run first, on GitHub only. The kit sets
  two per language: `unused` (dead code and libraries nothing uses) and `audit` (libraries with a known security problem).
- **dependencies** (advice, when `docs/STACK.md` exists): a library a change adds to `package.json`, `Cargo.toml`, `pyproject.toml`
  or `go.mod` that `docs/STACK.md` does not name gets an `advice:` line.
- **scope**: with one spec in `workflow/specs/`, a changed file the spec never names is printed as a `scope:` line (`"scope": "fail"` makes
  it stop the gate, `"off"` silences it; `scopeIgnore` lists globs to leave out). Not on main: a spec waiting there is for its session's build. Counted as named without being listed: a test
  that reaches a file the spec names and a file only such tests import, the pages a script writes (the file map, the docs
  index, the baseline, the lock files) and the owner's sign-off row.
- **rule rows** (advice, when the change touches `docs/ARCHITECTURE.md`): a cell of *Rules and where each lives* past 200
  characters (`docs.ruleCellMax` in the config) gets an `advice:` line: a row names its home, its check and a folder or a pattern,
  never a list of files.
- **spec**: an approved spec in `workflow/specs/` must name its end state (the `End state:` line: the best version, and whether
  this spec is it or a step toward it). Missing, empty or still the placeholder fails; a step that names no card for the rest
  gets an `advice:` line. A spec not approved yet is still being written and is not read.
- **quality** (when `quality.command` is in the config): the command prints "79 of 106"; fewer passing than the baseline fails.
  It runs when a changed file matches `quality.when` (default `src/**`) and with `--all`. `--update-baseline` stores the score.
  A command that cannot run on this computer prints `quality skipped: <why>` (the AI cases with no API key): the gate shows it as
  skipped, never as a pass, and the stored score stays.
- **requests** (with the map module): `docs/flow/requests.js` must be what the request pages say now (`node docs/flow/build-requests.mjs`).
- **testsNaming** (optional): a changed file that is not code picks the tests that name it; `{ "src/web/css/**": "css-parts.mjs" }`
  makes every file under that folder pick the tests that name that word instead.
- **map**: everything `npm run map` makes must be what it would write now; a stale one fails the gate. That is `docs/MAP.md`;
  `docs/run/INFRA-MAP.md` once there are infrastructure files (one row per OpenTofu resource and module and per Kubernetes object:
  kind, name, place, size; `map.k8s` lists the manifest globs); and the generated blocks in the docs, the parts made from the
  config so they cannot disagree with it: `<!-- generated: layers -->` (the import rules), `versions` (`.tool-versions`),
  `settings` (`.env.example` with each name's comment), `sensitive`, `naming`, each closed by `<!-- /generated -->`.
- **covers**: a hand-written doc names what it describes in a comment, `<!-- covers: infra/**, Dockerfile -->` (any change) or
  `<!-- covers new files: src/server/** -->` (a file added, removed or renamed there). When those files change and the doc does
  not, the gate fails, unless the spec or a commit body says on purpose `Docs: no change to <doc> (<why>)`. Keeping a doc as it is
  is then a decision written down, never forgotten. The starter docs carry the first covers lines; `/setup` adds the rest.
- **docs**: a backticked repo path (`src/…`, `config/…`, `tests/…`, `scripts/…`, `tools/…`, `docs/…`) or an `npm run <name>` in the docs listed under `docs` in the config that no longer exists fails, with the doc, line and thing. Globs, `<placeholders>` and bare names (`service.ts`) are skipped. Known stale ones are in `baseline.json`; fixing one and re-running `--update-baseline` shortens the list.
- **typecheck**: the config's `commands.typecheck`. Not run for a change of only docs and settings (`ignoreChanged`), which
  cannot break a type; with `--all`, at `/ship` in a pilot or in production, and on GitHub it always runs.
- **test time** (advice, when `testSeconds` is set): the whole suite took longer than that. `npm run health` shows how much test
  code there is per line of code and the biggest test files.
- **tests**: the import graph (read from the source text) gives every test that reaches a changed file,
  also through `tests/fakes.ts`. A test that reads a non-code file by name (`styles.css`) is picked too.
  A changed file the gate doesn't understand (`package.json`, an unknown data file) runs the whole suite.
  Docs and the paths in `ignoreChanged` are skipped.

Changes to a file many things import (a shared types file, say) still run most tests: that is the measure of how coupled it is.

## Several apps in one repository
A repository with a folder per app (`apps/web`, `apps/api`) and shared code beside them (`packages/rules`): each app under `apps` in
the config, with its folder and its own commands, and the shared folders under `shared`:

    "apps": [
      { "name": "web", "root": "apps/web", "commands": { "typecheck": "npm run typecheck", "testAll": "npm test" } },
      { "name": "api", "root": "apps/api", "commands": { "testAll": "go test ./..." } }
    ],
    "shared": ["packages/**"]

The gate runs `typecheck <app>` and `tests <app>` in the app's own folder for each app a change reaches: a file under its root
reaches it, a file under `shared` reaches every app, `--all` runs them all. Every other check (secrets, size, layers, docs, the map)
runs once for the whole repository, and the root's own `typecheck` and `tests` still run for what lies outside the apps. That an
app uses only the shared code, never another app's inside, is a layer rule in `boundaries` (`apps/web/**` may not import
`apps/api/**`, and the other way round): write one per pair, and the gate's *layers* check holds it. `/setup` chooses this shape when the app is several things that ship together
(`.claude/skills/setup/stack.md`, *One repository or a folder per app*). One session still has one port: the dev server it starts
is the one `session.serve` names.

## Straight to main, or pull requests
`"flow"` under `session` in the config. `"direct"` (the default): `--finish` puts the feature on the local `main` and `--push` sends
it. `"pr"`: `--finish` pushes the branch and opens a pull request, GitHub runs the gate on it, the session folder stays for fixes
(finish again to update it), and `node workflow/scripts/session.mjs --merge <topic>` lands it only when its checks are green, brings the
local `main` up to date and removes the session. With `"pr"`, `npm run protect` also refuses a direct push to `main` and asks
GitHub to take only work whose gate passed. Run `npm run protect` again after changing the flow.

## Protecting main
`npm run protect` does two things: a git hook on this computer that refuses a push that would delete `main` on GitHub or rewrite
it (a force push), and the same as a rule on GitHub. GitHub only takes the rule for a public repository or on a paid plan; when it
refuses, the script says so and the local guard still works. `npm run protect -- --check` shows what is in place.

What needs a public repository or a paid plan, and what stands in for it here:
| GitHub enforces (public or paid) | Here instead (any plan) |
|---|---|
| no force push or delete of `main` | the push guard (a git hook); agents may not skip it: `.claude/settings.json` and `opencode.jsonc` (`npm run harness` adds a rule the first gained to the second) deny `git push --no-verify`, `--force`, `-f` and another hooks path |
| a pull request merges only when its gate passed (`"flow": "pr"`) | `node workflow/scripts/session.mjs --merge <topic>` merges only when its checks are green; the gate still runs on every push |

**How strict it is** (`workflow/levels.json`, yours: the agent may propose a change, never make it; its settings deny the file
and the stop-point hook refuses a shell write to it). Three kinds of rule, each treated its own way:
| Kind | Which | Adjustable? |
|---|---|---|
| safety stops | commit and push wait for your word, the sign-off, secrets, leaks, migrations, the AI wrapper, the image, the network, the packages, typecheck, tests | no: on, or the part is not installed (a level for one fails the gate) |
| quality checks | layers, size, functions, ratchets, nesting, circles, untested, naming, copies, budget, docs, spec, covers, errors, waits, map, harness, versions, settings, spikes, together, scope, quality, and the project's own `checks` | per check: `fail`, `advise` (said, and the gate passes) or `off` (skipped, and said) |
| process weight | a spec, a pitch (`/shape`), a UI board, a fresh review at `/ship`, the user guide and app map kept up in the card itself | by the card's size: `process.spec`, `pitch`, `uiBoard`, `review`, `upkeep`, `designs` (`always`, `small`, `medium`, `large`, `never`); below `upkeep` the guide and the app map wait for one `/docs catch-up` pass; from `designs` on `/spec` has two designs drafted apart before it chooses one |

The phase fills them in (`"phase"`; `"preset"` before kit 3.4 is still read; no file is production): `"prototype"` while nothing
outside depends on the product (the structure checks advise; a spec and a fresh review only for large cards, no pitch; the guide
and the app map wait for a `/docs catch-up` pass; `/ship` runs the tests the change reaches, `gate.mjs --ship`), `"pilot"` once
other people can open it or it keeps their personal data (structure still advises; untested code, docs, covers, errors and
fixed waits fail; a review from medium cards; `/ship` runs the whole suite) and `"production"` once it takes money or has a
production address people rely on (every check fails; a spec from medium cards, a pitch for large ones, a board from small ones;
a deploy to a production environment is refused in any other phase). The file's own lines win. `npm run phase` reads the facts
(an address in `deploy`, personal data on `docs/company/PRIVACY.md`, a payment package, a production environment or a launch
record), says which phase they fit and what the next one still needs (`--ready`); `/next` shows it in one line and says a new
fact once (`--next`). The phase only changes when you change it. `"reach": "direct"` (any phase) picks only the tests that
import a changed file themselves, not the ones that reach it through a helper: faster, and GitHub still runs them all; the
default is `"chain"`.

**What passed before** (`lib/testcache.mjs`): a picked test that passed on this computer with exactly the same code under it
(the test, everything it imports, the lockfile, the tsconfigs, the config and any changed file the import graph cannot follow) is
skipped, and the tests line says how many. Not for the whole suite (`--all`, `--ship` in pilot and production) unless
`"cache": "all"` in `workflow/levels.json` says so (the files still to run then go in batches of 300); never on GitHub;
`--fresh` runs them anyway. Changing `workflow/levels.json`, the baseline or a spec runs neither the whole suite nor the kit's
tests (`ignoreChanged`, and `KIT_SETTINGS` in `lib/testplan.mjs`). The record is `.git/workflow-tests-passed.json`, this checkout's own,
kept file by file also after a failed run (the reporter names the failed files; `lib/testrun.mjs`), so a second attempt runs only
what failed.

**Flaky tests** (`lib/testcache.mjs`): a file that failed and then passes with the same code under it is flaky by definition. The
tests line says FLAKY, the file goes on the list in git's common folder (`workflow-flaky.json`, shared by every session), and
every gate run prints it with its first failing line and the card to make (`Flaky test: <file>`, its text with the whole failure
kept in `workflow-flaky/<file>.md` next to the list), until it has passed ten times in a row, counted in every session, with no
failure between (a failure sets the count back to nought and keeps its output as the newest evidence). Only a real run
counts: a test the cache skips adds nothing, so a fixed test that is rarely picked stays listed a while (the safe side). Two
gates take turns writing the list (a lock beside it), so neither loses what the other added. A failing test is
reported, never run again hoping for green (CLAUDE.md, rule 9). **Side by side**: while other gates of the project run their
tests, `node --test` gets `--test-concurrency` set to this gate's share of the cores (another runner: `commands.testConcurrency`,
with `{n}`; `""` turns it off), so five sessions do not slow each other into failures. The
gate prints what is loosened on every run, `--advice` too, so a quiet project never looks cleaner than it is; `npm run levels`
shows everything in force.

**The stop points** (Claude Code hooks in the tracked `.claude/settings.json`, so every clone and session has them; `workflow/scripts/stop-points.mjs`): an agent's Edit or Write of a code file in the main folder is refused (code is written only in a session folder; docs and settings, ignored files and other folders go through, but a script under `docs/` that node runs is code; `session.mainEdits: true` turns it off; a shell write such as `sed -i` is not seen here, and `--check-main` stops it at `/ship`). And an agent's `git commit`
`git merge`, `cherry-pick`, `revert`, `am` or `rebase` (also as `/usr/bin/git` or `git.exe`), and `--finish`, `--merge` or `--commit-notes` of the session script (also
through `npm run session`), is refused until the owner has said "done" (or "commit", "finish it", or a short "yes" to the skill's
question) in that same chat in the last 3 hours; a `git push`, `--push` or `gh pr merge` until they said "push". The word counts
only when it is the owner's word, not a description: "finish it and make a card" counts (the other work comes after), "finish
it and fix the header first" does not; a question ("is it done?"), a condition ("when you are done, tell me"), another
meaning ("push the button", "a commit button", "done reading the plan") or quoted text does not, and "wait" or "not yet" takes it
back. In Claude Code the hook reads the owner's words from the chat's own transcript, and only the messages Claude Code marks as
the person's own (`origin: human`; in a transcript without that mark, the ones the prompt hook saw, by a fingerprint of each): a
summary after `/compact`, a task notice, a subagent's prompt or a hook's message never counts, and a file the agent writes cannot
say them either. Only a short approval counts: the word on its own or after "ok", "yes", "it's", "that's", "all", "we're" or
"go ahead and". A description does not ("let riders mark a ride as done", "rename the button to commit"), nor a reported one
("well done", "you said it was done", "done, but the footer is still wrong"), nor a slash command's arguments ("/ship done-button":
the skill asks, and the answer is its own message).
`node workflow/scripts/stop-points.mjs --status` says what the note holds (the
note is for OpenCode's plugin, `.opencode/plugins/stop-points.js`, which `npm run harness` writes and which asks the same script).
The hook also refuses an agent's shell command that writes `docs/company/SIGNOFFS.md`, `SIGNERS.md` or the note, globs included.
What it is: a stop for an agent that would commit by mistake or take a shortcut. An agent that sets out to get around it with the
same shell (a script that commits, a command spelled another way) can; that is what GitHub's branch protection and a required
review are for (the table above), and what a sign-off's signature holds against on its own.

The guard lives in this clone's git hooks (the session folders share them). A clone on another computer or a cloud session has
none until `npm run protect -- --local` runs there; the gate prints an `advice:` line when it is missing (never on GitHub's runners).
What it cannot stop: a person who removes the hook, and a merge by hand on GitHub's website.

## Dependency updates
**Renovate** keeps versions current: libraries, Docker images, GitHub actions (pinned to a commit), the tools in `.tool-versions`,
OpenTofu providers and modules, Helm charts, and the scanner images of the security run. Its policy is `renovate.json` (written at
install, then yours): small updates grouped once a week, a new major version on its own, Node only between long-term-support
versions, and nothing published less than 7 days ago (a new release can be a supply-chain attack), except security fixes, which
come at once. One repository: that file is the whole policy. Several: put it in a config repository of your own
(`owner/renovate-config`, as `default.json`) and leave `{ "extends": ["github>owner/renovate-config"] }` in each. Renovate runs
once its GitHub app is installed for the repository (https://github.com/apps/renovate); a project made before 2.1 still has
`.github/dependabot.yml`, whose version updates come out once Renovate runs (`npm run updates` says when).

`npm run updates` reads what waits from both (security alerts first, then each pull request) and gives every library a verdict:
**take it** (a fix or a new feature, checks green), **look first** (a new major version, a 0.x minor, or checks red or still
running) or **hold** (it clashes with a decision: `@types/node` for a newer Node than `.tool-versions` pins; or a library in
`updates.hold` of the config, `{ "<library>": "<why>" }`), with the lines that stop a held one coming back. `--short` is one
line: `/work` starts with it and `npm run health` shows it (`--offline` skips it). GitHub that cannot be reached is one line.

## Security without hands (SecOps)
Every Monday `.github/workflows/secops.yml` scans: libraries with known vulnerabilities (OSV-Scanner, Trivy), our own code
(Semgrep, the p/default rules), the `Dockerfile` and infrastructure files (Trivy), and secrets anywhere in git's history (gitleaks),
and writes one report in plain words: an issue labelled `security-report` (last week's is closed). It never fails on a finding.
- **What comes by itself**: a library fix that exists, as a pull request (Renovate, and Dependabot security updates:
  `npm run secops -- --enable` turns those and the alerts on).
- **What needs a decision**: `/secops` in a session reads the report, says what each finding means, proposes the fix, and on a yes
  makes it a fix or a card. A finding that is safe by design gets `nosemgrep: <rule>` with the reason on the line before.
- **Findings in the kit's own files** (`workflow/tools`, the kit's scripts and pipelines) are listed apart: they are fixed in the kit.
- **By hand**: `npm run secops -- --scan` (Docker). The scanner versions live only in `SCANNERS` of `workflow/tools/secops.mjs`.
- **What no scanner sees**: the certificate of each public address (`security.domains`, else the host of `deploy.url`), raised
  when it ends within 21 days or cannot be read (renewal is meant to be automatic, so that is a broken renewal); and the access
  review, raised when the "Last review" date in `docs/company/ACCESS.md` is over 90 days old.

## Access review
`npm run access` (the owner, `gh` signed in as an admin): the people, deploy keys and Actions secret names GitHub shows, against
the table in `docs/company/ACCESS.md`: what nobody listed, what is listed but gone, a role that differs, and a checklist of the places no
script sees (the cloud console, the registrar, the database, the providers). `--publish` makes it an issue labelled
`access-review`; `--done` sets the date once every line is settled.

## Load tests
`npm run load -- <smoke|load|stress|spike|soak> [--url <address>]` runs k6 (`K6` in `workflow/tools/load.mjs`, pinned, Renovate
moves it) in Docker against `performance.load.url` (default the main port on this computer), walking `performance.load.paths`
with `performance.load.users`, and judges k6's summary against `performance.goals` (`p95ms`, `errorRate`): a few plain lines,
exit 1 when a goal is missed. Production (`deploy.url`) is refused without `--yes-production`. `--script-only` prints the k6
script; a file `load/<kind>.js` of your own replaces the made one. Why and when each kind: `docs/run/PERFORMANCE.md`.

## Infrastructure: check, plan, apply
- `npm run infra-check`: every stack under `infra/` (one per folder; the tool from its files, or `launch.iac`), in Docker:
  OpenTofu or Terraform `fmt -check`, `init -backend=false`, `validate`, and `test` when the stack has `*.tftest.hcl` files
  (with `mock_provider`, no cloud account); Ansible's syntax check; startup scripts (`cloud-init*.yaml`, `user-data*`,
  `startup*.sh`) without secrets or `curl | sh`, cloud-config files through `cloud-init schema`; Trivy's configuration scan.
  The `infra` entry of `checks` runs it in the gate when `infra/**` changes. The images live in `IMAGES`; Renovate moves them.
- `npm run infra-plan -- infra/<env> [--allow-destroy <address>]`: the plan against the real state (read-only credentials from
  the environment, passed by name), saved beside git's data, and reviewed (`lib/infraplan.mjs`) against the stack's
  `plan.expect`, the protected kinds (`launch.protect`), `naming.resources` (the final names) and `launch.labels`.
- `npm run infra-apply -- infra/<env>`: only at a terminal, with a typed code (agents are denied it in the settings), only a
  plan that passed, only while no file of the stack changed since, and once. The why and the order: `docs/run/IAC.md`.

## The restore drill
`npm run drill` runs `recovery.drill.restore` into a new temporary folder (`{dir}`), starts the app with `recovery.drill.start`
on `{port}`, asks it `recovery.drill.paths` (the first one until it answers, within `waitSeconds`), stops it, deletes the folder,
and writes the date and timings into the *Last restore drill* row of `docs/run/RECOVERY.md`; `pingEnv` names an environment
variable with a dead man's switch address to call on success. SecOps flags a drill older than 90 days.

## The launch check
`npm run launch-check -- <https address | built .html file>` checks one landing page (`lib/launchcheck.mjs`): the title (10 to
60 characters) and description (50 to 160), the language and viewport, a canonical link, Open Graph (title, description,
image), exactly one `<h1>`, alt text on every image, a link to the privacy notice, trackers (`TRACKERS`: Google tag and Ads,
Tag Manager, AdSense, DoubleClick, the Meta, LinkedIn and TikTok pixels, Hotjar, Clarity) without a consent manager or
Consent Mode defaults, robots.txt (present, not `Disallow: /` for all, naming the sitemap), the sitemap, and for an address the
weight of the page and its own files. Exit 1 on a problem; warnings are judgements. Why each: `docs/market/GROWTH.md`.

## A setup guide that is proven
`docs/SETUP.md` marks its steps ```sh setup``` (must finish) and one ```sh start``` with `<!-- ready: http://127.0.0.1:<port>/ -->`
below it (must answer). `npm run setup-check` runs them on a fresh clone of the committed repository; `.github/workflows/setup.yml`
does the same when the guide or what it installs changes, and every week. A step that stops working fails it.

## Spec and ship (the flow around the gate)
`/work <card number>` plans one card and stops for a yes; the build then starts in a new chat with `/build <topic>`, so the
planning chat isn't sent again on every round (see *Board*). `/spec <card number>` (or `/spec <topic>`) reads that one card from the board, writes `workflow/specs/<topic>.md` from `templates/spec.md`
and waits for approval; approval moves the card to Ready. A new chat builds it in a
session folder (tests first), updates the spec's `## Status`, and `/ship <topic>` runs `gate:ship`, checks the docs the spec
lists, has a subagent that has not seen the build review it (`/review`), runs `security-review` if flagged, makes the one commit, deletes the spec and runs `session.mjs --finish`.
`/build <topic>` sits between them: from a fresh chat in the main folder it makes (or reuses) the session folder, copies the
approved spec into it and starts a subagent that builds it there, so nobody changes folder; feedback goes to the same subagent.
**Several at once**: `/work 12 14 15` writes the specs one after another in one chat (each approved on its own); `/build a b c` starts one builder per independent spec, at most 3, in one message so they run together, each in its own folder, branch and port. Two specs whose "Files that change" name the same file overlap: the later waits until the first is shipped (the shared files listed in CLAUDE.md never count). One summary lists folder, URL and unsure items per topic; feedback goes to that topic's builder; `/ship` stays one topic at a time. `ui` cards join only after their variant is picked.
**One spec, several builders**: a big job that splits cleanly (a refactor over several large files) lists "Work packages" in its spec: files each owns, `after:` order. `/build <topic>` runs them in waves of at most 3 builders in the same session folder; a file belongs to one package, packages under about 300 changed lines are merged, builders run only their own tests, and the lead edits the shared files and runs `npm run gate` once after the last wave. The spec decides the split, `/build` only checks and runs it.
`workflow/specs/` is in `.gitignore`: waiting specs are local and can't be committed by accident. After `/ship` the spec is deleted in both the session folder and the main folder.

### The session script, one command at a time
`node workflow/scripts/session.mjs <command>`. The board never blocks a start or a finish: if it cannot be reached it prints one warning line.

- **`<topic> [--card <n>]`**: a new session folder. It links `node_modules` and copies `.env` with its own `PORT` plus the lines of `session.env` in the config (`{main}` in a value is the main folder: share a big data folder instead of copying it; switch off background jobs that only the main server should run). `--card <n>` (so `/build`, which passes the spec's card) moves card n to In progress.
- **`--adopt [--card <n>]`**, **`--release`**, **`--connect orca`**, **`<topic> --start "<prompt>"`**: sessions in folders an orchestrator makes (Orca: its worktrees, a terminal with the Claude CLI per session). With Orca `--serve` opens the link in the session's browser tab (`--phone`: as a phone). A session's folder is where git has its branch, so every command below works on one wherever it is. `workflow/guides/ORCHESTRATOR.md`.
- **`--finish <topic>`**: squashes the branch, rebases it on the local `main`, checks, moves the local `main` forward and moves the session's card to Waiting for your check. It does **not** push.
  - The rebase: a conflict only in what a script writes is settled by itself (the map's pages are made again, sign-off rows of both sides are kept); any other changes nothing and points to `--catch-up`. The map is re-made after every rebase into the same commit.
  - The checks: the quick gate on what the rebase can have broken (the feature's files and what came in under it), since `/ship` ran the whole suite and GitHub runs it again after the push. `--no-checks` skips it: only for a change that has no code.
  - `--partial "<what is left>"` (from the spec's "Card stays open after this spec" line): the card stays in In progress and the comment says what is left.
- **`--push`**: finished features stay on this PC until this sends them to `origin/main` in one go. If someone pushed meanwhile they are replayed on top and checked again; a conflict stops it with nothing changed.
- **`--list`**: each session's card, which sessions are finished (merged) or hold uncommitted work, and how many finished features are not pushed.
- **`--clean`**: lists the finished sessions; `--clean --yes` removes them through `--remove`'s own checks (folders git does not know are only named).
- **`--check-main`** (`/ship` starts with it): fast-forwards a `main` that is only behind; stops on uncommitted files, or on unpushed features when origin has moved too. Docs and settings left in the main folder (any `.md`, `workflow/config.json`, `renovate.json`, `.claude/`, `.opencode/`: from `/docs`, `/lesson`, `/shape` or the owner's own edits) are named as such.
- **`--commit-notes "<subject>"`**: `/ship` puts those docs and settings in first with it: one commit of their own, after the quick gate passes on them, never folded into the feature; code among them is refused.
- **`--catch-up <topic>`**: brings main into a session mid-build (a fix the build or its review needs), so a clash comes out mid-build and not at `--finish`.
- **`--handover <topic>`**: before the owner tries it: main comes in (as `--catch-up`) and the cards move to *Waiting for your check*. `--finish` brings main in by itself too (a clash stays open; the same `--finish` goes on) and moves the cards to *Done*. A new session copies main's `.tsbuildinfo`: a warm first typecheck.
  - A fast-forward when the session has no commit of its own, a merge when it has (`--finish` squashes it away); its loose work as it was (no stash, which breaks after `git add -N`).
  - Loose work in a file main also changed is saved first as a `checkpoint:` commit on the session's own branch (nothing reaches main, so it needs no "done"; `--finish` puts it under the approved subject).
  - A clash in what a script writes is settled by itself; a clash in other files is left open in the folder and named, the builder settles it there, and the same command goes on.
- **`--serve <topic>`**: starts a session's dev server in the background (through `lib/hidden.mjs`, so no console window opens on Windows) and waits until its link answers (and still answers 3 s later), so the owner only opens it (`.claude/skills/build/try-it.md`: how a build is handed over, with a try command when there is no screen).
  - `--lan` also opens it to the Wi-Fi for a phone (`HOST=0.0.0.0`, or `"serve": { "lan": { ... } }` under `session`); it prints the address after checking it answers, and the one firewall line Windows needs.
  - `--copy-data` runs it on a copy of the real data (the folder `DATA_DIR` names in the main folder's `.env`, else `data`; `"serve": { "data": { "env", "from" } }`), kept outside the folder.
  - Neither is written into the session's `.env`: both end when the server stops. The process it started is recorded, so `--finish`, `--remove` and `--drop` stop it whatever port it took, and remove the copy.

Two rules hold for all of them, and for the gate:
- **The `.env` decides, not the shell** (`lib/folderenv.mjs`): every name the folder's `.env` sets, and in a session folder every name the main folder's sets, is taken out of the shell's environment before anything starts. A `PORT` or data folder left set in the owner's terminal never sends a session's server or its tests to the main folder's port or data.
- **A kit fix reaches open sessions** (`lib/frommain.mjs`): a session folder whose kit is an older fix release than the main folder's (4.6.0 against 4.6.2) runs the gate, the sign-off and the session script from the main folder, and one line says so. After a bigger step (4.6 to 4.7), which may have changed the settings, its own copy runs and says to bring main in first.
The skills are in `.claude/skills/` (OpenCode's commands in `.opencode/commands/`); copy them with the rest when reusing the workflow.

## Board
The backlog (ideas, known bugs, what waits for the owner's check) is a GitHub Projects board over the repo's issues,
one card per item. `workflow/tools/lib/board.mjs` is the only code that talks to it: it runs `gh` with an argument list,
never through a shell, and takes the runner as an argument (`workflow/tests/board.test.ts` fakes it).

| Command | What it does |
|---|---|
| `npm run board -- --init` | makes what the config describes and GitHub lacks: the labels (types, areas, effort, feasibility), the project itself when `board.project` is `0` (titled after the config's `name`, linked to the repo, its number written into the config) and the columns. Safe to run again: it only adds. Column colours come out grey; recolour them on GitHub if you like |
| `npm run board -- --labels` | the labels the config allows, grouped: what `/idea` may use |
| `npm run board -- --check` | says which columns from the config the project lacks, lists the open cards with no type label, and the labels the config names that the repo does not have (for example after a rename on GitHub) |
| `npm run board -- --add "<title>" --label <type> [--label <name>]... [--body-file <file>] [--column "<column>"]` | a new card, in the first column (Backlog) unless told; refused without exactly one type label |
| `npm run board -- --move <n> "<column>"` | moves card #n; an unknown column is refused with the list of columns |
| `npm run board -- --block <n> "<reason>"` | moves card #n to *Blocked* and adds "Blocked: <reason>" as a comment; refused without a reason |
| `npm run board -- --show <n>` | card #n: title, column, labels and text; and a `code:` line when the card is likely to change a file the code's state points at (`lib/cardcode.mjs`: a path its title or text names, or a file half of the last eight shipped cards of its area changed, that `npm run health` lists as changed often and too big, changed often with no test, in an import circle or in the way of earlier cards), with what to do first, or the open code health card that is that work |
| `npm run board -- --search "<words>"` | up to 20 cards, open or closed, whose title or text has the words: number, title, column, state |
| `npm run board -- --graph` | which card needs which, as a tree (`lib/cardgraph.mjs`): from each card's `Depends on: #n` line (also `After:`, `Needs:`, `Blocked by:`), what nothing waits on at the top and what depends on it below; cards that wait for each other in a loop are named |
| `npm run board -- --depends <n> <m,k>` | card #n needs #m and #k done first: writes its `Depends on:` line, or extends it |
| `npm run board -- --undepend <n> <m,k>` | takes #m and #k off that line; both print the full list the card ends up with |
| `npm run board -- --rate <n> value high` | sets one label of a group (`value`, `effort`, `feasibility`, the words the config has) and takes the group's other label off, so a card never holds two |
| `npm run board -- --next [n]` | the n (5) cards to build next, **the graph first**: a card whose dependency is still open (not closed, not in Done) is not offered but listed with what it waits for, and of the rest, from the columns a card can start in: `first version` cards first (the first `board.labels.milestone`), then by worth: a card's own value for the effort plus that of every card it unlocks (unlocking a card of little value adds little) (`value` high 3, medium 2, low 1, not set 1.5; divided by `effort` small 1, medium 2, large 4, unknown 3, or what a medium and a large card really took here once enough shipped, times its area's factor when that area's cards run bigger than their label (`npm run shipped`; the reason then says "measured"); times `feasibility` high 1, medium 0.75, low 0.5; a bug +0.5), each with its reason; says a tie at the top as one ("#a, #b are equal", marked `=`: nothing in the graph or the labels puts one first, so `/tidy` asks the owner once and keeps the answer as value labels), counts the cards with no value label and the issues off the board (`lib/rank.mjs`, a fixed sum: the owner's labels decide, not a model); under a card its `code:` line (as in `--show`, from its title and its area's shipped cards) |
| `npm run board -- --focus [--all]` | the focus block (`lib/focus.mjs`): a few cards of one theme (an area label) the coming days are about. With none picked it prints the four best blocks (`--all`: every theme): the `board.focusSize` (5) best startable cards per area, with a rough length from the effort labels, and how many cards have no area. `--focus "<theme>" [n,m]` picks one (its proposed cards, or the ones named), `--focus --add <n>[,m]` puts more cards in, `--focus --clear` drops it. While one is picked `--next` offers only its cards, says how far it is (a goal of cards: its picked cards done), when it was picked and the work in progress by session, and names a high-value bug outside it (`--focus --all` then lists what to pick after it); when its cards are done it says to pick the next. Every `--next` starts with what you were on (in progress, waiting for your check). **Code health is due** when `board.upkeepEvery` (8) cards closed since the last closed card labelled `board.health` (`area: Code health`: performance, refactoring, tests). The pick is kept in git's common folder (`workflow-focus.json`): no commit, and every session folder reads the same one |
| `npm run board -- --focus` with the app map | **goals with a finish line** come first (`lib/goals.mjs` in the map module, `lib/focus.mjs`): each kind of request (`docs/REQUESTS.md`) measured by its page's cases that are built and the weak and missing ends of the stages it runs through (`kinds` in `docs/flow/map.js`; a kind with no page starts with writing it), each part of the app with something left by its ends, and code health with its numbers (from the baseline and the flaky list; due when one got worse since the goal was last picked, or `board.upkeepEvery` cards shipped without it). Four are suggested: what is due, the closest to its finish line, the biggest (`--all` every goal, `--areas` the blocks by area). `--focus "<goal id>"` picks one; its cards are the open cards on what is left, measured again on every run. Where goals come from follows the phase (`DIRECTION`: prototype requests, parts, health; pilot what users reported (`board.feedbackLabel`, `feedback`) first; production what the running app reports (`board.signalLabels`) first), or `direction.goals` in `workflow/levels.json` |
| `npm run board -- --add ... --unsorted`, `--unsorted`, `--accept <n,m\|all>` | a card an agent made on its own (an open point, something noticed) gets the label `to sort`: it is never ranked or offered until the owner lets it in; `--unsorted` lists them, `--accept` takes the label off |
| `npm run board -- --expire [--yes]` | the startable cards untouched for `board.expireDays` (56), not of high value and not first-version: listed, and closed with a note (reopenable) with `--yes` |
| `npm run board -- --together [n,m]` | which cards go together (`lib/together.mjs`), among the ones named or the ones to start: **one session** (small cards on the same part of the app map, else the same area; at most three), **one after another** (a card that needs another first, or two bigger cards on the same part), **side by side** (bigger cards of different parts, as many as `board.wip` allows, at most three). `--next` prints the same lines, each with its `/work` command |
| `npm run board -- --room` | whether one more piece of work may start: exit code 3 when `board.wip` (2) is reached, and a line per piece. The limit is on work, not cards: the cards one session carries (`branch.<topic>.card`) count once, a card in progress no session holds counts on its own ("no session"), a session started without a card counts once ("no card") until its work is on main; a session whose cards are all closed is named as left over. `/work` and `/build` run it first |
| `npm run board -- --stopped "<line>"` | where this session stopped and what comes next, kept in git's common folder (`workflow-stopped.json`, three weeks); every `--next` starts with it, adding from git each time how many finished features are not pushed (only when some are); `session.mjs --push` stamps it as pushed |
| `npm run board -- --sweep ["<theme>" [--from n]]` | every open card for a full clean-up (`/sweep`): with no theme the count per theme (how many lack something, how many are untouched for two months), the one with the most to settle first; with a theme its cards 25 at a time, the most incomplete first, each with its column, what it lacks (area, type, value, effort) and the days since it changed |
| `npm run board -- --inbox` | open issues that are not on the board (feedback from the form, error alerts, ideas filed on GitHub), the weekly reports aside |
| `npm run board -- --adopt <n> --label <type> [--label <name>]...` | puts issue #n on the board in Backlog with its labels |
| `npm run board -- --today` | today's plan (`lib/today.mjs`): the free room (`board.wip` minus the work running, a session's cards once) filled in the goal's order, one session a place; a small card joins a small one on the same part, else takes a place of its own; a card on a part already running or picked, or one that needs a picked card, goes on the `after:` line. A part: the app map's places, else the card's "Touches" line, else its area. `--next` prints it too; `--together <n>` says whether one card fits beside the work running |
| `npm run board -- --triage` | what needs a decision (`lib/triage.mjs`): more work in progress than `board.wip` (counted as `--room` does; 2; when set, also how many topics `/build a b c` starts at once, 3 otherwise), waiting for your check over 3 days, in progress or blocked unchanged for 14, the inbox, startable cards with no value, likely duplicates (titles sharing most words), and over `board.backlogMax` (30) cards in Backlog the old low-value ones to prune; then the focus (finish these, then start this). `--next` prints one line when anything is found; `/tidy` acts on it |
| `npm run board -- --close <n> "<reason>"` | closes card #n with the reason as its last comment; refused without a reason |

## Costs
`npm run costs` reads `docs/company/COSTS.md` (`lib/costs.mjs`): the running costs table (what, provider, plan, € a month, grows with,
checked, source) and your hours at the hourly rate; prints the month by provider and the year, and flags a line with no price,
no source link, or a price checked more than 90 days ago. `npm run costs -- --compare <file.json>` puts options side by side
(`monthly`, `perUnit` x `units`, `oneOff`, `setupHours`, `hoursPerMonth`, `hourlyRate`) at 1, 12 and 36 months, and says from
which use a flat-priced option beats a per-use one. `/estimate` and `/advise buy or host` use both; `docs/run/BUY-OR-HOST.md` is the method.

**The loop and the order of work**: `/shape <n>` asks whether an idea is worth it (the problem, today's alternative, the first
ten users, the smallest version, the sign it worked, when to stop) and sets `value` and `first version`; `/spike <n>` tries the
riskiest part in a `spike-<topic>` session with no spec, tests or gate, ends in `docs/decisions/spike-<topic>.md`, and
`node workflow/scripts/session.mjs --drop spike-<topic>` throws the code away (the gate's *spikes* check fails when `spikes/` reaches main).
`/work` with no number runs `--next 3`. `npm run changelog` groups the commit subjects by area since the last tag.

**`/idea <a sentence>`** (`.claude/skills/idea/SKILL.md`, runs on a cheap/free model) adds a card to Backlog: it searches for the same
idea first (`--search`) and asks "Same as this one?", picks one type label and an existing area, effort and feasibility label,
writes a short body like card #1's, and answers `#<n> made in Backlog: <url>`.

**`/docs`, `/check`, `/find`** (`.claude/skills/docs`, `check`, `find`) are the other cheap helpers, on the same small model:
a small edit to the hand-written docs with no commit, the gate run and explained without changing anything, and a code question
answered from `npm run map -- --find` with paths and lines.

**Columns**: Backlog, Needs a board or decision, Ready, In progress, Waiting for your check, Blocked, Done. "Set this on
blocked, waiting for X" is `--block`; the comment keeps the reason on the card.

**Type labels**: every card has exactly one of `ui`, `feature`, `bug`, `workflow`, `spike` (the config's `board.types`); an area label (`area: Backend`) comes
second. The type picks the route through the work: *ui* = the mockup board first, then the build, changes kept to
`src/web`; *feature* = a plan with named tests first; *bug* = a failing test first, a plan only if large; *workflow* =
like a feature, nothing in the app changes; *spike* = a throwaway try with a time limit and a decision note, never merged (`/spike`).

**`/work <n>`** (`.claude/skills/work/SKILL.md`) is the one entry in plain words: it reads the card, takes the route its
type label says, plans and stops for a yes, builds in a session folder (`/build`), moves the card to *Waiting for your
check* and stops while the owner tries it, and runs `/ship` only when the owner says done. A blocked step uses `--block`.

**`/ui <n>`** (`.claude/skills/ui/SKILL.md`) is the route for a `ui` card (`/work` sends it there; it refuses a card without
the label and asks which type it is). Stage 1, design, writes no app code: one HTML board in `docs/design/` on the real
`styles.css` tokens with variants A, B and C, four pictures from `workflow/scripts/shots.mjs` (desktop and phone, light and dark), the
README row and a notes file in `docs/design/notes/`, then it stops for the owner's pick ("B, with A's header"). After the pick it writes a short spec and stops; `/ui <n>` in a new chat
finds that spec and is stage 2, which builds the pick in the session folder (no `/build` subagent) from the spec and the pictures: a short spec, before and after pictures from the same command,
feedback as one numbered list per round, one pass per round, only `src/web` changed, and `/ship` when the owner says done. A small
tweak to a part that exists skips the board: a live draft, one pass. A UI session reads the core of `docs/STYLE.md` and one board's
notes file, not every board's history.

The `board` block in `workflow/config.json`: `owner` (the project's owner), `repo` (`owner/name`, where the issues
live), `project` (the project number in its URL), `field` (the column field, `Status`), `columns` (the column
names, spelled as on the board; `Blocked` must be one for `--block`), `types` (the type labels; leave it out for no
type rule) and `labels` (`areas`, `effort`, `feasibility`: the lists `/idea` picks from and `--init` makes). Field and option ids are read from the project, never stored in the repo; a script
that makes many cards passes one `boardCache()` so the ids and the label list are read once (GitHub rate-limits bulk work).

**When it cannot be reached** it prints one sentence and exits 1: gh missing (install it from https://cli.github.com;
on Windows the tool also tries `C:\Program Files\GitHub CLI\gh.exe`), not signed in (`gh auth login`, then
`gh auth refresh -s project`), no network, or GitHub's rate limit (wait, then run it again). Nothing that needs the board should block on it: carry on and move the
card by hand on the board later.

## Agents and models
The skills live once, in `.claude/skills/<name>/SKILL.md`; every agent reads those.
- **Claude Code** runs them as `/<name>`. `/idea`, `/check`, `/find`, `/docs` carry `model: haiku` in their front matter.
- **OpenCode** reads the root `CLAUDE.md` (no `AGENTS.md`: with one, OpenCode reads it instead of `CLAUDE.md`; it does not load folder `CLAUDE.md` files, so the root file says to read them) and the same skills. `.opencode/commands/<name>.md` is one short file per
  skill naming the skill, the agent (plan or build) and the model; `node workflow/tools/harness.mjs` writes them from the skills and
  `workflow/config.json` (`harness.opencode`), and `--check` (part of the gate) fails when one is missing or out of date.
  `opencode.jsonc` sets the models and mirrors the permissions of `.claude/settings.json` and `settings.local.json` (the shell asks, the workflow's own
  commands don't; `.env` and the data folders can't be read, so they are never sent to a model provider).
- **Model rule**: the flow (`/work /spec /build /ship /ui`, Plan, Build, subagents) runs on a paid model. Free models only for
  jobs you start yourself and can rerun (`/idea /docs /check /find`, session titles): they are promotions with no published
  limits, and OpenCode retries a rate-limited model instead of switching, which would stall a build.
- **New chat per build**: planning stops at the yes; `/build <topic>` (and `/ui <n>` stage 2) starts in a fresh chat from the
  spec, so the planning context is not sent again on every feedback round.

## Commits and sessions (the details behind CLAUDE.md)
**A main branch with another name** ("trunk", "master", "develop"): `"git": { "main": "<name>" }` in `workflow/config.json`. The
gate compares with it, sessions start from it, finish onto it and push it, and the retro and the stage read its history; the
skills and guides still say "main" for it.

**Commits.** One feature, one session, one commit; the owner says when it is done. Don't commit while the owner is trying it (one exception: a session another one is stacked on gets one commit first, `.claude/skills/work/together.md`);
after feedback change the files (`--amend` only while unpushed). Write the message once: `--finish` keeps the first commit's,
`--keep-commits` only for a big rework (say so in the message). `--finish` puts it on the local `main`;
`node workflow/scripts/session.mjs --push`, only when the owner says, sends it to origin. Collect fixes into one commit ("Fixes from
checking X") or fold them into the next feature there. Two sessions in one area: finish the first first.

**Working on cards together** (`.claude/skills/work/together.md`): cards that only make sense together or change the same
files are **combined**: one spec (`Card: #12, #14`), one session (`session.mjs <topic> --card 12,14`), one commit that moves
every card. A card whose dependency is built but not finished (it waits for the owner's check) is **stacked**:
`session.mjs <topic> --on <that topic>` starts from that session's branch, so it does not wait for the commit on main; the base is
finished first (finishing the stacked one before it is refused), and `--finish <base>` moves every session on it onto main by
itself, only their own commits; uncommitted work or a conflict there leaves it in place and `--restack <topic>` moves it later.
`board --next` offers such a card with "starts on top of #m". Independent cards run **side by side** from main.

**A squash the owner asks for** (the only time `main` is rewritten): in a scratch worktree, push a backup tag first, check every
rebuilt commit, make sure the last tree is identical to the old one, then `git push --force-with-lease` against the commit it
was built from. Never `git push --force`, never merge by hand in the main folder.

**Sessions.** A branch is one change, finished as soon as the owner says done. `node workflow/scripts/session.mjs --list` shows
sessions, ports, cards and how many finished features are not pushed; `--clean` takes the finished ones away.

## Pictures from the command line
`node workflow/scripts/shots.mjs <url or file> --width 1400 --theme dark --out docs/design/png/49-DayTimes.png` takes a picture of a board file or of the
live app (`http://127.0.0.1:<main port>`) with an installed Chrome or Edge, headless, through its DevTools protocol (no install step). Options:
`--height`, `--full` (the whole page), `--phone` (shown as on a touch phone, not only as a narrow window: an app that picks its phone layout by the device shows it), `--click <selector>` and `--press <key>` (repeatable, done before the picture), `--wait <ms>`.
Set `CHROME_PATH` if the browser is not in its usual place. It gives up after 30 s and always closes Chrome.

## Using it in another project
Run the kit's `install.mjs` (see the kit's README.md): it copies this folder and the skills, fills the config and package scripts,
and leaves you the files to edit. By hand: copy `workflow/tools/`, `workflow/scripts/session.mjs`, `workflow/scripts/shots.mjs`, `.claude/skills/` and
`workflow/config.json`, edit the config (roots, test glob, commands, boundaries, security folders, session, board), run
`--update-baseline` once, add the npm scripts (`gate`, `gate:all`, `map`, `board`).

The `security` block: `code` (the source folder the advice looks at), `server` (where a new route counts as a trigger) and
`inputFolders` (where reading input without a "refuses/rejects/caps/too large/hostile" test earns an advice line); `signIn` (true once the app has accounts: a new route then wants a test that says who is refused).
The `session` block: `prefix` (session folders are `../<prefix>-<topic>`), `firstPort`, `mainPort`, `env` (extra `.env` lines).
