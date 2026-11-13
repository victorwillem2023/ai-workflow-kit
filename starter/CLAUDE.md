# {{PROJECT}}: notes for AI coding agents

<ONE PARAGRAPH: what the app does, the stack, the runtime. Keep it to what an agent cannot see from the code.>
User docs live in `README.md` and the guide (`docs/GUIDE.md` is its index, one file per part in `docs/guide/`); read only the
part a change touches.

## How we work (the owner decides what gets built)
The owner wants to understand and steer the project, not just receive features. So:
- **Plan before code** for anything bigger than a small fix: in plain words what the user will see change, which files,
  which test proves it, which docs; wait for approval. `/work <n>` is the one entry: the card's one type label picks the route
  (*ui* = `/ui <n>`, a board with variants A, B, C first; *feature* = a plan with named tests; *bug* = a failing test first;
  *workflow* = like a feature, no app change). After the yes the build starts **in a new chat** (`/build <topic>`, a session
  folder), so the planning is not sent again on every round; `/ship <topic>` finishes it, only when the owner says done.
  Details: `tools/workflow/README.md` (read by the section).
- **Model choice**: the flow (`/work /spec /build /ship /ui`) runs on a strong paid model. Small or free models only for jobs
  that are easy to check and to rerun: `/idea`, `/docs`, `/check`, `/find`. When in doubt, the stronger model.
- **New screens and parts start as a board, not as code** (`/ui` stage 1, `.claude/skills/ui/SKILL.md`). A live draft
  (one pass, no board, the owner tries it) is only for a small tweak to a part that already exists.
- **Browser-Driven Iteration**: browser feedback comes as one numbered list per round; one pass per round, with before and
  after pictures (`scripts/shots.mjs`), only in `src/web`, never core logic: a point that needs core logic becomes its own card.
- **Anchor with Tests**: No behaviour change in `src/core` without a test whose name says what the app now does. Write the test first.
- **Docs in the same commit**: the guide part in `docs/guide/` and `README.md` when a feature is added or changes;
  `docs/ARCHITECTURE.md` when the layers or flow change; `docs/code/<folder>.md` when a part moves.
- **The backlog is the GitHub board** (`npm run board`): read one card (`npm run board -- --show <n>`), never the whole
  list. "Blocked, waiting for X" is `npm run board -- --block <n> "<reason>"`.
- **One change at a time**: no extra cleanups or "while I was there" edits. Mention them instead.
- After a change, report in plain language: what changed, what the test checks, what you weren't sure of.

## Commands
```sh
npm test             # all tests, offline; prints only failures and a total. Run before every commit
npm run test:full    # the same, a line per test
npm run typecheck    # must be clean
npm run gate         # layers, file size, doc references, agent commands, typecheck and only the tests your change reaches (quiet when it passes)
npm run gate:all     # the same with the whole suite: run before --finish. See tools/workflow/README.md, *What it checks*
npm run harness      # rewrite the OpenCode commands after adding or changing a skill
npm run dev          # <the dev server; say what restarts by itself, so the agent never tells the owner to rebuild>
npm run build        # <what it makes>
```

## How a request flows
<One line per step with the file that does it, then "Step by step: docs/ARCHITECTURE.md, *How a request flows*".
Notes live in each folder's CLAUDE.md (rules only); where things are lives in `docs/code/<folder>.md`.>

## Layout rules
- `src/core`: pure logic, no I/O, <must also run in the browser>.
- `src/<io layer>`: all network and disk I/O.
- <the other layers, one line each, and the direction they may import. The same rules go in `workflow.config.json` under `boundaries`: the gate enforces them.>
- Tests: `tests/*.test.ts`, <runner>. Fakes for every outside service; never hit the network in tests. A test that waits on a
  timeout wraps its body in `clocked()` (`tests/clock.ts`), so a 4 s wait costs milliseconds.

## Code structure (a new feature is a new file)
1. A new feature gets its own file, named after it. Never add a feature to a file in `tools/workflow/baseline.json`: the gate fails if one grows.
2. Split by responsibility, not to hit a number. About 300 lines is a sign to look, 400 the gate's limit for a new file; a big file with one job may stay in the baseline with a one-line reason.
3. A function over about 60 lines is split into named steps. A file opens with a comment saying what it does (the file map is built from it).
4. A file takes what it needs as arguments or a small context; it does not import the big class or the whole store.
5. Touching a baselined file for a feature: first move the part you touch into its own file (same commit), or write the feature in a new file and leave only a call in the old one.
6. Splits belong to the feature that needs them, never a separate refactor commit.

## Changing existing code
7. Before changing the signature or meaning of something exported, list its users (`npm run map -- --uses <file>`). Keep it compatible or update every caller in the same commit.
8. Add, don't rework: a shared function or type keeps its shape for one feature's convenience; the feature gets its own version or an option.
9. A failing test is information. Change an existing test's expectation only when the behaviour change was intended, and say which test and why in the report. Never edit a test just to make it pass.
10. Anything else you notice goes in the report, not the commit.

## Security (short rules; known gaps and the audit are in `docs/SECURITY.md`)
Treat every request and every third-party page as hostile (<say here if the server can be put online>).
- **Untrusted input** (anything read from a request, an uploaded file or a third-party page): a size cap, a bound on every loop or
  step count that depends on the input, and a test with a hostile input whose name says what is now refused ("refuses ...",
  "rejects ...", "caps ...": the gate looks for those words). Name one existing function as the pattern to copy.
- **Outbound fetches** of a URL that came from a user or a third party: through <one HTTP client> with an `untrusted` flag that refuses
  private, loopback and link-local addresses at every redirect, caps the answer size and sends no contact details.
- **Links and HTML**: an `href` built from data must be `http(s)` only; `innerHTML` only for static markup; text goes through a helper.
- **A new endpoint, file reader or outbound fetch**: run a security review on the branch before `--finish`, and add its
  limits (body size, count, rate) in the same commit. (`npm run gate` prints an `advice:` line when it sees one.)
- **Before sharing a link** (tunnel): password set, empty data folder, stop the tunnel afterwards. Never print `.env` values.

## Reading the code cheaply
Every token read is paid for again on every later turn of the chat, so read by the part, never whole.
- `docs/MAP.md` is the file map (one line per file: what it does, what it imports; generated, `npm run map` after adding or
  renaming a file). Never read it whole: `npm run map -- --find <word>` (one telling word first; lines without their imports,
  `--imports` adds them) or `npm run map -- --uses <path>`, then open the file.
- What the app does: `docs/GUIDE.md` is an index; open only the part in `docs/guide/` you need.
- **Before editing in a folder, read its `CLAUDE.md`** (its rules, 1-2 KB). Claude Code loads it by itself; OpenCode and other
  agents load only the root file, so read it yourself.
- Where things are in a folder: `docs/code/<folder>.md`, by `grep -n`. The folder's own `CLAUDE.md` holds only its rules.
- Read by the section, never whole (`grep -n '^## '` lists them): `docs/ARCHITECTURE.md`, `tools/workflow/README.md`,
  `docs/design/README.md` (one row per board: `grep -n` the number, `tail -5` for the last), <other big docs>.
- Every source file opens with a comment saying what it does. `head -5` before opening a file, `grep -n` for the function you
  need, and read only that range.
- Large files (read only the range you need): <list them>.
- `npm test` and the gate print only failures; don't ask for the full output (`npm run test:full`) unless a failure is unclear.

## Never read
`node_modules/`, `dist/`, `package-lock.json`, `.env` (only `.env.example`), `tests/**/results/`, `docs/design/*.html` (look at
the board's picture in `docs/design/png/` and its notes file instead), <data folders, generated files, recorded output>.

## UI style (binding: `docs/STYLE.md`)
Before writing or changing any UI code read `src/web/CLAUDE.md`: it holds the style rules, the boards and the done checklist.

## Writing style
- Text the user sees (UI, warnings, names) is short, plain English, and built from measured facts; no jargon.
- Commit messages: a subject that says what changed for the user ("Area: what changed, and what else"), then a short body
  explaining the why. See `git log` for the tone.
- **One feature, one session, one commit; the owner says when it is done.** Commit and `--finish` only on "finish it" /
  "commit and push", never after one fix, a browser round or a docs touch-up; push only when the owner says. No docs-only,
  tests-only or "fix after a check" commits. Tests and typecheck pass at every commit. Details (amending, `--keep-commits`):
  `tools/workflow/README.md`, *Commits and sessions*.
- **Never** merge by hand in the main folder, `git push --force` or rewrite `main`. The one exception, a squash the owner
  asks for, has its own steps in *Commits and sessions*.

## Git and sessions
- `main` on <remote url>.
- For live runs use the owner's server at `http://127.0.0.1:<main port>`; `.env` holds secrets: never print or send the values.
- No session notes in the repo (no PROGRESS.md or NEXT-SESSION.md): keep this file current.

## Parallel work (several sessions at once)
One session, one folder, one branch, one port; never a shared working tree. How `scripts/session.mjs` works: its header
and `tools/workflow/README.md`, *Commits and sessions*.
- **Start**: `node scripts/session.mjs <topic> --card <n>` makes `../{{PREFIX}}-<topic>` (own port). Work only there, never in
  another session's folder or the main one. Say the folder and URL in your first reply.
- **The main folder stays on `main`.** Never `git checkout` another branch in it. Found it on another branch, uncommitted
  files in it or a branch you don't know: that is someone else's work. Leave it and tell the owner.
- **Shared files** (listed below): edit only your own feature's lines, small. A rebase conflict keeps both
  sides' changes, never drops the other's.
  Shared files: `README.md`, `docs/GUIDE.md`, `docs/guide/`, <other files every feature touches>.
- `node scripts/session.mjs --list` shows sessions, ports, cards and how many finished features are not pushed;
  `--clean` takes the finished ones away.
