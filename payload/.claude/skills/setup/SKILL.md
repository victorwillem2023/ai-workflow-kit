---
name: setup
description: Set up {{PROJECT}} for the AI workflow right after the kit is installed: interviews the owner, then fills CLAUDE.md, workflow.config.json, the guide, docs/ARCHITECTURE.md and the folder notes from the answers and the code, writes the OpenCode commands, makes the board, and runs the gate. Run once, from the main folder.
---

# /setup

Turns the installed skeleton into this project's rules. Writes docs and config only, never app code. Ends with one commit,
on the owner's yes. Run again later only to fill gaps (it never overwrites a section the owner wrote).

## 1. Look before asking
Read, briefly: `package.json` (scripts, dependencies), `tsconfig.json` or the equivalent, the folder tree two levels deep under
the source root (`ls`, not every file), `README.md` if there is one, `git log --oneline | head -20`. Find what you can answer
yourself: the stack, the dev, build, test and typecheck commands, the folders that look like layers.
A new, empty project: skip to the questions and say the answers will become the plan for the first folders.

## 2. Ask the owner (AskUserQuestion, at most two rounds, each with your best guess as the recommended option)
1. **What the app does**, in one or two sentences, and for whom.
2. **The layers**: show the folders you found and the import rules you'd propose ("`src/core` imports nothing with I/O; `src/web`
   never imports `src/server`"). The owner confirms or corrects.
3. **Untrusted input**: where does outside data come in (requests, uploads, third-party pages, webhooks)? Will the server ever be
   reachable by other people (a tunnel, a deploy)?
4. **The dev loop**: the command the owner runs while working, its port, and whether it restarts by itself.
5. **The board**: the area labels (offer 3 to 6 from the folders and the app's parts), and whether the GitHub project exists already.
6. **Files every feature touches** (the shared files for parallel work), if any beyond `README.md` and the guide.
7. **Agents and models**: Claude Code only, or OpenCode too (and which paid and free models; the kit's defaults are in
   `workflow.config.json` under `harness`)? Which folders hold private data that must never be read or sent to a model provider?
Only real decisions; never ask what the code already says.

## 3. Write (show a short summary of each before writing it)
- **`workflow.config.json`**: `roots`, `tests`, `commands` (typecheck, testAll, testFiles), `boundaries` from answer 2,
  `security.inputFolders` and `security.server` from answer 3, `session.mainPort` from answer 4, `board.labels.areas` from answer 5
  (keep the effort and feasibility lists unless the owner changes them), `harness` from answer 7 (`"opencode": false` for
  Claude Code only; `private`: the data folders), `docs.include` with any other doc folder.
- **`CLAUDE.md`**: replace every `<...>` with the answers, short. *How a request flows*: one line per step with the file that does it.
  *Layout rules*: the same rules as `boundaries`, in words. *Security*: name the real places outside data comes in, and the guard
  to copy (`src/core/guards.ts` when the security module is installed). *Reading the code cheaply*: the large files and the big docs to read by the section.
  *Never read*: the data folders, generated files, recorded output, lock files. *Shared files*: answer 6. Keep the rest of the file as it is: those are the working rules.
- **A folder `CLAUDE.md`** for each layer with its own rules (`src/core/CLAUDE.md` is the pattern): only rules, as bullets, about
  1-2 KB, because it is loaded with every file read in that folder. Not for a folder with nothing special to say.
- **`docs/code/<folder>.md`** for each big folder (`docs/code/core.md` is the pattern): where each part lives and how it connects,
  read by `grep -n`. A new project: headings only; they fill as code arrives.
- **The guide** (for users): `docs/GUIDE.md` is the index, one line per part; each part is a file in `docs/guide/` with a
  link back to the index (`docs/guide/getting-started.md` is the pattern). A new project: one or two parts. And
  **`docs/ARCHITECTURE.md`** (the layers, the flow of a request, where state lives). Both short; they grow with each feature.
- When the ui module is installed: in `src/web/CLAUDE.md` fill *New feature here* and *Rules here*, and `docs/code/web.md`; leave `docs/STYLE.md` for the first `/ui` board
  (its tokens come from there), unless the owner already has a brand: then put its colours in `src/web/styles.css` and `docs/STYLE.md`.
- When the ui module is **not** installed (no `src/web/CLAUDE.md`): take the *UI style* section, the board and picture lines and
  the `docs/design` paths out of `CLAUDE.md`, and the `ui` type out of `workflow.config.json`.
- When the security module is installed: the first lines of `docs/SECURITY.md` (how to share a link safely, from answer 3).

## 4. Make it real
```sh
npm run board -- --init        # labels, the project (when board.project is 0) and the columns
npm run board -- --check
npm run map
npm run harness                 # .opencode/commands from the skills; opencode.jsonc and AGENTS.md when missing
node tools/workflow/gate.mjs --update-baseline
npm run gate
```
A board step that fails (gh missing or not signed in): say the one line it printed, give `gh auth login` and
`gh auth refresh -s project`, and carry on; the owner runs `--init` later. The gate must pass; a stale doc reference means a doc
names a file that does not exist yet: write it or take the name out, don't baseline it away.

## 5. Stop
Show what was written (files, one line each), what you guessed rather than were told, and ask for a yes. On yes, one commit:
"Workflow: set up the AI workflow (CLAUDE.md, config, board, agent commands, guide and architecture docs)". Then say the next step:
`/idea <the first thing to build>`, then `/work <n>`.
