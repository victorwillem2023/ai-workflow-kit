---
name: find
description: Answer a question about where something is or how it works in the {{PROJECT}} code ("/find where are dates parsed", "how does the importer pick a format?") with file paths and line numbers. Read-only.
model: haiku
---

# /find <a question>

Cheap and read-only: a small or free model is enough. Change no file. Follow CLAUDE.md, *Reading the code cheaply*, and never
read the paths under *Never read* there.

1. **Search the map, one word first**: `npm run map -- --find <the most telling word>`. A line must hold every word you give,
   so two words often find nothing.
   - Too many lines: add a second word. Nothing: try a synonym.
   - `--find` leaves the imports out; `--imports` adds them. `npm run map -- --uses <file>` lists who imports a file.
   - Never read `docs/MAP.md` whole: it grows with the code.
2. **Look closer**: `head -5` of the likely files, then `grep -n` for the function or the word. Read only the range you need:
   at most about 80 lines a file, and three files.
3. **Answer in about 10 lines at most**: the places (`path:line`), what each does, and how they connect. Say what you are not
   sure of. When the question needs a design judgment, or more than three files, say so and suggest asking the stronger model.

**This project's own**: when `.claude/project/find.md` exists, read it before you start: it holds this project's own steps and rules for /find, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
