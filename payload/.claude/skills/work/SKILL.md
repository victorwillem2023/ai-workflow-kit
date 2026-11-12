---
name: work
description: Work on one {{PROJECT}} board card from start to finish ("work on card 42 today"): reads the card, picks the route from its type label (ui goes to /ui; feature, bug, workflow here), plans and stops for a yes, builds in a session folder, stops while the owner tries it, and ships only when the owner says done. Run from the main folder.
---

# /work <card number>

The one entry in plain words. `/spec`, `/build` and `/ship` do the steps underneath; this skill says which, in what order,
and where to stop. Run it from the main folder in a fresh chat. Never commit before the owner says done.

1. **Read the card**: `npm run board -- --show <n>`. Never read the whole board.
   - Closed or in *Done*: say so and stop.
   - In *Blocked*: say the reason (the last "Blocked:" comment) and ask whether it is unblocked before going on.
   - No type label, or more than one: ask which of `ui`, `feature`, `bug`, `workflow` it is (with a recommendation), and
     after the owner's yes add it: `gh issue edit <n> --repo <board.repo> --add-label <type>`.
2. **Plan by type, then stop for a yes** (the type picks the route; area labels don't):
   - `feature` and `workflow`: run `/spec <n>`: the plan with named tests. A `workflow` card changes nothing in the app,
     so its spec says "none" under what the user sees in the app and names the workflow files and docs instead.
     The spec's "Card stays open after this spec" line says whether the card is only partly done (then `/ship` finishes with `--partial`).
   - `ui`: run `/ui <n>` and follow it instead of steps 2 to 5 here: it draws the board and stops for the pick, builds in
     a new chat after the pick (`/ui <n>` again, in the session folder, no `/build`), runs the feedback rounds there, and ends with `/ship` when the owner says done.
     A card of another type that turns out to need a new screen: ask to relabel it `ui` (or split it) before going on.
   - `bug`: in chat, in a few lines: the cause as far as known, the failing test that will show it (its name says
     what the app should do), the fix. A fix that reaches several areas or a shared type: run `/spec <n>` instead.
   On the yes, move the card to *Ready* (`/spec` does this). A card with a spec then **stops here**: tell the owner to open
   a new chat in the main folder and run `/build <topic>`. The spec carries everything the build needs, and a new chat
   doesn't send everything the planning read again on every feedback round. A small `bug` without a spec goes on in this chat.
3. **Build in a session folder**, tests first; move the card to *In progress* (`npm run board -- --move <n> "In progress"`).
   - With a spec: `/build <topic>`, in the new chat (steps 3 to 5 then run there).
   - A small bug: `node scripts/session.mjs <topic>`, then in that folder write the failing test, run it and see it
     fail, fix, and run `npm run gate` until it passes.
4. **Stop while the owner tries it**: move the card to *Waiting for your check*, give the folder and the URL
   (`http://127.0.0.1:<port>`, `npm run dev` there), and the "unsure" list. Feedback goes to the same builder
   (`/build` step 6).
5. **Finish only when the owner says done** ("commit and push", "finish it"): `/ship <topic>` (for a small bug without a
   spec, the same steps: `gate:all`, one commit, `node scripts/session.mjs --finish <topic>`). Then move the card to *Done*.

**Blocked at any step** (waiting for the owner, an outside service, another card): `npm run board -- --block <n> "waiting
for <what>"`, say so in one line, and stop. If the board cannot be reached, say so in one line and carry on; the owner
moves the card by hand.

## Several cards (`/work 12 14 15`)
Read each card (step 1; one `--show` per card). `ui` cards go their own route (`/ui <n>`), not here. For the others, write the specs
**one after another in this chat** (shared context is cheaper than parallel spec agents; do not fan out `/spec`). Show each spec and
stop for its own yes: an unapproved spec never gets a builder. Then stop: the owner opens a new chat and runs `/build a b c`,
which checks for overlap, starts at most 3 builders at once and gives one summary. Feedback and `/ship` go one topic at a time. One card behaves exactly as above.
