---
name: spec
description: Write the spec for a new {{PROJECT}} feature (what the user sees, files, tests, docs, security) in workflow/specs/<topic>.md and wait for the owner's approval. Use before any feature bigger than a small fix.
model: opus
---

# /spec <card number>  or  /spec <card numbers>  or  /spec <topic>

Plan before code. Write no source code in this skill.
The backlog is the GitHub board (`workflow/tools/README.md`, *Board*). Given a card number (`/spec 42`), the spec is for
that card; given several (`/spec 42,43`), name the topic after them and list every card in the spec. If the cards touch
separate areas or can ship alone, suggest splitting them into several specs. Given only a topic, ask whether a card
exists (or make one with `npm run board -- --add "<title>" --label <type>`). `/work <n>` calls this skill for a card.

0. A card that needs a pitch (`npm run levels -- --needs pitch <its effort>` says yes: large cards in production, none in a
   prototype), or a new part of the product, with no *Pitch* comment from `/shape` on it: run `/shape <n>`
   first (the pitch page: problem, first users, the smallest version, the stop rule). Ship the narrowest version first; the
   rest of the vision becomes cards for later, not this spec.
1. Read the card: `npm run board -- --show <n>` (title, column, labels, text). Never read the whole board.
   Its type label (`ui`, `feature`, `bug`, `workflow`; a `spike` card goes to /spike, not a spec) goes on the spec's "Card:" line; a card with none: ask which.
   Find what the feature does now in the guide part for it (`docs/GUIDE.md` lists them; open only that file in `docs/guide/`) and the files in `docs/MAP.md` (search them, don't read them
   whole) and open only the ranges you need.
2. **The end state first**: say in one sentence what the best version of this is (the design that scales and that nobody
   would want to redo), before choosing anything. It goes on the spec's "End state:" line; the gate refuses an approved spec
   without it. Then ask the owner the open questions (use AskUserQuestion; only real decisions, with a recommendation).
   **Every choice between designs** labels each option *end state* or *a step*, and recommends the end state. A step is
   recommended only for a named reason: it needs another card first, it is far bigger than the card's effort, or no test
   covers the code it changes yet. **In a prototype** (`npm run levels` names the phase) a step is the default whenever the
   end state is bigger than the card: the product may still change under it, so learn first. The End state line and its
   card are still written, so nothing is forgotten. An option that adds a special case beside the general rule (an `if` for one kind of input,
   a second way of doing a job the code already does) is always a step, never the end state: extend the rule's home instead.
   The same holds for infra (a stack, a module, a pipeline) and docs (a doc that grew into a list, two docs saying one thing).
   **The end state needs a split or a refactor first** (a file past its size, a rule living in two places, a stack shaped for
   one server, a module that knows too much): plan it, never build around it. It goes in this spec when it fits the card's
   effort; otherwise make a refactor card now (no behaviour change, the same test results before and after), put
   `Depends on: #<refactor card>` on this card (`npm run board -- --depends <this> <refactor>`), and offer to do that one first.
   **A step recommended**: make the end-state card in the same go (`npm run board -- --add "<title>" --label <type> --body-file
   <file>`, the body ending `Depends on: #<this card>`), and put its number on the End state line (`the rest is card #<n>`).
   Then, only when it applies:
   - **Hard to undo** (a new service or datastore, a platform or provider, a boundary): suggest `/arch` first (the architecture
     board, `docs/run/SCALING.md`) and write the spec on its accepted decision.
   - **Under `infra/`**: the spec names what it expects the plan to do; that becomes the stack's `plan.expect` (`docs/run/IAC.md`).
   - **AI or plain code**: the card's job is a use in `workflow/guides/AI-AGENTS.md` (*Where AI could make the app better*) and the
     project's rules let its data go to a model: one question, "Do it with AI (<what the person gets>, about <cost> per use) or
     plainly in code (<what that gives>)?", plain code first when it does the job. With AI the spec follows
     `workflow/guides/AI-SECURITY.md`; no `src/server/ai.ts` yet: `node <kit>/install.mjs . --update --with ai` adds it first. A fact
     the app relies on stays in code either way.
3. Copy `workflow/tools/templates/spec.md` to `workflow/specs/<topic>.md`, put the card number(s) on its "Card:" line, and fill
   every section (the "Card stays open after this spec" line says `yes, what is left` when the card is only partly done, so `/ship` keeps it in In progress). Short, plain English.
   - The rule and who shares it: `grep -n` the rule's row in `docs/ARCHITECTURE.md`, *Rules and where each lives*; the change goes in
     the file that row names, and the spec lists the kinds of case that share it (CLAUDE.md, 11 to 14).
   - **When it fails**: for each thing that can go wrong (bad input, a service down, a missing record), the error the person
     sees and its code, so the tests can name them ("refuses a race date in the past with that reason").
   - **New rules**: ask it every time, never skip the line: does this change add a rule the code will keep to from now on (who may
     call, where writes may come from, a limit, a format every caller must use)? A new endpoint, a new check on input or a new
     permission usually does. Yes: the rule in one line and its new row, and `docs/ARCHITECTURE.md` goes under "Docs that change"
     so `/ship` holds the commit to it. No: "none".
   - **Docs that change**: the user guide part and the app map go there only when `npm run levels -- --needs upkeep <effort>`
     says yes; otherwise the line says "guide and app map: the next `/docs catch-up`". `docs/ARCHITECTURE.md` for a new rule
     always goes there. Never `docs/MAP.md` or `docs/README.md`: they are generated at `--finish`.
   - Tests: name each as what the app now does; behaviour in `src/core` or `src/pipeline` needs one. Which level each
     belongs to, and the tests a route, a bug or a query always brings: `workflow/guides/TESTING.md`, *What every change needs*.
   - Security: any new endpoint, file reader or outbound fetch gets limits listed and a `security-review` before finish.
     A new endpoint follows `workflow/guides/API.md` (schema, errors, paging, limits, who may call it); a new outside host goes in
     `security.egress` (the owner says yes: what data goes there).
   - **When the change has one of these, read its section in `.claude/skills/spec/when.md`** (and only that one): the app map
     module; stored data; a new route, screen or stored thing (who may do it); a `ui` card; a screen; email, payments, uploads,
     a scheduled job or dates; code no test reaches yet; a big job that might split into work packages; a sensitive file.
4. Fill in "Suggested model for the build" (Sonnet by default: the plan is decided, building it is coding; Opus only if a design
   decision is left or a sensitive file is touched, with one reason).
   Show the owner a summary, including that line, and stop with one line: "Happy with it? Open a new chat here and type
   `/build <topic>`: that is your yes, and it builds it. Want changes? Say them here."
5. Changes asked for: change the spec and show the summary again. There is no separate "yes" step: `/build` records the approval
   and moves the card to Ready (`.claude/skills/build/SKILL.md`, step 1).
6. Building happens in that new chat: `/build <topic>` makes the session folder and starts a builder that reads the spec and
   the CLAUDE.md of each folder it touches, not this chat. It writes the tests first, and updates `## Status` at the end.

Finished features wait on the local `main` until the owner runs `node workflow/scripts/session.mjs --push`; a new session starts from them.

One spec, one feature, one commit. The spec file is deleted in the feature's commit (see /ship).

**This project's own**: when `.claude/project/spec.md` exists, read it before you start: it holds this project's own steps and rules for /spec, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
