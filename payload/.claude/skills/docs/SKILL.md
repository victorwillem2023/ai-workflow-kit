---
name: docs
description: Make a small, clear edit to {{PROJECT}}'s hand-written docs (README.md, the guide in docs/guide/, the other docs/*.md, the CLAUDE.md notes): "/docs mention the new export button in the README", "fix the typos in GUIDE". Never touches code; no commit.
model: haiku
---

# /docs <what to change>

Cheap: a small/free model is enough, because the change is text and easy to check.

**Only these files**: `README.md`, `docs/*.md`, `docs/guide/*.md` (not `docs/MAP.md`, which is generated, nor `docs/media/` or `docs/design/`)
and the `CLAUDE.md` files. Never `src/`, `tests/`, `config/`, `scripts/`, `tools/` or `package.json`. When the request needs
code, or a decision about what the app does, stop and say it belongs in `/work`.

1. **Find the place**: `grep -n` for the words (the guide: `grep -rn <word> docs/guide/`); read only that section.
2. **Edit** in the docs' own style (CLAUDE.md, *Writing style*: short, plain English, built from facts, no jargon). Change only
   what was asked; mention anything else you noticed instead of fixing it. Keep each file's line endings.
3. **Check**: every file path and npm script a doc names must exist. Run `npm run gate` (it checks doc references) and fix what
   it says about your edit.
4. **Don't commit** (CLAUDE.md: no docs-only commits). Report the files changed and the changed lines (`git diff`), and that
   they go in with the next feature's commit unless the owner commits them.
