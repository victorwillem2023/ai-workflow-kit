---
name: work
description: Work on one {{PROJECT}} board card from start to finish ("work on card 42 today"): reads the card, picks the route from its type label (ui goes to /ui; feature, bug, workflow here), plans and stops for a yes, builds in a session folder, stops while the owner tries it, and ships only when the owner says done. Run from the main folder.
model: opus
---

# /work <card number>  or  /work (no number: what to build next)

The one entry in plain words. `/spec`, `/build` and `/ship` do the steps underneath; this skill says which, in what order,
and where to stop. Run it from the main folder in a fresh chat. Never commit before the owner says done.

0. **What waits from outside**: `node scripts/session.mjs --sync` (brings in what merged on GitHub when nothing is in the way),
   then `npm run updates -- --short` (one line: Dependabot's security alerts and updates). A security
   alert: say it first, in plain words, and ask whether to deal with it before the card. An update that needs the owner (its
   "to look at" part): name it in one line and go on; the ones that merge by themselves are not mentioned.
   **No card number given**: `npm run board -- --next 3` (the graph first: only cards nothing open holds back, those that
   unlock the most first; then the owner's labels: first version, value for the effort) and offer those three in one line each, with its reason; the owner picks. Its notes about cards with no value
   label or issues waiting off the board (`npm run board -- --inbox`) are passed on in one line. Never read the whole board.
1. **Read the card**: `npm run board -- --show <n>`. Never read the whole board.
   - Closed or in *Done*: say so and stop.
   - **What it needs first**: `npm run board -- --graph` (the tree from the cards' "Depends on:" lines). For each open card it
     waits for, the earliest way that does not stop the owner's flow (`.claude/skills/work/together.md` has the rules):
     **built** (in *Waiting for your check*, or its session is done): start on top of it (`--on <its topic>`: no waiting for
     its commit on main); **planned or being built and close to this one** (small, same files, or this one only makes sense
     with it): offer to **combine** them (one session, one spec, one commit for both cards); **otherwise**: say which card it
     waits for, and offer that one instead (`/work <that one>`); start this one only if the owner says so, knowing what is missing. While planning, if the plan turns out to need another card first (it stores data, and sign-in is a card
     not built yet), stop and say so before any choice of a stand-in: propose adding the line (`npm run board -- --depends <n>
     <m>`) and doing that card first; a stand-in (a fake sign-in for development) is the owner's choice, said as one, never
     the default. Every dependency found this way is written on the card, so the next ranking knows it.
   - In *Blocked*: say the reason (the last "Blocked:" comment) and ask whether it is unblocked before going on.
   - No type label, or more than one: ask which of `ui`, `feature`, `bug`, `workflow`, `spike` it is (with a recommendation), and
     after the owner's yes add it: `gh issue edit <n> --repo <board.repo> --add-label <type>`.
2. **Plan by type, then stop for a yes** (the type picks the route; area labels don't):
   - `feature` and `workflow`: run `/spec <n>`: the plan with named tests. A `workflow` card changes nothing in the app,
     so its spec says "none" under what the user sees in the app and names the workflow files and docs instead.
     The spec's "Card stays open after this spec" line says whether the card is only partly done (then `/ship` finishes with `--partial`).
   - `ui`: run `/ui <n>` and follow it instead of steps 2 to 5 here: it draws the board and stops for the pick, builds in
     a new chat after the pick (`/ui <n>` again, in the session folder, no `/build`), runs the feedback rounds there, and ends with `/ship` when the owner says done.
     A card of another type that turns out to need a new screen: ask to relabel it `ui` (or split it) before going on.
   - **The light route** for a `feature` or `workflow` card labelled `effort: small` that adds no endpoint, screen, outside
     host or sensitive file: no spec file. In chat, in a few lines: what changes for the user, the test that proves it (its
     name), the files. On the yes it goes on like a small bug (step 3). The depth follows the size: spike, light, spec.
   - `spike`: run `/spike <n>` and follow it instead: a throwaway try with a time limit, no spec, tests or gate, ending in
     a decision note. A `feature` card for an idea nobody has tried yet: offer a spike first, in one line.
   - `bug`: in chat, in a few lines: the cause as far as known, the failing test that will show it (its name says
     what the app should do), the fix. A fix that reaches several areas or a shared type: run `/spec <n>` instead.
   On the yes, move the card to *Ready* (`/spec` does this). A card with a spec then **stops here**: tell the owner to open
   a new chat in the main folder and run `/build <topic>`. The spec carries everything the build needs, and a new chat
   doesn't send everything the planning read again on every feedback round. A small `bug` without a spec goes on in this chat.
3. **Build in a session folder**, tests first; move the card to *In progress* (`npm run board -- --move <n> "In progress"`).
   - With a spec: `/build <topic>`, in the new chat (steps 3 to 5 then run there).
   - A small bug: `node scripts/session.mjs <topic>`, then in that folder write the failing test, run it and see it
     fail, fix, and run `npm run gate` until it passes.
4. **Stop while the owner tries it**: hand it over as `.claude/skills/build/try-it.md` says (the server already running and the
   link, or a try command for a change without a screen; plain words, examples, their own numbers, edge cases) and move the card
   to *Waiting for your check*. Feedback goes to the same builder (`/build` step 6). "continue" or "ok" is not "done": ask.
5. **Finish only when the owner says done** ("commit and push", "finish it"): `/ship <topic>` (for a small bug without a
   spec, the same steps: `gate:all`, one commit, `node scripts/session.mjs --finish <topic>`). Then move the card to *Done*.

**Waiting for another card** is a dependency, not a block: `npm run board -- --depends <n> <m>` (the card stays where it is and
`--next` offers it once #m is done), say so in one line, and stop. **Blocked** (waiting for the owner or an outside service):
`npm run board -- --block <n> "waiting for <what>"`, say so in one line, and stop. If the board cannot be reached, say so in one line and carry on; the owner
moves the card by hand.

## Several cards (`/work 12 14 15`)
Read each card (step 1; one `--show` per card). `ui` cards go their own route (`/ui <n>`), not here. First sort them, as
`together.md` says, and show that sorting with the plans: which are **combined** (one spec, one session, one commit closing
them all), which are **stacked** (one starts on top of the other, its spec's "Starts on" line), and which run **side by side**.
For the others, write the specs
**one after another in this chat** (shared context is cheaper than parallel spec agents; do not fan out `/spec`). Show each spec, then
stop: the owner opens a new chat and types `/build a b c` (typing it is the yes for each; a spec with an open question is left out),
which checks for overlap, starts at most 3 builders at once and gives one summary. Feedback and `/ship` go one topic at a time. One card behaves exactly as above.
