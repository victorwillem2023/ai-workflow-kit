# AI workflow kit

A way of working with an AI coding agent (Claude Code and OpenCode, from one set of skills), packaged so a new project can start
with it on day one: the skills, the rules, the checks, the doc layout and the habits that keep sessions cheap.
It is the step from vibe coding to engineering: plans you approve, tests first, scripts that check, one commit when you say done.

```sh
git clone https://github.com/victorwillem2023/ai-workflow-kit
cd my-project && node ../ai-workflow-kit/install.mjs . --project "My App" --repo you/my-app
# then in Claude Code or OpenCode: /setup
```
You steer, Claude plans, builds and checks; scripts do the checking so the AI does not have to; nothing is committed until you say so.

## The idea in ten rules
1. **The board is the only backlog.** One GitHub Projects card per idea, bug or wish. Claude reads one card, never the list.
2. **One card, one type label, one route.** `ui` = mockup board first. `feature` = a plan with named tests. `bug` = a failing test first. `workflow` = like a feature, nothing in the app changes.
3. **Plan before code, and stop for a yes.** A spec (what the user sees, files, tests, docs, security) is approved before anything is built.
4. **Tests first, named as behaviour.** "refuses a 20 MB upload", not "test upload". New behaviour in the core layer needs one.
5. **One card = one folder = one branch = one port = one commit.** Sessions are git worktrees, so work in progress never breaks main or another session.
6. **You try it, you say done.** Claude stops with a URL; feedback comes as one numbered list per round; it commits only on "finish it". Pushing is a separate word.
7. **Scripts check, the AI reads the result.** `npm run gate` is quiet when it passes: layer rules, file size, stale doc references, typecheck, and only the tests the change can reach.
8. **Docs ride in the same commit,** and the gate fails when a doc names a file or command that no longer exists.
9. **Read by the part, never whole.** A new chat per build; the file map searched, the guide one file per part, folder notes
   that hold only rules, a never-read list, a test run that prints only failures. Why each one: `docs/TOKENS.md`.
10. **One set of skills, any agent.** Skills live in `.claude/skills/`; `npm run harness` writes OpenCode's commands from them
    (paid model for the flow, free model only for the cheap helpers) and, if you want, an `AGENTS.md` that only points at `CLAUDE.md`.

UI and security are first-class parts of the flow, not extras:
- **UI**: a new screen is never invented in code. `/ui` draws an HTML board with variants A, B, C on the real style tokens, takes four pictures (desktop/phone, light/dark), and stops for your pick. Then it builds the pick; feedback rounds come with before/after pictures. `docs/STYLE.md` is binding; a done checklist ends every UI reply.
- **Security**: short rules in `CLAUDE.md` (size caps, bounded loops, hostile-input tests, guarded outbound fetches, safe links/HTML), `docs/SECURITY.md` as the audit trail, and the gate prints an `advice:` line when a change adds a route, a file read or a fetch (run `security-review`), or reads input with no test named for what it refuses.

## What is in the kit
```
install.mjs               puts it all into a project (see below); --modules ui,security,testing,dev picks parts
payload/                  CORE machinery (copied; overwritten only with --force)
  .claude/skills/         /setup /idea /work /spec /build /ship, and the cheap helpers /check /find /docs
  tools/workflow/         gate, board, file map, harness (OpenCode commands, opencode.jsonc, AGENTS.md), quiet test reporter,
                          spec template, README (the reference)
  scripts/session.mjs     one worktree + port per card; --finish, --push, --list, --check-main, --remove
  tests/workflow/         tests for the gate, map, docrefs and board code
  docs/WORKFLOW.md        how to use it day to day, written for you
  docs/TOKENS.md          why the flow and the docs are shaped to keep sessions cheap
starter/                  CORE files that are YOURS (copied only when missing, then edited)
  CLAUDE.md               the rules every agent reads first (skeleton; /setup fills the <...> from an interview):
                          code structure, reading the code cheaply, never read, security, parallel work
  docs/GUIDE.md + docs/guide/   the user guide as an index plus one file per part
  docs/ARCHITECTURE.md    layers and flow, read by the section
  docs/code/core.md, src/core/CLAUDE.md   the pattern for every big folder: rules in the folder note, "where things are" in docs/code
  tsconfig.json
  workflow.config.json    roots, test commands, layer rules, security folders, session ports, board columns, harness models
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
| `/build <topic>` | After the yes, **in a new chat**: builds in a session folder, the feedback rounds, then `/ship` on "done". `/build a b c` runs up to 3 builders in parallel when their files do not overlap. |
| `/spec`, `/ship` | The steps underneath. |
| `/check`, `/find`, `/docs` | Cheap helpers on a small model: explain a failing gate, answer "where is X" from the map, a small docs edit. Read-only or no commit. |
| `node scripts/session.mjs --push` | Sends finished features to origin, only when you say so. |

## Install into a new project
Needs: Node 22+, git, the GitHub CLI (`gh auth login`, then `gh auth refresh -s project`), Claude Code.

```sh
cd my-new-project            # a git repo with package.json
node ../ai-workflow-kit/install.mjs . --project "My App" --repo myname/my-app
# only some parts:  ... --modules security,testing
npm i -D tsx typescript @types/node      # + @happy-dom/global-registrator with the ui module
```
The installer also writes `.opencode/commands/` and `opencode.jsonc`. Then open Claude Code (or OpenCode) in the
project and type **`/setup`**. It reads the code, asks you about the app, the layers, where outside
data comes in and the board's areas, then writes `CLAUDE.md`, `workflow.config.json`, `docs/GUIDE.md` and `docs/ARCHITECTURE.md`,
runs `npm run board -- --init` (labels, the GitHub project, its columns) and the gate, and stops for your yes before one commit.
After that: `/idea <the first thing to build>`, then `/work <n>`.

**Updating** a project to a newer kit: `git pull` in the kit, then `node ../ai-workflow-kit/install.mjs . --project ... --repo ... --force`.
It replaces the machinery (skills, tools, scripts) and never your starter files; `.workflow-kit` in the project says which version it has.

## Agents and models
- **Claude Code**: the skills as they are. `/idea /check /find /docs` say `model: haiku`; the flow runs on your chosen model.
- **OpenCode**: reads `CLAUDE.md` and `.claude/skills`. `npm run harness` writes one command per skill in `.opencode/commands/`
  (agent and model from `harness.opencode` in `workflow.config.json`; read-only skills get the plan agent), and once an
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

## What changed
- **1.2.0**: from Trailsmith's 12-13 Nov work. OpenCode support (`npm run harness`, a gate step); `/check /find /docs`; a new chat
  per build and per ui stage 2; `/build` reads its rare cases from `build/several.md`; the quiet test reporter (`npm test` prints
  failures and one total); the guide as index + parts, `docs/code/<folder>.md`, folder notes with rules only, a *Never read*
  list; map `--find` without imports; the size rule as a ratchet (baselined files may only shrink, `--allow-growth "<reason>"`,
  `reasons` in the baseline); `session.mjs --partial` and `--clean`; *Code structure* and *Changing existing code* rules;
  `docs/TOKENS.md`; a starter `tsconfig.json`.
- **1.1.0**: board setup from the config, the `/setup` interview, license and version.

## Things learned the hard way (kept in the skills and CLAUDE.md)
- Keep `CLAUDE.md` short (write each rule once; a root file of ~13 KB is plenty); push detail into folder-level `CLAUDE.md` files and docs that are read on demand.
- Generate a file map (`docs/MAP.md`) and search it; never let the AI read a 47 KB index whole.
- Start the build in a new chat after the plan is approved: otherwise the whole planning read rides along on every feedback round.
- A test run that prints one line per test cost 684 KB per passing run; print only failures.
- Free models never run the flow: they have no published limits, and OpenCode retries a rate-limited model instead of switching.
- Squash to one commit per feature; no docs-only or "fix after check" commits.
- Never let two sessions share a working tree. Never `git checkout` another branch in the main folder.
- Waiting specs are git-ignored so they cannot be committed by accident.
- A board that cannot be reached must be one warning line, never a stop.
- Name one real, well-tested input guard in `CLAUDE.md` as the pattern (here: `src/core/guards.ts` and its tests) so Claude copies a good example.
