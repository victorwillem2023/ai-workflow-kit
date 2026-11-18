---
name: check
description: Run the {{PROJECT}} checks and explain what failed in plain words, without changing anything ("/check", "/check all", "why does the gate fail?"). Read-only; never fixes, never commits.
model: haiku
---

# /check [all]

Cheap and read-only: a small or free model is enough. Change no file, commit nothing, start no server.
Run it from the folder whose changes you want checked: the main folder or a session folder.

1. **Run the checks**:
   - `npm run gate` by default;
   - `npm run gate:all` when the argument is `all`;
   - `npm run gate:ship` when a feature is about to be finished (what /ship runs: the phase in workflow/levels.json decides how much).

   The gate is quiet when it passes: then say "Gate passed." (or "Full gate passed.") and stop.
2. **Explain each failure**, grouping the ones that are the same: which check (layers, file size, docs, typecheck, tests),
   the file and line, what it says in one plain sentence, and the likely cause in one more. Read only the lines around a
   failure (`grep -n`, `sed -n`), never whole files, and never the paths under *Never read* in CLAUDE.md.
3. **End with one line**: what to fix first. Do not fix it: that is for the session working on the change (`/work`).

About 15 lines in all, at most.

**This project's own**: when `.claude/project/check.md` exists, read it before you start: it holds this project's own steps and rules for /check, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
