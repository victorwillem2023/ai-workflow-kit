# Spec: <topic>

Card: #<n> (`npm run board -- --show <n>`), type <ui | feature | bug | workflow>
Owner approval: <not yet | approved on YYYY-MM-DD>
Session: `node scripts/session.mjs <topic>` (folder `../{{PREFIX}}-<topic>`)

## What the user sees
Plain words: what changes on screen or in the results. No file names here.

## Files that change
One line per file: what changes in it. Look in `docs/MAP.md` first.

## Work packages (optional)
Only when the work is big and splits cleanly (several large files, e.g. a refactor). Leave the section out otherwise: one builder does it all.
One line per package: `name`: files it owns (backticked), `after: <name>` if it needs another package done first. A package under
about 300 changed lines is merged into a neighbour. A file belongs to one package only. Shared files (the list under "Parallel work" in CLAUDE.md) are edited by the lead after the last wave, unless one package is named for them.

## Tests (written first)
Each as a test name that says what the app now does, and the file it goes in.
For `src/core` / `src/pipeline` a behaviour change needs one. Hostile input: add a test for each refused case.

## Docs that change
`docs/GUIDE.md`, `README.md`, `docs/ARCHITECTURE.md`, or "none".

## Security triggers
New endpoint, file reader or outbound fetch? yes/no. If yes: limits (body size, count, rate) and run `security-review` before finish.
Untrusted input read? yes/no.

## Suggested model for the build
One line: **Sonnet** when the work is mechanical or additive and the spec already decides every seam, file and test name;
**Opus** when the build still needs a design decision (unclear seam, new shared type, tricky algorithm). Add one reason.

## Out of scope
Things noticed but not part of this change.

## Status (updated at the end of every session)
- Done:
- Open:
- Unsure:
