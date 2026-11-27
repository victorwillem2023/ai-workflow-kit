---
name: spec
description: Write the spec for a new {{PROJECT}} feature (what the user sees, files, tests, docs, security) in workflow/specs/<topic>.md and wait for the owner's approval. Use before any feature bigger than a small fix.
model: opus
---

# /spec <card number>  or  /spec <card numbers>  or  /spec <topic>

Plan before code: this skill writes no source code. The backlog is the GitHub board (`workflow/tools/README.md`, *Board*).

- **One card** (`/spec 42`): the spec is for that card. `/work <n>` calls this skill for a card.
- **Several cards** (`/spec 42,43`): name the topic after them and list every card in the spec. If they touch separate areas
  or could ship alone, suggest splitting them into several specs.
- **Only a topic**: ask whether a card exists, or make one: `npm run board -- --add "<title>" --label <type>`.

## 0. A pitch first, when one is needed

Run `/shape <n>` first when the card has no *Pitch* comment from `/shape` and either
`npm run levels -- --needs pitch <its effort>` says yes (large cards in production, none in a prototype) or it starts a new
part of the product. The pitch page
names the problem, the first users, the smallest version and the stop rule. Ship that narrowest version first; the rest of
the vision becomes cards for later, not this spec.

## 1. Read the card and what is there now

- `npm run board -- --show <n>`: its title, column, labels and text. Never read the whole board.
  - A `code:` line in it names a file this card is likely to change that is already costly (changed often and too big, no
    test, in the way of earlier cards). Open that file before you choose a design: it is the first candidate for *When the
    end state needs a split or a refactor first* in step 2, and the plan says what it does about it.
- Its type label (`ui`, `feature`, `bug` or `workflow`) goes on the spec's "Card:" line. A card with none: ask which. A
  `spike` card goes to `/spike`, not a spec.
- **The flow and the job**: the flow this card changes has a page, `docs/anatomy/<flow>.md` (the list: `docs/ARCHITECTURE.md`,
  *Flows and their jobs*); name the flow and the job on the spec's "Flow:" line. A flow with no page yet: write it as the code
  is now (`docs/anatomy/README.md` has the shape; `/anatomy <flow>` does it in full), under *Docs that change*. Each job the change does goes to its home.
- What the feature does today: `docs/GUIDE.md` lists the guide's parts; open only the part for it in `docs/guide/`.
- The files: search `docs/MAP.md` (never read it whole), then open only the line ranges you need.

## 2. The end state first, then the owner's questions

**Say in one sentence what the best version of this is**: the design that scales and that nobody would want to redo. Do
this before choosing anything. It goes on the spec's "End state:" line; the gate refuses an approved spec without it.

Then ask the owner the open questions (AskUserQuestion): only real decisions, each with your recommendation.

**Every choice between designs** labels each option *end state* or *a step*, and recommends the end state. A card that says how
to build it is the owner's first thought: a better way is named and recommended beside it, and the owner picks.

- A step is recommended only for a named reason: it needs another card first, it is far bigger than the card's effort, or
  no test covers the code it changes yet.
- **In a prototype** (`npm run levels` names the phase), a step is the default whenever the end state is bigger than the
  card: the product may still change under it, so learn first. The End state line and its card are still written, so nothing
  is forgotten.
- An option that adds a special case beside the general rule (an `if` for one kind of input, or a second way of doing a job
  the code already does) is always a step, never the end state: extend the rule's home instead. The same holds for infra (a
  second stack, module or pipeline) and for docs (a doc that grew into a list, two docs saying one thing).

**Two designs, drafted apart, for a card that is worth it.** One author writes one design and then defends it. So when
`npm run levels -- --needs designs <its effort>` says yes (large cards once people use the app, none in a prototype), or
the change is hard to undo whatever its size, or **in any phase** the card adds a flow or a job, gives a job a second home,
or is the step back a `step back:` line asked for (`npm run board -- --next`), do this before the owner's questions (in a
prototype too: that is when the shapes form and when they are cheapest to get right):

1. Start two subagents at the same time (the Task tool, on the strong model), each with the card's text, the End state line,
   the files step 1 found, and one of these two briefs. Neither sees this chat or the other's draft.
   - **The smallest change**: "The design that changes the fewest files and adds the least. Take away or reuse before you
     add. Say what it cannot do that the end state asks for."
   - **The end state**: "The design nobody would want to redo, as if the code were written today. Say what has to move or be
     split first, and what it costs."

   Each answers in at most thirty lines: the seam (where the new code meets the old), the files that change, what it moves
   or deletes, the tests it needs, and its one biggest risk.
2. Put them side by side on the same five lines each: files touched, rules that move or gain a second home, code deleted
   against code added, what is hard to undo, what the next card on this part of the app would have to redo.
3. Choose, or join the best of both. The choice is one of the owner's questions when the two differ in what the person
   using the app gets or in more than a session of work; otherwise decide, and say why in one line.
4. The one not taken goes on the spec's "Design not taken:" line with the reason, so `/review` can tell whether the build
   drifted into it and whether the reason still held.

A card below that size gets one design: the comparison costs two drafts, and a small card does not pay them back.

**When the end state needs a split or a refactor first** (a file past its size, a rule living in two places, a stack shaped
for one server, a module that knows too much): plan it, never build around it.

- It fits the card's effort: it goes in this spec.
- It does not: make a refactor card now (no behaviour change, the same test results before and after), write the dependency
  on this card (`npm run board -- --depends <this> <refactor>`, which adds `Depends on: #<refactor card>`), and offer to do the
  refactor first.

**When a step is recommended**: make the end-state card in the same go, its body ending with `Depends on: #<this card>`:

    npm run board -- --add "<title>" --label <type> --body-file <file> --unsorted

It waits for the owner's yes with the spec's (`--accept <n>` when the spec is approved, and `--focus --add <n>` while a goal is picked). Then put its number on the End state line (`the rest is card #<n>`).

**Only when it applies:**

- **How it moves or feels** (gestures, scrolling, animation, loading): the End state line names the best known way
  (`workflow/guides/SCREENS.md`, *Feel*); a part still to prove on the phone is a spike first, not a spec.
- **Used on a phone** (`npm run surfaces` has a phone width): the "On the phone:" line says what the phone shows, planned with
  the computer's view, so neither is built twice. A state both draw is an entry in `views` (`workflow/config.json`): its
  new fields are drawn on both, or go under `only` with why (the gate's *views* check).
- **Hard to undo** (a new service or datastore, a platform or provider, a boundary): suggest `/arch` first (the architecture
  board, `docs/run/SCALING.md`), and write the spec on the decision it accepts.
- **Under `infra/`**: the spec names what it expects the plan to do; that becomes the stack's `plan.expect` (`docs/run/IAC.md`).
- **AI or plain code**: when the card's job is one of the uses in `workflow/guides/AI-AGENTS.md` (*Where AI could make the app
  better*) and the project's rules let its data go to a model, ask one question: "Do it with AI (<what the person gets>, about
  <cost> per use) or plainly in code (<what that gives>)?" Recommend plain code when it does the job. With AI, the spec follows
  `workflow/guides/AI-SECURITY.md`; when there is no `src/server/ai.ts` yet, `node <kit>/install.mjs . --update --with ai` adds
  it first. A fact the app relies on stays in code either way.

## 3. Write the spec

Copy `workflow/tools/templates/spec.md` to `workflow/specs/<topic>.md`, put the card number(s) on its "Card:" line, and fill
in every section in short, plain English. When the card is only partly done, the "Card stays open after this spec" line says
`yes, what is left`, so `/ship` keeps the card in *In progress*.

- **The rule and who shares it**: `grep -n` the rule's row in `docs/ARCHITECTURE.md`, *Rules and where each lives*. The change
  goes in the file that row names, and the spec lists the kinds of case that share the rule (CLAUDE.md, rules 11 to 14).
- **When it fails**: for each thing that can go wrong (bad input, a service down, a missing record), the error the person
  sees and its code, so the tests can name them ("refuses a race date in the past with that reason").
- **New rules**: ask this every time and never skip the line. Does the change add a rule the code keeps from now on: who may
  call, where writes may come from, a limit, a format every caller must use? A new endpoint, a new check on input or a new
  permission usually does.
  - Yes: the rule in one line and its new row, and `docs/ARCHITECTURE.md` goes under "Docs that change", so `/ship` holds the
    commit to it.
  - No: "none".
- **Docs that change**:
  - The user guide part and the app map go here only when `npm run levels -- --needs upkeep <effort>` says yes. Otherwise the
    line says "guide and app map: the next `/docs catch-up`".
  - `docs/ARCHITECTURE.md` for a new rule always goes here.
  - Never `docs/MAP.md` or `docs/README.md`: they are generated at `--finish`.
- **Tests**: name each one as what the app now does. Behaviour in `src/core` or `src/pipeline` needs one. Which level each
  test belongs to, and the tests a route, a bug or a query always brings: `workflow/guides/TESTING.md`, *What every change needs*.
- **Security**: any new endpoint, file reader or outbound fetch gets its limits listed and a `security-review` before finish.
  A new endpoint follows `workflow/guides/API.md` (schema, errors, paging, limits, who may call it). A new outside host goes
  in `security.egress`, once the owner says yes to what data goes there.
- **Beside**: with "Files that change" saved, run `node workflow/scripts/session.mjs --beside <topic>`. For each session it
  names, the "Beside:" line says the rule both follow there (theirs; another is a question in the summary), or "Starts on:" it.
- **When the change has one of these, read its section in `.claude/skills/spec/when.md`**, and only that section: the app map
  module; stored data; a new route, screen or stored thing (who may do it); a `ui` card; a screen; email, payments, uploads,
  a scheduled job or dates; code no test reaches yet; a big job that might split into work packages; a sensitive file.

## 4. The model for the build, then stop

Fill in "Suggested model for the build": Sonnet by default, since the plan is decided and building it is coding; Opus only
when a design decision is left open or a sensitive file is touched, with one reason.

Show the owner a summary, that line included, and stop with one line: "Happy with it? Open a new chat here and type
`/build <topic>`: that is your yes, and it builds it. Want changes? Say them here."

## 5. Changes

Change the spec as asked and show the summary again. There is no separate "yes" step: `/build` records the approval and moves
the card to Ready (`.claude/skills/build/SKILL.md`, step 1).

## 6. The build happens in that new chat

`/build <topic>` makes the session folder and builds from the spec and the CLAUDE.md of each folder it touches, not from this
chat: in its own chat for a small or medium card, by a subagent for a large one. It writes the tests first, and updates the
spec's `## Status` at the end.

---

Finished features wait on the local `main` until the owner runs `node workflow/scripts/session.mjs --push`; a new session
starts from them. One spec, one feature, one commit: the spec file is deleted in the feature's commit (see `/ship`).

**This project's own**: when `.claude/project/spec.md` exists, read it before you start: it holds this project's own steps and rules for /spec, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
