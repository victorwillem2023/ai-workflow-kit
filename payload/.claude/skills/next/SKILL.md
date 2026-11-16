---
name: next
description: The front door of {{PROJECT}}'s workflow: say what to do next and which command does it, at any point ("/next", "what now?", "what should I work on?", "which command for ...?"): what waits from outside (security alerts, updates, issues off the board), then the one to three cards to start, ranked by a script from the owner's labels, each with its reason and command; a tie is asked once and kept as value labels; it ends by offering the next steps as one question and runs the one picked. Read-only apart from those labels.
model: haiku
---

# /next  or  /next <which command for ...?>

Change no file. Read no code (the file map's lines, `npm run map -- --find`, are fine for an effort estimate). At most eight
lines, plus the one question when there is a tie, and the closing question of step 4.

**Asked which command** for something ("how do I check what this costs?", "where do I start the deploy?"): find it in
`docs/workflow/WORKFLOW.md`, *The commands, by stage* (`grep -n` the words, read only that table), and answer with the command and one
line on what it does. Not in the table: say so and offer `/find`. Then stop. A command whose skill is not in
`.claude/skills/` was left out of a lean install: say so, and that `node <kit>/install.mjs . --update --with <part>` adds it.
Never offer a skill that is not installed as the next step.

**Otherwise**, three commands:
1. `npm run updates -- --short`: a security alert comes first, in one line, with "deal with it first?".
   `node tools/workflow/stage.mjs`: where the project is, from facts (the first version built and nowhere to run it, a card
   that must come before the first deploy, a launch plan with nobody to tell, a week shipped without a retro). Each `stage:`
   line it prints goes next, as it says, with its command: a nudge, never a stop. It prints nothing when there is nothing to say.
2. `npm run board -- --next 3`: the cards to start, best first (the dependency graph first: nothing open holds them back, or
   only a card that is built and waits for the owner's check, which they start on top of; then first version, then value for
   the effort; a fixed sum of the owner's labels). Give each as "#n title: why", and the command to start it: `/work <n>` (a
   `spike` card: `/spike <n>`; a big idea with no pitch yet: `/shape <n>`). A card that "starts on top of #m" does not wait
   for #m's check: say so in plain words.
   **A tie** (its line "#a, #b are equal", the cards marked `=`): never present the card number as an order. In this order:
   - a tied card with no effort label: estimate it from the code (`npm run map -- --find <word>`) and set it
     (`npm run board -- --rate <n> effort <small|medium|large>`), say so in one line, and run `--next` again: value for the
     effort may settle it;
   - still tied: `docs/PRODUCT.md` decides what it can (a card for the first users and the smallest version before one outside
     them) as the recommendation, and you ask the owner ONE question: which of these comes first (an order of all of them is
     fine). Write the answer so it is kept: the first gets `--rate <n> value high`, the next ones `medium` and `low` (only cards
     with no value yet, or ones the owner said to change). Then show the order it gives.
3. With the app map, `npm run board -- --gaps`: when it lists ends nobody plans, one line ("the map has 21 ends no card is on:
   /tidy links them to cards or makes the missing ones"). Then pass on the board's notes in one line each: cards with no value label ("set them with /shape, or say high, medium or low"), and
   issues waiting off the board (`npm run board -- --inbox`). When it says "the board needs ... decisions", offer
   `/tidy` in one line (it sorts them and names the week's focus).
Nothing to start: say so, and offer `/idea` or `/shape` for the next thing in `docs/PRODUCT.md`; no `docs/PRODUCT.md` and no
cards yet: `/setup`.
4. **Offer, do not just name.** End with ONE question whose choices are the next steps found above, at most four, most urgent
   first: a security alert, each `stage:` line (`/retro`, `/advise roadmap`, `/launch`, `/market`), `/tidy` when the board needs
   decisions or the map has ends nobody plans, and the top card (`/work <n>`). Mark the one you recommend and say why in a few
   words (the quick ones that keep the rest honest first: a retro due, an empty roadmap, decisions waiting; then the card). On
   the answer, **run that command here at once** (its skill, as if the owner had typed it), never only print it. "Not now" ends it.
   **Each choice in plain words**, as someone who never heard of the workflow would follow it: what you will do, what you get,
   and how long, with the command after it in brackets. Never a bare command name. The words for the usual ones:
   - `/retro`: "Look back on the week (about 10 minutes): what shipped, what went well, what got in the way. Each lesson becomes a
     check or a rule, so it does not happen again." (`/retro`)
   - `/advise roadmap`: "Say where the project is and what would show it is ready for the next step (a few minutes): for
     example 'stage 1, first users; the sign: most of the ten use it every week'. From then on the kit reminds you at the right
     moment." (`/advise roadmap`)
   - `/tidy`: "Clean up the board (about 5 minutes): I propose small fixes, like merging two cards that are the same, setting
     how much a card matters, linking a missing piece of the app to its card. You tick what you agree with." (`/tidy`)
   - `/work <n>`: "Build #n <its title in plain words> (<its effort>): I plan it, you say yes, it is built, you try it." (`/work n`)
   - `/launch`: "Decide where the app will run online and set it up (an hour or two, over a few sittings)." (`/launch`)
   - `/market`: "Work out who it is for and how they will find it (a few short sessions)." (`/market`)
   - a security alert: "A package the app uses has a known security hole: update it first (minutes)." (the alert's command)
