# AI workflow kit

A way of working with an AI coding agent (built for Claude Code), packaged so a new project can start with it on day one.
You steer, Claude plans, builds and checks; scripts do the checking so the AI does not have to; nothing is committed until you say so.

## The idea in eight rules
1. **The board is the only backlog.** One GitHub Projects card per idea, bug or wish. Claude reads one card, never the list.
2. **One card, one type label, one route.** `ui` = mockup board first. `feature` = a plan with named tests. `bug` = a failing test first. `workflow` = like a feature, nothing in the app changes.
3. **Plan before code, and stop for a yes.** A spec (what the user sees, files, tests, docs, security) is approved before anything is built.
4. **Tests first, named as behaviour.** "refuses a 20 MB upload", not "test upload". New behaviour in the core layer needs one.
5. **One card = one folder = one branch = one port = one commit.** Sessions are git worktrees, so work in progress never breaks main or another session.
6. **You try it, you say done.** Claude stops with a URL; feedback comes as one numbered list per round; it commits only on "finish it". Pushing is a separate word.
7. **Scripts check, the AI reads the result.** `npm run gate` is quiet when it passes: layer rules, file size, stale doc references, typecheck, and only the tests the change can reach.
8. **Docs ride in the same commit,** and the gate fails when a doc names a file or command that no longer exists.

UI and security are first-class parts of the flow, not extras:
- **UI**: a new screen is never invented in code. `/ui` draws an HTML board with variants A, B, C on the real style tokens, takes four pictures (desktop/phone, light/dark), and stops for your pick. Then it builds the pick; feedback rounds come with before/after pictures. `docs/STYLE.md` is binding; a done checklist ends every UI reply.
- **Security**: short rules in `CLAUDE.md` (size caps, bounded loops, hostile-input tests, guarded outbound fetches, safe links/HTML), `docs/SECURITY.md` as the audit trail, and the gate prints an `advice:` line when a change adds a route, a file read or a fetch (run `security-review`), or reads input with no test named for what it refuses.

## What is in the kit
```
install.mjs               puts it all into a project (see below); --modules ui,security,testing,dev picks parts
payload/                  CORE machinery (copied; overwritten only with --force)
  .claude/skills/         /idea /work /spec /build /ship  (the commands you type)
  tools/workflow/         gate, board, file map, spec template, README (the reference)
  scripts/session.mjs     one worktree + port per card; --finish, --push, --list, --check-main, --remove
  tests/workflow/         65 tests for the gate, map, docrefs and board code
  docs/WORKFLOW.md        how to use it day to day, written for you
starter/                  CORE files that are YOURS (copied only when missing, then edited)
  CLAUDE.md               the rules Claude reads first (skeleton with <...> to fill)
  workflow.config.json    roots, test commands, layer rules, security folders, session ports, board columns
  gitignore.txt, package-scripts.json, settings.local.json    merged into the project by the installer
modules/                  OPTIONAL parts, each with payload/ (machinery) and starter/ (yours)
  ui/        .claude/skills/ui (the board route), scripts/shots.mjs (screenshots via Chrome/Edge),
             src/web/styles.css (16 colour tokens, light+dark, type/space/radius scales, buttons, chips, cards, states, toast),
             src/web/dom.ts (h() that never injects HTML or javascript: links, toast, prefs, keepFocus), src/web/CLAUDE.md (rules + done checklist),
             docs/STYLE.md, docs/design/README.md, docs/design/board-template.html (variants A/B/C, phone, states), tests/dom.test.ts
  security/  src/core/netguard.ts (private-address check), src/server/safefetch.ts (DNS guard, hand-followed redirects, size cap, timeout),
             src/core/guards.ts (safeHref, parseJsonCapped, atMost, cleanText), src/web/debug.ts (debug handle only on localhost),
             tests/security/security.test.ts (hostile-input tests), docs/SECURITY.md
  testing/   tests/clock.ts (fake clock: a 4 s wait costs milliseconds), tests/fakes.example.ts (fakeDeps + fixed NOW pattern)
  dev/       dev.cmd, start.cmd (Windows: install on first run, check packages and port), scripts/dev-check.mjs, .env.example
```

## The commands you type
| Command | Does |
|---|---|
| `/idea <sentence>` | Card in Backlog (duplicate check, labels, one question at most). Cheap model. |
| `/work <n>` | The one entry: reads card n, takes the route its type says, plans, stops for yes, builds, stops for you to try it, ships on "done". |
| `/ui <n>` | The `ui` route (called by `/work`). |
| `/spec`, `/build`, `/ship` | The steps underneath `/work`. `/build a b c` runs up to 3 builders in parallel when their files do not overlap. |
| `node scripts/session.mjs --push` | Sends finished features to origin, only when you say so. |

## Install into a new project
Prerequisites: Node 22+, git, the GitHub CLI signed in with project access (`gh auth login`, `gh auth refresh -s project`), Claude Code.
The tests are TypeScript run with `tsx`; the gate itself is plain Node and works on any repo that has test files and a typecheck command.

```sh
cd my-new-project            # a git repo with package.json
node ../ai-workflow-kit/install.mjs . --project "My App" --repo myname/my-app
# only some parts:  ... --modules security,testing
```
The modules' tests are TypeScript: `npm i -D tsx typescript @types/node @happy-dom/global-registrator` (happy-dom only for the ui module's test).
Then:
1. **Edit `workflow.config.json`**: `roots`, `tests` glob, `commands` (typecheck, test), `boundaries` (which folders may not import which), `security` folders, `session` (prefix, ports, extra `.env` lines such as a shared data dir), `board.project` (the project number in its GitHub URL).
2. **Fill `CLAUDE.md`** (every `<...>`), and add a short `CLAUDE.md` in each source folder that has its own rules (what is allowed, what to read first).
3. **Make the GitHub board**: a Project with a *Status* field holding the columns from the config, the four type labels, and your area/effort/feasibility labels. List the labels in `.claude/skills/idea/SKILL.md`. `npm run board -- --check` tells you what is missing.
4. `npm run map && node tools/workflow/gate.mjs --update-baseline && npm run gate`
5. Commit once: "Workflow: ...". Later, `/idea` your first card and `/work <n>` it.

The first gate run lists some "known stale doc references" because the skeleton docs mention files you have not written yet (`docs/GUIDE.md`, `docs/ARCHITECTURE.md`). Write them, then re-run `--update-baseline`.

## Adapting it
- **No web UI**: install with `--modules security,testing,dev` (no ui), and drop the `ui` type from `workflow.config.json` and the `/work` skill. Everything else stands alone.
- **Not TypeScript / Node**: change `commands` in the config. Import-graph test selection (`lib/graph.mjs`) reads JS/TS imports; for another language, drop to `gate:all` or write a graph for it.
- **Solo vs. team**: "the owner" in the skills is the person steering. Rename it if you like; the stop points are what matters.
- **No GitHub**: the board is isolated in `tools/workflow/lib/board.mjs`. Swap it for another tracker, or delete the card steps from the skills; the board never blocks a start or finish anyway.
- **Different gates**: each check is a small file in `tools/workflow/lib/`; add one next to them and a step in `gate.mjs`.

## Things learned the hard way (kept in the skills and CLAUDE.md)
- Keep `CLAUDE.md` short (write each rule once; a root file of ~13 KB is plenty); push detail into folder-level `CLAUDE.md` files and docs that are read on demand.
- Generate a file map (`docs/MAP.md`) and search it; never let the AI read a 47 KB index whole.
- Squash to one commit per feature; no docs-only or "fix after check" commits.
- Never let two sessions share a working tree. Never `git checkout` another branch in the main folder.
- Waiting specs are git-ignored so they cannot be committed by accident.
- A board that cannot be reached must be one warning line, never a stop.
- Name one real, well-tested input guard in `CLAUDE.md` as the pattern (here: `src/core/guards.ts` and its tests) so Claude copies a good example.
