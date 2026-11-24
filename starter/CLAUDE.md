# {{PROJECT}}: notes for AI coding agents

<ONE PARAGRAPH: what the app does, the stack, the runtime. Keep it to what an agent cannot see from the code.>
User docs live in `README.md` and the guide (`docs/GUIDE.md` is its index, one file per part in `docs/guide/`); read only the
part a change touches. Where every other doc is (product, company, build, run, decisions, the kit's guides): `docs/README.md`.

<!-- kit:how-we-work -->
## How we work (the owner decides what gets built)
The owner wants to understand and steer the project, not just receive features. So:
- **A stage in plain words** ("ready to deploy", "let's get users", "what now?"): the command comes from `/next` (it reads where
  the project is, `workflow/tools/stage.mjs`, and `workflow/guides/WORKFLOW.md`, *The commands, by stage*), never improvised.
  The stage commands (`/setup`, `/launch`, `/market`, `/advise`, `/arch`, `/secops`) are typed by the owner: suggest one, never run it.
- **The stack is decided**: `docs/STACK.md` says what the app is built with and why. A new library or service is the owner's
  decision first: propose it in the plan with the reason, and add its line there in the same commit.
- **Plan before code** for anything bigger than a small fix: what the user will see change, which files, which test proves it,
  which docs; wait for the owner. `/work <n>` is the one entry; the owner typing `/build <topic>` **in a new chat** is the yes, and
  `/ship <topic>` finishes it only when the owner says done (`workflow/tools/README.md`, read by the section).
- **Model choice**: each skill's `model:` line; a script before a model, never asking one what a tool can check (`workflow/guides/TOKENS.md`).
- **Anchor with Tests**: No behaviour change in `src/core` without a test whose name says what the app now does. Write the test first.
- **Docs in the same commit**: the guide part and `README.md` when a feature changes (or in one `/docs catch-up` pass, when the phase line under
  *Code structure* says they wait); `docs/ARCHITECTURE.md` when the layers or flow change; `docs/code/<folder>.md` when a part moves. A doc with a `<!-- covers: ... -->` line fails the gate when its
  files change and it does not; generated parts: `npm run map`.
- **The backlog is the GitHub board**: one card at a time (`npm run board -- --show <n>`), never the whole list; "blocked,
  waiting for X" is `npm run board -- --block <n> "<reason>"`. The owner works towards one goal at a time
  (`npm run board -- --focus`); when they stop for now, leave one line for the next session: `npm run board -- --stopped "<line>"`.
- **One change at a time**: no "while I was there" edits. What you notice is sorted (`.claude/skills/build/try-it.md`, *Open
  points are sorted*): only new work becomes a card, labelled and put in the goal when its finish line needs it, else parked (no goal: the backlog),
  then said ("say 'drop #n' to change one"). Small steps are about one commit, never a reason for the smaller design.
- **The best design, not the quickest patch**, for app code, infra and docs alike: every plan names the end state first (clean,
  easy to change, the version that scales). No special case beside a rule that could take it, no second way of doing one job:
  extend the rule's home, and split or refactor first when that is what it takes (`/spec` step 2).
- **Advice fits the project** (`project.audience`: `me`, `team`, `customers`). For `me`, never bring up launch, market, access
  reviews, privacy texts or "this already exists"; such a remark is made once, when it matters. All beyond the gate is optional.
- **A script the plan proposes** says whose it is. It knows this app's words or data: the project's own, in the project, run
  by hand, never by the gate; kit updates leave it. Every project would need it: a kit card instead. Measuring before and
  after: `workflow/guides/TESTING.md`, *Measuring before and after*.
- **Settle what you can yourself**: an open point a test, a run or the code can answer is answered before you report (say what
  it showed). One left for the owner comes with the step ready and how sure you are ("the cause is shown: shall I apply the fix?").
- After a change, report in plain language: what changed, what the test checks, then only what needs the owner: a decision as
  a question with your recommendation, work outside the card as a proposed card. Work inside the card is finished first; what
  is decided or changes nothing is not written. Never a bare "not sure".
- **Talk to the owner in plain words.** What it means for the person using the app before how it works; a technical word gets a
  few words of explanation the first time ("the gate, the checks that run before a commit"). Short sentences.
<!-- /kit:how-we-work -->

## Commands
```sh
npm test             # all tests, offline; prints only failures and a total (GitHub runs them all after every push)
npm run typecheck    # must be clean
npm run gate         # the checks and only the tests your change reaches; run it while building (a test that passed with the same code is skipped)
npm run gate:ship    # what /ship runs before --finish: the phase in workflow/levels.json says how much (workflow/tools/README.md, *What it checks*)
npm run gate:all     # the whole suite, only when asked for
npm run test:one -- <file>  # one test file, as quiet as npm test (never npx tsx --test)
<dev command>        # <the dev server; say what restarts by itself, so the agent never tells the owner to rebuild>
<build command>      # <what it makes>
```

## How a request flows
<One line per step with the file that does it, then "Step by step: docs/ARCHITECTURE.md, *How a request flows*".
Notes live in each folder's CLAUDE.md (rules only); where things are lives in `docs/code/<folder>.md`.>

## Layout rules
- `src/core`: pure logic, no I/O, <must also run in the browser>.
- `src/<io layer>`: all network and disk I/O.
- <the other layers, one line each, and the direction they may import. The same rules go in `workflow/config.json` under `boundaries`: the gate enforces them.>
- Tests: `{{TESTS}}`, <runner>. Fakes for every outside service; never hit the network in tests.{{TEST_TIPS}}

<!-- kit:code-structure -->
## Code structure (where a new feature goes)
<!-- generated: phase -->
<!-- /generated -->

1. A new feature gets its own file, named after it. Never add a feature's logic to a file in `workflow/tools/baseline.json`
   (pass-through lines are not counted; `size.allowance` gives a few a card): the gate says so if one grows.
2. Split by responsibility, not to hit a number: 300 lines is a sign to look, 400 the gate's limit for a new file.
3. A function over about 60 lines is split into named steps. A file opens with a comment saying what it does (the file map is built from it).
4. A file takes what it needs as arguments or a small context; it does not import the big class or the whole store.
5. Touching a baselined file for a feature: first move the part you touch into its own file (same commit), or write the feature in a new file and leave only a call in the old one.
6. A split or refactor the end state needs is planned, never worked around: in the feature's own commit when it fits the card,
   else a refactor card of its own, done first (the feature's card depends on it), with no behaviour change and the same test
   results before and after. A card that moves a rule into one place (rule 13) is one of those.
<!-- /kit:code-structure -->

<!-- kit:changing-code -->
## Changing existing code
7. Before changing the signature or meaning of something exported, list its users (`npm run map -- --uses <file>`). Keep it compatible or update every caller in the same commit.
8. Add, don't rework: a shared function or type keeps its shape for one feature's convenience; the feature gets its own version or an option.
   That is about shapes, never about rules: a rule (how a total is worked out, what counts as valid) is not copied, see 11 to 14.
9. A failing test is information. Change a test's expectation only for an intended behaviour change, naming the test and why; never just to pass.
   A test that fails with nothing changed under it is flaky: report it with its output, never run it again hoping for green
   (the gate lists flaky tests by itself).
10. Anything else you notice goes in the report, not the commit.
<!-- /kit:changing-code -->

<!-- kit:rule-lives -->
## Fix it where the rule lives
11. Before a fix, name the rule that was broken, in one line, and find its row in `docs/ARCHITECTURE.md`, *Rules and where each
    lives* (`grep -n` the rule, don't read the doc whole). Fix it in the file that row names, not where the bug showed up.
12. The plan and the report say which kinds of case share the rule (the kinds are listed above that table) and which you checked.
13. A rule lives in one place. A second copy is a bug even when it works: say so in the report, it becomes a card. A new rule
    is a new row in that table, in the same commit.
14. A shared step doesn't ask what kind of thing it is handling where the kind's own file can hold what differs. A number that
    is a rule gets a name and a comment saying what it is.
15. One job, one home: a flow's jobs and their homes are on its page, `docs/anatomy/<flow>.md`. A card that adds a job, or a
    second home for one, is a design question for the owner (`/spec`), never a patch.
<!-- /kit:rule-lives -->

<!-- kit:docs-before-memory -->
## Docs before memory
A fact a platform, library or product decides (a limit, price, region, flag, API, default, what is deprecated) is looked up
now in its official docs (a docs MCP server, `docs/company/ADVISORS.md`, else the page) and cited with the link, a price with the date
too (`docs/company/COSTS.md`). Not found: say "not checked" and how to check, never a plausible number. A library: the docs for the
version in the lock file.
<!-- /kit:docs-before-memory -->

## Security (the rules for code: `docs/SECURITY.md`, *Rules for code*)
Treat every request, uploaded file and third-party page as hostile (<say here if the server can be put online>). Read *Rules for
code* before you touch untrusted input, fetch a URL that came from a user or a third party, build a link or HTML from data, or add
an endpoint, file reader or outbound fetch (those also need a security review before `--finish`). Secrets are read from the
environment, never written into a file in git (the gate fails on one). Never print or send `.env` values.
**Sensitive files** (`sensitive.paths`: money, health, legal texts, personal data; `workflow/guides/SENSITIVE.md`): no number, rate or
legal sentence from memory, only from the source the spec names; a missing source is a question for the owner. Only the owner
signs off (`npm run signoff`): never run it, never write `docs/company/SIGNOFFS.md`.

## Reading the code cheaply
Every token read is paid for again on every later turn of the chat, so read by the part, never whole.
- `docs/MAP.md` is the file map (generated: `npm run map` after adding or renaming a file). Never read it whole:
  `npm run map -- --find <word>` or `npm run map -- --uses <path>`, then open the file.
- **Before editing in a folder, read its `CLAUDE.md`** (its rules; Claude Code loads it, other agents must read it). Where things
  are in a folder: `docs/code/<folder>.md`, by `grep -n`.
- Read big docs by the section (`grep -n '^## '`):
<!-- generated: bigdocs -->
<!-- /generated -->
- `head -5` before opening a file (each opens with what it does), `grep -n` the function, read only that range. Large files: <list>.
- `npm test` and the gate print only failures; ask for the full output (`npm run test:full`) only when a failure is unclear.

## Never read
`node_modules/`, `dist/`, `package-lock.json`, `.env` (only `.env.example`), `tests/**/results/`, `docs/design/*.html` (look at
the board's picture in `docs/design/png/` and its notes file instead), <data folders, generated files, recorded output>.

## UI style (binding: `docs/STYLE.md`)
A new screen or part starts as a board, not as code (`/ui`). Before writing or changing UI code read `src/web/CLAUDE.md`: the
style rules, the feedback rounds and the done checklist.

<!-- kit:writing-style -->
## Writing style
- Text the user sees (UI, warnings, names) is short, plain English, and built from measured facts; no jargon.
- **To the owner**, a suggestion or a question says in plain words what will happen, what they get and how long; a skill or
  command name comes after it in brackets at most ("Look back on the week, 10 minutes (/retro)"), never as the message.
- Commit messages: a subject that says what changed for the user ("Area: what changed, and what else"), then the why.
- **One feature, one session, one commit; the owner says when it is done.** Commit and `--finish` only on "finish it" /
  "commit and push"; push only when the owner says. A hook holds this (`workflow/scripts/stop-points.mjs`): a commit or push it refuses
  is a reason to stop and ask, never to find another way. How strict the gate is (`workflow/levels.json`) is the owner's: propose a
  level, never change one. No tests-only or "fix after a check" commits (docs and settings left in the main folder go in first, on their own: `/ship` step 0); tests and
  typecheck pass at every commit. **Never** merge by hand in the main folder, `git push --force` or rewrite `main` (the
  owner's squash has its own steps: `workflow/tools/README.md`, *Commits and sessions*).
<!-- /kit:writing-style -->

## Git and sessions
- `main` on <remote url>. For live runs use the owner's server at `http://127.0.0.1:<main port>`.
- No session notes in the repo (no PROGRESS.md or NEXT-SESSION.md): keep this file current.
- **One session, one folder, one branch, one port**: `node workflow/scripts/session.mjs <topic> --card <n>` makes `../{{PREFIX}}-<topic>` (with an orchestrator: the folder it prints);
  work only there and say the folder and URL in your first reply (the rest: *Commits and sessions*).
- **The main folder stays on `main`.** Never `git checkout` another branch in it. Found it on another branch, uncommitted files
  in it or a branch you don't know: that is someone else's work. Leave it and tell the owner.
- **Shared files** (`README.md`, `docs/GUIDE.md`, `docs/guide/`, <other files every feature touches>): edit only your own
  feature's lines, small. A rebase conflict keeps both sides' changes, never drops the other's. Code and tests are held by the
  session changing them: `session.mjs` refuses a second one on them.

## This project's own rules
Rules only this project has, one line each (`/lesson` adds them here). The kit's parts above are between `<!-- kit:... -->`
markers: an update replaces those it wrote, never this section or anything outside them.
