---
name: next
description: Say what to do next in {{PROJECT}}, at any point ("/next", "what now?", "what should I work on?"): what waits from outside (security alerts, updates, issues off the board), then the one to three cards to start, ranked by a script from the owner's labels, each with its reason. Read-only.
model: haiku
---

# /next

Change no file. Read no doc and no code. Three commands, then at most eight lines.

1. `npm run updates -- --short`: a security alert comes first, in one line, with "deal with it first?".
2. `npm run board -- --next 3`: the cards to start, best first (first version, then value for the effort; a fixed sum of the
   owner's labels). Give each as "#n title: why", and the command to start it: `/work <n>` (a `spike` card: `/spike <n>`;
   a big idea with no pitch yet: `/shape <n>`).
3. Pass on its notes in one line each: cards with no value label ("set them with /shape, or say high, medium or low"), and
   issues waiting off the board (`npm run board -- --inbox`).
Nothing to start: say so, and offer `/idea` or `/shape` for the next thing in `docs/PRODUCT.md`.
