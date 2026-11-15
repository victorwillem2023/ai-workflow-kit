# Spec: <topic>

Card: #<n> (`npm run board -- --show <n>`), type <ui | feature | bug | workflow>
Card stays open after this spec: <no | yes, what is left>
Owner approval: <not yet | approved on YYYY-MM-DD>
Session: `node scripts/session.mjs <topic>` (folder `../{{PREFIX}}-<topic>`)

## What the user sees
Plain words: what changes on screen or in the results. No file names here.

## The rule and who shares it
A fix, or a change to a rule every feature keeps to: the rule in one line, its row in `docs/ARCHITECTURE.md` (*Rules and where
each lives*), and the kinds of case that share it. The change goes in the rule's home. Anything else: "none".

## Files that change
One line per file: what changes in it. Look in `docs/MAP.md` first.

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
Calls a language model, or gives one tools? yes/no. If yes: what goes in (personal? untrusted?), how the answer is checked, which
tools need a person's click, the cost per use and the cap, and the hostile cases added (`docs/AI-SECURITY.md`, *Before it ships*).
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
- Unsure:
