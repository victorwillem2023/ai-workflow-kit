# How to work with the AI workflow

For anyone working on this repo with an AI coding agent (for example Claude Code with Sonnet/Opus, OpenCode with DeepSeek, or a similar agent): what to type, what happens, and where you are asked to decide.
"You" is the person steering the session; the agent does the planning, building and checking.
The scripts behind it (gate, board, map, pictures) are described in `tools/workflow/README.md`;
the rules the agent follows are in `CLAUDE.md`.

## Before you start
- Your AI coding agent open in the repo's main folder (editor extension or terminal), in a fresh chat for each card.
- The GitHub CLI installed and signed in with project access: `gh auth login`, then `gh auth refresh -s project`.
  Without it the board commands fail with one line and the agent carries on; you move the card by hand.
- `npm install` done, and a `.env` in the main folder (session folders copy it; never share its values).

## The idea in one minute
- **The board is the only backlog.** Every idea, bug and wish is one card on the GitHub board.
- **You steer, the agent builds.** The agent plans and stops for your yes, builds and stops for you to try it,
  and commits only when you say it is done. (`CLAUDE.md` calls the person steering "the owner".)
- **One card, one session folder, one commit.** Each piece of work happens in its own folder
  (`../{{PREFIX}}-<topic>`, own port), so work in progress never breaks the main folder or another session.

## The first time
After the kit is installed, `/setup` once: it interviews you and writes the project's rules, config and first docs, and makes the board.

## Your four commands
| You type | What happens |
|---|---|
| `/idea <a sentence>` | Adds a card to Backlog. Checks for a duplicate first, picks the labels, answers `#<n> made in Backlog: <url>`. Works in any folder. |
| `/work <n>` | The main entry. Plans card n and stops for your yes, in the steps below. Run it from the main folder in a fresh chat. |
| `/build <topic>` | After the yes, in a new chat: builds the plan, the feedback rounds and `/ship` all happen there. |
| `/ui <n>` | Same, for a `ui` card (`/work` sends you there by itself). |
| `node scripts/session.mjs --push` | Sends every finished feature to GitHub. Only when you say so. |

`/spec` and `/ship` are the steps underneath; you rarely type them.

Three cheap helpers, run on a small/free model (Haiku in Claude Code; in OpenCode the `cheapModel` of `harness.opencode` in `workflow.config.json`), for jobs you start
yourself and can simply run again:

| You type | What happens |
|---|---|
| `/docs <what to change>` | A small edit to the hand-written docs (README, `docs/*.md`, the CLAUDE.md notes). Never code, no commit: it goes in with the next feature. |
| `/check` (or `/check all`) | Runs the gate and explains what failed and where, in plain words. Changes nothing. |
| `/find <a question>` | Where is X, how does Y work: file paths and lines from the map, without reading whole files. Changes nothing. |

Why the flow is split this way, and what keeps a session cheap: `docs/TOKENS.md`.

## A normal day
1. **Capture**: `/idea a button to export a PDF`. Look at the board (the Backlog column) when you want to choose.
2. **Pick**: `/work 42`. The agent reads that one card (never the whole board) and takes the route its **type label** says:

   | Label | Route |
   |---|---|
   | `feature` | A plan (`specs/<topic>.md`) with named tests, then the build. |
   | `bug` | A failing test first, then the fix. A plan only if the fix is large. |
   | `workflow` | Like a feature, but nothing in the app changes. |
   | `ui` | A mockup board first (variants A, B, C, with pictures), then the build, only in `src/web`. |

3. **Approve the plan**: The agent shows a short summary (what you will see, files, tests, docs) and stops.
   Answer yes, or say what to change. The card moves to *Ready*, and the agent asks you to open a new chat and run
   `/build <topic>`. The build starts fresh from the plan, so it doesn't carry the whole planning chat along (a small bug is
   fixed in the same chat).
4. **Try it**: In that chat the agent builds in the session folder, then tells you the folder and a URL like
   `http://127.0.0.1:8788`. Open it, refresh with Ctrl+F5. The card is in *Waiting for your check*.
5. **Give feedback**: one numbered list per round ("1. the button is too big, 2. ..."). The agent does one pass per round
   and shows before and after pictures. Feedback that needs a change in core logic becomes its own card.
6. **Say done**: "finish it" or "commit and push". The agent runs the full check, makes one commit, puts it on the local
   `main` and moves the card on. Nothing is sent to GitHub yet.
7. **Push**: when you want it online, `node scripts/session.mjs --push`.

## Several cards at once
`/work 12 14 15` reads the three cards and writes their plans one after another in the same chat; you approve each on its own.
Then, in a new chat, `/build a b c` starts one builder per plan, at most 3 at the same time, each in its own folder and port. If two plans change the
same file, the later one waits until the first is finished with `/ship`. You get one summary with each folder, URL and
"unsure" list. Give feedback naming the topic ("on fan-out: ..."), and ship one at a time: `/ship a`, then `/ship b`.
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
| see the running sessions and unpushed work | `node scripts/session.mjs --list` |
| park a card ("waiting for X") | `npm run board -- --block <n> "<reason>"` |
| move a card by hand | `npm run board -- --move <n> "<column>"` |
| run the checks yourself | `npm run gate` (quick), `npm run gate:all` (full, before finishing) |

Columns, left to right: Backlog, Needs a board or decision, Ready, In progress, Waiting for your check, Blocked, Done.

## Two servers, don't mix them up
- The **main** folder runs on the main port (`session.mainPort` in `workflow.config.json`, e.g. 8787): it shows what is finished.
- A session's work is on **its own port** (8788 and up): `npm run dev` in that folder.

## When something goes wrong
- **Board unreachable** (gh missing, not signed in, no network): The agent says so in one line and carries on. Move the card by hand.
- **Gate fails**: The agent shows the output and fixes it; nothing is committed until it passes.
- **Found work the agent did not make** (loose files in the main folder, an unknown branch): The agent leaves it and tells you.
- **Abandoning a session**: `node scripts/session.mjs --remove <topic>` (it refuses while there is uncommitted work).
- **A stale browser**: Ctrl+F5, the service worker caches.

## Model choice and free models (optional)
- **Good fits for free/cheap models:** `/idea` triage, documentation and README edits, copy tweaks, simple renames, and other low-risk mechanical changes that are easy to review and verify.
- **Better with stronger models:** planning/specs with design choices, most feature or bugfix implementation, security-sensitive changes, refactors that cross modules, and anything ambiguous.
- **Tradeoff:** free models can reduce cost and are fine for routine work, but they may miss context or make weaker judgments. When in doubt, use a stronger model and rely on the normal plan/review/gate steps before finishing.
- **Free models never run inside `/work`** (or `/spec`, `/build`, `/ship`, `/ui`): they have no published limits, and OpenCode keeps
  retrying a model that is out instead of switching, which would stall a build. They only run `/idea`, `/docs`, `/check`, `/find`
  and session titles. When one keeps retrying, press Esc, pick a paid model with `/models` and run the command again.

## Keeping it healthy
- After adding or renaming a source file: `npm run map`.
- The gate also checks that docs only mention files and commands that exist.
- When the workflow changes, update this file and `tools/workflow/README.md` in the same commit.
