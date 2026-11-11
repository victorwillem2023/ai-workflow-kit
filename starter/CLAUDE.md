# {{PROJECT}}: notes for Claude

<ONE PARAGRAPH: what the app does, the stack, the runtime. Keep it to what Claude cannot see from the code.>
User docs live in `README.md` and `docs/GUIDE.md`; read them only when a change touches what they describe.

## How we work (the owner decides what gets built)
The owner wants to understand and steer the project, not just receive features. So:
- **Plan before code** for anything bigger than a small fix: in plain words what the user will see change, which files,
  which test proves it, which docs; wait for approval. `/work <n>` is the one entry: it takes the route the card's one type
  label says (*ui* = `/ui <n>`, a mockup board with variants A, B, C, then the build, only `src/web`; *feature* = a plan with
  named tests; *bug* = a failing test first, a plan only if large; *workflow* = like a feature, no app change), stops for a
  yes, builds in a session folder, stops while the owner tries it, finishes only on done. Underneath: `/spec` writes
  `specs/<topic>.md` (`tools/workflow/templates/spec.md`), `/build` builds it, `/ship <topic>` finishes it (full gate, docs
  check, one commit, `--finish`, deletes the spec). Details: `tools/workflow/README.md`.
- **New screens and parts start as a board, not as code** (`/ui` stage 1, `.claude/skills/ui/SKILL.md`). A live draft
  (one pass, no board, the owner tries it) is only for a small tweak to a part that already exists.
- **Browser-Driven Iteration**: browser feedback comes as one numbered list per round; one pass per round, with before and
  after pictures (`scripts/shots.mjs`), only in `src/web`, never core logic: a point that needs core logic becomes its own card.
- **Anchor with Tests**: No behaviour change in `src/core` without a test whose name says what the app now does. Write the test first.
- **Docs in the same commit**: `docs/GUIDE.md` and `README.md` when a feature is added or changes;
  `docs/ARCHITECTURE.md` when the layers or flow change.
- **The backlog is the GitHub board** (`npm run board`): read one card (`npm run board -- --show <n>`), never the whole
  list. "Blocked, waiting for X" is `npm run board -- --block <n> "<reason>"`.
- **One change at a time**: no extra cleanups or "while I was there" edits. Mention them instead.
- After a change, report in plain language: what changed, what the test checks, what you weren't sure of.
- To find your way, read first: what the app does `docs/GUIDE.md`, where the code is `docs/MAP.md` (search it, see
  *Reading the code cheaply*), how it fits together `docs/ARCHITECTURE.md`.

## Commands
```sh
npm test             # all tests, offline; run before every commit
npm run typecheck    # must be clean
npm run gate         # layers, file size, doc references, typecheck and only the tests your change reaches (quiet when it passes)
npm run gate:all     # the same with the whole suite: run before --finish. See tools/workflow/README.md
npm run dev          # <the dev server; say what restarts by itself, so Claude never tells the owner to rebuild>
npm run build        # <what it makes>
```

## How a request flows
<One line per step with the file that does it, then "Step by step: docs/ARCHITECTURE.md". Notes live in each folder's CLAUDE.md.>

## Layout rules
- `src/core`: pure logic, no I/O, <must also run in the browser>.
- `src/<io layer>`: all network and disk I/O.
- <the other layers, one line each, and the direction they may import. The same rules go in `workflow.config.json` under `boundaries`: the gate enforces them.>
- Tests: `tests/*.test.ts`, <runner>. Fakes for every outside service; never hit the network in tests.

## Security (short rules; known gaps and the audit are in `docs/SECURITY.md`)
Treat every request and every third-party page as hostile (<say here if the server can be put online>).
- **Untrusted input** (anything read from a request, an uploaded file or a third-party page): a size cap, a bound on every loop or
  step count that depends on the input, and a test with a hostile input whose name says what is now refused ("refuses ...",
  "rejects ...", "caps ...": the gate looks for those words). Name one existing function as the pattern to copy.
- **Outbound fetches** of a URL that came from a user or a third party: through <one HTTP client> with an `untrusted` flag that refuses
  private, loopback and link-local addresses at every redirect, caps the answer size and sends no contact details.
- **Links and HTML**: an `href` built from data must be `http(s)` only; `innerHTML` only for static markup; text goes through a helper.
- **A new endpoint, file reader or outbound fetch**: run the `security-review` skill on the branch before `--finish`, and add its
  limits (body size, count, rate) in the same commit. (`npm run gate` prints an `advice:` line when it sees one.)
- **Before sharing a link** (tunnel): password set, empty data folder, stop the tunnel afterwards. Never print `.env` values.

## Reading the code cheaply
- `docs/MAP.md` is the file map (one line per file: what it does, what it imports; generated, `npm run map` after adding or renaming a
  file). Never read it whole: `npm run map -- --find <words>` or `npm run map -- --uses <path>`, then open the file.
- Every source file opens with a comment saying what it does. `head -5` before opening a file, grep for the function you need.
- Large files (read only the range you need): <list them>.
- Never read or search: `node_modules/`, `dist/`, <data folders, generated files, lock files>.

## UI style (binding: `docs/STYLE.md`)
Before writing or changing any UI code read `src/web/CLAUDE.md`: it holds the style rules, the boards and the done checklist.

## Writing style
- Text the user sees (UI, warnings, names) is short, plain English, and built from measured facts; no jargon.
- Commit messages: a subject that says what changed for the user ("Area: what changed, and what else"), then a short body
  explaining the why. See `git log` for the tone.
- **One feature, one session, one commit; the owner says when it is done.** Don't commit while the owner is trying it; after
  feedback change the files (`--amend` only while unpushed). Commit and `--finish` only on "finish it" / "commit and push", never
  after one fix, a browser round or a docs touch-up. `--finish` puts it on the local `main`; `--push`, only when the owner says,
  sends it to origin. Tests and typecheck pass at every commit.
- **No docs-only, tests-only or "fix after a check" commits**: fold them into the next feature or collect them into one.
- **Never** merge by hand in the main folder, `git push --force` or rewrite `main`, except a squash the owner asks for.

## Git and sessions
- `main` on <remote url>.
- For live runs use the owner's server at `http://127.0.0.1:<main port>`; `.env` holds secrets: never print or send the values.

## Parallel work (several sessions at once)
One session, one folder, one branch, one port; never a shared working tree. How `scripts/session.mjs` works: its header
and `tools/workflow/README.md`.
- **Start**: `node scripts/session.mjs <topic> --card <n>` makes `../{{PREFIX}}-<topic>` (own port). Work only there, never in
  another session's folder or the main one. Say the folder and URL in your first reply.
- **A branch is one change**, finished as soon as the owner says done.
- **The main folder stays on `main`.** Never `git checkout` another branch in it. Found it on another branch, uncommitted
  files in it or a branch you don't know: that is someone else's work. Leave it and tell the owner.
- **Shared files** (listed below): edit only your own feature's lines, small. A rebase conflict keeps both
  sides' changes, never drops the other's.
  Shared files: `README.md`, `docs/GUIDE.md`, <other files every feature touches>.
- `node scripts/session.mjs --list` shows sessions, ports, cards and how many finished features are not pushed.
- Keep this file current instead of writing session notes into the repo (no PROGRESS.md or NEXT-SESSION.md).
