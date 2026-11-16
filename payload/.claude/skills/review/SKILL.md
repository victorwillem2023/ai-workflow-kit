---
name: review
description: Review a finished {{PROJECT}} build with fresh eyes before it ships ("/review <topic>"): reads only the spec and the diff, and says in plain words what does not match. Read-only; never fixes, never commits.
model: opus
---

# /review <topic>

`/ship` runs this by itself in a subagent that has not seen the build; the owner can also run it in a new chat. Never in the
chat that built it: the builder does not grade its own work. Change no file.
Work in the session folder `../{{PREFIX}}-<topic>`.

1. Read `specs/<topic>.md`, then `git diff main --stat` and the diff of the files that matter (not generated ones).
2. Answer these, each with the file and line when the answer is no:
   - **Does it do what the spec says the user sees?** Name anything missing, and anything built that the spec never asked for.
   - **Were tests bent to pass?** List every existing test whose expectation changed (`git diff main -- tests`), and whether
     the spec meant that change.
   - **Was a rule copied?** A rule written a second time when it already has a home (`docs/ARCHITECTURE.md`, *Rules and where each lives*).
   - **Does it add a rule with no row?** Something the code now enforces for every caller (writes only from this site, only this
     computer may ask, a new limit or permission) that has no row in that table, whatever the spec's "New rules" line says.
   - **Is anything outside the spec touched?** `npm run gate` prints `scope:` lines for those files.
   - **If it fails, does the log say what and where?** Each error a person or a dependency can cause is an `AppError` with
     its `doing`, the ids and the `cause`; no catch swallows one; a new path writes its request line (CLAUDE.md, *Requests,
     errors and logs*). A failure that would leave nothing to find is a finding.
   - **Would the owner understand it?** Names and comments say what a thing does; nothing is cleverer than it needs to be.
3. Report as a short list, worst first, in plain words with one example each. Say "nothing found" when that is true.
   Do not suggest extra features or clean-ups.

**This project's own**: when `.claude/project/review.md` exists, read it before you start: it holds this project's own steps and rules for /review, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
