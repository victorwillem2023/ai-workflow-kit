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
   - **A new project: the stack.** Read `stack.md` in this folder and go through its decisions with the owner, one at a time,
     each with a recommendation (language, screens, backend, data, sign-in, where it runs, tests, and the few decided-once questions).
     Write the answers into `docs/STACK.md`. An existing project: fill `docs/STACK.md` from what the code already uses.
   - **A new project: the architecture.** Propose the folders and what each may import, fitted to the app, and show it before
     writing anything: a pure core (the rules, no files or network), a folder per outside service, the app on top (server,
     command line or screen). Two or three lines per folder. The owner confirms or changes it; it becomes answer 2.
2. **The layers**: show the folders you found and the import rules you'd propose ("`src/core` imports nothing with I/O; `src/web`
   never imports `src/server`"). The owner confirms or corrects.
3. **Untrusted input**: where does outside data come in (requests, uploads, third-party pages, webhooks)? Will the server ever be
   reachable by other people (a tunnel, a deploy)?
4. **The dev loop**: the command the owner runs while working, its port, and whether it restarts by itself.
5. **The board**: the area labels (offer 3 to 6 from the folders and the app's parts), and whether the GitHub project exists already.
6. **Files every feature touches** (the shared files for parallel work), if any beyond `README.md` and the guide.
   - **How work reaches main**: straight to `main` (the default, fine when you work alone and nothing is deployed yet), or pull
     requests (`"flow": "pr"` under `session`: GitHub runs the checks before anything lands; making GitHub enforce it needs a
     public repository or a paid plan).
7. **The quality score**: is there a set of real cases whose pass count should never drop (typed requests and what must come
   out, sample files, recorded inputs)? If yes: the command that runs them and prints "N of M", for `quality` in the config.
8. **Agents and models**: Claude Code only, or OpenCode too (and which paid and free models; the kit's defaults are in
   `workflow.config.json` under `harness`)? Which folders hold private data that must never be read or sent to a model provider?
Only real decisions; never ask what the code already says.

## 3. Write (show a short summary of each before writing it)
- **`workflow.config.json`**: `roots`, `tests`, `commands` (typecheck, testAll, testFiles), `code` and `testPicking` for a language
  other than TypeScript, `functions`, `quality` from answer 7 (`{ "command": "npm run cases", "when": ["src/**"] }`), `boundaries` from answer 2,
  `security.inputFolders` and `security.server` from answer 3, `session.mainPort` from answer 4, `board.labels.areas` from answer 5
  (keep the effort and feasibility lists unless the owner changes them), `harness` from answer 8 (`"opencode": false` for
  Claude Code only; `private`: the data folders), `docs.include` with any other doc folder.
- **`CLAUDE.md`**: replace every `<...>` with the answers, short. *How a request flows*: one line per step with the file that does it.
  *Layout rules*: the same rules as `boundaries`, in words. *Security* (and *Rules for code* in `docs/SECURITY.md`): name the real places outside data comes in, and the guard
  to copy (`src/core/guards.ts` when the security module is installed). *Reading the code cheaply*: the large files and the big docs to read by the section.
  *Never read*: the data folders, generated files, recorded output, lock files. *Shared files*: answer 6. Keep the rest of the file as it is: those are the working rules.
- **A folder `CLAUDE.md`** for each layer with its own rules (`src/core/CLAUDE.md` is the pattern): only rules, as bullets, about
  1-2 KB, because it is loaded with every file read in that folder. Not for a folder with nothing special to say.
- **`docs/code/<folder>.md`** for each big folder (`docs/code/core.md` is the pattern): where each part lives and how it connects,
  read by `grep -n`. A new project: headings only; they fill as code arrives.
- **The guide** (for users): `docs/GUIDE.md` is the index, one line per part; each part is a file in `docs/guide/` with a
  link back to the index (`docs/guide/getting-started.md` is the pattern). A new project: one or two parts. And
  **`docs/ARCHITECTURE.md`** (the layers, the flow of a request, where state lives, and *Rules and where each lives*: the kinds of case this app has and
  the three to six rules every feature must keep, each with its home file; an empty table on a new project). Both short; they grow with each feature.
- When the ui module is installed: in `src/web/CLAUDE.md` fill *New feature here* and *Rules here*, and `docs/code/web.md`; leave `docs/STYLE.md` for the first `/ui` board
  (its tokens come from there), unless the owner already has a brand: then put its colours in `src/web/styles.css` and `docs/STYLE.md`.
- When the ui module is **not** installed (no `src/web/CLAUDE.md`): take the *UI style* section, the board and picture lines and
  the `docs/design` paths out of `CLAUDE.md`, and the `ui` type out of `workflow.config.json`.
- When the map module is installed (`docs/flow/`): the questions and the kinds in `docs/REQUESTS.md` from answer 1, the first
  real parts in `docs/flow/map.js` (an end not built yet is `gap`), then `node docs/flow/build-requests.mjs`.
- When the security module is installed: the first lines of `docs/SECURITY.md` (how to share a link safely, from answer 3).
- **Checks that follow from the stack** (`workflow.config.json`; `tools/workflow/README.md`, *What it checks*): with a database,
  `together` keeps table and migration in one change (`{ "name": "migration", "when": ["<the schema file>"], "needs": ["<the migrations folder>/**"] }`);
  with screens, the `e2e` entry of `stack.md` part 7 in `checks`; `knip.json` when the app starts somewhere else than `src/index.ts`.
- When the deploy module is installed (`docs/DEPLOY.md`): fill it, and `deploy` in the config for the host chosen in `stack.md`
  part 6 (`url`, `command`, `rollback`; `{version}` is the commit); fit the `Dockerfile` to the app and write `.env.example`.
  An app with no server: take out `Dockerfile`, `.dockerignore`, `docs/DEPLOY.md` and the *Deploying* section of `CLAUDE.md`.

## 4. Make it real
```sh
npm run board -- --init        # labels, the project (when board.project is 0) and the columns
npm run board -- --check
npm run protect                # main can no longer be deleted or rewritten: a guard on this computer, and the rule on GitHub
npm run map
npm run harness                 # .opencode/commands from the skills; opencode.jsonc when missing (AGENTS.md only with harness.agentsMd)
node tools/workflow/gate.mjs --update-baseline
npm run gate
```
`npm run protect` says in one line when GitHub refuses (a private repository on the free plan): pass it on, the local guard is enough to go on.
A board step that fails (gh missing or not signed in): say the one line it printed, give `gh auth login` and
`gh auth refresh -s project`, and carry on; the owner runs `--init` later. The gate must pass; a stale doc reference means a doc
names a file that does not exist yet: write it or take the name out, don't baseline it away.

## 5. Stop
Show what was written (files, one line each), what you guessed rather than were told, and ask for a yes. On yes, one commit:
"Workflow: set up the AI workflow (CLAUDE.md, config, board, agent commands, guide and architecture docs)". Then say the next step:
`/idea <the first thing to build>`, then `/work <n>`.
