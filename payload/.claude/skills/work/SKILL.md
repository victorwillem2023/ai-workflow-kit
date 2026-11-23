---
name: work
description: Work on one {{PROJECT}} board card from start to finish ("work on card 42 today"), or a batch of bugs in one go ("/work bugs"): reads the card, picks the route from its type label (ui goes to /ui; feature, bug, workflow here), plans and stops for a yes, builds in a session folder, stops while the owner tries it, and ships only when the owner says done. Run from the main folder.
model: opus
---

# /work <card number>  or  /work (no number: what to build next)

This is the one entry for a card. `/spec`, `/build` and `/ship` do the steps underneath; this skill says which one runs, in
what order, and where to stop and wait for the owner. Run it from the main folder, in a fresh chat. Never commit before the
owner says done.

## 0. What waits from outside

1. `node workflow/scripts/session.mjs --sync`: brings in what was merged on GitHub, when nothing in the main folder is in the way.
2. `npm run updates -- --short`: one line about Dependabot's security alerts and updates.
   - A **security alert**: say it first, in plain words, and ask whether to deal with it before the card.
   - An update that **needs the owner** (its "to look at" part): name it in one line and go on.
   - Updates that merge by themselves: say nothing about them.

**No card number given**: run `npm run board -- --next 3`. Offer its `today:` line first (the free room filled: one
`/work a b c`, with what waits after it), then the three cards one line each with its reason; the owner picks. The order comes from the cards' dependencies first (only cards nothing open holds back, first-version cards
first), then from their worth (value for the effort, plus the value of the cards they unlock). Pass on its notes about cards
with no value label, or issues waiting off the board (`npm run board -- --inbox`), in one line. Never read the whole board.
While a goal or focus is picked (its `goal:` or `focus:` line), those three are its cards: say the line. A `together, ...`
line is an offer of its own: cards that go in one session, one after another, or side by side.

**A card number outside the picked focus** (`npm run board -- --focus` lists the block's cards): say so in one line ("#n is
outside the UI block you picked") and go on; the owner chose it. Never add it to the block yourself.

## 1. Read the card

`npm run board -- --show <n>`. Never read the whole board. Then check, in this order:

- **Closed, or in *Done***: say so and stop.
- **Someone else's** (assigned to another person, or in *In progress* with their session): say so and stop. In a team, take
  a card before starting it (`workflow/guides/TEAM.md`, *Two people on one board*).
- **In *Blocked***: say the reason (the last "Blocked:" comment) and ask whether it is unblocked before going on.
- **No type label, or more than one**: ask which of `ui`, `feature`, `bug`, `workflow` or `spike` it is, with your
  recommendation. After the owner's yes, add it: `gh issue edit <n> --repo <board.repo> --add-label <type>`.
- **It changes old code that has no tests** (the gate's *untested* list): the plan starts with tests that pin down what the
  code does today (`workflow/guides/TAKEOVER.md`, *2. A test before the first change*).
- **A `code:` line in the card** (`--show` prints it under the address): this card is likely to change a file that is
  already costly. Say it to the owner in one plain sentence with the plan, and what the plan does about it: the split or
  the test first when it fits the card's size, else a card of its own that this one depends on (`/spec` step 2). When the
  line names a card that is that work, offer that card first.
- **What it needs first**: `npm run board -- --graph` shows the tree built from the cards' "Depends on:" lines. For each open
  card this one waits for, pick the earliest way that keeps the owner's work flowing (the rules: `.claude/skills/work/together.md`):
  - That card is **built** (in *Waiting for your check*, or its session is done): start this one on top of it
    (`--on <its topic>`), so nothing waits for its commit on main.
  - That card is **planned or being built, and close to this one** (small, the same files, or this one only makes sense with
    it): offer to **combine** them: one session, one spec, one commit for both cards.
  - **Otherwise**: say which card it waits for and offer that one instead (`/work <that one>`). Start this one only if the
    owner says so, knowing what is missing.

  If the plan turns out to need another card first (it stores data, and sign-in is a card not built yet), stop and say so
  before choosing any stand-in. Propose writing the dependency down (`npm run board -- --depends <n> <m>`) and doing that card
  first. A stand-in (a fake sign-in for development, say) is the owner's choice, offered as one, never the default. Every
  dependency found this way goes on the card, so the next ranking knows it.

## 2. Plan by type, then stop for a yes

The type label picks the route; area labels do not. How deep the plan goes follows the card's size: a spike, the light
route, or a spec.

Every plan, light or not, names the other way it could be built and recommends one (the end state over a step, as `/spec`
says). A card that says how to build it is the owner's first thought, not the decision: a better way you see is said and
recommended, and the owner picks.

- **`feature` or `workflow`**: run `/spec <n>`, the plan with its tests named. A `workflow` card changes nothing in the app,
  so its spec says "none" under what the user sees and names the workflow files and docs instead. The spec's "Card stays open
  after this spec" line says whether the card is only partly done (then `/ship` finishes with `--partial`).
- **The light route**, for a `feature` or `workflow` card too small to need a spec: `npm run levels -- --needs spec <its
  effort>` says no (the owner sets the size in `workflow/levels.json`: from medium cards in production, large ones in a
  prototype), and it adds no endpoint, screen, outside host or sensitive file. No spec file: say in a few lines in the chat
  what changes for the user, the name of the test that proves it, and the files. On the yes, go on as for a small bug (step 3).
- **`bug`**: say in a few lines the cause as far as it is known, the failing test that will show it (its name says what the
  app should do), and the fix. A fix that reaches several areas or a shared type: run `/spec <n>` instead.
- **`ui`**: run `/ui <n>` and follow it instead of steps 2 to 5 here. It draws the board and stops for the owner's pick, then
  builds in a new chat (`/ui <n>` again, in the session folder, no `/build`), runs the feedback rounds there, and ends with
  `/ship` when the owner says done. A card of another type that turns out to need a new screen: ask to relabel it `ui`, or
  to split it, before going on.
- **`spike`**: run `/spike <n>` and follow it instead: a throwaway try with a time limit, no spec, tests or gate, ending in a
  decision note. A `feature` card for an idea nobody has tried yet: offer a spike first, in one line.

On the owner's yes, move the card to *Ready* (`/spec` does this itself).

- **A card with a spec stops here.** Tell the owner to open a new chat in the main folder and type `/build <topic>`. The spec
  carries everything the build needs, and a new chat does not carry all that the planning read into every feedback round.
  With `"orchestrator": "orca"` (`session` in `workflow/config.json`), offer to open it for them, after `--room`:
  `node workflow/scripts/session.mjs <topic> --card <n> --start "/build <topic>"` (the new chat, in the session's own terminal).
- **A small bug without a spec** goes on in this chat.

## 3. Build in a session folder, tests first

**Room to start**: `npm run board -- --room`. When it prints STOP (more work in progress than `board.wip`; a session's cards count once), stop here: name
the work in progress in one line each and ask which to finish or park first (park: `--move <n> "Ready"`). A card that is
already *In progress* (picked up again) needs no room.

- **With a spec**: `/build <topic>`, in the new chat. Steps 3 to 5 then happen there.
- **A small bug**: `node workflow/scripts/session.mjs <topic> --card <n>` (it moves the card to *In progress*). In that folder, write the failing test, run it and see it
  fail, make the fix, and run `npm run gate`, fixing what it names, until it passes. A test that fails with nothing changed
  under it is flaky: report it with its output, and never run the gate again hoping it turns green.
- **Several bugs at once**: `/work bugs` (the open `bug` cards, from `gh issue list --repo <board.repo> --label bug --state open
  --json number,title`, offered as one batch for a yes), or `/work 12 14 15` when all of them are bugs.
  - One session: topic `bugs-<date>`, with `--card 12,14,15`.
  - Each bug first becomes one failing test row: a case in the test file that already holds its kind, never a test file per bug.
  - Then the fixes, one gate, and one commit that closes every card.
  - In a prototype, a bug that breaks no core flow is not fixed. The core flows are the app map's ends; with no app map, what
    the owner named first in `docs/PRODUCT.md`. Mark it weak on the map, or leave its card in Backlog, and say so in one line.

## 4. Stop while the owner tries it

Hand it over as `.claude/skills/build/try-it.md` says: the server already running and its link, or a try command for a
change without a screen, in plain words, with examples, the owner's own numbers and the edge cases. First
`node workflow/scripts/session.mjs --handover <topic>`: main comes in (a clash shows now; settle it, run it again) and the card
moves to *Waiting for your check*. Feedback goes to whoever built it (`/build` step 6). "continue" or "ok" is not "done": ask.

## 5. Finish only when the owner says done

"commit and push" or "finish it" is done. Then `/ship <topic>`. A small bug without a spec takes the same steps by hand:
`npm run gate:ship`, one commit, `node workflow/scripts/session.mjs --finish <topic>` (it moves the card to *Done*).

## When a card cannot go on

- **It waits for another card**: that is a dependency, not a block. `npm run board -- --depends <n> <m>`: the card stays where
  it is, and `--next` offers it once #m is done. Say so in one line, and stop.
- **It is blocked** (waiting for the owner or an outside service): `npm run board -- --block <n> "waiting for <what>"`. Say so
  in one line, and stop.
- **The board cannot be reached**: say so in one line and carry on; the owner moves the card by hand.

## Several cards (`/work 12 14 15`)

1. Read each card as step 1 says, one `--show` per card. `ui` cards go their own route (`/ui <n>`), not this one.
2. Start from the script's sorting, `npm run board -- --together <n,m,...>` (from the labels, the dependencies and the app
   map), check it against what the cards and the code say as `together.md` says, and show the sorting with the plans:
   - **combined**: one spec, one session, one commit that closes them all;
   - **stacked**: one starts on top of the other (its spec's "Starts on" line);
   - **side by side**: each on its own.
3. Write the specs **one after another in this chat**: shared context is cheaper than parallel spec agents, so never fan
   `/spec` out. Show each spec, then stop.
4. The owner opens a new chat and types `/build a b c`. Typing it is the yes for each spec; a spec with an open question is
   left out. `/build` checks the specs for overlap, starts at most `board.wip` builders at once (3 when it is not set), and
   gives one summary. Feedback and `/ship` then go one topic at a time.

One card behaves exactly as the steps above.

**This project's own**: when `.claude/project/work.md` exists, read it before you start: it holds this project's own steps and rules for /work, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
