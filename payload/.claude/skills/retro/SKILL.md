---
name: retro
description: The weekly {{PROJECT}} retro ("/retro", or in plain words: "how did the week go?", "look back on the week"): reads the numbers a script gathers (what shipped per week and the streak, how the code's health moved, what is next), asks the owner what went well and what got in the way, and turns each lesson into a check or a rule through /lesson. About 10 minutes, once a week.
model: sonnet
---

# /retro

Once a week, in a fresh chat in the main folder. The numbers come from scripts; this skill only reads them and asks.

1. `npm run retro` (shipped per week for 8 weeks and the streak, the health moves since a week ago, the next cards) and
   `npm run health` (the code-health numbers). Say what they show in four lines at most: the trend, anything that got worse,
   anything that got better. No praise, no blame: what happened.
2. Ask the owner, in one AskUserQuestion: what went well, what got in the way (a check that failed for no reason, a rework, a
   slow step, a card that was bigger than it looked), and whether anything from *How we will know it worked* is due a look
   (`docs/PRODUCT.md`, *What we learned*).
3. For each thing that got in the way: propose one fix in one line, the cheapest that lasts. A script or check when it can be
   checked, a line in a skill or doc otherwise. On a yes, run `/lesson <it>` for it (one at a time).
4. **Once a month**, for a project that runs for others (`project.audience` team or customers): `npm run costs` (prices older
   than 3 months to check again) and one suggestion from the platform panel (`/advise platform`, the single most useful
   change, with its source and cost), offered, never pushed. And whether `docs/company/ROADMAP.md`'s sign for the next stage shows.
5. Write three lines at the top of `docs/PRODUCT.md`, *What we learned*, when the week taught something about the product
   (not about the workflow: that goes through `/lesson`). Commit only when the owner says so ("Docs: the retro of week <n>").

**This project's own**: when `.claude/project/retro.md` exists, read it before you start: it holds this project's own steps and rules for /retro, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
