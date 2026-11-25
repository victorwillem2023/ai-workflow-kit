# Spec: <topic>

Card: #<n> (`npm run board -- --show <n>`; cards combined into one commit: #<n>, #<m>), type <ui | feature | bug | workflow>
End state: <the best version, in one sentence>. This spec: <is it | a step toward it, because <reason>; the rest is card #<n>>
Flow: <the flow and the job this card changes (`docs/anatomy/<flow>.md`) | a new job or a second home for one: <which> (two designs, `/spec` step 2) | none>
Design not taken: <none: one design was drafted | the other design in one line, and why it lost (`/spec` step 2, two designs)>
Start-up cost: <none: no page loads more at start | +<n> KB and +<n> ms on <page>'s first screen (the gate's page weight and speed lines), and why it cannot load later>
Starts on: <main | <topic> of a built, unfinished card it needs (`.claude/skills/work/together.md`)>
Beside: <none | #<n> (session <topic>) changes <file> too: the rule both follow there (`node workflow/scripts/session.mjs --beside <topic>`)>
Card stays open after this spec: <no | yes, what is left>
Owner approval: <not yet | approved on YYYY-MM-DD>
Session: `node workflow/scripts/session.mjs <topic>` (folder `../{{PREFIX}}-<topic>`)

## What the user sees
Plain words: what changes on screen or in the results. No file names here.

## The rule and who shares it
A fix, or a change to a rule every feature keeps to: the rule in one line, its row in `docs/ARCHITECTURE.md` (*Rules and where
each lives*), and the kinds of case that share it. The change goes in the rule's home. Anything else: "none".

New rules: <none | the rule in one line ("the API only accepts writes from this site", "only this computer may ask") and its row
to add to `docs/ARCHITECTURE.md`, *Rules and where each lives* (its home, its check, who keeps to it as a folder or a pattern, never a list of files); then `docs/ARCHITECTURE.md` is under "Docs that change">

## When it fails
Each thing that can go wrong (bad input, a service down, a missing record): what the person sees, and its error code, so a
test can name it. A change where nothing can fail: "nothing".

Map ends it moves (with the app map): <the ends by their words, and how each moves: gap to built, a new end, a weak one fixed;
or "none">

## Files that change
One line per file: what changes in it. Look in `docs/MAP.md` first. (An update of the kit itself: write "the kit's files" once,
and the files it wrote count as named.)

## Work packages (optional)
Only when the work is big and splits cleanly (several large files, e.g. a refactor). Leave the section out otherwise: one builder does it all.
One line per package: `name`: files it owns (backticked), `after: <name>` if it needs another package done first. A package under
about 300 changed lines is merged into a neighbour. A file belongs to one package only. Shared files (the list under *Parallel work* in CLAUDE.md) are edited by the lead after the last wave, unless one package is named for them.

## How we will know it worked
One sign we can see after it ships (people use it weekly, an error goes away, a number moves, something a user says), where
we look, and when. `/ship` puts it on the card, so the look-back is not forgotten. "Nothing to measure" is fine for a fix.

## Tests (written first)
Each as a test name that says what the app now does, and the file it goes in.
For `src/core` / `src/pipeline` a behaviour change needs one. Hostile input: add a test for each refused case.

## Docs that change
The guide part (`docs/guide/<part>.md`), `README.md`, `docs/ARCHITECTURE.md`, or "none".

## Security triggers
New endpoint, file reader or outbound fetch? yes/no. If yes: limits (body size, count, rate) and run a security review before finish.
Untrusted input read? yes/no.
Who may do it: <who may read and change it, and what everyone else gets (`workflow/guides/PERMISSIONS.md`); "no change">
Stored data changed (a table, column, query or migration)? yes/no. If yes: the migration, whether it destroys anything (the
owner's yes), the constraint and the index (`workflow/guides/DATA.md`).
A hot path (a list, a search, a page many people open, a job that runs often)? yes/no. If yes: the query plan and the load test to
run (`docs/run/PERFORMANCE.md`).
Calls a language model, or gives one tools? yes/no. If yes: what goes in (personal? untrusted?), how the answer is checked, which
tools need a person's click, the cost per use and the cap, and the hostile cases added (`workflow/guides/AI-SECURITY.md`, *Before it ships*).
Sensitive file touched (`sensitive.paths`: money, health, legal texts, personal data)? yes/no. If yes: fill *Sources*; the owner
signs off with `npm run signoff` before the commit.

## Sources (only when a sensitive file is touched)
One line per number, rate, limit, rule or legal sentence the code will hold: what it is, its value, and where it comes from (a
law and its article, a contract clause, a price list with its date, a file in `docs/sources/`). No source: an open question for
the owner, never a value from memory.

## Suggested model for the build
One line: **Sonnet** (or the OpenCode `model`) by default: the plan decides every seam, file and test name, so the build is coding;
**Opus** when the build still needs a design decision (unclear seam, new shared type, tricky algorithm) or touches a sensitive
file. A free model only for docs and copy that are easy to check. Add one reason.

## Out of scope
Things noticed but not part of this change.

## Status (updated at the end of every session)
- Done:
- Open:
- Questions for the owner: each a choice, with your recommendation and what each answer changes, with an example ("A race
  on a Monday: plan the long run on the Saturday before (recommended) or the Sunday? Saturday gives a rest day before it").
- Later: work noticed and left out, one line each (a title and why it matters). Each becomes a card at the hand-over. No
  bare "not sure about X": every open point is a question or a later card.
