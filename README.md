# AI workflow kit: scripts check, the AI reads the result

Every kit for AI coding promises "from idea to product". This one is built on a different rule: **whatever a script can
check, a script checks**, and the model only reads the result. Layers, sizes, names, secrets, versions, outbound hosts, images,
sign-offs, stale docs, what to build next and the weekly security report are scripts that give the same answer every time and
cost nothing to rerun. The model is kept for what needs judgement: the plan, the code, the review, and the words for you.
That makes it cheaper (the model reads one failing line, not a log), safer (a check cannot be talked out of), and honest (a
script does not say "done" when it is not).

Around that: the way of working with Claude Code and OpenCode from one set of skills, from an idea worth building to an app
people use. Plans you approve, tests first, one commit when you say done, and the basis for running it without going down.

> **Build on the latest `v4.x` tag** (now `v4.19.0`: work on how the app moves measured before the hand-over and felt through the session log; sessions that never change the same files side by side, a goal planned in waves; sessions in an orchestrator, Orca, with the Claude CLI in its terminals, `workflow/guides/ORCHESTRATOR.md`; past a prototype a screen is walked before the hand-over and the weekly runs are scheduled). 4.0 works in phases (prototype, pilot, production, read from facts about
> who depends on the product: fast while you build, strict once people rely on it) and has the docs portal (`/portal`): every doc
> in one page, in the project's own style sheet, with where the project stands at the top. 3.0 put the kit's own files under one folder, `workflow/`, so the root is
> the project's; it comes in profiles (minimal, solo, product, team), can be taken out again, and knows a repository with several
> apps. An older project moves over by itself on its next update. The rule from 2.8 holds: a new part, guide or skill comes from a
> real project running into its lack, never ahead of one. The guides written before that rule (the service mesh, paid ads and
> AdSense, agent-to-agent) are **the kit's library**: no project gets them from the start; when an app could use one, the agent
> reads it from the kit (`npm run library -- --list`, `--show <name>`) and brings it in on your yes (`--add <name>`). They say
> "Not yet tried in a real project" at their top, as does the cluster module's guide.

```sh
git clone https://github.com/victorwillem2023/ai-workflow-kit
cd my-project && node ../ai-workflow-kit/install.mjs . --project "My App" --repo you/my-app
# then in Claude Code or OpenCode: /setup
```
You steer, Claude plans, builds and checks; scripts do the checking so the AI does not have to; nothing is committed until you say so.

## The lifecycle
| Stage | What the kit gives it |
|---|---|
| **Idea** | `/idea`: one card per idea, bug or wish on a GitHub board; `/shape`: is it worth building (the problem, today's alternative, the first ten users, the smallest version, when to stop); `/spike`: a throwaway try of the riskiest part |
| **Plan** | `/setup`: who it is for, the product (`docs/PRODUCT.md`), then the stack and the layers it proposes; `/next` (`npm run board -- --next`): what to do next and which command, by value for the effort, at any point; `/tidy` (`npm run board -- --triage`): the board kept from piling up, and one goal at a time with a finish line (`npm run board -- --focus`: a kind of request made really good, a part of the app finished, or code health when a number got worse; where goals come from follows the phase), a limit on cards in progress, cards the AI makes waiting for your yes, and a "where I stopped" line between sessions; `/estimate`: a change's work and cost from `docs/company/COSTS.md`; `/advise`: up to three advisors on a choice, citing the docs; `/spec`: a plan with named tests and how we will know it worked |
| **Build** | `/work` and `/build`: tests first, one session folder per card, the gate (layers, size, copies, secrets, tests the change reaches) |
| **Ship** | `/review` and `/ship`: one commit when you say done; the gate on GitHub; one scanned release image per commit (distroless for TypeScript and Go, a slim image for Python and Rust); a page-weight budget once there are screens. from pilot on a screen is walked before it is handed over (`workflow/scripts/walk.mjs`: a few steps in the owner's words, run by a script in headless Chrome; the agent reads one line). Accessibility tests are added by `/setup` as a project check (Playwright, from `stack.md`) once there are screens: **not yet** shipped as kit code |
| **Run** | from day one in a TypeScript app (the production module): checked settings, safe logs, health and readiness, stopping without downtime, a record of personal data (**Not yet** for Python, Go and Rust); `npm run deploy` from your computer to one host, health-gated, then watched for 5 minutes (the canary) and rolled back on its own; AI inside the app behind one wrapper with the OWASP rules (`workflow/guides/AI-SECURITY.md`). `/launch` decides where it runs, for any platform and infrastructure tool (`docs/run/LAUNCH.md`), writes `infra/` and the environments; every infrastructure change is tested with mocks, planned, reviewed against what was expected and applied by you (`docs/run/IAC.md`); deploys go from GitHub to staging by themselves, and to production only when you run it (or a required reviewer approves, checked before it deploys); `npm run drill` proves the backups. Guides for CI/CD, monitoring, releases and user testing, the service mesh, and scaling with the architecture board (`/arch`) |
| **Grow** | the loop back: feedback and "did it work" become cards (`npm run board -- --inbox`), a changelog from the commits and a version at release, and a weekly `/retro` on the shipping streak and the code's health whose lessons become checks. `/market` brings it to market (`docs/market/GROWTH.md`): positioning, pricing, the landing page and `npm run launch-check`, cookieless analytics on one funnel, search, Google Ads and whether AdSense fits, the launch checklist and a monthly review; the answers live in `docs/market/MARKET.md`. **Not yet**: feature-flag code (how to add it: `workflow/guides/LIFECYCLE.md`), a help button in the app linking the feedback form, and errors from the tracker becoming issues by themselves |

The basis for each stage is laid from the first day; the big questions are asked when a card makes them real, each with a
recommendation fitted to how big the app is. The full map: `workflow/guides/LIFECYCLE.md` in a project. Everything past the gate is optional: `project.audience` (just me, a team,
customers) decides what the kit brings up, so a personal project is never told to launch, market or review access.

## The idea in ten rules
1. **Scripts check, the AI reads the result.** `npm run gate` is quiet when it passes: layer rules, file size, stale doc references, typecheck, and only the tests the change can reach.
2. **The board is the only backlog.** One GitHub Projects card per idea, bug or wish. Claude reads one card, never the list.
3. **One card, one type label, one route.** `ui` = mockup board first. `feature` = a plan with named tests. `bug` = a failing test first. `workflow` = like a feature, nothing in the app changes.
4. **Plan before code, and stop for a yes.** A spec (what the user sees, files, tests, docs, security) is approved before anything is built.
5. **Tests first, named as behaviour.** "refuses a 20 MB upload", not "test upload". New behaviour in the core layer needs one.
6. **One card = one folder = one branch = one port = one commit.** Sessions are git worktrees, so work in progress never breaks main or another session. An orchestrator (Orca) may make the folders and run the agents in them; the port, the card and the commit stay the kit's.
7. **You try it, you say done.** Claude stops with a URL; feedback comes as one numbered list per round; it commits only on "finish it". Pushing is a separate word.
8. **Docs ride in the same commit,** and the gate fails when a doc names a file or command that no longer exists.
9. **Read by the part, never whole.** A new chat per build; the file map searched, the guide one file per part, folder notes
   that hold only rules, a never-read list, a test run that prints only failures. Why each one: `workflow/guides/TOKENS.md`.
10. **One set of skills, any agent.** Skills live in `.claude/skills/`; `npm run harness` writes OpenCode's commands from them
    (the strong model for plans and reviews, the fast one for building, a small one for the cheap helpers) and, if you want, an `AGENTS.md` that only points at `CLAUDE.md`.

UI and security are first-class parts of the flow, not extras:
- **UI**: a new screen is never invented in code. `/ui` draws an HTML board with variants A, B, C on the real style tokens, takes four pictures (desktop/phone, light/dark), and stops for your pick. Then it builds the pick; feedback rounds come with before/after pictures. `docs/STYLE.md` is binding; a done checklist ends every UI reply.
- **Security**: the rules for code in `docs/SECURITY.md` (size caps, bounded loops, hostile-input tests, guarded outbound fetches, safe links/HTML), `docs/SECURITY.md` as the audit trail, and the gate prints an `advice:` line when a change adds a route, a file read or a fetch (run `security-review`), or reads input with no test named for what it refuses.

## What is in the kit
```
install.mjs               puts it all into a project (see below); --modules ui,security,testing,dev picks parts
payload/                  CORE machinery (copied; overwritten only with --force)
  .claude/skills/         /setup /idea /shape /spike /work /spec /build /ship /review /retro /lesson /secops /launch /arch /market /advise /estimate /tidy /sweep /debug, and the cheap helpers /next /check /find /docs
                          infracheck and infraplan (infrastructure checked, planned, reviewed, applied), drill (the restore drill)
  workflow/tools/         gate, board, file map, harness (OpenCode commands, opencode.jsonc, AGENTS.md), quiet test reporter,
                          updates (Dependabot and Renovate verdicts), secops (the weekly security report), setupcheck
                          (SETUP.md proven on a fresh clone), spec template, README (the reference)
  workflow/scripts/session.mjs     one worktree + port per card; --finish, --push, --list, --check-main, --remove;
                          --adopt, --release, --connect orca: the folders made and the Claude CLI run by an orchestrator (Orca)
  workflow/tests/         tests for the gate, map, docrefs and board code
  workflow/guides/WORKFLOW.md        how to use it day to day, written for you
  workflow/guides/TOKENS.md          why the flow and the docs are shaped to keep sessions cheap
  .github/workflows/      gate (every push), secops (Mondays: the security report), setup (SETUP.md proven)
  workflow/guides/LIFECYCLE.md       the whole path from idea to product: what each stage needs, what is laid now, what /launch decides later
  workflow/guides/TESTING.md, DATA.md, PERMISSIONS.md   the build stage's rules: which tests at which level, tables, migrations and
                          queries, sign-in and who may see what; read by /spec and /review, with their checks in the gate
starter/                  CORE files that are YOURS (copied only when missing, then edited)
  CLAUDE.md               the rules every agent reads first (skeleton; /setup fills the <...> from an interview):
                          code structure, reading the code cheaply, never read, security, parallel work
  docs/GUIDE.md + docs/guide/   the user guide as an index plus one file per part
  docs/ARCHITECTURE.md    layers and flow, read by the section
  docs/code/core.md, src/core/CLAUDE.md   the pattern for every big folder: rules in the folder note, "where things are" in docs/code
  tsconfig.json
  workflow/config.json    roots, test commands, layer rules, naming rules, security folders, session ports, board columns, harness models
  orca.yaml               Orca's setup and archive scripts for each worktree (workflow/guides/ORCHESTRATOR.md)
  renovate.json, .tool-versions   the update policy (one repository, or moved to a config repository for several) and the pinned tools
  docs/SETUP.md, docs/CONVENTIONS.md   the setup guide whose marked steps are run, and the conventions with their reasons
  gitignore.txt, package-scripts.json, settings.local.json    merged into the project by the installer
modules/                  OPTIONAL parts, each with payload/ (machinery) and starter/ (yours)
  ui/        .claude/skills/ui (the board route), workflow/scripts/shots.mjs (screenshots via Chrome/Edge), workflow/scripts/walk.mjs
             (a screen walked before the hand-over, from pilot on: tests/smoke/<topic>.json),
             src/web/styles.css (16 colour tokens, light+dark, type/space/radius scales, buttons, chips, cards, states, toast),
             src/web/dom.ts (h() that never injects HTML or javascript: links, toast, prefs, keepFocus), src/web/CLAUDE.md (rules + done checklist),
             docs/STYLE.md, docs/design/README.md, docs/design/board-template.html (variants A/B/C, phone, states), tests/dom.test.ts
  security/  src/core/netguard.ts (private-address check), src/server/safefetch.ts (DNS guard, hand-followed redirects, size cap, timeout),
             src/core/guards.ts (safeHref, parseJsonCapped, atMost, cleanText), src/web/debug.ts (debug handle only on localhost),
             tests/security/security.test.ts (hostile-input tests), src/core/permissions.ts (who may do what: one function, a table test), docs/SECURITY.md
  testing/   tests/clock.ts (fake clock: a 4 s wait costs milliseconds), tests/fakes.example.ts (fakeDeps + fixed NOW pattern), tests/builders.example.ts (test data)
  dev/       dev.cmd, start.cmd (Windows: install on first run, check packages and port), scripts/dev-check.mjs, .env.example
  map/       (opt in: --with map) docs/flow (the app map: a page of yes/no trees of what the app decides), docs/REQUESTS.md and the request pages
  deploy/    a Dockerfile per language, workflow/scripts/deploy.mjs (npm run deploy: proves the new version runs or puts the old one back;
             npm run smoke; npm run rollback; --env staging|production), docs/run/DEPLOY.md, .github/workflows/release.yml (after the gate: one image per commit,
             scanned with Trivy, with an SBOM, kept in ghcr.io; third-party actions pinned to a commit), .github/workflows/deploy.yml
             (after a release: staging by itself; production when you run it, or after a required reviewer's approval)
  production/ src/server/config.ts (settings checked at start-up), src/server/log.ts (JSON logs, secrets and personal fields hidden),
             src/server/shutdown.ts (/health, /ready, stopping without cutting requests off), src/server/http.ts + server.ts (the assembled
             server: security headers, rate limit, same-origin check, body cap, idempotency keys; npm run build:server makes dist/server.js),
             tests/production/, docs/PRODUCTION.md,
             docs/company/PRIVACY.md (the record of personal data: the start of what the GDPR asks, not legal advice)
  cluster/   (optional, --with cluster) deploy/helm/app (a Helm chart: not root, read-only, no capabilities, a disruption budget,
             autoscaling, a NetworkPolicy, a Gateway API route; values per environment), deploy/gitops/argocd (one Application
             per environment), docs/run/CLUSTER.md; the infra check renders and scans each environment
  ai/        (optional, --with ai) src/server/ai.ts (the one file that calls a model: spend caps, limits, untrusted text as marked
             data, a canary against leaked instructions, answers checked by a zod schema, a log without content; the Anthropic
             SDK by default, a fake provider for tests), cases/ (real and hostile cases; npm run cases is the quality score)
```

## The commands you type
**Not sure what to type? Type `/next`: it tells you which command.** It looks at the board, the security alerts and where the
project stands, and names the next command; ask it "which command for ...?" and it answers from the list below.

| Stage | Command | Does |
|---|---|---|
| Start | `/next` | The front door: what to do now and which command does it; the cards to start, best first. Cheap model. |
| Start | `/setup` | Once, after installing: interviews you (who it is for, the product, the stack) and writes the rules, config, docs and board. |
| Idea | `/idea <sentence>` | Card in Backlog (duplicate check, labels, one question at most). Cheap model. |
| Idea | `/shape <n>`, `/spike <n>` | Is it worth building (fitted to who it is for); a throwaway try of the riskiest part. |
| Plan | `/tidy` | The board's front desk: too much in progress, cards waiting for you, stalled work, the inbox, duplicates, an old backlog; one batch of tidy-ups for a yes, then the week's focus. |
| Plan | `/estimate <card or idea>` | What one change really takes: the cards and hours, the cost a month now and at 10 times (from `docs/company/COSTS.md` and the price pages), and everything else it brings. |
| Plan | `/advise [panel] [question]` | Help choosing between options: up to three advisors from a panel (platform, architecture, buy or host, roadmap, growth), each citing the official docs; a pilot, pages to read, a proposed decision record. `/arch` is its architecture panel. You decide. |
| Plan | `/spec` | The plan of a feature with named tests (`/work` runs it). |
| Build | `/work <n>` | The one entry for a card: takes the route its type says, plans, stops for yes, builds, stops for you to try it, ships on "done". |
| Build | `/build <topic>`, `/ui <n>` | After the yes, **in a new chat**: builds in a session folder with the feedback rounds (`/build a b c`: up to 3 builders when their files do not overlap); the `ui` route with boards first. |
| Ship | `/review`, `/ship` | Fresh eyes on the diff; one commit when you say done (`/work` and `/build` call them). |
| Build | `node workflow/scripts/session.mjs --connect orca` | Once: sessions are made in Orca from then on, each with its own terminal and the Claude CLI; the open ones show there (`workflow/guides/ORCHESTRATOR.md`). |
| Run | `npm run schedule [-- --on]` | With Orca, past a prototype: the weekly runs (`/secops`, `/retro`, `npm run updates`) started on Orca's schedule; each reports and waits for you. |
| Ship | `node workflow/scripts/session.mjs --push` | Sends finished features to origin, only when you say so. |
| Run | `/launch` | Before the first real deploy: platform, shape, database, load balancer, sizes and infrastructure tool, one decision at a time with prices that day; writes the record, `infra/`, the environments and the run docs. Never applies. |
| Run | `npm run infra-plan -- infra/<env>` then `npm run infra-apply -- infra/<env>` | The plan, reviewed against the stack's `plan.expect` (names, labels, nothing holding data destroyed); then you apply exactly that plan, typing a code. |
| Run | `npm run drill`, `npm run costs [-- --compare <file>]` | The restore drill (the date goes in `docs/run/RECOVERY.md`); the monthly bill with stale prices flagged, or paid against self-hosted at 1, 12 and 36 months. |
| Run | `/secops` | Reads the weekly security report (an issue every Monday), says what each finding means, proposes the fix; a yes makes it a fix or a card. |
| Grow | `/market [part]` | Positioning, pricing, the page, converting, ads, the launch, the monthly review; answers in `docs/market/MARKET.md`, the work as cards. Never spends money or publishes. |
| Grow | `npm run launch-check -- <address>` | Is the landing page ready: title, description, share preview, one heading, image texts, privacy link, trackers without consent, robots.txt, sitemap, weight. |
| Every week | `/retro`, `/lesson` | The week's shipping streak and code health, lessons turned into checks; a correction made to last. |
| Any time | `/check`, `/find`, `/docs` | Cheap helpers on a small model: explain a failing gate, answer "where is X" from the map, a small docs edit. Read-only or no commit. |
| Any time | `/debug <what you saw>` | Why something goes wrong: the reference or request, its log lines, the cause in the code, a failing test that shows it, then the fix. |
| Any time | `npm run updates`, `npm run setup-check` | Security alerts and dependency updates with a verdict each; `docs/SETUP.md`'s steps proven on a fresh clone. |

## Install into a new project
Needs: Node 26+, git, the GitHub CLI (`gh auth login`, then `gh auth refresh -s project`), Claude Code.

A web app: make it with its framework's own starter first (`npm create vite@latest my-app -- --template react-ts`), then install
the kit into that folder. `/setup` recommends the framework when you haven't picked one.

```sh
cd my-new-project            # a git repo (an existing codebase is fine: see below)
node ../ai-workflow-kit/install.mjs . --dry-run     # what it would add, change and keep; nothing is written
node ../ai-workflow-kit/install.mjs .               # the name, the repo and the language come from the project; give
                                                    # --project "My App" --repo owner/name when it has no GitHub remote
npm i -D tsx typescript @types/node@^26 knip @biomejs/biome # the installer prints the exact line for the parts you took
```
**Profiles**: how much of the kit a project takes, with `--profile <name>` (the default is product):

| Profile | What it is |
|---|---|
| `minimal` | the gate and its checks only: no commands, no board, no sessions, no CLAUDE.md. The safety net and nothing else. |
| `solo` | the build loop: `/setup` `/next` `/idea` `/work` `/spec` `/build` `/ship` `/review` `/check` `/find` `/docs` `/debug` `/lesson`, the board, sessions, the stop points (was `--lean`) |
| `product` | solo and the stages: `/shape` `/spike` `/tidy` `/sweep` `/estimate` `/advise` `/launch` `/market` `/retro` `/secops`, and every module |
| `team` | product, with pull requests, a required review and the team roles (`workflow/guides/TEAM.md`) |

`--with <part>` adds one (`--with ai`, `--with retro`), `--without <part>` leaves one out (`--without market,ui`). Each skill is
something every agent reads about in every chat, so fewer is cheaper. The record (`workflow/record`) keeps the choice; running with
another profile moves the project there, and what a profile leaves out is taken away when you never changed it.

**Running it again** is how you update: the same command, no flags needed, keeps every choice and changes only what the kit
changed. **`--uninstall`** takes the kit out (`--uninstall --dry-run` first): its files as it wrote them, its parts of CLAUDE.md,
its hooks and scripts; a kit file you changed stays and is named, and what became yours (the config, your docs) stays.

**Where it all is**: the kit's own files are under `workflow/` (`config.json`, `record`, `tools/`, `scripts/`, `tests/`, `guides/`,
`specs/`); `.claude/` (the skills and settings) stays at the root because Claude Code reads it there. A project from before 3.0 is
moved over by its next update, with git, and the old paths in its own text follow.
The installer also writes `.opencode/commands/` and `opencode.jsonc`. Then open Claude Code (or OpenCode) in the
project and type **`/setup`**. It reads the code, asks you about the app, the layers, where outside
data comes in and the board's areas, then writes `CLAUDE.md`, `workflow/config.json`, `docs/GUIDE.md` and `docs/ARCHITECTURE.md`,
runs `npm run board -- --init` (labels, the GitHub project, its columns) and the gate, and stops for your yes before one commit.
After that: type `/next` whenever you are not sure; it tells you which command (the first time: `/idea`, then `/work <n>`).

**Is a project behind the kit, or ahead of it?** `node ../ai-workflow-kit/install.mjs . --check` lists the machinery files that
differ or are missing and changes nothing.

**An existing project** (its own code, its own CLAUDE.md): the same command. Files of yours at a place the kit also writes are kept
and named, the kit's rule sections are added at the end of your CLAUDE.md between markers (your text stays), and
`workflow/guides/TAKEOVER.md` is the path from there: today's state as the baseline, tests around old code before changing it.

**Updating to a newer kit**: `git pull` in the kit, then run the installer in the project again. A kit file the project never
changed is replaced; one it changed is kept and listed (compare, then `--take <path,path>` takes the kit's, `--take all` takes
everything); missing files are added; settings the kit has and the project lacks are added to `workflow/config.json`, nothing in
it is changed; the steps since the project's version run once (`migrations/`), and the update says what changed for you. Then
`npm run map`, `node workflow/tools/gate.mjs --update-baseline` and `npm run gate:all`. `--force` replaces all the machinery
(never your starter files) and still keeps your choices.

## Agents and models
- **Claude Code**: the skills as they are. `/idea /check /find /docs` say `model: haiku`; the flow runs on your chosen model.
- **OpenCode**: reads `CLAUDE.md` and `.claude/skills`. `npm run harness` writes one command per skill in `.opencode/commands/`
  (agent and model from `harness.opencode` in `workflow/config.json`; read-only skills get the plan agent), and once an
  `opencode.jsonc` whose permissions mirror `.claude/settings.local.json` and deny reading `.env` and the `harness.private`
  folders, in OpenCode 2's format (`permissions`, `agents`, `shell`; OpenCode 1 refuses it). The gate fails when a command is
  out of date. Defaults: DeepSeek for the flow, a free model only for the cheap helpers.
- **Other agents** that read only `AGENTS.md`: `"agentsMd": true` writes one that only points at `CLAUDE.md`. Off by default,
  because OpenCode reads `AGENTS.md` *instead of* `CLAUDE.md` when both exist. OpenCode also loads only the root `CLAUDE.md`,
  not a folder's, so the starter `CLAUDE.md` says to read a folder's `CLAUDE.md` before editing there.
  `"harness": { "opencode": false }` turns the OpenCode files off.

## Good to know
- **Windows first**: `dev.cmd` and `start.cmd` (dev module) are Windows scripts; everything else is plain Node and works anywhere.
  `session.mjs` links `node_modules` into each session folder with a junction on Windows and a symlink elsewhere.
- **Any language** (Python through [uv](https://docs.astral.sh/uv/): the install writes a `pyproject.toml`, `uv sync` gets pytest, mypy and ruff, the gate runs them with `uv run`): `--lang rust|python|go` at install (or `/setup` on a new project, which recommends one) sets the check and test
  commands. TypeScript and Rust also get the layer rules and the file map from their imports; only TypeScript and JavaScript get
  tests picked by file, the others run the whole suite. The kit's own tools stay Node scripts, so Node is always needed.
- **The modules' code examples** are TypeScript, except the input guards of the security module, which also come in Rust, Python
  and Go. The fake clock and the screen helpers have no other-language version.
- **Tests must run where the agent runs**: `node_modules` installed on Windows does not run in a Linux sandbox (and the other way
  round). An agent working remotely needs its own install (`npm ci`) or it can only read.
- **The board is GitHub Projects**, reached only through `workflow/tools/lib/board.mjs` and `gh`. A board that cannot be reached is
  one warning line, never a stop.

## Adapting it
- **No web UI**: install with `--modules security,testing,dev` (no ui), and drop the `ui` type from `workflow/config.json` and the `/work` skill. Everything else stands alone.
- **Not TypeScript / Node**: change `commands` in the config. Import-graph test selection (`lib/graph.mjs`) reads JS/TS imports; for another language, drop to `gate:all` or write a graph for it.
- **Solo vs. team**: "the owner" in the skills is the person steering. Rename it if you like; the stop points are what matters.
- **No GitHub**: the board is isolated in `workflow/tools/lib/board.mjs`. Swap it for another tracker, or delete the card steps from the skills; the board never blocks a start or finish anyway.
- **Different gates**: each check is a small file in `workflow/tools/lib/`; add one next to them and a step in `gate.mjs`.

## What changed
Every version, newest first, with what it fixed and why: `CHANGELOG.md`.

## Things learned the hard way (kept in the skills and CLAUDE.md)
- Keep `CLAUDE.md` short (write each rule once; a root file holds only what every chat needs, up to about 20 KB); push detail into folder-level `CLAUDE.md` files and docs that are read on demand.
- Generate a file map (`docs/MAP.md`) and search it; never let the AI read a 47 KB index whole.
- Start the build in a new chat after the plan is approved: otherwise the whole planning read rides along on every feedback round.
- A test run that prints one line per test cost 684 KB per passing run; print only failures.
- Free models never run the flow: they have no published limits, and OpenCode retries a rate-limited model instead of switching.
- Squash to one commit per feature; no docs-only or "fix after check" commits.
- Never let two sessions share a working tree. Never `git checkout` another branch in the main folder.
- Waiting specs are git-ignored so they cannot be committed by accident.
- A board that cannot be reached must be one warning line, never a stop.
- Name one real, well-tested input guard in `CLAUDE.md` as the pattern (here: `src/core/guards.ts` and its tests) so Claude copies a good example.
