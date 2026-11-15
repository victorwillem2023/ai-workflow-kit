---
name: review
description: Review a finished {{PROJECT}} build with fresh eyes before it ships ("/review <topic>"): reads only the spec and the diff, and says in plain words what does not match. Read-only; never fixes, never commits.
---

# /review <topic>

Run in a new chat, never in the chat that built it: the builder does not grade its own work. Change no file.
Work in the session folder `../{{PREFIX}}-<topic>`.

1. Read `specs/<topic>.md`, then `git diff main --stat` and the diff of the files that matter (not generated ones).
2. Answer these, each with the file and line when the answer is no:
   - **Does it do what the spec says the user sees?** Name anything missing, and anything built that the spec never asked for.
   - **Were tests bent to pass?** List every existing test whose expectation changed (`git diff main -- tests`), and whether
     the spec meant that change.
   - **Was a rule copied?** A rule written a second time when it already has a home (`docs/ARCHITECTURE.md`, *Rules and where each lives*).
   - **Is anything outside the spec touched?** `npm run gate` prints `scope:` lines for those files.
   - **Would the owner understand it?** Names and comments say what a thing does; nothing is cleverer than it needs to be.
3. Report as a short list, worst first, in plain words with one example each. Say "nothing found" when that is true.
   Do not suggest extra features or clean-ups.
