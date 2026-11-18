---
name: retro
description: The weekly {{PROJECT}} retro ("/retro", or in plain words: "how did the week go?", "look back on the week"): reads the numbers a script gathers (what shipped per week and the streak, how the code's health moved, what is next), asks the owner what went well and what got in the way, and turns each lesson into a check or a rule through /lesson. About 10 minutes, once a week.
model: sonnet
---

# /retro

Once a week, in a fresh chat in the main folder. The numbers come from scripts; this skill only reads them and asks.

## 1. The numbers

- `npm run retro`: what shipped each week for 8 weeks and the streak, the health moves since a week ago, the next cards.
- `npm run health`: the code-health numbers.
- `npm run cost`: the week's AI use, by command. Give one line of it: the total, and the command that used most.
- **Once a month** also `npm run coverage` (a minute): how much of the code the tests run, and the files with the most lines
  no test runs. Give the figure, and offer a card for the top file when it holds a rule.

Say what they show in four lines at most: the trend, anything that got worse, anything that got better. No praise, no blame:
what happened.

A project that started with debt (an older codebase): say how the baseline moved, and offer one card for the riskiest untested
file when the baseline has not shrunk for a month (`workflow/guides/TAKEOVER.md`, *3. Work the baseline down*).

## 2. Ask the owner

In one AskUserQuestion:
- what went well;
- what got in the way: a check that failed for no reason, a rework, a slow step, a card that was bigger than it looked;
- for each card on the script's *Did it work, due a look* line: what they saw for its sign.

For each of those signs:
- write the answer on its card: `gh issue comment <n> --repo <board.repo> --body "Looked: <what they saw>"`;
- add "Looked: <what they saw>" to its line under *Signs to look at* in `docs/PRODUCT.md` (either one closes it on the list);
- the lesson goes in `docs/PRODUCT.md`, *What we learned*;
- a sign that did not come true becomes a card to rethink the feature (`/idea`), never left unsaid.

## 3. A fix for each thing that got in the way

Propose one fix in one line, the cheapest that lasts: a script or a check when it can be checked, otherwise a line in a skill
or a doc. On a yes, run `/lesson <it>` for it, one at a time.

## 4. Once a month, for a project that runs for others

Only for `project.audience` team or customers:
- `npm run costs`: prices older than 3 months, to check again;
- one suggestion from the platform panel (`/advise platform`: the single most useful change, with its source and cost),
  offered, never pushed;
- whether the sign in `docs/company/ROADMAP.md` for the next stage shows.

## 5. What the week taught about the product

Write three lines at the top of `docs/PRODUCT.md`, *What we learned*, when the week taught something about the product. A
lesson about the workflow goes through `/lesson` instead. Commit only when the owner says so ("Docs: the retro of week <n>").

**This project's own**: when `.claude/project/retro.md` exists, read it before you start: it holds this project's own steps and rules for /retro, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
