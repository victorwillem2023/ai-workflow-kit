# Design boards

One HTML board per screen or part, drawn by `/ui` (stage 1) on the real style-sheet tokens, with variants A, B, C.

- `png/` holds the pictures of every board (`node scripts/shots.mjs docs/design/<Name>.html ... --out docs/design/png/<n>-<Name>.png`).
- `notes/` holds each board's dated notes (what was agreed, built, changed), one file per board, linked from its row below.
  A new board gets its notes file in the same commit.
- The written rules are in `docs/STYLE.md`; what still has to change is on the board (label `ui`).

| Board | Content |
|---|---|
| 1 | <first board: what it shows> · notes: [01-name.md](notes/01-name.md) |
