---
name: review
description: Review a finished {{PROJECT}} build with fresh eyes before it ships ("/review <topic>"): reads only the spec and the diff, and says in plain words what does not match. Read-only; never fixes, never commits.
model: opus
---

# /review <topic>

`/ship` runs this by itself, in a subagent that has not seen the build; the owner can also run it in a new chat. Never run it
in the chat that built the feature: the builder does not grade its own work. Change no file.
Work in the session folder `../{{PREFIX}}-<topic>`.

## 1. Read

1. `workflow/specs/<topic>.md`.
2. **The changed files**: `git diff $(git merge-base main HEAD) --stat`, then the diff of the files that matter (not the
   generated ones). Always from the merge-base, never `git diff main`: once main has moved, that shows other features' changes
   backwards.
3. **The new files**: `git ls-files --others --exclude-standard` lists the files git does not know yet, which no diff shows. A
   new feature is mostly new files, so read each one that matters, whole. Without this, the review reads only the edits to old
   files. (Do not `git add` them to see them: that changes the session's index, and a later `--catch-up` would refuse.)

## 2. Answer these

Each answer that is no comes with the file and line.

**Does it do the job, and only the job?**
- **Does it do what the spec says the user sees?** Name anything missing, and anything built that the spec never asked for.
- **Is anything outside the spec touched?** `npm run gate` prints `scope:` lines for those files.
- **Were tests bent to pass?** List every existing test whose expectation changed
  (`git diff $(git merge-base main HEAD) -- tests`), and whether the spec meant that change.
- **Would each new test fail for the mistake it is named for?** A test that asserts nothing, repeats the code's own sum, or
  fakes the app's own code is a finding (`workflow/guides/TESTING.md`).

**Does it move toward the end state?** The spec's "End state:" line says what the best version is.
- **Two ways of doing one thing**: a second path beside an old one for the same job, a special case (`if` this kind, else the
  old way) where the general rule could have taken it, or a copy of logic that already has a home. Each is a finding, with
  what one way would look like.
- The same for infra and docs: a second stack or module for what one already does; a doc that repeats another, or lists what
  a folder or a pattern would name.
- **The design not taken**: when the spec has a "Design not taken:" line, did the build drift into that design after all (its
  seam, its files)? And is the reason it lost still true now that the code is written? Either one is a finding.
- **Code that grew messier to fit the change** (a file past its size, a function doing two jobs) is a finding, with the split
  or refactor that would clean it. Follow the phase line in CLAUDE.md (*Code structure*): where it says the size rules are
  advice (a prototype), a baselined file that grew is not a finding to fix now; name its split as a *Later* item instead.

**Rules in one place**
- **Was a rule copied?** A rule written a second time when it already has a home (`docs/ARCHITECTURE.md`, *Rules and where
  each lives*).
- **Does it add a rule with no row?** Something the code now enforces for every caller (writes only from this site, only this
  computer may ask, a new limit or permission) that has no row in that table, whatever the spec's "New rules" line says.

**Safety**
- **Can someone reach what is not theirs?** Every new route or query checks, on the server, that the thing belongs to the
  person the session names; nothing takes a user, customer or role from the request; another person's id answers "not found";
  a test says so (`workflow/guides/PERMISSIONS.md`, *Permissions: the rules*).
- **Is the data change safe?** A schema change is a migration that works while the old version still runs, and destroys
  nothing the spec did not name; values are passed as parameters; a list has a limit; no query per row
  (`workflow/guides/DATA.md`).
- **Email, payments, uploads, jobs, time**: the rules of `workflow/guides/COMMON.md` for the part it touches, above all: a
  webhook checked and acted on once, a file's type read from its content, a job safe to run twice, a day stored as a date.
- **If it fails, does the log say what and where?** Each error a person or a dependency can cause is an `AppError` with its
  `doing`, the ids and the `cause`; no catch swallows one; a new path writes its request line (CLAUDE.md, *Requests, errors
  and logs*). A failure that would leave nothing to find is a finding.

**The person using it**
- **A screen: are its four states there, and can everyone use it?** Loading, empty, error and full, as the spec names them;
  each form message says what to do; every action works with the keyboard and has a name; nothing is said by colour alone
  (`workflow/guides/SCREENS.md`). Compare with the board's picture when there is one (`docs/design/png/`).
- **Is it slow where it does not need to be?** A query or a fetch inside a loop, a whole table read to show ten rows, a list
  with no limit, a heavy library for one small use, work on every keystroke; the gate's page weight line when screens changed
  (`docs/run/PERFORMANCE.md`, when the project has it).
- **Would the owner understand it?** Names and comments say what a thing does; nothing is cleverer than it needs to be.

## 3. Report

A short list, worst first, in plain words, with one example each. Say "nothing found" when that is true. Do not suggest extra
features or clean-ups.

End each finding with its kind in brackets, one of: `missing` (the spec asked for it), `extra` (built, never asked for),
`tests` (bent, or would not catch its mistake), `two-ways` (a second way of doing one job, the design not taken),
`messier`, `rule-copied` (or a rule with no row), `safety`, `data`, `other`. `/ship` counts them per card
(`npm run shipped`), so a kind that keeps coming back is seen and caught earlier, in the plan.

**This project's own**: when `.claude/project/review.md` exists, read it before you start: it holds this project's own steps and rules for /review, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
