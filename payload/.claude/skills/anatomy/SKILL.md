---
name: anatomy
description: Look at how one part of {{PROJECT}}'s code is built, and plan its clean-up ("/anatomy", "/anatomy to-a-top", "the code feels taped together", "where does this repeat itself?"): a script lists the flows worst first (a kind spread over shared steps, rules written twice, look-alike functions, fixes); you read one flow, write its jobs in order and where each lives now, mark two homes, flags in shared steps and jobs with no home, write the end state, and propose the clean-up as cards in order for a yes. Never changes code. One flow per round. Run from the main folder.
model: opus
---

# /anatomy  or  /anatomy <flow>

The kit's checks stop new duplication; this goes back over code written before them, one flow at a time. A flow is one path
through the app from what someone asks to what they get (a hike to a top, a checkout). Its **jobs** are the steps it takes in
order, and each job should have **one home**: one file and function. The script finds where that is not so; you read the flow
and say what it should be; the owner decides; the cards do it. Nothing in the code changes in this skill.

## 1. Which flow

`npm run anatomy`: the flows, worst first. A flow comes from `anatomy.flows` in `workflow/config.json`, the app map's kinds, or
a kind the code asks about in several shared steps (`shape: loop`). Per flow: its files; how many shared steps ask about it (a
kind check like `shape === 'loop'`, or one of its flags); rules written twice (one name in two files, one list of numbers under
two names); look-alike functions; fixes in four weeks; whether it has a page (`docs/anatomy/<flow>.md`) and when it was looked at.

- **A flow was named**: take it. Otherwise say the first three in plain words ("Hikes to a top: asked about in 14 shared steps,
  a rule written twice, 10 fixes in four weeks") and ask which (AskUserQuestion; the worst one recommended, or the one a
  `step back:` line names).
- The numbers are leads, not verdicts: a coarse app map gives a flow files it hardly uses. Your reading decides.

## 2. Read the flow, write its shape today

`npm run anatomy -- --flow <name>`: its files, each finding with its file and line. Then read only what the flow runs: start at
its entry (the route, command or screen), follow the calls, `head -5` each file and `grep -n` the functions. Never whole folders.

Write the jobs in order (five to twelve), each with where it lives now (file, function). Mark each job that has:

- **two homes**: the same job done in two places (two ways to route the way up, a rule in two files: the script's repeated
  rules and look-alikes point there);
- **a flag in a shared step**: a step every flow runs that asks whether this is that flow (`if (run.wayUp)` in `select.ts`);
- **no clear home**: the job is done in bits across files that are named for other jobs;
- **a name that says another job**: a file whose name says one job while it does another.

When the flow has flags the script does not know yet (properties its shared steps branch on), propose them for
`anatomy.flows`: `"<flow>": { "files": ["<its folder or files>"], "flags": ["wayUp", "mustPass"] }`. From then on the script
counts them everywhere, with no AI, and the next round compares.

## 3. The end state

One sentence: how this flow should be built (".. is one small pipeline in one folder: the top, the ways up, the climb, fitted
to one day or several; the loop planner never runs for a top"). Then each job's target home. Look across flows: a job two
flows both do ("judge whether the goal was reached" for tops and for named trails) is one home both use, not two.

The end state follows the root `CLAUDE.md`: one job, one home (rule 15), a shared step does not ask the kind (rule 14), a rule in
one place (rule 13). Name what has to move or be split first, and what it costs.

## 4. The move plan, as cards

Propose, in this order, each with a title, what it changes, and `Depends on: #<n>` where it needs another:

1. **A before-and-after check first**, when the flow has none: a script or test that runs the flow's real cases and records
   their results (a `measure:<flow>` script), so each refactor can show it changed nothing.
2. **Refactor cards**, in dependency order: each moves code toward its home with no change to what anyone sees (same routes,
   same results, the same tests passing before and after; root `CLAUDE.md` rule 6).
3. **The behaviour cards those refactors unlock**: the fixes that were hard while a job had two homes.

Show the shape, the end state and the plan, then ask (AskUserQuestion): make the cards, change something first, or stop. Only
on yes: each card with `npm run board -- --add "<title>" --label <type> --body-file <file> --unsorted` (refactors in the code
health area when the board has it), and the dependencies with `npm run board -- --depends <n> <m>`.

## 5. Write the page

`docs/anatomy/<flow>.md` (the shape: `docs/anatomy/README.md`): the jobs in order, each one's home today and in the end state,
the marks, the end state and the cards, with today's date on "Looked at". Add its row to `docs/ARCHITECTURE.md`, *Flows and
their jobs*. The page is the owner's doc; commit it with `node workflow/scripts/session.mjs --commit-notes "Anatomy: <flow>"`
when the owner says so. From then on `/spec` names the job a card changes from it, `/review` checks each job against it, and
the next round of `/anatomy <flow>` starts from it and says what moved.

A worked example, the first round done by hand on a real project: `.claude/skills/anatomy/example.md`. Read it on a project's
first round.

**This project's own**: when `.claude/project/anatomy.md` exists, read it before you start: it holds this project's own steps and rules for /anatomy, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
