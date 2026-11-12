# Workflow gate

Scripts that check a change so an AI session doesn't have to. No packages; plain Node ESM.
Project settings are in `workflow.config.json` at the repo root, the rest is generic.
How to use the whole flow day to day (`/idea`, `/work`, `/ui`): `docs/WORKFLOW.md`. This file is the reference, read by the
section (`grep -n '^## '` lists them), never whole. The flow runs in Claude Code and in OpenCode (see *Agents and models*).

| Command | What it does |
|---|---|
| `npm run gate` | layer rules, file size, doc references, typecheck, then only the tests the change can reach |
| `npm run gate:all` | the same with the whole suite: run it before `--finish` |
| `npm run map` | rewrite `docs/MAP.md`, the file map: one line per source file (opening comment + imports); `--check` fails if it is out of date; `-- --find <words>` prints only the map lines whose description has every word, under their folder; `-- --uses <file>` (e.g. `config/vibes`) prints the lines that import that file; both print at most 25 lines |
| `node tools/workflow/gate.mjs --list` | only print the tests the change reaches |
| `node tools/workflow/gate.mjs --update-baseline` | accept today's exceptions; sizes may only drop (see *size*) |
| `npm run board -- --show <n>` | the backlog board: read, add and move cards (see *Board*) |

Quiet on success (one line per check); after the checks it prints one `advice:` line per changed `src/` file whose added lines open a server route, read a file or make an outbound fetch ("run the security-review skill before --finish"). It also prints `advice: <file> reads input but no new test says what it refuses` when added code in the `security.inputFolders` of the config (default `src/core`, `src/server`) reads input (JSON.parse, a file read, a fetch, a request body) and the change adds no test named with "refuses", "rejects", "caps", "too large" or "hostile" (names only; `tools/workflow/lib/hostilecheck.mjs`). Advice never fails the gate; `node tools/workflow/gate.mjs --advice` prints only those lines. On a failure it prints the last lines that explain it.

## What it checks
- **layers**: `boundaries` in the config says which folders may not import which (`src/core` is pure, no
  `node:` modules). A violation already in `baseline.json` is accepted, a new one fails.
- **size**: a new file over `size.maxLines` fails. A big file in the baseline may stay but must not grow: growth fails with
  `<file> grew <was> -> <now>: put the new code in its own file`. `--update-baseline` only lowers or removes numbers; a raised
  or new one is refused (files named, exit 1) unless `--allow-growth "<reason>"` is given (for a pure refactor such as an import
  rewrite), and the reason is printed. Splitting a file and re-running `--update-baseline` shrinks the list. An optional `reasons`
  map in `baseline.json` (`"<file>": "<why it stays>"`) is kept for files still in the list and dropped for the rest; a reason
  for a file not in the list fails as a stale reason.
- **map**: `docs/MAP.md` must be what `npm run map` writes now; a stale map fails the gate.
- **docs**: a backticked repo path (`src/…`, `config/…`, `tests/…`, `scripts/…`, `tools/…`, `docs/…`) or an `npm run <name>` in the docs listed under `docs` in the config that no longer exists fails, with the doc, line and thing. Globs, `<placeholders>` and bare names (`service.ts`) are skipped. Known stale ones are in `baseline.json`; fixing one and re-running `--update-baseline` shortens the list.
- **typecheck**: the config's `commands.typecheck`.
- **tests**: the import graph (read from the source text) gives every test that reaches a changed file,
  also through `tests/fakes.ts`. A test that reads a non-code file by name (`styles.css`) is picked too.
  A changed file the gate doesn't understand (`package.json`, an unknown data file) runs the whole suite.
  Docs and the paths in `ignoreChanged` are skipped.

Changes to a file many things import (a shared types file, say) still run most tests: that is the measure of how coupled it is.

## Spec and ship (the flow around the gate)
`/work <card number>` plans one card and stops for a yes; the build then starts in a new chat with `/build <topic>`, so the
planning chat isn't sent again on every round (see *Board*). `/spec <card number>` (or `/spec <topic>`) reads that one card from the board, writes `specs/<topic>.md` from `templates/spec.md`
and waits for approval; approval moves the card to Ready. A new chat builds it in a
session folder (tests first), updates the spec's `## Status`, and `/ship <topic>` runs `gate:all`, checks the docs the spec
lists, runs `security-review` if flagged, makes the one commit, deletes the spec and runs `session.mjs --finish`.
`/build <topic>` sits between them: from a fresh chat in the main folder it makes (or reuses) the session folder, copies the
approved spec into it and starts a subagent that builds it there, so nobody changes folder; feedback goes to the same subagent.
**Several at once**: `/work 12 14 15` writes the specs one after another in one chat (each approved on its own); `/build a b c` starts one builder per independent spec, at most 3, in one message so they run together, each in its own folder, branch and port. Two specs whose "Files that change" name the same file overlap: the later waits until the first is shipped (the shared files listed in CLAUDE.md never count). One summary lists folder, URL and unsure items per topic; feedback goes to that topic's builder; `/ship` stays one topic at a time. `ui` cards join only after their variant is picked.
**One spec, several builders**: a big job that splits cleanly (a refactor over several large files) lists "Work packages" in its spec: files each owns, `after:` order. `/build <topic>` runs them in waves of at most 3 builders in the same session folder; a file belongs to one package, packages under about 300 changed lines are merged, builders run only their own tests, and the lead edits the shared files and runs `npm run gate` once after the last wave. The spec decides the split, `/build` only checks and runs it.
`specs/` is in `.gitignore`: waiting specs are local and can't be committed by accident. A new session's folder links `node_modules` and copies `.env` with its own `PORT` plus the lines of `session.env` in the config (`{main}` in a value is the main folder: share a big data folder instead of copying it; switch off background jobs that only the main server should run). `--finish` squashes the branch, rebases it on the local `main` (a conflict only in the file map is solved by making the map again, any other stops it with nothing changed; the map is re-made after every rebase into the same commit), checks (`--no-checks` skips typecheck and tests: only for a change that has no code), moves the local `main` forward and moves the session's card to Waiting for your check (with `--partial "<what is left>"`, from the spec's "Card stays open after this spec" line, the card stays in In progress and the comment says what is left): it does **not** push. Finished features stay on this PC until `node scripts/session.mjs --push` sends them to `origin/main` in one go (if someone pushed meanwhile they are replayed on top and checked again; a conflict stops it with nothing changed). `session.mjs <topic> --card <n>` (so `/build`, which passes the spec's card) moves card n to In progress; `--list` shows each session's card, which sessions are finished (merged) or hold uncommitted work, and how many finished features are not pushed; `--clean` lists the finished sessions and `--clean --yes` removes them through `--remove`'s own checks (folders git does not know are only named). The board never blocks a start or a finish: if it cannot be reached it prints one warning line. `/ship` starts with `node scripts/session.mjs --check-main` (fast-forwards a `main` that is only behind; stops on uncommitted files, or on unpushed features when origin has moved too). After `/ship` the spec is deleted in both the session folder and the main folder.
The skills are in `.claude/skills/` (OpenCode's commands in `.opencode/commands/`); copy them with the rest when reusing the workflow.

## Board
The backlog (ideas, known bugs, what waits for the owner's check) is a GitHub Projects board over the repo's issues,
one card per item. `tools/workflow/lib/board.mjs` is the only code that talks to it: it runs `gh` with an argument list,
never through a shell, and takes the runner as an argument (`tests/workflow/board.test.ts` fakes it).

| Command | What it does |
|---|---|
| `npm run board -- --init` | makes what the config describes and GitHub lacks: the labels (types, areas, effort, feasibility), the project itself when `board.project` is `0` (titled after the config's `name`, linked to the repo, its number written into the config) and the columns. Safe to run again: it only adds. Column colours come out grey; recolour them on GitHub if you like |
| `npm run board -- --labels` | the labels the config allows, grouped: what `/idea` may use |
| `npm run board -- --check` | says which columns from the config the project lacks, lists the open cards with no type label, and the labels the config names that the repo does not have (for example after a rename on GitHub) |
| `npm run board -- --add "<title>" --label <type> [--label <name>]... [--body-file <file>] [--column "<column>"]` | a new card, in the first column (Backlog) unless told; refused without exactly one type label |
| `npm run board -- --move <n> "<column>"` | moves card #n; an unknown column is refused with the list of columns |
| `npm run board -- --block <n> "<reason>"` | moves card #n to *Blocked* and adds "Blocked: <reason>" as a comment; refused without a reason |
| `npm run board -- --show <n>` | card #n: title, column, labels and text |
| `npm run board -- --search "<words>"` | up to 20 cards, open or closed, whose title or text has the words: number, title, column, state |

**`/idea <a sentence>`** (`.claude/skills/idea/SKILL.md`, runs on a cheap/free model) adds a card to Backlog: it searches for the same
idea first (`--search`) and asks "Same as this one?", picks one type label and an existing area, effort and feasibility label,
writes a short body like card #1's, and answers `#<n> made in Backlog: <url>`.

**`/docs`, `/check`, `/find`** (`.claude/skills/docs`, `check`, `find`) are the other cheap helpers, on the same small model:
a small edit to the hand-written docs with no commit, the gate run and explained without changing anything, and a code question
answered from `npm run map -- --find` with paths and lines.

**Columns**: Backlog, Needs a board or decision, Ready, In progress, Waiting for your check, Blocked, Done. "Set this on
blocked, waiting for X" is `--block`; the comment keeps the reason on the card.

**Type labels**: every card has exactly one of `ui`, `feature`, `bug`, `workflow`; an area label (`area: Backend`) comes
second. The type picks the route through the work: *ui* = the mockup board first, then the build, changes kept to
`src/web`; *feature* = a plan with named tests first; *bug* = a failing test first, a plan only if large; *workflow* =
like a feature, nothing in the app changes.

**`/work <n>`** (`.claude/skills/work/SKILL.md`) is the one entry in plain words: it reads the card, takes the route its
type label says, plans and stops for a yes, builds in a session folder (`/build`), moves the card to *Waiting for your
check* and stops while the owner tries it, and runs `/ship` only when the owner says done. A blocked step uses `--block`.

**`/ui <n>`** (`.claude/skills/ui/SKILL.md`) is the route for a `ui` card (`/work` sends it there; it refuses a card without
the label and asks which type it is). Stage 1, design, writes no app code: one HTML board in `docs/design/` on the real
`styles.css` tokens with variants A, B and C, four pictures from `scripts/shots.mjs` (desktop and phone, light and dark), the
README row and a notes file in `docs/design/notes/`, then it stops for the owner's pick ("B, with A's header"). After the pick it writes a short spec and stops; `/ui <n>` in a new chat
finds that spec and is stage 2, which builds the pick in the session folder (no `/build` subagent) from the spec and the pictures: a short spec, before and after pictures from the same command,
feedback as one numbered list per round, one pass per round, only `src/web` changed, and `/ship` when the owner says done. A small
tweak to a part that exists skips the board: a live draft, one pass. A UI session reads the core of `docs/STYLE.md` and one board's
notes file, not every board's history.

The `board` block in `workflow.config.json`: `owner` (the project's owner), `repo` (`owner/name`, where the issues
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
- **OpenCode** reads `CLAUDE.md` (no `AGENTS.md` needed) and the same skills. `.opencode/commands/<name>.md` is one short file per
  skill naming the skill, the agent (plan or build) and the model; `node tools/workflow/harness.mjs` writes them from the skills and
  `workflow.config.json` (`harness.opencode`), and `--check` (part of the gate) fails when one is missing or out of date.
  `opencode.jsonc` sets the models and mirrors `.claude/settings.local.json`'s permissions (the shell asks, the workflow's own
  commands don't; `.env` and the data folders can't be read, so they are never sent to a model provider).
- **Model rule**: the flow (`/work /spec /build /ship /ui`, Plan, Build, subagents) runs on a paid model. Free models only for
  jobs you start yourself and can rerun (`/idea /docs /check /find`, session titles): they are promotions with no published
  limits, and OpenCode retries a rate-limited model instead of switching, which would stall a build.
- **New chat per build**: planning stops at the yes; `/build <topic>` (and `/ui <n>` stage 2) starts in a fresh chat from the
  spec, so the planning context is not sent again on every feedback round.

## Commits and sessions (the details behind CLAUDE.md)
**Commits.** One feature, one session, one commit; the owner says when it is done. Don't commit while the owner is trying it;
after feedback change the files (`--amend` only while unpushed). Write the message once: `--finish` keeps the first commit's,
`--keep-commits` only for a big rework (say so in the message). `--finish` puts it on the local `main`;
`node scripts/session.mjs --push`, only when the owner says, sends it to origin. Collect fixes into one commit ("Fixes from
checking X") or fold them into the next feature there. Two sessions in one area: finish the first first.

**A squash the owner asks for** (the only time `main` is rewritten): in a scratch worktree, push a backup tag first, check every
rebuilt commit, make sure the last tree is identical to the old one, then `git push --force-with-lease` against the commit it
was built from. Never `git push --force`, never merge by hand in the main folder.

**Sessions.** A branch is one change, finished as soon as the owner says done. `node scripts/session.mjs --list` shows
sessions, ports, cards and how many finished features are not pushed; `--clean` takes the finished ones away.

## Pictures from the command line
`node scripts/shots.mjs <url or file> --width 1400 --theme dark --out docs/design/png/49-DayTimes.png` takes a picture of a board file or of the
live app (`http://127.0.0.1:<main port>`) with an installed Chrome or Edge, headless, through its DevTools protocol (no install step). Options:
`--height`, `--full` (the whole page), `--click <selector>` and `--press <key>` (repeatable, done before the picture), `--wait <ms>`.
Set `CHROME_PATH` if the browser is not in its usual place. It gives up after 30 s and always closes Chrome.

## Using it in another project
Run the kit's `install.mjs` (see the kit's README.md): it copies this folder and the skills, fills the config and package scripts,
and leaves you the files to edit. By hand: copy `tools/workflow/`, `scripts/session.mjs`, `scripts/shots.mjs`, `.claude/skills/` and
`workflow.config.json`, edit the config (roots, test glob, commands, boundaries, security folders, session, board), run
`--update-baseline` once, add the npm scripts (`gate`, `gate:all`, `map`, `board`).

The `security` block: `code` (the source folder the advice looks at), `server` (where a new route counts as a trigger) and
`inputFolders` (where reading input without a "refuses/rejects/caps/too large/hostile" test earns an advice line).
The `session` block: `prefix` (session folders are `../<prefix>-<topic>`), `firstPort`, `mainPort`, `env` (extra `.env` lines).
