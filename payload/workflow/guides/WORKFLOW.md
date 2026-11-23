# How to work with the AI workflow

**Not sure what to type? Type `/next`: it tells you which command.** It looks at the board, the security alerts and where
the project stands, and names the next step; ask it "which command for ...?" and it answers from *The commands, by stage*.

For anyone working on this repo with an AI coding agent (for example Claude Code with Sonnet/Opus, OpenCode with DeepSeek, or a similar agent): what to type, what happens, and where you are asked to decide.
"You" is the person steering the session; the agent does the planning, building and checking.
The scripts behind it (gate, board, map, pictures) are described in `workflow/tools/README.md`;
the rules the agent follows are in `CLAUDE.md`.

## Before you start
- Your AI coding agent open in the repo's main folder (editor extension or terminal), in a fresh chat for each card.
- The GitHub CLI installed and signed in with project access: `gh auth login`, then `gh auth refresh -s project`.
  Without it the board commands fail with one line and the agent carries on; you move the card by hand.
- `npm install` done, and a `.env` in the main folder (session folders copy it; never share its values).

## The idea in one minute
- **The board is the only backlog.** Every idea, bug and wish is one card on the GitHub board.
- **One goal at a time, few cards at once.** You pick a goal with a finish line (`/tidy focus`), and `/next` shows how far it
  is. No more than `board.wip` pieces of work are in progress (the cards one session builds together count once): `/work` and `/build` stop and ask before one more starts. Cards the AI
  makes along the way wait for your yes before they are offered, and the last session's "where I stopped" line opens the next.
- **You steer, the agent builds.** The agent plans and stops for your yes, builds and stops for you to try it,
  and commits only when you say it is done. (`CLAUDE.md` calls the person steering "the owner".)
- **One card, one session folder, one commit.** Each piece of work happens in its own folder
  (`../{{PREFIX}}-<topic>`, own port), so work in progress never breaks the main folder or another session.

## The first time
After the kit is installed, `/setup` once: it interviews you and writes the project's rules, config and first docs, and makes the board.

## The commands, by stage
Most days you need four: `/next`, `/idea`, `/work <n>` and, after the plan's yes, `/build <topic>` in a new chat. The rest
come when a stage needs them; past the gate, every one is optional (`project.audience` decides what the kit brings up).

| Stage | You type | What happens |
|---|---|---|
| Start | `/next` | What to do now and which command does it; the cards to start, best first. |
| Start | `/setup` | Once, after the kit is installed: interviews you and writes the rules, config, first docs and the board. |
| Idea | `/idea <a sentence>` | Adds a card to Backlog. Checks for a duplicate first, picks the labels, answers `#<n> made in Backlog: <url>`. Works in any folder. |
| Idea | `/shape <n>` | Is it worth building: the questions, fitted to who it is for; sets the card's value. |
| Idea | `/spike <n>` | A throwaway try of the riskiest part, ending in a decision note. |
| Plan | `/tidy` | When the board piles up: one batch of tidy-ups for your yes, then the focus block. |
| Plan | `/sweep [theme]` | The full clean-up, when `/tidy` is not enough: every open card, one theme at a time, 25 per round. What to close, merge or split, and the area, value and effort each card lacks; you approve each round. |
| Plan | `/anatomy [flow]` | Look at how one flow of the code is built (the code written before the checks too): its jobs and where each lives, what is done twice, which shared steps ask what kind they handle. The end state and the clean-up as cards in order, for your yes; never changes code. `/next` says when no flow was looked at yet. |
| Plan | `/tidy focus` | Pick the goal for the coming days, with a finish line: one kind of request made really good ("hikes to a top: 14 of 26 done"), one part of the app finished, or code health (speed, reliability, tidy code) when a number got worse. Until it is done `/next` and `/work` offer only its cards. Without the app map: a block of cards of one area. Where goals come from follows the phase: the product itself in a prototype, what users report once they use it. |
| Plan | `/estimate <n or a sentence>` | What one change costs: the work, the money a month now and at 10 times, and what else it brings. |
| Plan | `/advise [panel] [question]` | Help choosing between options: up to three advisors, each citing the docs; `/arch` is its architecture panel; `/advise ai` looks where AI could make the app better, once the first version works. You decide. |
| Build | `/work <n>` | The main entry. Plans card n and stops for your yes, in the steps below. Run it from the main folder in a fresh chat. |
| Build | `/build <topic>` | After the yes, in a new chat: builds the plan, the feedback rounds and `/ship` all happen there. |
| Build | `/ui <n>` | Same, for a `ui` card (`/work` sends you there by itself). |
| Ship | `/spec`, `/review`, `/ship` | The steps underneath `/work` and `/build`; you rarely type them. |
| Ship | `node workflow/scripts/session.mjs --push` | Sends every finished feature to GitHub. Only when you say so. |
| Run | `/launch` | Where it runs, before the first real deploy; writes `infra/` and the environments. Never applies. |
| Run | `npm run infra-plan -- infra/<env>`, then `npm run infra-apply -- infra/<env>` | The infrastructure change planned and checked against what was expected; then you apply exactly that plan. |
| Run | `npm run drill`, `npm run costs` | The restore drill; the monthly bill, and paid against self-hosted (`-- --compare <file>`). |
| Run | `/secops` | The weekly security report explained, with a fix or a card for each finding. |
| Grow | `/market [part]` | Positioning, pricing, the page, converting, ads, the launch; `npm run launch-check -- <address>` checks the page. |
| Every week | `/retro`, `/lesson` | What the week taught, turned into checks; a correction made to last. `npm run shipped`: what each shipped card took against its effort label, which the retro reads. |

Three cheap helpers, run on a small/free model (Haiku in Claude Code; in OpenCode the `cheapModel` of `harness.opencode` in `workflow/config.json`), for jobs you start
yourself and can simply run again:

| You type | What happens |
|---|---|
| `/docs <what to change>` | A small edit to the hand-written docs (README, `docs/*.md`, the CLAUDE.md notes). Never code, no commit: the next `/ship` puts it in, on its own or with the feature (`commits.notes` in the config). |
| `/check` (or `/check all`) | Runs the gate and explains what failed and where, in plain words. Changes nothing. |
| `/debug <what went wrong>` | Something goes wrong and you do not know why: from what you saw and the error's reference to its log lines, the cause in the code, a failing test that shows it, then the fix. Never a guessed fix. |
| `/find <a question>` | Where is X, how does Y work: file paths and lines from the map, without reading whole files. Changes nothing. |

Why the flow is split this way, and what keeps a session cheap: `workflow/guides/TOKENS.md`.

## A normal day
1. **Capture**: `/idea a button to export a PDF`. Look at the board (the Backlog column) when you want to choose.
2. **Pick**: `/work 42`. The agent reads that one card (never the whole board) and takes the route its **type label** says:

   | Label | Route |
   |---|---|
   | `feature` | A plan (`workflow/specs/<topic>.md`) with named tests, then the build. |
   | `bug` | A failing test first, then the fix. A plan only if the fix is large. |
   | `workflow` | Like a feature, but nothing in the app changes. |
   | `ui` | A mockup board first (variants A, B, C, with pictures), then the build, only in `src/web`. |

3. **Look at the plan**: The agent shows a short summary (what you will see, files, tests, docs) and stops. Say what to change,
   or open a new chat and type `/build <topic>`: typing it is your yes (the plan is marked approved and the card moves to
   *Ready*). The build starts fresh from the plan, so it doesn't carry the whole planning chat along (a small bug is
   fixed in the same chat).
4. **Try it**: In that chat the agent builds in the session folder, then hands it over in plain words: what to try, with
   examples, your own numbers and the edge cases. A change with a new screen comes with a link to a server that is already
   running (open it, refresh with Ctrl+F5); a change with nothing to see yet (rules, data) comes with one command to paste,
   where you type your own numbers. The card is in *Waiting for your check*.
5. **Give feedback**: one numbered list per round ("1. the button is too big, 2. ..."). The agent does one pass per round
   and shows before and after pictures. Feedback that needs a change in core logic becomes its own card.
6. **Say done**: "finish it" or "commit and push". The agent runs the full check, makes one commit, puts it on the local
   `main` and moves the card on. Nothing is sent to GitHub yet.
7. **Push**: when you want it online, `node workflow/scripts/session.mjs --push`.

## Several cards at once
`/work 12 14 15` reads the three cards and writes their plans one after another in the same chat; then one `/build <their topics>` in a new chat approves and builds them all.
Then, in a new chat, `/build a b c` starts one builder per plan, at most 3 at the same time (more with `board.wip` in `workflow/config.json`, how many cards may be in progress at once), each in its own folder and port. If two plans change the
same file, the later one waits until the first is finished with `/ship`. You get one summary with each folder, URL and
questions for you (each with a recommendation); what was left out is already on the board as new cards. Give feedback naming the topic ("on fan-out: ..."), and ship one at a time: `/ship a`, then `/ship b`.
`ui` cards join only after you have picked a variant.

## One big plan, several builders
A big job that splits cleanly (a refactor over several large files) can list "work packages" in its plan: which files each one
owns and which must go first. You see and approve that split with the plan. `/build` then runs the independent packages at the
same time (at most 3), the dependent ones afterwards, all in the same folder. No two builders touch one file, and the lead agent runs the
full check once at the end. Small jobs stay with one builder: splitting only pays off when each part is big.

## The `ui` route in two stops
1. **The board**: The agent draws one HTML page with variants A, B, C, and pictures (desktop and phone, light and dark).
   You pick: "B, with A's header". No app code is written yet.
2. **The build**: The agent writes a short plan for your pick and asks you to open a new chat and run `/ui <n>` again. That
   chat builds the pick from the plan and the pictures, then the feedback rounds as above, without carrying the board's HTML along.

A small tweak to something that exists (spacing, a label, a colour) skips the board: one live draft, you try it.

## Where you are always asked
- **Before building**: the plan.
- **Before committing**: "done" from you, never after a single fix or a browser round.
- **Before pushing**: your word.
- **When the card is unclear**: no type label, or two. The agent recommends one and asks.

## Looking around
| I want to | Command |
|---|---|
| read one card | `npm run board -- --show <n>` |
| find a card | `npm run board -- --search "<words>"` |
| see the goal you are on, or the ones to pick from | `npm run board -- --focus` |
| let in the cards made while building (they wait for your yes) | `npm run board -- --unsorted`, then `--accept <n,m>` |
| close the cards nobody touched for eight weeks | `npm run board -- --expire`, then `--expire --yes` |
| see the running sessions and unpushed work | `node workflow/scripts/session.mjs --list` |
| park a card ("waiting for X") | `npm run board -- --block <n> "<reason>"` |
| move a card by hand | `npm run board -- --move <n> "<column>"` |
| run the checks yourself | `npm run gate` (quick), `npm run gate:ship` (what /ship runs: everything in pilot and production, the reached tests in a prototype), `npm run gate:all` (everything) |
| see which phase the project is in, and what the next one needs | `npm run phase` |
| see every doc in one place, with where the project is at the top | `/portal` (opens it in a new browser tab) |

Columns, left to right: Backlog, Needs a board or decision, Ready, In progress, Waiting for your check, Blocked, Done.

## Two servers, don't mix them up
- The **main** folder runs on the main port (`session.mainPort` in `workflow/config.json`, e.g. 8787): it shows what is finished.
- A session's work is on **its own port** (8788 and up): start the dev server in that folder.

## When something goes wrong
- **Board unreachable** (gh missing, not signed in, no network): The agent says so in one line and carries on. Move the card by hand.
- **Gate fails**: The agent shows the output and fixes it; nothing is committed until it passes.
- **Found work the agent did not make** (loose files in the main folder, an unknown branch): The agent leaves it and tells you.
- **Abandoning a session**: `node workflow/scripts/session.mjs --remove <topic>` (it refuses while there is uncommitted work).
- **A stale browser**: Ctrl+F5, the service worker caches.

## Model choice and free models (optional)
- **Good fits for free/cheap models:** `/idea` triage, documentation and README edits, copy tweaks, simple renames, and other low-risk mechanical changes that are easy to review and verify.
- **Better with stronger models:** planning/workflow/specs with design choices, most feature or bugfix implementation, security-sensitive changes, refactors that cross modules, and anything ambiguous.
- **Tradeoff:** free models can reduce cost and are fine for routine work, but they may miss context or make weaker judgments. When in doubt, use a stronger model and rely on the normal plan/review/gate steps before finishing.
- **Free models never run inside `/work`** (or `/spec`, `/build`, `/ship`, `/ui`): they have no published limits, and OpenCode keeps
  retrying a model that is out instead of switching, which would stall a build. They only run `/idea`, `/docs`, `/check`, `/find`
  and session titles. When one keeps retrying, press Esc, pick a paid model with `/models` and run the command again.

## Keeping it healthy
- After adding or renaming a source file: `npm run map`.
- The gate also checks that docs only mention files and commands that exist.
- It refuses a key or password in a change, a function copied from another file, and (once set in the config) a changed
  database table with no migration. Before shipping it also looks for code and libraries nothing uses, and libraries with a known
  security problem.
- Before the commit, `/ship` has a second agent that never saw the build compare it with the spec. You get its findings.
- `npm run protect` (once, `/setup` runs it): `main` on GitHub can no longer be deleted or overwritten by accident.
- When the workflow changes, update this file and `workflow/tools/README.md` in the same commit.
