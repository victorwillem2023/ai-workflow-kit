---
name: advise
description: The {{PROJECT}} advisory board ("/advise platform would Cloud Run suit us better", "/advise buy or host routing", "/advise roadmap", "/advise growth why do visitors not sign up", "/advise ai" for where AI could make the app better, "/advise" alone for what it would change): a panel of AI advisors (cloud architect, infrastructure and DevOps engineer, sysadmin, FinOps, security, product strategist, growth, AI product engineer), each reading the official docs before answering, answer apart; the chair compares them and gives a recommendation, a pilot to test it, the pages to read, and a proposed decision record. The owner decides. Read-only. Run from the main folder.
model: opus
---

# /advise [panel] [question]

**Which command**: `/advise` helps choose between options; `/estimate` says what one chosen change costs in work and money.
A question that is really "what would X cost?" goes to `/estimate`; an estimate that turns up a real choice comes back here.
The panels and the docs servers: `docs/company/ADVISORS.md`; the docs rule: `CLAUDE.md`, *Docs before memory*. Panels: `platform`, `architecture` (also `/arch`),
`buy or host`, `roadmap`, `growth`, `ai`. No panel named: pick the one the question needs and say which. No question: the platform
panel looks at the project as it is and names the three changes it would make first.

1. **The brief**, once, short, with file paths: the question and the options on the table (add "do nothing yet" when it is
   real); `docs/PRODUCT.md`, `docs/company/ROADMAP.md` (the stage; for the `roadmap` panel also `docs/company/STAGES.md`, what each stage needs and its sign), `project.audience` and `launch` in the config, `docs/company/COSTS.md` (via
   `npm run costs`), `docs/STACK.md`, earlier records in `docs/decisions/`, the last load test and SecOps numbers when they bear
   on it. Never secrets, `.env`, or personal or health data in the brief.
   For the `ai` panel also `docs/workflow/AI-AGENTS.md` (*Where AI could make the app better*), `security.egress`,
   `sensitive.paths` and every line in `CLAUDE.md`, the folder notes and `docs/PRODUCT.md` about data that never goes to a
   model or leaves the app: the brief starts with those rules, and an idea that needs such data is out before it is weighed.
   Each advisor names, for each use it proposes, what the person gets in plain words ("a three-line summary of the week"), the
   cost per use and a month from the price page, and why code alone would not do; "none for now" is a full answer.
2. **The advisors, in parallel and apart**: at most three, chosen from the panel's roles (`docs/company/ADVISORS.md`) for what this
   question needs most; say which and why in one line. More only when the owner asks for them or names them. One subagent per
   advisor, all in one message, model `sonnet`, each given the brief and its role. Each must, before answering, look up every platform or product fact it relies
   on in the official docs (a docs MCP server if the project has one, else the docs pages) and cite the link; a fact it could
   not check is marked "not checked". Each answers in at most 25 lines: what it recommends and why, the two biggest risks of
   each option, the cost a month now and at 10 times (with the price page), what would change its mind, and, where useful,
   **a pilot** (the smallest real try: what, for how long, the success measure, the cost cap, how to undo it) and **two or
   three official pages** worth reading first. They may read files and docs; they write nothing.
3. **The board's view**: a table (options down, advisors across, a few words each); where they agree; where they disagree and
   the real trade-off in plain words; the unknowns and the cheapest way to settle each (often the pilot). Your recommendation
   as the chair, its cost from the advisors' sources, and the links. Never hide a dissent; never present an unchecked fact as
   checked.
4. **Offer the next step**, the owner picks: discuss (answer their questions, the advisors' sources at hand), read first (the
   pages), a pilot (`/spike` card with the pilot's measure and cost cap), an estimate (`/estimate`), or a decision.
5. **The record**, on a decision: `docs/decisions/<date>-<topic>.md`, status **proposed**, then **accepted** or **rejected**
   with why on the owner's word: the question, the options, the board's table, the sources, the cost, the consequences, and
   *Reopen when*. An `ai` decision is `docs/decisions/<date>-ai.md` even when the answer is "none for now" (then `/next` stops asking), and each use taken becomes a card through `/idea`. A roadmap decision also updates `docs/company/ROADMAP.md`; a buy-or-host one adds its line to `docs/company/COSTS.md`.
   The cards it needs come from `/idea`. No commit from this skill: the record goes in with the first card that builds it.

**This project's own**: when `.claude/project/advise.md` exists, read it before you start: it holds this project's own steps and rules for /advise, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
