---
name: review
description: Review a finished {{PROJECT}} build with fresh eyes before it ships ("/review <topic>"): reads only the spec and the diff, and says in plain words what does not match. Read-only; never fixes, never commits.
model: opus
---

# /review <topic>

`/ship` runs this by itself in a subagent that has not seen the build; the owner can also run it in a new chat. Never in the
chat that built it: the builder does not grade its own work. Change no file.
Work in the session folder `../{{PREFIX}}-<topic>`.

1. Read `workflow/specs/<topic>.md`, then `git diff main --stat` and the diff of the files that matter (not generated ones).
2. Answer these, each with the file and line when the answer is no:
   - **Does it do what the spec says the user sees?** Name anything missing, and anything built that the spec never asked for.
   - **Does this move toward the end state, or leave two ways of doing one thing?** The spec's "End state:" line says what
     the best version is. A second path beside an old one for the same job, a special case (`if` this kind, else the old way)
     where the general rule could have taken it, or a copy of logic that already has a home is a finding, with what one way
     would look like. The same for infra and docs: a second stack or module for what one already does, a doc that repeats
     another or lists what a folder or a pattern would name. Code that grew messier to fit the change (a file past its size,
     a function doing two jobs) is a finding with the split or refactor that would clean it.
   - **Were tests bent to pass?** List every existing test whose expectation changed (`git diff main -- tests`), and whether
     the spec meant that change.
   - **Was a rule copied?** A rule written a second time when it already has a home (`docs/ARCHITECTURE.md`, *Rules and where each lives*).
   - **Does it add a rule with no row?** Something the code now enforces for every caller (writes only from this site, only this
     computer may ask, a new limit or permission) that has no row in that table, whatever the spec's "New rules" line says.
   - **Can someone reach what is not theirs?** Every new route or query checks, on the server, that this thing belongs to the
     person the session names; nothing takes a user, customer or role from the request; another's id answers "not found"; a
     test says so (`workflow/guides/PERMISSIONS.md`, *Permissions: the rules*).
   - **Is the data change safe?** A schema change is a migration that works while the old version still runs and destroys
     nothing the spec did not name; values are passed as parameters; a list has a limit; no query per row
     (`workflow/guides/DATA.md`).
   - **Would each new test fail for the mistake it is named for?** One that asserts nothing, repeats the code's own sum or
     fakes the app's own code is a finding (`workflow/guides/TESTING.md`).
   - **A screen: are its four states there, and can everyone use it?** Loading, empty, error and full as the spec names them;
     each form message says what to do; every action works with the keyboard and has a name; nothing is said by colour alone
     (`workflow/guides/SCREENS.md`). Compare with the board's picture when there is one (`docs/design/png/`).
   - **Is it slow where it does not need to be?** A query or a fetch inside a loop, a whole table read to show ten rows, a list
     with no limit, a heavy library for one small use, work on every keystroke; the page weight line of the gate when screens
     changed (`docs/run/PERFORMANCE.md`, when the project has it).
   - **Email, payments, uploads, jobs, time**: the rules of `workflow/guides/COMMON.md` for the part it touches, above all: a
     webhook checked and acted on once, a file's type from its content, a job safe to run twice, a day stored as a date.
   - **Is anything outside the spec touched?** `npm run gate` prints `scope:` lines for those files.
   - **If it fails, does the log say what and where?** Each error a person or a dependency can cause is an `AppError` with
     its `doing`, the ids and the `cause`; no catch swallows one; a new path writes its request line (CLAUDE.md, *Requests,
     errors and logs*). A failure that would leave nothing to find is a finding.
   - **Would the owner understand it?** Names and comments say what a thing does; nothing is cleverer than it needs to be.
3. Report as a short list, worst first, in plain words with one example each. Say "nothing found" when that is true.
   Do not suggest extra features or clean-ups.

**This project's own**: when `.claude/project/review.md` exists, read it before you start: it holds this project's own steps and rules for /review, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
