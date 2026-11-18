---
name: docs
description: Make a small, clear edit to {{PROJECT}}'s hand-written docs (README.md, the guide in docs/guide/, the other docs/*.md, the CLAUDE.md notes): "/docs mention the new export button in the README", "fix the typos in GUIDE"; or "/docs catch-up", one pass that brings the user guide and the app map up to every feature shipped since the last one. Never touches code; no commit.
model: sonnet
---

# /docs <what to change>  or  /docs catch-up

The change is text and easy to check, so keep it cheap: read by the section, never a doc whole.

**Only these files**: `README.md`, `docs/*.md`, `docs/guide/*.md` and the `CLAUDE.md` files.
- Not `docs/MAP.md` (it is generated), `docs/media/` or `docs/design/`.
- Never `src/`, `tests/`, `config/`, `scripts/`, `tools/` or `package.json`.
- When the request needs code, or a decision about what the app does: stop, and say it belongs in `/work`.

## A small edit

1. **Find the place**: `grep -n` for the words (in the guide: `grep -rn <word> docs/guide/`), and read only that section.
2. **Edit** in the docs' own style (CLAUDE.md, *Writing style*: short, plain English, built from facts, no jargon). Change
   only what was asked; mention anything else you noticed instead of fixing it. Keep each file's line endings.
3. **Check**: every file path and npm script a doc names must exist. Run `npm run gate` (it checks doc references) and fix
   what it says about your edit.

## `/docs catch-up`

In a phase where the guide and the app map wait (`npm run levels` says so), this one pass brings them up for every feature
since the last pass, instead of a little in every card. `/next` offers it once five features wait.

- **What changed since the last pass.** `docs/.caught-up` holds the last commit the previous pass covered. A card that updated
  the guide itself does not move it, so no feature before it is skipped.
  - The list: `git log --format='%h %s' <that hash>..HEAD`.
  - No file yet, or its commit is no longer on main (`git merge-base --is-ancestor <hash> HEAD` fails: the owner's squash
    rewrote it): the commits since its date (`git log --since=<its date>`), or the last 20 when there is no date either. Say
    which in the report.
  - For each feature, only `git show --stat <hash>`. Read its code only where the subject leaves a doubt.
- **The guide**: for each feature, the part of `docs/guide/` it changed (`docs/GUIDE.md` lists the parts): what a person can
  now do, in the guide's words.
- **The app map** (`docs/flow/map.js`, when the project has it; an allowed file in this pass): the ends each feature moved,
  and each touched decision's file (`f: 'src/...'`). `npm run gate`'s map lines name the stale ones.
- **Last, write `docs/.caught-up`**: one line, `<the full hash of HEAD> <today>`.
- One report, one line per feature, then step 4. The changes go in as the project chose, like every note: on their own, or
  with the next feature's commit.

## 4. Don't commit

Report the files changed and the changed lines (`git diff`), and that the next `/ship` puts them in, as the project chose
(`commits.notes`):
- as their own commit, after the quick gate (`node workflow/scripts/session.mjs --commit-notes`, which the owner can also run now);
- or with the feature's commit.

**This project's own**: when `.claude/project/docs.md` exists, read it before you start: it holds this project's own steps and rules for /docs, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
