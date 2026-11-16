---
name: next
description: The front door of {{PROJECT}}'s workflow, safe to type at any moment ("/next", "what now?", "what should I work on?", "which command for ...?"): what waits from outside (a security alert, an update that needs you), where the project is (a look back due, a roadmap to fill, the next stage), the cards to start, best first, by a script; it ends with the next steps as one question in plain words, and says how to start the one picked in a new chat. Changes nothing.
model: haiku
---

# /next  or  /next <which command for ...?>

Change no file, set no label, start nothing: this is the one command that is safe at any moment. At most eight lines and the
closing question.

**Asked which command** for something ("how do I check what this costs?", "where do I start the deploy?"): find it in
`docs/workflow/WORKFLOW.md`, *The commands, by stage* (`grep -n` the words, read only that table), and answer with the command and one
line on what it does. Not in the table: say so and offer `/find`. Then stop. A command whose skill is not in
`.claude/skills/` was left out of a lean install: say so, and that `node <kit>/install.mjs . --update --with <part>` adds it.
Never offer a skill that is not installed as the next step.

**Otherwise**, four commands, all read-only:
1. `npm run updates -- --short`: a security alert first; an update only when it needs the owner (its "to look at" part; the
   ones that merge by themselves are not the owner's job).
2. `node tools/workflow/stage.mjs`: where the project is, from facts (a look back due, the roadmap empty, the first version built
   and nowhere to run it, a card that must come before the first deploy). Each `stage:` line is a next step.
3. `npm run board -- --next 3`: the cards to start, best first (the dependency graph first, then the owner's labels). A card that
   "starts on top of #m" does not wait for #m's check: say so. **A tie** ("#a, #b are equal"): never present the card number as
   an order; deciding it is a next step of its own (the board tidy-up asks it once and keeps the answer).
4. With the app map, `npm run board -- --gaps`, and the board's notes (cards with no value, issues off the board, "the board
   needs ... decisions"): together one next step, the board tidy-up.
Nothing to start: offer `/idea` or `/shape` for the next thing in `docs/PRODUCT.md`; no `docs/PRODUCT.md` and no cards: `/setup`.

**Faster, together**, only when it pays for itself: several builders cost a session each, so it is offered by the size of the
work, from the cards' effort labels. Two or three cards to start that do not depend on each other, have different area labels
(so they are unlikely to touch the same files) and are each `effort: medium` or `large`: add one choice: "Build #a, #b and #c at the same time (about as long as the longest;
it costs about the three together, and you try three things at the end). (/work a b c)". Small cards are not
worth a builder each: two `effort: small` cards in the same area are offered as one session instead ("Do #a and #b together,
one change (/work a b)"); small ones in different areas simply go one after the other. Cards that depend on each other are never
offered together; `/work` sorts them again (combined, one after the other, or side by side).

**End with ONE question**: the next steps found, at most four, most urgent first (a security alert, the `stage:` lines, the
board tidy-up when it has decisions, the top card), the one you recommend marked with why in a few words (the quick ones that
keep the rest honest first: a look back due, an empty roadmap, decisions waiting; then the card).
**On the answer, do not run it here**: say "Start it in a new chat (so it begins clean, on the right model): type `<command>`".
A new chat gives the command its own model (planning on the strong one) and none of this chat's reading. "Not now" ends it.

**Each choice in plain words**, as someone who never heard of the workflow would follow it: what will happen, what you get, how
long; the command after it in brackets, never as the choice itself:
- `/retro`: "Look back on the week (about 10 minutes): what shipped, what went well, what got in the way. Each lesson becomes a
  check or a rule, so it does not happen again. (/retro)"
- `/advise roadmap`: "Say where the project is and what would show it is ready for the next step (a few minutes), for example
  'first users; the sign: most of the ten use it every week'. Then the kit reminds you at the right moment. (/advise roadmap)"
- `/tidy`: "Clean up the board (about 5 minutes): I propose small fixes, like merging two cards that are the same, setting how
  much a card matters, deciding which of two equal cards comes first, linking a missing piece of the app to its card. You tick
  what you agree with. (/tidy)"
- `/work <n>`: "Build #n, <its title in plain words> (<its effort>): it is planned, you say yes, it is built, you try it. (/work n)"
- `/launch`: "Decide where the app runs online and set it up (an hour or two, over a few sittings). (/launch)"
- `/market`: "Work out who it is for and how they will find it (a few short sessions). (/market)"
- a security alert: "A package the app uses has a known security hole: update it first (minutes). (npm run updates)"
- an update to look at: "An update needs you: helm 3.16 to 3.22, a tool the checks never run. Try it once, then take it
  (minutes). (npm run updates)"
