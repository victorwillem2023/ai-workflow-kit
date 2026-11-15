---
name: estimate
description: Say what a change to {{PROJECT}} would really take before deciding on it ("/estimate 23", "/estimate add live tracking for coaches"): the work (cards, size, what it touches), the running cost a month now and at 10 times the users, the one-off costs, and everything else it brings (security, privacy, data, monitoring, support, docs, lock-in), with cheaper options. From the real numbers in docs/company/COSTS.md and the providers' price pages, never from memory. Read-only. Run from the main folder.
model: opus
---

# /estimate <card number>  or  /estimate <a change in a sentence>

**Which command**: `/estimate` says what one change costs in work and money; `/advise` helps choose between options. A
question that is really "which should we pick?" goes to `/advise`; when the estimate turns up a real choice (paid or
self-hosted, this platform or that), say so and offer `/advise` with the options and the numbers found here.

1. **What it is.** The card (`npm run board -- --show <n>`) or the sentence, said back in two lines: what the user will get,
   and the smallest version of it. Ask one question if the size depends on it ("live for all coaches, or one at a time?").
2. **What it touches**, from the map, not by reading code whole: `npm run map -- --find <word>`, the rules in
   `docs/ARCHITECTURE.md` (by `grep -n`), `launch` in the config, `docs/run/ENVIRONMENTS.md`. List the parts: screens, server, data
   (a new table, a migration), outside services, infrastructure (new resources under `infra/`), the AI wrapper.
3. **The work**: the cards it becomes, each with `effort: small | medium | large` and why; what must come first (a migration, a
   spike for the unknown part); the hours you would plan for it, as a range, and what makes it the high end.
4. **The money**, as a table: one row per new or changed cost: what, provider, now a month, at 10 times the users, one-off,
   source (the price page, read now: `CLAUDE.md`, *Docs before memory*), the date. Start from `npm run costs` (the real
   bill today) so the answer is "from €38 to €61 a month", not a number in the air. Count:
   - servers, storage, data transfer out, a bigger database plan, a new managed service;
   - outside APIs per use (maps, routing, email, SMS, payments' fees), with today's use from the analytics or logs;
   - AI calls: tokens per use times uses, at the prices in the settings (`AI_PRICE_INPUT_USD_PER_MTOK`, `AI_PRICE_OUTPUT_USD_PER_MTOK`; checked against the price page), against the cap (`AI_MONTHLY_BUDGET_USD`);
   - your hours each month to run it (updates, data refreshes, support questions it will bring), at the rate in `docs/company/COSTS.md`.
   Where options differ (paid or self-hosted), write them as JSON and run `npm run costs -- --compare <file>`
   (`docs/run/BUY-OR-HOST.md`).
5. **What else it brings**, only what applies, one line each: personal or sensitive data (`docs/workflow/SENSITIVE.md`, a sign-off), a
   new outside service to list (`security.egress`, the privacy record), a new attack surface (an upload, a public endpoint),
   load and performance (a load test before release), monitoring and alerts, backups of new data, a migration that cannot be
   undone, support and docs, a price change for users, lock-in to one provider, and the law (a medical claim, payments).
   For `project.audience: me`, leave out what only matters for other people.
6. **The verdict**: the cheapest way to get most of the value, the full version, and what you would do; whether it is worth
   it at this stage (`docs/company/ROADMAP.md`). Offer the next step: `/shape` it, a `/spike` for the unknown part, `/advise` for a
   choice with real trade-offs (the panel gets this estimate's numbers), or `/spec` when it is clear. On the owner's yes, put the estimate as a comment on the card
   (`gh issue comment <n> --body-file <file>`), headed **Estimate** with the date.
