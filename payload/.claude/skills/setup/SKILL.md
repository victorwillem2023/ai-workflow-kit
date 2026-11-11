---
name: setup
description: Set up {{PROJECT}} for the AI workflow right after the kit is installed: interviews the owner, then fills CLAUDE.md, workflow.config.json, docs/GUIDE.md and docs/ARCHITECTURE.md from the answers and the code, makes the board, and runs the gate. Run once, from the main folder.
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
6. **Files every feature touches** (the shared files for parallel work), if any beyond `README.md` and `docs/GUIDE.md`.
Only real decisions; never ask what the code already says.

## 3. Write (show a short summary of each before writing it)
- **`workflow.config.json`**: `roots`, `tests`, `commands` (typecheck, testAll, testFiles), `boundaries` from answer 2,
  `security.inputFolders` and `security.server` from answer 3, `session.mainPort` from answer 4, `board.labels.areas` from answer 5
  (keep the effort and feasibility lists unless the owner changes them).
- **`CLAUDE.md`**: replace every `<...>` with the answers, short. *How a request flows*: one line per step with the file that does it.
  *Layout rules*: the same rules as `boundaries`, in words. *Security*: name the real places outside data comes in, and the guard
  to copy (`src/core/guards.ts` when the security module is installed). *Reading the code cheaply*: the large files, the folders never
  to read. *Shared files*: answer 6. Keep the rest of the file as it is: those are the working rules.
- **A folder `CLAUDE.md`** for each layer with its own rules (five to ten lines: what lives here, what it may import, what to read
  first, its test rule). Not for a folder with nothing special to say.
- **`docs/GUIDE.md`** (for users: what the app does, how to use it; a stub of headings for a new project) and
  **`docs/ARCHITECTURE.md`** (the layers, the flow of a request, where state lives). Both short; they grow with each feature.
- When the ui module is installed: in `src/web/CLAUDE.md` fill *UI structure*; leave `docs/STYLE.md` for the first `/ui` board
  (its tokens come from there), unless the owner already has a brand: then put its colours in `src/web/styles.css` and `docs/STYLE.md`.
- When the security module is installed: the first lines of `docs/SECURITY.md` (how to share a link safely, from answer 3).

## 4. Make it real
```sh
npm run board -- --init        # labels, the project (when board.project is 0) and the columns
npm run board -- --check
npm run map
node tools/workflow/gate.mjs --update-baseline
npm run gate
```
A board step that fails (gh missing or not signed in): say the one line it printed, give `gh auth login` and
`gh auth refresh -s project`, and carry on; the owner runs `--init` later. The gate must pass; a stale doc reference means a doc
names a file that does not exist yet: write it or take the name out, don't baseline it away.

## 5. Stop
Show what was written (files, one line each), what you guessed rather than were told, and ask for a yes. On yes, one commit:
"Workflow: set up the AI workflow (CLAUDE.md, config, board, guide and architecture docs)". Then say the next step:
`/idea <the first thing to build>`, then `/work <n>`.
