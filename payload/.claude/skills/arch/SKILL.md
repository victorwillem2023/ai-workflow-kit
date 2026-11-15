---
name: arch
description: The {{PROJECT}} architecture board ("/arch one repo or several for the portal?", "/arch should we split the importer out"): several AI reviewers, each with one point of view (simplicity and cost, operations and scale, security and data, product and time), answer the same question on their own; the chair compares them and writes a proposed decision record. The owner decides. Read-only on the code. Run from the main folder.
model: opus
---

# /arch <question>  or  /arch <card number>

For decisions that are hard to undo: a new service or datastore, a platform or provider, a boundary, the repository shape.
The board and its roles: `docs/SCALING.md`, *The architecture board*. Small or easily undone questions do not need it: say so
and answer directly.

1. **The question and the facts.** Put the question in one sentence with the options on the table (two to four; add "do
   nothing yet" when it is real). Gather the facts once, short, with file paths: `docs/PRODUCT.md` (users, load), `docs/STACK.md`,
   `docs/ARCHITECTURE.md` (by `grep -n`), `launch` and `boundaries` in `workflow.config.json`, `docs/decisions/` (earlier
   decisions on the same thing), the load test's last numbers, the card. Never read code whole; `npm run map -- --find <word>`.
   No secrets, no `.env`, no personal or health data in the brief.
2. **The reviewers, in parallel, apart.** Start one subagent per role with the Agent tool, all in one message, model `sonnet`
   (enough for a position, a quarter of the price), each given only the brief from step 1 and its role:
   - *simplicity and cost*: the smallest thing that works; the cost a month and in hours of work, now and at 10 times the users;
   - *operations and scale*: what breaks first under load, how it is deployed, watched, backed up and recovered, who is woken;
   - *security and data*: where each kind of data goes, who can reach it, the EU and `docs/SENSITIVE.md`, the attack surface;
   - *product and time*: what it does to the next three months of the board, what it makes easy or hard to build next.
   Each answers in at most 25 lines: the option it recommends, the two biggest risks of each option, what would change its
   mind, and the evidence (a file, a number, a doc line; "unknown" when there is none). They may read files; they write nothing.
   Add a fifth role only when the question needs it (for example *a customer's IT department* for an on-prem request).
3. **The board's view.** A table: options down, roles across, each cell the role's verdict in a few words. Then: where all
   agree; where they disagree and why (the real trade-off, in plain words); what is unknown and how to find out cheaply (often
   a `/spike`). Your recommendation as the chair, and what it costs. Never hide a dissent.
4. **The record.** Write `docs/decisions/<date>-<topic>.md` with status **proposed**: the question, the options, the board's
   table, the recommendation, the consequences (what gets easier, what harder, what it costs), and *Reopen when* (the facts
   that would change it). Stop for the owner.
5. **The owner decides.** On their choice set the status to **accepted** (or **rejected**, with why), and name the cards it
   needs (`/idea`); a choice that changes `docs/STACK.md`, `docs/LAUNCH.md`'s answers in `launch`, or `boundaries` says so, and
   those change in the card that builds it, not here. No commit from this skill: the record goes in with the commit of the
   first card that builds it.
