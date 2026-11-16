# Changelog

What changed in each version of the kit, newest first. Build on the latest tag (the README says which).

- **2.9.6**: **updates look after themselves.** The `renovate.json` a project starts with merges small updates (fixes, minor
  versions, pins, the monthly lock refresh; not libraries below 1.0) once Renovate has seen every check on them pass, and Renovate
  merges them itself (`platformAutomerge` off, so nothing merges before the checks ran; GitHub's "Allow auto-merge" is not
  needed). New major versions, Node and the tool images the checks never run (helm, k6, the scanners, in a group of their own)
  still wait for the owner. `node scripts/session.mjs --sync` brings the main folder level with GitHub when nothing is in the way
  (and installs what a merged update brought); `/next` and `/work` run it first. `npm run updates -- --short` names only what
  needs the owner ("1 to look at: alpine/helm 3.16.4 -> 3.22.0, a tool your checks do not run") and counts the rest as merging
  by themselves. A project's own `renovate.json` is its policy: an update does not change it (copy the rules in by hand).
  **`/next` is the safe front door again** (2.9.5 had made it run the picked command in the same chat, on the cheap model, and
  set labels): it changes nothing, offers the next steps in plain words, and says to start the one picked in a new chat (so a plan
  runs on the strong model, in a clean chat). Deciding a tie moved to `/tidy`; the catch-up with GitHub (`--sync`) runs in `/work`.
  CLAUDE.md is lighter: the rules for requests, errors and AI inside the app go into the server's folder note
  (`src/server/CLAUDE.md`, which the production module now starts), so a full install with AI is 12.6 KB of its 14 KB budget
  instead of 13.8 KB. `--update` names the files it rewrote old doc paths in. The changelog left the README for `CHANGELOG.md`.
- **2.9.5**: **`/next` offers instead of naming.** It ends with one question whose choices are the next steps it found (a
  security alert, the stage nudges such as `/retro` and `/advise roadmap`, `/tidy` when the board needs decisions or the map has
  ends nobody plans, and the top card), the recommended one marked with why, and runs the one picked at once, so the owner never
  has to type a command the kit already knew was next. Each choice says in plain words what you will do, what you get and how long ("Look back on
  the week, about 10 minutes: what shipped, what got in the way; each lesson becomes a check or a rule"), the command after it. CLAUDE.md makes it the rule everywhere: a suggestion or a question to the
  owner says in plain words what will happen; a skill name comes after it in brackets at most.
- **2.9.4**, from updating Training Coach: a stage not reached yet keeps the kit docs the project's own pages still point at
  (its filled-in deploy page at the infra guide), a few references deep, so nothing it keeps leads nowhere; and an update rewrites
  old doc paths in the project's text every time, not only when it moved a file (one an earlier update left is fixed too). The
  self-test's older project has its own deploy page pointing at the infra guide, and after the update every doc pointed at
  must be there.
- **2.9.3**, fixes from updating a real project (Training Coach) from 2.8.4. **An update no longer takes kit files for the
  project's own work** when the only change is the doc paths it rewrote itself (a file that matches the kit's stamp once the
  paths are put back is the kit's, and gets the new version). **`docs/PRODUCTION.md` is a build-stage doc again**: it describes
  code a project has from the first day (settings, logs, health), so it is not taken away before the run stage; an update moves
  it back from `docs/run/`. **The move does not fail a project's gate**: when the longer doc paths alone take CLAUDE.md over its
  budget, the budget grows by exactly those bytes, and the update says so. **Errors answer in the web's standard form**: RFC 9457
  problem details (`type`, `title`, `status`, `detail`) plus `code` and `reference`, as `application/problem+json`; the cause
  chain is logged as `causes` by `src/server/errors.ts`, so it works with the logger a project already has; the page reads
  `detail`, and an older `{ error }` body too. **An update adds the helpers a project lacks** (`src/server/trace.ts`,
  `errors.ts`, `src/web/report.ts` and their test), never replacing one, and names each in the code doc that covers its folder
  (`docs/code/web.md`, from the helper's own first comment), so the gate's covers check holds; and a CLAUDE.md section can name the folder note it
  belongs in (the debugging rules go into `src/server/CLAUDE.md` when the project has one). The self-test's update now starts
  from a project shaped like that one: the older layout with the older kit's stamps, `PRODUCTION.md` where 2.9.0 put it, the
  helpers missing and CLAUDE.md exactly at its budget, and it fails when the update takes any kit file for the project's own.
- **2.9.2**: **finding what goes wrong.** Every request has one id (the W3C `traceparent` trace id: kept when a request brings
  one, made when not) on every log line, in the answer (`x-request-id`) and in its calls to other services, and one line when it
  is answered (`POST /api/goal 400 12 ms`): `src/server/trace.ts`. Errors point at the cause: an `AppError` has a code, the words
  a person reads, what the code was doing, the ids and the error it was handling (`cause`), and `answerError` turns any error
  into `{ error, code, reference }` with the details in the log only, the whole cause chain in one line (`src/server/errors.ts`).
  The page turns a failed call into an `ApiError` with one clear console line and sends uncaught errors to the log, capped
  (`src/web/report.ts`). The gate's `errors` check refuses an empty catch and `console` in server code. `--serve` gives the
  command to follow the server's log, readable (`node scripts/logs.mjs <topic> --follow`, `--ref <reference>` for one request).
  **`/debug <what went wrong>`**: from what was seen and its reference to the log lines, the cause in the code, a failing test,
  then the fix; `/spec` asks what the person sees when it fails, `/review` whether a failure would leave nothing to find. A
  module can have more than one CLAUDE.md section, so these rules reach a project that has the first. **The app map steers**:
  `npm run board -- --gaps` lists the map's `gap` and `weak` ends no card is on (and how many decisions name no file), `/next`
  and `/tidy` pass them on (link the card, or make one), `/spec` names the ends a change moves and the file each decision is made
  in, the hand-off names the ends a build moved, and the gate advises when code the map names changed without its node.
  Fixed from GitHub's runs of 2.9.1 and before: the file map makes `docs/run/` when it writes the infra map there (a project
  with infrastructure files before its run stage has no such folder), and the session tests' clean-up waits for a folder Windows
  still holds.
- **2.9.1**: **a stage's docs come with the stage.** A new project has no `docs/run/` or `docs/market/`: `/launch` and `/market`
  start their stage (`node tools/workflow/stage.mjs --enter run|market`, from the kit on this computer, which `.workflow-kit`
  now records), and `.workflow-kit` remembers it (`stages=`). Mentions of a doc not there yet say where it comes from ("comes with
  the run stage: /launch"; a lean project's "with the security module, not installed"), and CLAUDE.md gets them back as links once
  the stage starts. `--update` takes away the untouched copies a stage not reached yet had, and keeps (and names) the ones the
  project changed; a project from before 2.9.1 keeps a stage it already went into. **The roadmap steers**: the stage nudge reads
  `docs/company/ROADMAP.md`'s stage and sign (unfilled: `/advise roadmap`; a month unchanged: has the sign come?). **Every doc
  has a reader**: `/launch` reads the production and cluster pages, `/advise roadmap` the stages page, and every self-test variant
  fails on a doc no skill, tool or CLAUDE.md names, and on a doc pointer that leads nowhere (which found a lean project's skills
  pointing at the security, ui and production modules' docs).
- **2.9.0**: **the docs in folders.** The top of `docs/` keeps the product and how it is built (product, guide, architecture,
  stack, conventions, style, security, setup, requests, the file map and the index); the rest is in a folder per subject:
  `docs/workflow/` (how the kit works with the AI), `docs/run/` (deploy, environments, network, production, recovery and the
  launch guides), `docs/market/` and `docs/company/` (costs, access, privacy, sign-offs, the roadmap, the advisors). One table
  (`doc-layout.mjs`) says where each doc lives. `--update` moves an older project's docs with `git mv`, keeps a kit guide known
  as the kit's under its new path, rewrites the old paths in the project's own files (the waiting specs too) and adds the folders
  to `docs.include`. `docs/README.md` takes its sections from the folders. Every self-test variant fails on an old path left,
  and proves the move: it turns its project back into an older kit's layout before the update and checks that nothing is left.
  **A faster gate**: the kit's own tests (`tests/workflow/`, most of a project's test time: 49 of 53 s on a real one) run only
  when what they test may have changed (a kit update, `tools/workflow/`, `scripts/`, the config, the packages, the skills), on
  GitHub, or with `--kit`; an app change runs only the app's tests, also in `gate:all` (71 s down to 17 s on that project).
  **Packages as the lock lists them**: the sessions share the main folder's packages through a link, so a card that added one
  and landed on main left the main folder without it (a server card's tests could not run). `scripts/packages.mjs` compares
  `package-lock.json` with `node_modules`; `session.mjs` runs it when it makes a session, before `--serve` and after `--finish`,
  and installs what is missing; the gate's `packages` check says it plainly instead of a typecheck error further down.
  **A new rule gets its row**: the spec template asks "New rules" every time (the rule and its row, and then
  `docs/ARCHITECTURE.md` under "Docs that change", which `/ship` holds the commit to), and `/review` asks whether the change
  adds a rule with no row.
- **2.8.5**: **no order by guesswork.** `board --next` says a tie at the top as one ("#11, #12, #14 are equal", marked `=`)
  instead of ranking by card number; `/next` then estimates any missing effort from the code, lets `docs/PRODUCT.md` decide
  what it can, and asks the owner one question whose answer is kept as value labels (`npm run board -- --rate <n> value high`,
  which also replaces an old one). `/idea` always sets value and effort (the card command left the value out), the value from
  the product doc or, when the doc does not decide it, as its one question; `/shape` estimates the effort too.
  The kit's self-test runs its variants side by side (`--jobs`, default 4; each project in its own port range through
  `WORKFLOW_TEST_PORTS`, so one's `--finish` never stops another's test server), runs each project's test suite twice instead of
  three times (the gate runs it; the separate run is gone), and `--quick` checks full and lean only for a routine change (GitHub still runs every variant).
  **The kit nudges at each stage**: `/next` first runs `tools/workflow/stage.mjs`, which reads facts (the first-version cards all
  done and no launch decision: `/launch`, after any card that says it comes before the first deploy; a launch plan and no
  `docs/market/MARKET.md`: `/market`; a week shipped without a retro: `/retro`), one line each, with the command that adds a skill a
  lean install left out. `/launch`, `/market` and `/retro` answer to plain words ("ready to deploy", "get users", "how did the
  week go?"), and CLAUDE.md sends a stage named in plain words through `/next`.
- **2.8.4**: stacking on a session whose built work is not committed is refused with the commit to make (the new session
  would not have had it); and a repo whose remote was added after `git init` gets `origin/HEAD` (set by `session.mjs` whenever
  it fetches), so Claude Code's `security-review` runs in `/ship` instead of falling back to a review by hand.
- **2.8.3**, fixes from trying 2.8.2 on a real project. **Handing a build over to try** follows one page
  (`.claude/skills/build/try-it.md`): `node scripts/session.mjs --serve <topic>` starts the session's dev server in the background
  and waits until the link answers, so the owner only opens it; a change without a screen gets a try command
  (`specs/<topic>.try.*`, never committed) that takes the owner's own numbers; the message is plain words with real examples
  and what they should give, the owner's own numbers, edge cases and what is not in the card. A link only for a change that
  shows something new on a screen: rules, data or an API with nothing to see yet get the try command alone, and a new
  session no longer prints a link by itself. `/ship` commits only a version the
  owner tried: a review fix that changes what it does goes back for a new check, and "continue" is not "done". Waiting for
  another card is a `Depends on:` line, not the Blocked column (which hid those cards from `--next`), and `npm run board --
  --undepend <n> <m>` takes a dependency off; both commands print the full list the card ends up with.
  **Work no longer waits for a commit on main when it need not** (`.claude/skills/work/together.md`): a card whose dependency
  is built and waits for the owner's check is offered by `--next` ("starts on top of #m") and starts on top of it
  (`session.mjs <topic> --on <that topic>`); the base is finished first, and its `--finish` moves the sessions on it onto main
  by itself (`--restack <topic>` when uncommitted work or a conflict was in the way). Cards that only make sense together or
  change the same files are combined: one spec (`Card: #12, #14`), one session (`--card 12,14`), one commit that moves them all.
- **2.8.2**, the first version to build on (tagged `v2.8.2`; only fixes after it until 2.9). A lean project gets only the guides of
  the parts it has (`launch` brings LAUNCH, CICD, MESH, MONITORING and RELEASES; `market` brings GROWTH, MARKET and the launch
  check; `advise` brings BUY-OR-HOST, SCALING, STAGES and ROADMAP), and every mention of a command or guide it does not have
  says "(not installed)", checked by the lean self-test. `docs/README.md` is the docs index, made by `npm run map`: every doc
  grouped (the product, the company, how it is built, how it runs, decisions, working with the AI, guides for later), one
  line each, the kit's own guides marked. The AI spend file is checked at start-up: not writable (a read-only container) or
  damaged, and the app refuses to start instead of paying for calls it cannot count.
  **The order of work follows the dependency graph**: a card says what it needs first (`Depends on: #1, #5`); `npm run board --
  --next` never offers a card whose dependency is still open, puts the cards that unlock the most first, and only then weighs
  value for the effort; `--graph` draws the tree, `--depends <n> <m>` writes a dependency, loops are named. `/idea`, `/shape`
  and `/setup` write the lines, and `/work` checks the tree before planning: a card that needs another first stops and names it.
  Docs and settings left in the main folder (from `/docs`, `/lesson`, `/shape` or the owner's own edits) no longer block `/ship`:
  it puts them in first as their own commit with `node scripts/session.mjs --commit-notes "<subject>"`, after the quick gate
  passes on them, so a hand edit that breaks a check is caught there; code left in the main folder still stops it.
- **2.8.1**: the board inbox leaves out Renovate's Dependency Dashboard (by its default title, or the one `renovate.json` gives it),
  so `/next` and `/tidy` no longer ask for a decision about it.
- **2.8.0**: safe before relying on it, and as lean as you want.
  **Production never deploys by itself**: after staging the deploy workflow stops; production is you running it, or (with
  `PRODUCTION_AFTER_STAGING`) a required reviewer's approval that the job checks is really there before it deploys.
  **The AI caps cannot be off**: the model, its prices and both caps are required settings (no prices written in code, the
  cheapest model by default), the wrapper refuses to start without them, and spending is kept in a file that survives restarts
  and deploys. **Destroys are spelled out**: the apply lists every destroy by name, each one that holds data is typed out in
  full before the code, and `--allow-destroy` is refused to agents by the settings and by the script.
  `--lean` installs only the build loop, every other part one word with `--with`, remembered on updates. `--update` removes
  files the kit no longer ships when the project never changed them. The starter `CLAUDE.md` is 2 KB smaller, so every module
  fits its budget with room for `/setup`; the first baseline no longer takes a `CLAUDE.md` over budget without a reason. The
  self-test runs seven variants (full, lean, cluster, a Vite starter, Python, Go, Rust), which found and fixed: the Python image
  copied everything (now only the installed app), the Vite starter's demo links counted as outbound calls, two TypeScript
  classes Vite's `erasableSyntaxOnly` refuses, and lint failing on a project with no `src` yet. The k6 pin is visible to
  Renovate, with a test that every pinned image is. Board read commands warn in one line and carry on when GitHub cannot be
  reached. `/setup` and the installer end with `/next`. Go needs 1.26 or newer, and its checks run pinned versions of staticcheck and govulncheck instead of @latest.
- **2.7.0**: an advisor, a board tidy-up and a cost estimate, and everything optional.
  `project.audience` (`me`, `team`, `customers`, asked by `/setup`) decides what the kit brings up: a personal project hears
  nothing about launch, market, access reviews or "this already exists"; the SecOps report leaves out access and drills for it.
  **Docs before memory**, a section of `CLAUDE.md` so every skill follows it: a fact about a platform or product comes from its
  official docs, read now and linked, or is marked "not checked"; `docs/company/ADVISORS.md` lists the docs MCP servers per platform
  (Context7, AWS, Microsoft Learn, Google Cloud, Cloudflare, Terraform, GitHub). `/next` is the front door: it says which command,
  and `docs/workflow/WORKFLOW.md` and this README list every command by stage. `/advise` is the one place for help deciding (panels:
  platform, architecture, buy or host, roadmap, growth; at most three advisors chosen for the question, more on request), each
  citing its sources, with pilots, reading and decision records; `/arch` is its architecture panel, and `/estimate` and
  `/advise` hand over to each other; `/retro` brings one platform suggestion a month. `/estimate` gives a change's work, its cost a month now and at 10 times, and what else it brings, from `docs/company/COSTS.md` (new:
  the real bill, with sources and dates) and `npm run costs` (the sums, and `--compare` for paid against self-hosted over 1, 12
  and 36 months with your hours). `docs/run/BUY-OR-HOST.md` (maps, routing, geocoding, email, sign-in, search, AI),
  `docs/company/STAGES.md` and the project's `docs/company/ROADMAP.md` (from ten users to a company). `/tidy` and
  `npm run board -- --triage` keep the board from piling up (work-in-progress limit, waiting for you, stalled, long blocked, the
  inbox, unranked, duplicates (short titles pair only on the same words), pruning) and name the focus; `--close` closes with
  a reason. The lifecycle table and `docs/workflow/LIFECYCLE.md` now say **Not yet** for what the kit does not have (browser smoke and
  accessibility tests, feature-flag code, the production module outside TypeScript, an errors-to-issues workflow). `docs/market/GROWTH.md` gains *Converting*
  (each funnel step, what moves it, no dark patterns) and `/market convert` proposes product changes as cards. The cluster module
  (`--with cluster`): a secure Helm chart, Argo CD per environment, rendered, schema-checked and scanned by the infra check.
  Background jobs, queues and serverless: `docs/run/SCALING.md`.
- **2.6.0**: `/market` and the Grow stage. `docs/market/GROWTH.md` is the guide (positioning in five answers, pricing models and
  providers, the landing page, search and Search Console, cookieless analytics on one funnel, a first Google Ads Search
  campaign step by step with Consent Mode and a stop rule, Performance Max and the rest, AdSense and when it does not fit,
  the other channels, the launch checklist, and what AI may draft but a person checks); `docs/market/MARKET.md` holds the project's
  answers and numbers. `npm run launch-check` checks a landing page by script: title, description, Open Graph, one main
  heading, image texts, language, viewport, the privacy link, nine kinds of tracker without a consent manager, robots.txt that
  shuts search engines out, the sitemap, and the page's weight.
- **2.5.0**: `/launch` and the Run stage, for any platform and tool. `docs/run/LAUNCH.md` walks the choices (cloud or on-prem;
  one server, a container host, serverless or a cluster; the database; the load balancer; server type and size; OpenTofu,
  Terraform, Pulumi or Ansible; analytics and a warehouse). Infrastructure changes go out in four steps (`docs/run/IAC.md`):
  `npm run infra-check` (in the gate when `infra/` changes: format, validate, the stack's own tests with mocked providers,
  startup scripts without secrets or `curl | sh` and passing cloud-init's schema, Trivy), a `plan.expect` written from the
  spec before the plan, `npm run infra-plan` (the plan reviewed against it: nothing unexpected, nothing missing, no database or
  volume destroyed without `--allow-destroy`, the final names and labels checked against the conventions), and
  `npm run infra-apply`, only at a terminal with a typed code, applying exactly the saved plan. `infra/network.json` is made
  from the config. The deploy script takes `--env`; the deploy workflow takes each release to staging, then production after an
  approval. `npm run drill` restores the latest backup into a new place and proves the app runs on it; SecOps flags a drill
  older than 3 months. New guides: CI/CD and monitoring (options, prices, what fits, how each works with AI agents), releases
  and user testing, the service mesh (Istio ambient and sidecar, Linkerd, Cilium, Consul, Kuma), and scaling (repositories,
  the platform repository for shared config, ownership, when to split a service). `/arch`: the architecture board.
- **2.4.0**: the AI module, for an app that calls a language model (`--with ai`; optional modules are new, and an update now
  keeps the modules a project was installed with). `src/server/ai.ts` is the one file allowed to call a model: a monthly and a
  per-user daily spend cap counted before the call, limits on input, output and time, untrusted text passed as marked data that
  cannot close its own tag, a canary that shows when the instructions leak, the answer checked by a zod schema (the Anthropic
  SDK's structured output by default, `claude-opus-5-5`), answers that would send data out through an image refused, and one log
  line per call without the content; a fake provider for tests. `npm run cases`: real and hostile cases (instruction leaks,
  tag breaking, data sent out) judged by code, "N of M" for the quality score, which shows *skipped* when no API key is there.
  `docs/workflow/AI-AGENTS.md`: tools for a model, MCP servers (using them, offering one, and the ones that help the coding agent),
  agent-to-agent with A2A, and when not to build an agent at all. A module can carry its own settings (`config.json`). The
  self-test installs every module, the optional ones too.
- **2.3.1**: performance and load testing. Goals in the config (`performance.goals`: 95% of requests within 300 ms, under 1%
  errors; `performance.load`: the paths and the expected users), and `npm run load -- smoke|load|stress|spike|soak`: k6 in Docker
  (pinned, kept current by Renovate) against the dev server or staging, never production unplanned, judged against the goals in
  plain lines. `docs/run/PERFORMANCE.md`: the page-weight budget, Core Web Vitals with Lighthouse CI, the kinds of load test and when,
  queries, queues and caching; specs ask about hot paths. Fixed: the session script found its own folder through a URL path,
  so on Windows short paths (`RUNNER~1`) and in any folder with a space it ran git in a folder that does not exist, and `--clean`
  cut a path with a space in two; found by the kit's self-test on GitHub's Windows runner; the session tests now run in a path
  with a space and a "~".
- **2.3.0**: worth building, and proven for a person; ideas borrowed from gstack and BMAD, with scripts where they used prompts.
  The README now leads with the difference: scripts check, the AI reads the result. AI inside the app: the gate's *ai* check (every
  model call through one wrapper file, `ai.wrapper`) and `docs/workflow/AI-SECURITY.md` (prompt injection and the rest of the OWASP Top 10
  for LLM applications, each with its rule; hostile cases in the quality score; promptfoo or garak for a bigger push). `/next` at
  any point (a script ranks; the model only says it). A light route for small cards (no spec file), so depth follows size: spike,
  light, spec. `/spec` asks for `/shape`'s pitch before a large card: the narrowest version first, the rest as later cards. The
  canary: `npm run deploy` watches the new version (5 minutes, an optional error check from the config) and rolls back on its own.
  `/ship` shows the commit subject as the changelog line; `npm run changelog -- --release <version>` writes `CHANGELOG.md` and
  the version. `/retro` weekly, from `npm run retro` (features per week, the streak, the health moves) and `npm run health`; each
  lesson goes through `/lesson`. `/shape` asks whether an idea is worth it (the problem, what people do
  today, the first ten users, the smallest useful version, the sign it worked, when to stop) into `docs/PRODUCT.md` and the card;
  `/setup` asks it first on a new project. The board ranks itself: `value` labels, a `first version` milestone, and
  `npm run board -- --next` (a fixed sum, not a model); `/work` with no number offers the top three. `spike` cards: `/spike` tries
  the riskiest part in a throwaway session, ends in a decision note in `docs/decisions/`, and `--drop` throws the code away (the gate
  keeps `spikes/` off main). The loop back: a feedback form, `--inbox` and `--adopt` for issues off the board, a *How we will know it
  worked* line in every spec that `/ship` puts on the card, `npm run changelog` from the commits, a feature-flag pattern. End-to-end
  smoke tests with an accessibility scan are the default once there are screens, and a page-weight budget is a gate check. The
  README says plainly that `/launch` and `/market` are not there yet. The kit checks itself: `npm test` in the kit installs it into
  a fresh project, runs its tests and the full gate there and an update over it, on Linux and Windows on GitHub; its first run
  showed the installer naming `@types/node` without the Node major (now `@types/node@^26`, from `.tool-versions`).
- **2.2.0**: images that hold only what runs, traffic rules as code, APIs and frontends. The TypeScript `Dockerfile` runs on
  distroless Node 26 as nonroot and copies only the built app, its production libraries and `package.json`; the gate's *image*
  check (pinned bases, a non-root user, no whole-repository copy, no secret in the history, a `.dockerignore`); `docs/run/INFRA.md`
  compares distroless, Docker Hardened Images, Chainguard, Wolfi, Chiseled and UBI. The gate's *network* check: every outside
  host the code calls is in `security.egress`, every IP allow or block rule has a reason and an end date (the weekly report
  raises one that ended), shown in `docs/run/NETWORK.md`. `docs/workflow/API.md` (OpenAPI from the code, versions, errors, paging, keys,
  webhooks, breaking-change checks, docs with Swagger UI, Scalar or Redoc behind sign-in), SFTP when a partner needs it,
  `docs/workflow/FRONTEND.md` (Vite, Next.js, React Router, TanStack Start, Astro, Expo; Storyblok, Payload and other CMSs), and AI
  security and deploy tools with their cost and what they see in `docs/workflow/TOOLS.md`. Fixed: on Node 26 a session's dev server
  watcher was not stopped on Linux and macOS (Node names its main thread "node-MainThread"), found by the gate on GitHub.
- **2.1.0**: kept up to date, checked and written down. The gate's *naming* check (files and exported names, from the
  language's norms) and `docs/CONVENTIONS.md`; *versions* (every tool pinned in `.tool-versions`, Node one version everywhere,
  OpenTofu stacks pinned with their lock file). Renovate (`renovate.json`: grouped small updates, majors alone, Node only between
  LTS versions, nothing younger than 7 days except security fixes; one policy per repository, or a config repository of your own
  for several) instead of Dependabot's version updates; `npm run updates` reads both. SecOps without hands: a weekly scan
  (OSV-Scanner, Trivy, Semgrep, gitleaks) as one report issue in plain words, `/secops` to act on it, `npm run secops -- --enable`
  for Dependabot alerts and security updates. `docs/SETUP.md` and `npm run setup-check` (its steps run on a fresh clone, on GitHub
  too). New projects on Node 26 (the active LTS; 22 ends in April 2027). Every pipeline action pinned to a commit, event values
  reach shell steps only through env, and the kit's own by-design shell and pattern uses are marked with their reason. Found by
  running all of it on Training Coach.
  Sensitive work (money, health, legal texts, personal data): `sensitive.paths`, every value from a source the spec names, and the
  gate's *signoff* check, which needs the owner's own `npm run signoff` for the exact files (`docs/workflow/SENSITIVE.md`). Names of things
  in the system (`<app>-<env>-<place>-<part>`, checked in infrastructure files), alphabetical lists (`naming.sorted`) and commits
  (one per feature) in `docs/CONVENTIONS.md`. `docs/company/ACCESS.md` and `npm run access`; the weekly report also watches certificates
  and the 90-day access review. New docs: `docs/run/ENVIRONMENTS.md`, `docs/run/RECOVERY.md` (backups, expand-and-contract migrations,
  cutovers, the runbook), `docs/run/INFRA.md` (proxy, load balancer, CDN, WAF, API gateway, service mesh, DNS, private networks,
  certificates), `docs/workflow/TOOLS.md` (the current open-source tool per job and what it replaced), and a small-company stage in
  `docs/workflow/LIFECYCLE.md`. Models by job: plans and reviews on Opus, building on Sonnet, small jobs on Haiku, a script before any model.
  Docs that cannot go stale: `docs/run/INFRA-MAP.md` made from the infrastructure files by `npm run map`, generated blocks in the docs
  (layers, versions, settings, sensitive files, naming) made from the config, and the gate's *covers* check (a doc that names what
  it covers changes with it, or the spec says why not).
- **2.0.1**: the TypeScript `Dockerfile` runs without npm, npx, corepack or yarn (the first release scan of Training Coach failed on known
  vulnerabilities in the npm that `node:22-slim` ships, never used by the running app), starts `node` directly so the app gets the stop
  signal, and has a health check that uses Node's own fetch.
- **2.0.0**: from idea to product. The README and `docs/workflow/LIFECYCLE.md` tell the whole lifecycle. The `production` module: settings
  checked at start-up, JSON logs that hide secrets and personal fields, `/health` and `/ready`, a stop that lets open requests
  finish, `docs/PRODUCTION.md` and `docs/company/PRIVACY.md`. The gate's *settings* check (every name the code reads is in `.env.example`).
  The release pipeline (deploy module): one image per commit after the gate, scanned (Trivy: vulnerabilities and configuration),
  with an SBOM, in ghcr.io, third-party actions pinned to a commit. The gate pipeline on the current GitHub actions.
  `--update-baseline` refuses a new broken import rule or a doc naming a missing file (it accepted them before), unless `--allow-growth`.
- **1.6.2**: a `.gitattributes` (LF everywhere, CRLF only for `.cmd` and `.bat`) written into every project, and in the kit itself:
  Git for Windows sets `core.autocrlf=true`, so every `git add` warned "LF will be replaced by CRLF". The `.cmd` files are written with CRLF.
- **1.6.1**: `npm run harness` (and so `--update`) adds to an `opencode.jsonc` written earlier the shell rules
  `.claude/settings.local.json` gained since (allows after the ask rule, denies after every allow), and leaves the rest of the file as it is.
- **1.6.0**: `npm run updates` reads Dependabot (security alerts and pull requests) and gives each library a verdict: take it, look
  first, or hold (type definitions for a newer Node than the app runs on, or a library held in the config), with the ignore lines that
  stop a held one at the source; `/work` starts with its one line and `npm run health` shows it. Agents may not skip the push guard
  (`--no-verify`, `--force`, `-f`, another hooks path are denied in Claude Code and OpenCode; `--update` adds the rules to a project
  made earlier), and the gate says when the guard is missing on a computer. `tools/workflow/README.md` says what needs a public
  repository or a paid plan and what stands in for it.
- **1.5.4**: `npm run protect` asks GitHub about the repository by its full name (`board.repo` is `owner/name`; it put the owner
  in front a second time, so GitHub answered "not found" and the rule was never set). Its test now uses a config as the installer writes it.
- **1.5.3**: the import rules see `require('...')`, `import(`...`)` and a folder's `index.tsx`, so no import slips past them; a rule
  can name a stated exception (`except`), used for the start file that loads the variants page; `--update` adds a missing rule
  and sets component variants for a framework project.
- **1.5.2**: `/ui` with a UI framework draws its variants A, B, C as real components (`"ui": { "boards": "components" }`, set by the
  installer when it finds the framework), so the pick is half built; the gate fails when a variant is left at ship time. A picture
  from an outside tool can be the brief. A renamed `CLAUDE.md` section is not added twice; the baseline refuses a rules file that grew.
- **1.5.1**: from the first real project. The gate runs in a repository with no commit yet; a project's first baseline takes what
  a framework starter ships; `tsconfig.gate.json` when the starter's own config checks nothing; `.cmd` files get their names filled
  in; a project with a UI framework does not get the kit's DOM helper; the hostile-input advice sees new test files. `/setup` asks
  about the product first and proposes what to build, with the host (cheapest and easiest) and, for AI features, the model.
- **1.5.0**: the rules of the craft as checks, and a diet. Gate: import circles, source files no test reaches, nesting deeper
  than 4, escape hatches that may not increase (`any`, `@ts-ignore`, an empty `catch`, a `TODO` with no card number; a set per
  language), Biome (lint and format) for TypeScript, tests that are copies with other values, a time budget for the suite
  (advice), and a size budget for `CLAUDE.md`. `install.mjs --update` brings an existing project up to the kit and keeps its own changes. The starter `CLAUDE.md` is 1.7 KB smaller: the security rules moved to
  `docs/SECURITY.md` (*Rules for code*), the screen rules to `src/web/CLAUDE.md`. `npm run health` shows the test numbers.
- **1.4.0**: built to ship. Gate: a secret in a change fails (`secrets`), a copied function fails (`copies`), files that change
  together (`together`: a changed table needs a migration), and your own checks (`checks`: end-to-end tests, and per language
  `unused` for dead code and unused libraries and `audit` for libraries with a known security problem). `npm run protect` (main can
  no longer be deleted or rewritten). The deploy module (`npm run deploy`, `smoke`, `rollback`, a `Dockerfile`, `docs/run/DEPLOY.md`).
  `.github/dependabot.yml`. Pull requests as a setting (`"flow": "pr"`: `--finish` opens one, `--merge <topic>` lands it when its
  checks are green). `/ship` has a subagent that has not seen the build review it. `/setup` goes through the stack of a new project with you, one decision at a time with a recommendation
  (`.claude/skills/setup/stack.md`: language, UI and app framework, backend, data, sign-in, where it runs, tests, the decided-once
  questions) and writes `docs/STACK.md`. A library a change adds that `docs/STACK.md` does not name gets an `advice:` line. Globs take `{a,b}`.
- **1.3.0**: from Trailsmith's 15 Nov audit. *Fix it where the rule lives* (rules 11 to 14 in the starter `CLAUDE.md`, a
  *Rules and where each lives* table in the starter `docs/ARCHITECTURE.md`, a section in the spec template, a line in `/spec` and `/setup`).
  Three gate checks: function length, the scope guard, the quality score. `/review` (fresh eyes before shipping) and `/lesson`
  (a correction becomes a check or one line). The gate on GitHub (`.github/workflows/gate.yml`). `install.mjs --check` and `--lang`;
  Rust, Python and Go in the import graph, `forbidUse` in a layer rule; the `map` module (the app map and the request pages, with a gate check); `/setup` recommends a language and proposes an architecture. Plain words to the owner.
  Counts that may not rise (`ratchets`, for checks on what kind a thing is) and `npm run health` (the code-health numbers on one
  screen). The input guards as Rust, Python and Go examples in the security module. From Trailsmith: finishing a session stops its
  dev server and names a folder that is still open (`scripts/session-stop.mjs`), and `npm run board -- --map` (the worksheet:
  which cards sit on which ends of the app map; with the map module).
- **1.2.0**: from Trailsmith's 12-13 Nov work. OpenCode support (`npm run harness`, a gate step); `/check /find /docs`; a new chat
  per build and per ui stage 2; `/build` reads its rare cases from `build/several.md`; the quiet test reporter (`npm test` prints
  failures and one total); the guide as index + parts, `docs/code/<folder>.md`, folder notes with rules only, a *Never read*
  list; map `--find` without imports; the size rule as a ratchet (baselined files may only shrink, `--allow-growth "<reason>"`,
  `reasons` in the baseline); `session.mjs --partial` and `--clean`; *Code structure* and *Changing existing code* rules;
  `docs/workflow/TOKENS.md`; a starter `tsconfig.json`.
- **1.1.0**: board setup from the config, the `/setup` interview, license and version.
