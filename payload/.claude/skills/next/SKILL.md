---
name: next
description: The front door of {{PROJECT}}'s workflow: say what to do next and which command does it, at any point ("/next", "what now?", "what should I work on?", "which command for ...?"): what waits from outside (security alerts, updates, issues off the board), then the one to three cards to start, ranked by a script from the owner's labels, each with its reason and command. Read-only.
model: haiku
---

# /next  or  /next <which command for ...?>

Change no file. Read no code. At most eight lines.

**Asked which command** for something ("how do I check what this costs?", "where do I start the deploy?"): find it in
`docs/WORKFLOW.md`, *The commands, by stage* (`grep -n` the words, read only that table), and answer with the command and one
line on what it does. Not in the table: say so and offer `/find`. Then stop.

**Otherwise**, three commands:
1. `npm run updates -- --short`: a security alert comes first, in one line, with "deal with it first?".
2. `npm run board -- --next 3`: the cards to start, best first (first version, then value for the effort; a fixed sum of the
   owner's labels). Give each as "#n title: why", and the command to start it: `/work <n>` (a `spike` card: `/spike <n>`;
   a big idea with no pitch yet: `/shape <n>`).
3. Pass on its notes in one line each: cards with no value label ("set them with /shape, or say high, medium or low"), and
   issues waiting off the board (`npm run board -- --inbox`). When it says "the board needs ... decisions", offer
   `/tidy` in one line (it sorts them and names the week's focus).
Nothing to start: say so, and offer `/idea` or `/shape` for the next thing in `docs/PRODUCT.md`; no `docs/PRODUCT.md` and no
cards yet: `/setup`.
