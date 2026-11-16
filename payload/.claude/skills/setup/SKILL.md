---
name: setup
description: Set up {{PROJECT}} for the AI workflow right after the kit is installed: interviews the owner, then fills CLAUDE.md, workflow/config.json, the guide, docs/ARCHITECTURE.md and the folder notes from the answers and the code, writes the OpenCode commands, makes the board, and runs the gate. Run once, from the main folder.
model: opus
---

# /setup

Turns the installed skeleton into this project's rules. Writes docs and config only, never app code. Ends with one commit,
on the owner's yes. Run again later only to fill gaps (it never overwrites a section the owner wrote).

## 1. Look before asking
Read, briefly: `package.json` (scripts, dependencies), `tsconfig.json` or the equivalent, the folder tree two levels deep under
the source root (`ls`, not every file), `README.md` if there is one, `git log --oneline | head -20`. Find what you can answer
yourself: the stack, the dev, build, test and typecheck commands, the folders that look like layers.
A new, empty project: skip to the questions and say the answers will become the plan for the first folders.
**A project that already has code**: follow `workflow/guides/TAKEOVER.md` from *1. Accept today as the starting line*: the folder
notes describe the code as it is ("today: ...; aim: ..."), the baseline is its own commit before any change, and the first
cards are tests around the riskiest untested code, never a big clean-up. Say that path to the owner in three lines.
**A team** (`project.audience: team`, question 0): ask the roles of `workflow/guides/TEAM.md` (who decides, who reviews) and write
them in `CLAUDE.md`, *This project's own rules*; propose `"flow": "pr"` with a required review.

## 2. Ask the owner (AskUserQuestion, each with your best guess as the recommended option; an existing project: at most two rounds)
0. **Who it is for**: just you (a personal, learning or hobby project), your team or company, or customers (people outside,
   who may pay). Write it as `project.audience` (`me`, `team`, `customers`) in `workflow/config.json`. It decides how much of the
   kit speaks up: for `me`, nothing about access reviews, restore drills, launch, market, privacy texts or "does this already
   exist?" unless the owner asks; they stay in the kit, one command away. It can change any day (a hobby that gets users).
1. **What the app does**, in one or two sentences, and for whom.
   - **A new project: is it worth building?** (For `project.audience: me`, only the smallest useful version and the sign it
     works for you: a project you want is worth building.) First the questions of `/shape` (`.claude/skills/shape/SKILL.md`): the problem,
     what people do today, the first ten users, the smallest useful version, how we will know it worked, when to stop. The
     answers become `docs/PRODUCT.md`; the smallest version becomes the first cards, each with its `Depends on: #n` line, labelled `first version` (`npm run board -- --next`
     ranks them first). Say plainly if the answers point to a spike before any stack (`/spike`). An existing project: fill
     `docs/PRODUCT.md` from what the owner says in one round, and skip what they do not know yet.
   - **A new project: the product first, then what to build it with.** Read `stack.md` in this folder. Ask its product
     questions in batches of four, in the owner's words, skipping what an earlier answer already settled. Then show one page,
     *What I would build*: every part chosen (language, what runs it, screens, backend, data, sign-in, where it runs, tests),
     each with one sentence on why it follows from the answers and what would make it change. Never ask the owner to pick a
     technology they cannot judge: choose it and say why. The owner changes a line or says yes; only then write `docs/STACK.md`.
     An existing project: fill `docs/STACK.md` from what the code already uses.
   - **A new project: the architecture.** Propose the folders and what each may import, fitted to the app, and show it before
     writing anything: a pure core (the rules, no files or network), a folder per outside service, the app on top (server,
     command line or screen). Two or three lines per folder. The owner confirms or changes it; it becomes answer 2.
2. **The layers**: show the folders you found and the import rules you'd propose ("`src/core` imports nothing with I/O; `src/web`
   never imports `src/server`"). The owner confirms or corrects.
3. **Untrusted input**: where does outside data come in (requests, uploads, third-party pages, webhooks)? Will the server ever be
   reachable by other people (a tunnel, a deploy)?
   - **Sensitive work**: which parts handle money, health or safety advice, legal texts, personal data or access (propose the
     folders from the code or the plan; `workflow/guides/SENSITIVE.md`, *What counts*)? Those become `sensitive.paths`: every change there
     needs the owner's own sign-off. Who checks the sources (the owner, an accountant, a lawyer, an expert)?
   - **Accounts and stored data**: do people sign in, and who may see whose things (the roles, in the owner's words;
     `workflow/guides/PERMISSIONS.md`)? What does the app store, and where (`workflow/guides/DATA.md`)? Neither yet: skip.
4. **The dev loop**: the command the owner runs while working, its port, and whether it restarts by itself.
5. **The board**: the area labels (offer 3 to 6 from the folders and the app's parts), and whether the GitHub project exists already.
6. **Files every feature touches** (the shared files for parallel work), if any beyond `README.md` and the guide.
   - **How work reaches main**: straight to `main` (the default, fine when you work alone and nothing is deployed yet), or pull
     requests (`"flow": "pr"` under `session`: GitHub runs the checks before anything lands; making GitHub enforce it needs a
     public repository or a paid plan).
7. **The quality score**: is there a set of real cases whose pass count should never drop (typed requests and what must come
   out, sample files, recorded inputs)? If yes: the command that runs them and prints "N of M", for `quality` in the config.
8. **Agents and models**: Claude Code only, or OpenCode too (and which paid and free models; the kit's defaults are in
   `workflow/config.json` under `harness`)? Which folders hold private data that must never be read or sent to a model provider?
Only real decisions; never ask what the code already says.

## 3. Write (show a short summary of each before writing it)
- **`workflow/config.json`**: `roots`, `tests`, `commands` (typecheck, testAll, testFiles), `code` and `testPicking` for a language
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
  read by `grep -n`. A new project: headings only; they fill as code arrives. Its first line under the title says what it
  covers (`<!-- covers new files: src/<folder>/** -->`), so the gate asks for it when a part comes or goes; give each guide part
  and other hand-written doc the covers line of the files it describes. Facts the config already holds go in a generated block
  (`<!-- generated: layers -->`, `versions`, `settings`, `sensitive`, `naming`; `workflow/tools/README.md`, *What it checks*), never typed.
- **The guide** (for users): `docs/GUIDE.md` is the index, one line per part; each part is a file in `docs/guide/` with a
  link back to the index (`docs/guide/getting-started.md` is the pattern). A new project: one or two parts. And
  **`docs/ARCHITECTURE.md`** (the layers, the flow of a request, where state lives, and *Rules and where each lives*: the kinds of case this app has and
  the three to six rules every feature must keep, each with its home file; an empty table on a new project). Both short; they grow with each feature.
- **`docs/SETUP.md`**: fit its marked steps to the app (the install, the settings, the start command and its ready address,
  `session.mainPort`), then `npm run setup-check` must pass. **`docs/CONVENTIONS.md`**: the names the owner's team already uses,
  and `naming` in the config to match (the kit's defaults follow the language): the app's short code and the environment and
  place codes in *Names of things in the system* and `naming.resources`, the files whose lists stay alphabetical in `naming.sorted`.
- **Security**: `npm run secops -- --enable` (Dependabot alerts and security updates); the weekly report starts with the first push.
- **Then read `.claude/skills/setup/when.md`, section by section**: *Versions*, *Tools*, *Sensitive and access* and *The deploy*
  for every project; the others only for a part this project has: the ui module (installed or not), the map module, a framework
  starter, the security module, checks from the stack (a database, screens, personal data), the production module.

## 4. Make it real
```sh
npm run board -- --init        # labels, the project (when board.project is 0) and the columns
npm run board -- --check
npm run protect                # main can no longer be deleted or rewritten: a guard on this computer, and the rule on GitHub
npx biome check --write src tests   # TypeScript, once: a framework starter's files into the kit's format; fix what it cannot
npm run map
npm run harness                 # .opencode/commands from the skills; opencode.jsonc when missing (AGENTS.md only with harness.agentsMd)
node workflow/tools/gate.mjs --update-baseline
npm run gate
```
`npm run protect` says in one line when GitHub refuses (a private repository on the free plan): pass it on, the local guard is enough to go on.
A board step that fails (gh missing or not signed in): say the one line it printed, give `gh auth login` and
`gh auth refresh -s project`, and carry on; the owner runs `--init` later. The gate must pass; a stale doc reference means a doc
names a file that does not exist yet: write it or take the name out, don't baseline it away.

## 5. Stop
Show what was written (files, one line each), what you guessed rather than were told, and ask for a yes. On yes, one commit:
"Workflow: set up the AI workflow (CLAUDE.md, config, board, agent commands, guide and architecture docs)". Then say the next step:
"From here, type `/next` whenever you are not sure: it tells you which command." (The first time it will offer `/idea` for the
first thing to build, then `/work <n>`.)

**This project's own**: when `.claude/project/setup.md` exists, read it before you start: it holds this project's own steps and rules for /setup, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
