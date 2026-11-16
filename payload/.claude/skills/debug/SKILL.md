---
name: debug
description: Find out why something in {{PROJECT}} goes wrong, from what the owner saw ("/debug saving my goal says something went wrong", "/debug reference 4f2a9c1e", "the plan shows 13 km easy days, why?"): the reference or the request, the log lines that belong to it, the cause found in the code, a failing test that shows it, and then the fix through the usual route. Never guesses a fix before the cause is shown.
model: sonnet
---

# /debug <what went wrong, in the owner's words>

The aim is the cause, shown, before any fix: a fix for a guess moves the problem somewhere else. Stop after step 4 when the owner
only asked why.

1. **What was seen.** In one or two lines: what the owner did, what they expected, what happened instead. Ask once for what
   is missing: the screen and the values used, and **the reference** the error showed ("reference 4f2a...") or the time it
   happened. A failed call on the page also printed it in the console: `POST /api/goal 400: ... (reference ...)`.
2. **Its lines in the log.** With a reference: `node workflow/scripts/logs.mjs <topic> --ref <reference>` for a session's server (no
   topic: `node workflow/scripts/logs.mjs` lists them), or search the main server's output for it. Without one: `--level warn` around
   that time. Read the request's lines in order: the request line (`POST /api/goal 400 12 ms`), what it was doing (`doing=`), the
   ids, and the error with its `caused by` chain: the last cause is usually the real one. No log line at all is a finding in
   itself: that path logs nothing (step 5 adds it).
3. **The place in the code.** `npm run map -- --find <word from the error or the doing>`, then the file and line the error's
   `at` names. Read that function and what calls it, not the whole file. Say the cause in one sentence a person understands,
   and the evidence: the log line and the code line. Not sure yet: say what would tell it apart, and check that first.
4. **Show it with a test.** A failing test named for what the app should do ("refuses a race date in the past with that
   reason"), with the values from step 1, run so it fails for the reason found. When a test cannot reach it (a timing or an
   outside service), say why, and how it was shown instead.
5. **Then fix it through the usual route.** A small fix: the bug route of `/work` (a session folder, the test from step 4
   first, `npm run gate`), handed over as `.claude/skills/build/try-it.md` says. Anything bigger: a `bug` card with the cause
   and the test (`/idea`), so it is planned. In both, close the gap that made it hard to find: an error without its
   `doing` or `cause`, a path that logged nothing, a catch that swallowed the error (CLAUDE.md, *Requests, errors and logs*).
6. **Report**: the cause, the evidence, the test, and the fix or the card. If the same kind of problem could hide elsewhere,
   name where, and offer `/lesson` when it is a rule worth keeping.

**This project's own**: when `.claude/project/debug.md` exists, read it before you start: it holds this project's own steps and rules for /debug, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
