# AI workflow kit

A way of working with an AI coding agent (built for Claude Code), packaged so a new project can start with it on day one.
It is the step from vibe coding to engineering: plans you approve, tests first, scripts that check, one commit when you say done.

```sh
git clone https://github.com/victorwillem2023/ai-workflow-kit
cd my-project && node ../ai-workflow-kit/install.mjs . --project "My App" --repo you/my-app
# then in Claude Code: /setup
```
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
  .claude/skills/         /setup /idea /work /spec /build /ship  (the commands you type)
  tools/workflow/         gate, board, file map, spec template, README (the reference)
  scripts/session.mjs     one worktree + port per card; --finish, --push, --list, --check-main, --remove
  tests/workflow/         tests for the gate, map, docrefs and board code
  docs/WORKFLOW.md        how to use it day to day, written for you
starter/                  CORE files that are YOURS (copied only when missing, then edited)
  CLAUDE.md               the rules Claude reads first (skeleton; /setup fills the <...> from an interview)
  docs/GUIDE.md, docs/ARCHITECTURE.md   skeletons /setup fills
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
Needs: Node 22+, git, the GitHub CLI (`gh auth login`, then `gh auth refresh -s project`), Claude Code.

```sh
cd my-new-project            # a git repo with package.json
node ../ai-workflow-kit/install.mjs . --project "My App" --repo myname/my-app
# only some parts:  ... --modules security,testing
npm i -D tsx typescript @types/node      # + @happy-dom/global-registrator with the ui module
```
Then open Claude Code in the project and type **`/setup`**. It reads the code, asks you about the app, the layers, where outside
data comes in and the board's areas, then writes `CLAUDE.md`, `workflow.config.json`, `docs/GUIDE.md` and `docs/ARCHITECTURE.md`,
runs `npm run board -- --init` (labels, the GitHub project, its columns) and the gate, and stops for your yes before one commit.
After that: `/idea <the first thing to build>`, then `/work <n>`.

**Updating** a project to a newer kit: `git pull` in the kit, then `node ../ai-workflow-kit/install.mjs . --project ... --repo ... --force`.
It replaces the machinery (skills, tools, scripts) and never your starter files; `.workflow-kit` in the project says which version it has.

## Good to know
- **Windows first**: `dev.cmd` and `start.cmd` (dev module) are Windows scripts; everything else is plain Node and works anywhere.
  `session.mjs` links `node_modules` into each session folder with a junction on Windows and a symlink elsewhere.
- **JS and TS get the fast gate**: `npm run gate` picks the tests a change reaches from JS/TS imports. Another language still gets
  every other check; set `commands` to its typecheck and test commands and use `gate:all` (the whole suite) as the test step.
- **The board is GitHub Projects**, reached only through `tools/workflow/lib/board.mjs` and `gh`. A board that cannot be reached is
  one warning line, never a stop.

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
