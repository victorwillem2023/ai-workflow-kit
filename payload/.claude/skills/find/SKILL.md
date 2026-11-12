---
name: find
description: Answer a question about where something is or how it works in the {{PROJECT}} code ("/find where are dates parsed", "how does the importer pick a format?") with file paths and line numbers. Read-only.
model: haiku
---

# /find <a question>

Cheap and read-only: a small/free model is enough. Change no file. Follow CLAUDE.md, *Reading the code cheaply*.

1. **Search the map, one word first**: `npm run map -- --find <the most telling word>` (a line must hold every word you
   give, so two words often find nothing). Too many lines: add a second word. Nothing: try a synonym.
   `npm run map -- --uses <file>` lists who imports a file; `--find` leaves the imports out (`--imports` adds them). Never read `docs/MAP.md` whole (it grows with the code).
2. **Look closer**: `head -5` of the likely files, then `grep -n` for the function or word. Read only the range you need:
   at most about 80 lines a file and three files.
3. **Answer in at most about 10 lines**: the places (`path:line`), what each does, how they connect. Say what you are not sure
   of. When the question needs a design judgment or more than three files, say so and suggest asking the stronger model.

Never read the paths under *Never read* in CLAUDE.md.
