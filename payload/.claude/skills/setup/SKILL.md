---
name: setup
description: Set up {{PROJECT}} for the AI workflow right after the kit is installed: interviews the owner, then fills CLAUDE.md, workflow.config.json, the guide, docs/ARCHITECTURE.md and the folder notes from the answers and the code, writes the OpenCode commands, makes the board, and runs the gate. Run once, from the main folder.
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

## 2. Ask the owner (AskUserQuestion, each with your best guess as the recommended option; an existing project: at most two rounds)
0. **Who it is for**: just you (a personal, learning or hobby project), your team or company, or customers (people outside,
   who may pay). Write it as `project.audience` (`me`, `team`, `customers`) in `workflow.config.json`. It decides how much of the
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
     folders from the code or the plan; `docs/workflow/SENSITIVE.md`, *What counts*)? Those become `sensitive.paths`: every change there
     needs the owner's own sign-off. Who checks the sources (the owner, an accountant, a lawyer, an expert)?
   - **Accounts and stored data**: do people sign in, and who may see whose things (the roles, in the owner's words;
     `docs/workflow/PERMISSIONS.md`)? What does the app store, and where (`docs/workflow/DATA.md`)? Neither yet: skip.
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
  read by `grep -n`. A new project: headings only; they fill as code arrives. Its first line under the title says what it
  covers (`<!-- covers new files: src/<folder>/** -->`), so the gate asks for it when a part comes or goes; give each guide part
  and other hand-written doc the covers line of the files it describes. Facts the config already holds go in a generated block
  (`<!-- generated: layers -->`, `versions`, `settings`, `sensitive`, `naming`; `tools/workflow/README.md`, *What it checks*), never typed.
- **The guide** (for users): `docs/GUIDE.md` is the index, one line per part; each part is a file in `docs/guide/` with a
  link back to the index (`docs/guide/getting-started.md` is the pattern). A new project: one or two parts. And
  **`docs/ARCHITECTURE.md`** (the layers, the flow of a request, where state lives, and *Rules and where each lives*: the kinds of case this app has and
  the three to six rules every feature must keep, each with its home file; an empty table on a new project). Both short; they grow with each feature.
- When the ui module is installed: in `src/web/CLAUDE.md` fill *New feature here* and *Rules here*, and `docs/code/web.md`; leave `docs/STYLE.md` for the first `/ui` board
  (its tokens come from there), unless the owner already has a brand: then put its colours in the tokens file (`ui.tokens`, `src/web/styles.css` by default; set it where the project keeps them) and `docs/STYLE.md`.
- When the ui module is **not** installed (no `src/web/CLAUDE.md`): take the *UI style* section, the board and picture lines and
  the `docs/design` paths out of `CLAUDE.md`, and the `ui` type out of `workflow.config.json`.
- When the map module is installed (`docs/flow/`): the questions and the kinds in `docs/REQUESTS.md` from answer 1, the first
  real parts in `docs/flow/map.js` (an end not built yet is `gap`), then `node docs/flow/build-requests.mjs`.
- **After a framework starter** (Vite, Next.js, SvelteKit): `package.json` needs the scripts `dev.cmd` and `start.cmd` call
  (`dev`, `build`, `start`; with Vite `start` is `vite preview`). The installer wrote `tsconfig.gate.json` for `npm run typecheck`
  when the starter's own `tsconfig.json` checks nothing by itself: keep its `include` on every folder with code. Keep one
  linter: with Biome, take the starter's ESLint config and packages out. With a UI framework, `ui.boards` in the config is
  `components`: `/ui` draws its variants as real components (the installer sets it when it finds the framework).
- When the security module is installed: the first lines of `docs/SECURITY.md` (how to share a link safely, from answer 3).
- **Checks that follow from the stack** (`workflow.config.json`; `tools/workflow/README.md`, *What it checks*): with a database,
  `together` keeps table and migration in one change (`{ "name": "migration", "when": ["<the schema file>"], "needs": ["<the migrations folder>/**"] }`);
  with screens, the `e2e` entry of `stack.md` part 7 in `checks` (required: a smoke test and an accessibility scan per main
  screen) and `performance.files` pointing at the built files (the `page weight` check); `knip.json` when the app starts somewhere else than `src/index.ts`.
  With personal data (answer 4 of the product questions), `together` also keeps the tables and `docs/company/PRIVACY.md` in one change
  (`{ "name": "privacy", "when": ["<the schema file>"], "needs": ["docs/company/PRIVACY.md"] }`).
- **`docs/SETUP.md`**: fit its marked steps to the app (the install, the settings, the start command and its ready address,
  `session.mainPort`), then `npm run setup-check` must pass. **`docs/CONVENTIONS.md`**: the names the owner's team already uses,
  and `naming` in the config to match (the kit's defaults follow the language): the app's short code and the environment and
  place codes in *Names of things in the system* and `naming.resources`, the files whose lists stay alphabetical in `naming.sorted`.
- **Sensitive and access**: `sensitive.paths` from answer 3 (the gate's *signoff* check; an empty list until there is such code);
  with accounts, `security.signIn: true`, the sign-in and permission code under `sensitive.paths`, and the roles table of
  `docs/workflow/PERMISSIONS.md` (who may what, and what never) in *Rules for code* of the security page, each rule with its
  row in *Rules and where each lives*. With stored data: the folder that owns the queries, a `boundaries` rule so only it uses
  the database library (`{ "name": "only the data folder talks to the database", "from": "src/**", "except": ["src/<data folder>/**"],
  "forbidUse": ["<the database library>"] }`), and `data.migrations` set to where this stack's migrations are;
  in `docs/company/ACCESS.md` a row for the owner and every account the app already depends on (GitHub, the cloud, the domain, the sign-in
  provider), then `npm run access` must list nothing unexpected. **`docs/run/ENVIRONMENTS.md`**: the *This project* row for `dev`;
  the rest waits for `/launch`. `security.domains`: the app's public addresses once it has any (their certificates are watched).
  `security.egress`: every outside host the code calls today (the gate's *network* check), and `docs/run/NETWORK.md` from answer 3.
  AI inside the app (stack.md 6b): `ai.wrapper`, the one file that calls the model, and its first hostile cases in `quality`.
- **Tools**: for each tool the project uses that `docs/workflow/TOOLS.md` lists under *Leaving*, one line to the owner with what replaced it
  and what moving costs; never change it without a yes (it becomes a card).
- **Versions**: `.tool-versions` with the exact Node (and any other tool) the app uses, the same Node in the `Dockerfile` and
  `@types/node`; the gate's *versions* check must pass. Renovate: say the owner installs its GitHub app for the repository
  (https://github.com/apps/renovate); several repositories: the policy goes to a config repository of their own.
- **Security**: `npm run secops -- --enable` (Dependabot alerts and security updates); the weekly report starts with the first push.
- When the production module is installed (`docs/PRODUCTION.md`): fill the first rows of `docs/company/PRIVACY.md` from the product
  answers (what is kept, why, where; "not decided" where it is not), and the logger's `personal` list from them. Don't ask
  about hosts, clusters or queues now: `docs/workflow/LIFECYCLE.md` says they are decided by `/launch` when the first deploy card comes.
  Another language than TypeScript: write the same three parts (checked settings, safe logs, health and stopping) in the
  language's own way when the server is first built, and point `docs/PRODUCTION.md` at those files when the run stage starts.
- The deploy is the run stage's (`/launch` starts it and brings `docs/run/`): do not fill deploy pages now. Write `.env.example`;
  the host chosen in `stack.md` part 6 goes into `docs/STACK.md`, so `/launch` starts from it. An app with no server: take out
  `Dockerfile`, `.dockerignore` and the *Deploying* section of `CLAUDE.md`.

## 4. Make it real
```sh
npm run board -- --init        # labels, the project (when board.project is 0) and the columns
npm run board -- --check
npm run protect                # main can no longer be deleted or rewritten: a guard on this computer, and the rule on GitHub
npx biome check --write src tests   # TypeScript, once: a framework starter's files into the kit's format; fix what it cannot
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
"From here, type `/next` whenever you are not sure: it tells you which command." (The first time it will offer `/idea` for the
first thing to build, then `/work <n>`.)

**This project's own**: when `.claude/project/setup.md` exists, read it before you start: it holds this project's own steps and rules for /setup, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
