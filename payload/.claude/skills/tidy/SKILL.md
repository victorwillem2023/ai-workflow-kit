---
name: tidy
description: Keep the {{PROJECT}} board from piling up and make the focus clear ("/tidy", "what should I focus on", "the board is a mess"): reads the board's triage (too much in progress, cards waiting for the owner, stalled or long-blocked work, the inbox, cards without a value, duplicates, an old backlog), proposes one batch of tidy-ups for a yes, does the approved ones, and ends with the focus block: the cards of one theme the coming days are about ("/tidy focus" does only that). Run from the main folder.
model: sonnet
---

# /tidy

The board's front desk: nothing waits without a decision, and the owner knows what matters this week. The script finds, you
explain and propose, the owner decides, and the board commands do it.

Run it when `npm run board -- --next` prints "the board needs ... decisions", at the start of a week, or whenever the owner
feels lost in the cards.

**`/tidy focus`**: only step 4.

**More than this can clear** (dozens of cards without a value or an area, a backlog far over `board.backlogMax`): say so
and offer the full pass, `/sweep`, which goes over every card, a theme at a time.

## 1. Read the triage

- `npm run board -- --triage` (lib/triage.mjs): the counts, the focus, and each finding with its cards.
- With the app map: `npm run board -- --gaps`, its `gap` and `weak` ends that no open card is on.
- Read a single card only when a proposal needs its text (`npm run board -- --show <n>`). Never read the whole board.

## 2. One batch of proposals

First the cards made along the way: `npm run board -- --unsorted` lists the cards agents made on their own outside a
hand-over (a build's open points are made sorted: in the goal, parked or in the backlog, `try-it.md`). Offer them as one choice each, ticked: let in (`--accept <n,m>`) or drop (`--close <n> "<reason>"`). Then
`npm run board -- --expire`: the cards nobody touched for eight weeks that are not of high value; offer closing them all
(`--expire --yes`, each can be reopened), unticked.

At most eight, the most blocking first, each one line with the command it would run:

- **Too much in progress**: which card to finish first, and which to move back (`--move <n> "Ready"`).
- **Waiting for your check**: "try #12 the way it was handed over (its link for a screen, its try command otherwise), then say
  done or what is wrong". Nothing to run: it is the owner's turn.
- **Stalled**: move it back, split it ("the part left becomes a new card"), or close it.
- **Blocked for long**: unblock it (`--move <n> "Ready"`), or close it with why (`--close <n> "<reason>"`).
- **The inbox**: adopt each with a type (`--adopt <n> --label <type>`), or close it with a reply.
- **The map's gaps**:
  - an end a card already covers gets that card on it (`card: [<n>]` on the end in `docs/flow/map.js`; `grep -n` the end's words);
  - a real gap gets a card (`/idea` with the end's words), or stays a gap on purpose (its note says why).
- **No area**: `npm run board -- --focus` says how many cards have no area label; without one a card is in no block. Propose
  an existing area for up to ten of them, from their titles (`gh issue edit <n> --repo <board.repo> --add-label "<area>"`);
  performance, refactoring and test work goes under `area: Code health` when the config has it.
- **Unranked**: a value guess per card for the owner to confirm (`npm run board -- --rate <n> value medium`), or `/shape`.
- **A tie at the top of `npm run board -- --next`** ("#a, #b are equal"):
  1. first estimate a missing effort from the code (`npm run map -- --find <word>`, then
     `--rate <n> effort <small|medium|large>`), which may settle it;
  2. still tied: ask which comes first (`docs/PRODUCT.md` recommends a card for the first users before one outside them), and
     keep the answer as value labels: the first gets `--rate <n> value high`, then `medium`, then `low`, only on cards with no
     value yet.
- **Duplicates**: merge into the older card. Copy what the newer one adds as a comment, then
  `--close <newer> "duplicate of #<older>"`.
- **Prune**: close the listed old low-value cards with "closed in a backlog tidy-up; reopen if it matters again".

Ask with AskUserQuestion (multiSelect), every proposal ticked except the closing ones; the owner unticks what they disagree
with.

## 3. Do the approved ones

Each with its board command, and one line per change in the report. Nothing else changes: no labels the owner did not
approve, and no new cards except a split they said yes to.

## 4. The focus: one goal at a time

One goal for the coming days, with a finish line, and the rest waits: the owner always knows what they are working towards.

1. Run `npm run board -- --focus`.
   - **A goal or block is picked and not done**: say its line and its next card. Things "left with no card yet": go to step 3
     to make them. Otherwise stop here.
   - **Otherwise** it prints the goals to pick from (with the app map), each with its count and what is left. Without the app
     map it prints blocks of one area label instead.
2. Ask with AskUserQuestion, one choice per goal (at most four), each in plain words: what it makes better for the person
   using the app, how far it is, how much is left. For example "Hikes to a top really good: 14 of 26 cases work; 8 cards and
   3 things with no card yet". Where goals come from follows the phase (`DIRECTION` in `workflow/tools/lib/focus.mjs`;
   `direction.goals` in `workflow/levels.json` is the owner's own list): in a prototype the product itself, once people use
   it what they report first.
   - **A goal is due** (code health with a number that got worse, or many cards shipped without such work): recommend it,
     with the script's reason.
   - Otherwise recommend the one closest to its finish line, unless more than `board.wip` cards are in progress: then the one
     that holds most of those, so they get finished.
3. On the answer: `npm run board -- --focus "<goal id>"` (the id the script printed; the owner named cards:
   `--focus "<goal id>" <n,m>`; one more card later: `--focus --add <n>`; none: `--focus --clear`).
   - **Things left with no card yet**: propose a card for each (at most eight), from the goal's notes and the app map
     (`npm run board -- --gaps` names the weak and missing ends). A kind of request **with no page yet** gets one card first:
     "write the page for <kind>: what someone asks, what the app does" (a `workflow` card; the page is drafted from the code
     and the app map, and the owner decides each row). Code health with no card: propose at most five from `npm run health`
     (the biggest files, the longest functions, the flaky tests), labelled `area: Code health`. Make the approved ones with
     `/idea` (they are the owner's, so no `--unsorted`) and add each to the goal: `--focus --add <n>`.
   - **The plan, for one yes**: read each goal card (`--show <n>`); write what it needs first (`--depends <n> <m>`) and the
     files it will change (`--touches <n> "<paths>"`, a guess from the map and code). Write the finish line, what must work
     when it is done (`npm run board -- --plan --finish "<what>"`). Say the waves in plain words ("first #4, #7 and #9 side by
     side; then #5 on top of #4, and #8") and ask once.
4. End with three lines: what to finish first (the cards in progress), the goal's first wave (`npm run board -- --plan`),
   and that everything else waits until the goal is done, when `/next` offers the next pick.

For `project.audience: me`, keep it light: lecture no limits; a hobby board may be messy.

**This project's own**: when `.claude/project/tidy.md` exists, read it before you start: it holds this project's own steps and rules for /tidy, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
