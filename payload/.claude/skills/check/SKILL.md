---
name: check
description: Run the {{PROJECT}} checks and explain what failed in plain words, without changing anything ("/check", "/check all", "why does the gate fail?"). Read-only; never fixes, never commits.
model: haiku
---

# /check [all]

Cheap and read-only: a small/free model is enough. Change no file, commit nothing, start no server.
Run from the folder whose changes you want checked (the main folder or a session folder).

1. **Run the checks**: `npm run gate`, or `npm run gate:all` when the argument is `all` or a feature is about to be finished.
   The gate is quiet when it passes: then say "Gate passed." (or "Full gate passed.") and stop.
2. **Explain each failure**, grouped when several are the same: which check (layers, file size, docs, typecheck, tests), the
   file and line, what it says in one plain sentence, and the likely cause in one more. Read only the lines around a failure
   (`grep -n`, `sed -n`), never whole files. Never read the paths under *Never read* in CLAUDE.md.
3. **End with one line**: what to fix first. Don't fix it: that is for the session working on the change (`/work`).
   At most about 15 lines in all.
