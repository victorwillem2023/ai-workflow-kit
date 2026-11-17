# Changelog

What changed in each version of the kit, newest first. Build on the latest tag (the README says which).

- **4.0.3**: **the gate's audit checks what ships** (`npm audit --audit-level=high --omit=dev`). A dev tool's advisory with
  no fix yet (picomatch, through knip and Vite) failed every TypeScript project's gate for code no user runs; the weekly security
  scan (OSV-Scanner on the lock files) and Dependabot's alerts still report the dev tools, and /next shows a security alert first.
  An update changes the audit check only where it is still the kit's own command. **A test file that fails as a whole says why**:
  the quiet reporter shows its exit code and the last lines it wrote to stderr, not only "test failed". **Fixes from the full
  self-test**: a session test still expected the `gate:all` wording; the serve test checks a port is free on every address, not
  only 127.0.0.1; the production module's shutdown test waits until the shutdown is done instead of a fixed 60 ms.
- **4.0.2**: **the portal's front page says it in a few words.** Each item is a short title with its command as a chip, not a
  sentence with brackets: "Errors you can see" with where it is done under it, "Look back on the 3 changes shipped" with `/retro`
  and "10 minutes", "4 in progress, the limit is 2" with "Finish one first", "#106 and #105 look the same", "#382 and #392 score
  the same. Which first?". The tools give the short forms as fields (`stage.mjs --json`, the phase needs' `short` and `how`, the
  board decisions' `title` and `hint`); on the command line they keep their full sentences. "Changed lately" lists titles without
  the project's name, as the sidebar does; the board's time is to the minute.
- **4.0.1**: **the portal's doc pages read comfortably.** Light by default, whatever the computer's setting (dark text on the
  white surface reads lighter over long docs; dark is one click away and remembered), the doc on the style sheet's surface colour
  and the sidebar on its page colour. Prose ends at one measure (about 68 characters), headings and their lines included; the
  style sheet's next sizes up for h2 and h3, space between list items, inline code in a quiet monospace that wraps, tables at the
  ui size with short columns kept from wrapping, code blocks with their `# comments` dimmed, line height 1.6. The sidebar shows
  each doc's title (the project's name taken off its front), in 32 px rows (44 on touch); the line above a title is its path; a
  centred picture keeps to the text column; links in tables and link lists underline on hover; a long doc gets "On this page"
  beside it on a wide window. The font is the file the project's app loads (width and weight). **A doc read as it is**: a code
  fence it never closes ends at the next blank line or heading instead of turning the rest of the file into code, and every
  line ending (CRLF, CR) is read.
- **4.0.0**: **the kit works in phases and has a portal** (3.4 to 3.5 brought them in; 4.0 finishes them). **The portal wears the
  project's own style sheet**: `docs/STYLE.md`'s colours, found by what each token's use says ("App background", "Panels, cards",
  "Text on yellow"), so no project renames anything; its font, from the project's own `@fontsource` package, so it shows offline;
  its sizes, condensed voice and radii; light and dark as the sheet gives them, with a switch. No style sheet yet: a plain look, and
  a line saying `/ui` writes one (the `ui` skeleton now names the uses the portal reads; `/portal` offers to make it first).
  **At a glance, redesigned**: four numbers (the phase, shipped this week, board decisions waiting, cards without a value); the
  board as a page, not sentences: a tie as a question, the next cards with value, effort, feasibility and score in columns, what
  waits, what needs a decision (`npm run board -- --next <n> --json`); the next phase's needs as a numbered list with "1 of 2 done"
  (`npm run phase -- --json`, `needsFor`); what is worth doing now; the latest decisions and what changed, marked "New" since your
  last visit. Commands are chips that copy on a click, card numbers open the card, the one primary button is "Tidy the board"
  when the board needs decisions, a quiet part (no tie, no warning) is left out, and an old or failed board answer says so. Doc
  pages in the same look; the sidebar keeps the docs opened lately.
- **3.5.0**: **the docs portal: `/portal` (`npm run portal`).** Every doc of the project in one page in the browser, with what
  matters now at the top: the phase and what the next one still needs, the stage, the next cards on the board, the latest
  decisions and the docs that changed lately. A menu grouped as the docs index groups them (the kit's guides marked), links
  between docs that work, search over all of them, and the file map and the app map one click away. Read-only and live: each
  page is made from the files when it is opened, an open tab reloads itself when a doc changes, and the board and the stage
  are asked in the background every five minutes, so a page never waits on GitHub. It starts in the background when it is not
  running and opens a new tab; it listens only on 127.0.0.1, on its own port (`portal.port`, else the main port - 1, outside the
  session range, so a session's finish never stops it), and serves only files git knows (never `.env`). No new packages.
- **3.4.3**: **the whole suite runs only when it is needed.** CLAUDE.md's Commands said "npm test ... Run before every commit"
  and "gate:all ... run before --finish", so an agent ran everything whatever the phase: new projects get `npm run gate` while
  building and `npm run gate:ship` for /ship, and an update rewrites those two lines in an existing CLAUDE.md by what they say (its
  own wording kept, never longer). `workflow/levels.json` and the gate's baseline go on `ignoreChanged`, and with the specs they no
  longer count as kit machinery: changing one runs neither the whole suite nor the kit's tests. **`"cache": "all"`** in
  `levels.json` (off by default) lets `--all` and a pilot or production /ship skip what passed on this computer with the same code
  (a second full run on a real project: 289 s to 25 s); GitHub runs everything. **The kit's slowest test files are split** in two,
  so their halves run side by side (the slowest group 61 s to about 30 s).
- **3.4.2**: **main comes into a session mid-build: `session.mjs --catch-up <topic>`.** A fast-forward when the session has no
  commit of its own, a merge when it has (`--finish` squashes it away); the loose work stays as it was, `git add -N` files too (no
  stash); a conflict stops it with nothing changed, one only in the map's pages is settled by making the map again. It commits
  nothing of the session's own work, so it needs no "done"; the /build builder uses it instead of `git stash`, `git merge` or
  `git rebase`, so a review no longer sees failures main has fixed. **"finish it and make a card" counts**: the stop points take
  the word with other work after it, not when that work must come first ("and fix the header first"). **`--serve` asks again
  3 s later** before it says the server runs; one that answered and stopped is said, with its last lines.
- **3.4.1**: **a session's finish no longer stops another session's server.** The stop now checks whose server it is: the
  listener and the node/npm/tsx processes above it, by their command lines (and, on Linux and macOS, their working folders). One
  that names this session's folder is stopped; one that names another folder of the project (the main folder, another session:
  a live session's vite or tsx names its own folder through node_modules/.bin) is left running and named; one that names no
  folder is stopped as before. So a leftover folder whose .env has a live session's port no longer takes that server down on
  --finish or --clean. **The session tests stay off the real session ports**: `WORKFLOW_TEST_PORTS` is 10000 by default (the
  throwaway sessions use 18788 up, not 8788 to 8999, where a project's real sessions run while its tests do); 0 is the real
  range again. The kit's self-test starts its projects from 10000 too.
- **3.4.0**: **phases: fast while you prototype, strict once people rely on it.** `workflow/levels.json` has a `phase`
  (`preset` before, still read): `prototype`, `pilot` or `production`. Each sets the quality checks, the process weight and how
  much `/ship` runs (`npm run gate:ship`: the tests the change reaches in a prototype, the whole suite in pilot and production;
  GitHub runs everything after the push either way). The phase follows facts read from the project, never a reminder on a
  timer: other people can open it or it keeps their personal data (pilot), it takes money or has a production address people
  rely on (production). `npm run phase` shows the phase, the facts and what the next one still needs (`--ready`); /next shows it
  in one quiet line and says a new fact once, and once when the phase is stricter than anything depends on. A deploy to a
  production environment is refused until the phase is production (smoke and rollback always go); /launch says what that means
  and what is missing. Only the owner switches. New projects start in prototype; a project without the file stays production.
  **A faster gate while you build.** A picked test that passed on this computer with the same code under it is skipped (`--fresh`
  runs it; never for the whole suite or on GitHub). `"reach": "direct"` picks only the tests that import a changed file. The
  typecheck keeps its notes between runs (`--incremental`, `.tsbuildinfo`; an update changes a typecheck script still as the kit
  wrote it). `--finish`, and `--push` when someone pushed meanwhile, run the quick gate on what the rebase can have broken, not the
  whole suite again. **How many cards at once**: `/build a b c` starts `board.wip` topics when it is set (3 otherwise). **Fixes**:
  an update no longer calls kit files the project's own when the project has a doc of a module it left out (its own
  `docs/SECURITY.md` without the security module: five files listed on every update); the gate's advice test passes in a project
  that loosens a check.
- **3.3.1**: **`map --check` passes on a Windows checkout.** With `core.autocrlf=true`, `workflow/record` has CRLF line endings,
  so no line matched and the docs index lost its "(the kit's)" marks: the gate went red on map, on Windows only. A shared
  `lines()` (`workflow/tools/lib/text.mjs`) splits on LF or CRLF, and the reads of checked-out files go through it (the gate's
  advice on new files, the Renovate pin test, the kit's self-test). **`--finish` commits every page the map writes**: it
  committed only `docs/MAP.md` after the rebase, so a docs index (or infra map, or generated block) it rewrote stayed in the
  folder and the folder could not be removed; a rebase conflict in the file map stopped the same way when the map rewrote the
  index too. Now all of it goes into the feature's commit. A folder that still cannot go no longer stops the finish: the
  feature is on main, so the card is told and the folder is named with its `--remove`. The "commit first" stop says any
  message will do (`--subject` puts the approved one on the commit).
- **3.3.0**: **how strict the kit is, written down and yours: `workflow/levels.json`.** Three kinds of rule, each treated its
  own way. The safety stops (commit and push wait for your word, the sign-off, secrets, leaks, migrations, the AI wrapper, the
  image, the network, the packages, typecheck, tests) have no level: on, or the part is not installed. Each quality check
  (layers, size, untested, docs... and the project's own `checks`) is `fail`, `advise` (said, and the gate passes) or `off`.
  The process weight follows the card's size: from which effort a spec, a pitch (/shape) and a UI board are needed (/work's light
  route, /spec's pitch step and /ui's board ask `npm run levels -- --needs`). A preset fills it in (`production`, `prototype`),
  the file's own lines win. Only you change it: the agent's settings deny the file and the stop-point hook refuses a shell write
  to it; the gate prints what is loosened on every run (`--advice` too), so a quiet project never looks cleaner than it is.
  **What the product is used on is decided at the start**: `project.surfaces` (web, web-phone, phone-companion, phone, desktop,
  cli, api), asked first in /setup. It sets the widths /ui draws and checks (`npm run surfaces -- --widths`: no phone width for a
  web app on a computer, only the phone for a phone app), whether pages are weighed and tested in a browser (only with web pages),
  and a phone or desktop app as an app of its own (`apps/mobile`); the gate checks the list makes sense. **For projects already
  on 3.2.1**: the budget counts CLAUDE.md as committed (a Windows checkout's 
 made every one fail); the kit's hooks and rules
  are in the tracked .claude/settings.json (moved there from settings.local.json, which is often not in git); a path setting
  (`ui.tokens`) is not a password; knip.json gets the build's start files and `workflow/**` in place of the kit's pre-3.0 places
  (the files package.json's scripts run count as start files too); --kit-path with a copy keeps kitRepo= and finds the version's
  tags in the clone; a kit update's spec says "the kit's files" once; the kit's own tools (knip, tsx...) are never asked for in
  docs/STACK.md; docs/design/notes/ holds only notes; the two dev-server tests no longer count processes (Linux has one).
  **The board's --next ranks by worth**: a card's value for the effort plus that of the cards it unlocks, so unlocking a card of
  little value no longer puts a low-value card above the best one.
  And **a description is not approval.** "Let riders mark a ride as done", "add a filter for rides that are done", "the
  status should read done", "rename the button to commit" and "/ship done-button" each gave three hours of commit permission. Now
  the word counts only on its own or after a short approving lead-in ("ok", "yes", "it's", "that's", "all", "we're", "go ahead
  and"), every place the word stands in a message is weighed, and a slash command's arguments never count (the skill asks, and
  the answer is its own message). A turn Claude Code marks as typed by the person counts even when its recorded text differs
  from what the prompt hook saw (an image, an @file); the fingerprint is needed only where that mark is missing. The gate says
  when a sign-off counts only by a signer on the local main, and the guide says why that is a convenience and GitHub the lock.
- **3.2.2**: **only what you typed says "done".** The stop points' transcript reader took any user turn, so a summary after
  /compact or a task notice that said "all done" granted a commit; now a turn counts only when Claude Code marks it as the
  person's (`origin: human`, checked against a real transcript) and the prompt hook saw it (it notes a fingerprint of each message,
  and runs on nothing else). "Well done", "you said it was done" and "done, but the footer is still wrong" no longer count; git
  cherry-pick, revert, am and rebase are held like commit; a redirect is refused only when it writes into the record (reading it
  into /tmp is fine). **The secrets check no longer lets a file off**: 3.2.0 passed any connection string in a compose file or an
  example env file, a real one included; now only a password that is the user name again on a compose service passes, in any
  file. **The first signer counts once committed on the local main** (`session.mjs --commit-notes`), before any push. The server
  answers a broken %-escape with 400, and counts page files apart from routes (ten times the routes' allowance). /arch and /retro
  have scenarios: every skill has one (23). The top-level check counts steps, not a table of data (the scenario
  table no longer counts; the gate's known stretch is 96 lines, from 147).
- **3.2.1**: **the skill scenarios test what they say.** Their project had none of the parts most of them use (a lean install:
  no /launch, /market, /ui, /shape, /spike, /tidy, /estimate, /advise or /secops), so those scenarios would have passed by the
  command not being there; the project now has every part they use, and a scenario whose command is missing fails. Three more
  (/launch asks before it writes, /market spends and publishes nothing on its own, /ui draws its board before any app code): 21
  in all. The kit's own top-level code keeps to the 60-line rule at a stretch (the self-test checks it; the gate's steps and
  the scenario table are named as longer and may only shrink). A call that sends data after its path (`api.post('/users',
  body)`) is a client, not a route. Found by GitHub's runners: on Linux a stacked base's checkpoint took the session's
  node_modules link into the commit (the kit's .gitignore now says `node_modules`, which matches a link too, and the checkpoint
  leaves it out), and a Go project's full gate handed `go test ./...` a list of files (a language that picks no tests now runs
  its suite); the Go variant had failed on GitHub since before 3.0.
- **3.2.0**: **sign-offs are signatures.** 3.1.0 said "a sign-off an agent cannot write"; what it delivered was one an agent
  would not write by accident (the key it sealed with was readable, the gate refused real rows on a second computer, and CI took
  any seal). Now each signer has a key pair: the private key encrypted with a passphrase only they know (`npm run signoff --
  --init`), the public key committed in `docs/company/SIGNERS.md`; each row is signed, and every computer and CI checks it the
  same way against the signers on main (a key a change adds counts only when an existing signer endorsed it: `--add-signer`). A
  row sealed by 3.1 is not a signature: run `--init`, commit SIGNERS.md on its own, and sign again. **The stop points read the
  owner's words from Claude Code's transcript**, not from a file an agent could write; "done reading the plan", "a commit button"
  and quoted words no longer count; `/usr/bin/git`, `npm run session -- --finish`, `git merge` and `gh pr merge` are held; writing
  the record, the signers or the note through a glob is refused. The README now says what the stop points are: a stop for an
  agent's mistake, not a lock against one that sets out to get around them (that is GitHub's branch protection). **The kit's
  library**: the guides written ahead of any project's need (the service mesh, paid ads and AdSense, agent-to-agent) are no
  longer installed; `npm run library -- --list` says when each helps, `--show` reads one from the kit, `--add` brings it in on
  the owner's yes, and /advise, /arch, /launch and /market look there first (a project that has one keeps it). **The assembled
  server**: the caller behind a proxy is counted from the right (`TRUST_PROXY` is the number of proxies), an idempotency key is
  done once even for two requests at the same moment and refused with another body, the built pages are served (never the
  server bundle), and an optional `signIn` refuses every route not marked `public`. Path aliases follow `extends` and
  `references` (Vite's tsconfig.app.json), and .vue and .svelte files are code. A client call (`api.get('/users')`,
  `cache.get`, anything in the browser's folders) is no longer a route; a Next.js app without src/ and Python routes get the
  security advice. A dev database (`postgres:postgres@db`, a compose file) passes the secrets check. "How we will know it
  worked" goes in `docs/PRODUCT.md` too, so `npm run retro` reads it without a board, in any wording with a date. The OpenCode
  plugin has a test that loads it and calls its hooks. **18 skill scenarios** (added: the read-only skills, /idea, /tidy, /debug, /setup, /secops, /spike, /work, /shape),
  and the skilltest workflow runs by itself on a change to a skill or the stop points.
- **3.1.0**: **checks that do what they say.** The stop points read the owner's words by sentence: a short "yes" commits
  (never pushes), a question, a condition or another meaning ("push the button") does not count, "wait" takes the word back, and
  each chat keeps its own note. **A sign-off an agent cannot write**: each row of `docs/company/SIGNOFFS.md` is sealed with a key
  in git's own folder and the gate refuses one whose seal does not check out; the hook refuses a shell command that writes the
  record or reads the key (a row signed before 3.1 has no seal: sign that change again). The layer rules, test picking, the
  untested check and the map follow **path aliases** (`@/...` from tsconfig, per app). **One route pattern** for the security and
  the "who is refused" advice (any `x.post('/...')`, Next.js handlers, server actions), and each advice line is quieted only by a
  test about that file. The secrets check catches a password in a connection string and a JWT. The load test and the
  certificate check read production from `deploy.environments` too. **The AI wrapper** reserves the budget before the call
  (calls at the same moment cannot pass the cap), retries with back-off and has a rate limit per user. **Stacking** saves the
  base's loose work as a checkpoint itself, and `--finish --subject` keeps the subject the owner approved (`/ship` passes it).
  **An assembled server** in the production module (`src/server/http.ts`, `server.ts`): security headers, a body cap, a rate
  limit, a same-origin check and idempotency keys on every route; `npm run build:server` makes the image's `dist/server.js`.
  OpenCode gets the **stop points** through a plugin `npm run harness` writes. `npm run retro` lists the "how we will know it
  worked" signs that are due. A multi-turn skill scenario (plan, build, done, ship) and the minimal profile in CI. Lighter
  skills (`/spec` and `/setup` read their conditional rules from `when.md`); the **map module is opt-in** (`--with map`) and
  loads no outside fonts; guides written ahead of a project's need say so. Docs that disagreed with the code now agree (TypeScript
  is the default language, browser tests, API checks, the deploy page, Node 26, the card types, one UI checklist). The kit's own
  code keeps its rules: one gh runner (`lib/gh.mjs`), the OpenCode models in one place, `install.mjs` in steps.
- **3.0.0**: **the kit's own files are under `workflow/`**, so the project's root is the project's: `workflow/config.json` (was
  `workflow.config.json`), `workflow/record` (`.workflow-kit`), `workflow/tools/` (`tools/workflow/`), `workflow/tests/`
  (`tests/workflow/`), `workflow/scripts/` (the kit's scripts that were in `scripts/` among the project's own), `workflow/guides/`
  (`docs/workflow/`) and `workflow/specs/` (`specs/`); `.claude/` stays at the root. An older project moves over on its next update
  (`migrations/3.0.0`: with git, its own text, config, tsconfig, test scripts, lint command and Renovate pattern following; a
  project from before 2.9 gets the docs move in the same pass). **Profiles**: `--profile minimal` (the gate and its checks only),
  `solo` (the build loop, was `--lean`), `product` (everything, the default), `team` (product with pull requests and a review);
  `--with` and `--without` adjust one, and running with another profile moves the project there. **`--uninstall`** takes the kit
  out again, its own files as it wrote them and its parts of CLAUDE.md, settings and scripts, keeping everything the project
  changed or wrote. **Several apps in one repository**: `apps` and `shared` in the config, and the gate runs each reached app's
  typecheck and tests in its own folder; `/setup` decides the shape from the answers. **Extras**: a main branch with another name
  (`git.main`), and gitleaks over what a change adds when it is installed (the `leaks` check). **Skill scenarios**:
  `scripts/skilltest.mjs` runs Claude Code headless on a throwaway project for `/ship` before "done", `/next`, `/docs` and
  `/lesson` and checks what it did (all four pass for real, about $0.13 a run; by hand or the `skilltest` workflow), and a stand-in
  agent proves each check catches a misbehaving one. Found by the self-test on the way: a path rewrite that took hours on a long
  line with no spaces, and a written file looked for with "/" where Windows lists "\" (a new Python project never got its checks).
- **2.10.0**: **the installer converges**: the same command gives the same result on a new project, an existing one or one that
  has the kit. `.workflow-kit` now holds every choice (also the language, the name, the repo and the prefix), so running the
  installer again updates (a flag changes only its own choice; `--force` replaces the machinery and keeps the choices), and what
  no flag or record says is read from the project: its manifest, its git remote, or its own `workflow.config.json` (a project
  from before the record). The kit's place on this computer is in git config (`workflow.kit`), not the committed record; `ref=`
  is the version's tag. The self-test runs it again with no flags after the update and fails on any change.
  **`--dry-run`** runs the same installer on a copy of the project and lists what it would add, change, move and remove.
  **Into an existing project**: each file of the project's at a kit place is named, an existing CLAUDE.md gets the kit's
  marked parts at its end (its own text kept, its budget grown to fit), and `package.json` keeps its layout with its own scripts
  first. **A place for the project's own**: each skill reads `.claude/project/<command>.md` (this project's own steps, saying
  where each goes; never in place of the owner's yes, the gate or a sign-off); the kit's parts of CLAUDE.md sit between
  `<!-- kit:... -->` markers, and an update replaces one only when it is what the project's kit version wrote (from that
  version's tag), so a part the owner changed stays theirs and is named; *This project's own rules* is where `/lesson` writes.
  **Migrations**: the kit's version history moved out of the installer into `migrations/`, one step per version, run once when
  the recorded version is older, each still looking before it acts. **What changed for you**: after an update, each kit
  version's headlines since the project's, the commands whose text changed, and the app map's request group when it changed.
  Each module describes itself in `modules/<name>/module.json`; `gate.yml` is filled in the same pass as the rest (no special
  cases); a part added later takes its "(not installed)" marks out of the project's text. `npm run test:quick` checks the
  installer's helpers in a second (the self-test runs it first). **Build-stage guides with their checks** (testing, data,
  sign-in and permissions: `docs/workflow/TESTING.md`, `DATA.md`, `PERMISSIONS.md`): a migration edited after it was there
  fails, SQL built from a value gets an advice line, and with `security.signIn` a new route without a "who is refused" test
  does too; `/setup` asks about accounts and stored data. **Guides where the kit was thin**: building screens (the four states
  every screen designs, state, data, forms and their messages, accessibility as rules: `SCREENS.md`), taking over existing code
  (the baseline as its own commit, tests that pin today's behaviour before the first change: `TAKEOVER.md`), more than one person
  (the roles, who approves whose plan, two people on one board, review between people: `TEAM.md`), and email, payments, uploads,
  scheduled jobs and time zones (`COMMON.md`), each read by the command that needs it. **The stop points are held, not only
  written**: two Claude Code hooks (`scripts/stop-points.mjs`; an update adds them) note the owner's own "done" or "push" and
  refuse an agent's commit or push without it. **"Not checked" is said**: changed Python, Go or Rust code the security,
  hostile-input and error-rule checks do not read gets a line saying so, instead of a silent ok. **Measured, not guessed**:
  `npm run cost` adds up what Claude Code recorded for the project and its session folders (tokens by model, command and day;
  money only from prices the project writes down), and `npm run coverage` says how much of the code the tests run and which
  files have the most lines no test runs; `/retro` shows both. The kit's prices and free tiers say when they were checked, and
  the self-test fails when that is over six months ago. Two runnable examples to copy: a route test with each refusal
  (`tests/security/routes.example.ts`) and a data test with migrations and a rollback per test (`tests/data.example.ts`).
  **The self-test is faster**: the kit's own tests run once per run, not
  in every gate of every variant, and the longest variants start first (all variants, the messy one included: 3 min 21;
  `--quick`: 2 min 14; `npm run test:quick`: a second).
- **2.9.11**: **the self-test has an old, messy project** (Trailsmith at 2.8 the model): an app with debt (an unused file and
  export, a page over its weight budget), made with the kit of the v2.8.5 tag and passing that kit's gate, then given its own
  settings, a board, an area label, an input folder, a rule in CLAUDE.md and a page of its own. It is updated with this kit,
  does only what the update says, and must then pass the full gate and still have everything it had (`scripts/selftest-messy.mjs`;
  CI runs it). Found by it: the versions check read `engines.node: ">=24"` as "24" and failed it against Node 26; a `>=` is a
  floor now, kept by any newer Node, and the `.tool-versions` an install writes follows the same rule.
- **2.9.10**, from porting Trailsmith (its builder's second list; what only Trailsmith's history causes is left to its own move).
  **An update no longer changes what it should not**: waiting specs, `CHANGELOG.md` and `docs/decisions/` keep the old doc paths
  (the specs are named in the report instead), and a line that already names the new place, a sentence about the move itself,
  is left alone. The old "no docs-only commits" line stays when the project never chose `commits.notes`, and its config then says
  `"with-feature"`, so it commits as before; only a project that chose `"own"` gets the new sentence. Lists the config merge adds
  to keep their layout (a one-line list stays one line), at any depth. A `.tool-versions` the kit adds says the Node the project
  already names (engines, the Dockerfile, `.nvmrc`), not the kit's. **Checks that fit an older project**: page weight already
  over the budget the first time takes that weight as its baseline (`tools/workflow/perf-baseline.json`, 5% room; heavier fails),
  instead of blocking every screen change; the unused check says "install the packages first" when knip is missing; and a
  TypeScript project with no knip config gets `knip.json` with the files its build starts from (a build script's entry points,
  vite.config, index.html), so knip no longer calls the app unused. **A session's packages without touching the main folder**:
  `node scripts/packages.mjs --own` gives the session its own copy (the suggestion now offers both). **Settings, not fixed text**:
  `build-requests.mjs` reads `map.requests` and takes the map's words from the index page (its title, its "## The kinds ..."
  heading, an "On the map: ..." line); `/ui` and `/setup` name the tokens file by `ui.tokens`. Smaller: an added card type says
  to run `npm run board -- --init`; the hidden-by-`.gitignore` warning covers every kit file, not only those written that run;
  the `--card` test commits even when the project's own config already names the board.
- **2.9.9**: **the kit asks where AI could make the app better**, in plain words and always starting from what the project's
  rules let go to a model. `docs/workflow/AI-AGENTS.md` opens with *Where AI could make the app better*: the uses (summarise,
  a first draft, sorting, reading a file, search by meaning, an assistant over the person's own data, the app as an MCP server
  for people's own assistants, data from an MCP server), what each needs and when it is worth it; the model writes words, code
  holds facts, and plain code is the answer more often than not. `/shape` adds one line when a use fits; `/spec` asks "with AI
  or plainly in code?" when the card's job is such a use (and says that `--with ai` adds the wrapper when it is missing). A new
  `/advise ai` panel (AI product engineer, security and data, FinOps, product and time) looks at the whole app, with the
  project's data rules at the top of its brief, and its answer, "none for now" included, is a decision record
  (`docs/decisions/<date>-ai.md`). Once the first version works, `/next` offers that look until the record exists.
- **2.9.8**, from porting Trailsmith (its builder's list). **A test moves a card**: starting a session with `--card` must
  move it to In progress with no board warning (the fixture's missing `cardgraph.mjs` had only shown as a warning). **An update
  keeps every setting**: the self-test's older project has its own extra input folder, and after the update every value of the
  old config must still be there. **The installer remembers where the kit is and what to skip**: `.workflow-kit` records `ref=`
  (the tag) and `kitRepo=` beside `kit=`, `--kit-path` names the real place when installing from a copy, and `stage.mjs --enter`
  says how to fetch that tag when the folder is gone; `--skip <files or folders>` keeps kit files out for good (`skip=`), and
  `--take` takes a folder (`tools/workflow/**`) or `all`. `--check` now goes by the project's remembered choices (lean, parts,
  modules, stages, skips) and the text an install writes, so a fresh lean install reads "the machinery is the kit's".
  **Settings instead of fixed places**: the request pages' places (`map.requests`: `{ index, folder }`), and where the notes left
  in the main folder go (`commits.notes`: `"own"`, a commit of their own, or `"with-feature"`, carried into the session by
  `session.mjs --carry-notes <topic>` for a project that allows no commit of docs alone). An update adds the card types the
  skills offer (`spike`) to `board.types`. The session test fixture takes its folder prefix as an option. And, unsaid until now:
  since 2.8.3 a session's card comment no longer names its port (a link only for a change with a screen, from `--serve`).
- **2.9.7**: **the kit keeps its own size rule.** The two scripts that grew most and carry the most risk are split along their
  seams: `session.mjs` (648 lines) into itself (making, finishing, pushing, listing), `session-core.mjs` (git, the folders, the
  main folder against origin, the board, packages, rebasing, checks) and `session-extras.mjs` (the main folder's notes, `--sync`,
  `--serve`, stacked sessions); `install.mjs` (590) into itself, `install-docs.mjs` (the stages, the doc move, keeping what a
  project's pages point at) and `install-config.mjs` (Claude Code's rules, the config merge, the files written once). Each moved
  piece is unchanged, and gets what it works on as arguments. The self-test fails when any of the kit's own scripts goes over
  400 lines. Fixed on the way: an update again sees a market page an older project kept at its old place (the 2.9.0 path rewrite
  had turned that path into the new one).
  **Typing `/build` is the approval** (asked for before 2.8.3 and lost since): `/spec` and `/work` end with "happy with it? open a
  new chat and type `/build <topic>`: that is your yes", and `/build` records "approved on <date> (by running /build)" and moves
  the card to Ready itself. It still stops when the spec asks an open question or holds a sensitive number without a source, and
  only the owner's own `/build` approves.
  **Faster work is offered, not hidden**: `/next` adds "build these at the same time" when two or three cards to start do not
  depend on each other and sit in different areas (about as long as the longest, about the cost of all of them), and `/spec`
  offers splitting a big card over several builders as a choice of time against cost instead of deciding it silently.
  Both go by the size of the work: cards at the same time only when each is medium or large (two small ones in one area are
  offered as one session instead), a split only for a large card whose packages are each a few hundred lines on their own files.
  **From porting an existing project (Trailsmith)**: the session tests' repos copy what the board library imports
  (`cardgraph.mjs`); the gate workflow says `permissions: contents: read` itself; the installer warns when the project's ignore
  rules hide a file it wrote (a rule once hid `docs/PRODUCT.md`) and adds a `.gitignore` comment only with a line of its group;
  the page-weight check fails, with the setting to write, when the build's files are not where `performance.files` says (it
  passed checking nothing); the unused check (knip) has a baseline like the others (`tools/workflow/unused.mjs`: the first run
  takes what is there, then only new findings fail; an update moves a project still on the old command to it); writing
  `workflow.config.json` back keeps every unchanged key exactly as written (no more reflowed one-line entries); in a session the
  packages check gives the command that puts a missing package into the shared folder without touching the main folder's files
  (`npm install --no-save`); the installer takes the Node version from the project's own `.tool-versions`, `engines`,
  Dockerfile or `.nvmrc` (it named `@types/node` 26 for a Node 24 project); and an update rewrites the kit's own old "no
  docs-only commits" sentence in CLAUDE.md, which contradicted `/ship`'s notes commit.
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
