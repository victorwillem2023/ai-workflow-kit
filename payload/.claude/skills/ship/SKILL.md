---
name: ship
description: Finish a {{PROJECT}} feature after the owner says it is done: full gate, docs check against the spec, security review if flagged, one commit, session finish. Never run before the owner says done.
model: sonnet
---

# /ship <topic>

Only when the owner has said the feature is done ("commit and push", "finish it") **after trying this version** (handed over as
`.claude/skills/build/try-it.md` says). If not, stop and ask; "continue" or "ok" is not "done". Never handed over (no link or try
command was ever given): hand it over now and stop.
Work in the session folder `../{{PREFIX}}-<topic>`.

0. In the main folder run `node workflow/scripts/session.mjs --check-main`. It fast-forwards a `main` that is only behind `origin/main`;
   if it fails (uncommitted files there, or unpushed features while origin has new commits: it then says to run `--push`) stop and show
   the owner its message. Finished features that are not pushed yet are fine. Waiting specs don't count (`workflow/specs/` is ignored).
   **Only docs and settings left there** (its message says "docs and settings that are not committed yet": from `/docs`, `/lesson`,
   `/shape` or the owner's own edits) are not a reason to stop or ask. Where they go is the project's choice, `commits.notes` in
   `workflow/config.json`:
   - `"own"` (the default): they are the owner's, never folded into this feature. Run `node workflow/scripts/session.mjs --commit-notes
     "<Area: what changed>"` (a subject from the diff, e.g. "Product: the problem and the first users"), say in one line that they
     went in first as their own commit, run `--check-main` again and go on. If its quick gate fails, stop and show the owner the
     failure: a hand edit broke a check.
   - `"with-feature"` (a project that allows no commit of docs alone): `node workflow/scripts/session.mjs --carry-notes <topic>` moves them
     into the session folder, so they go in with this feature's one commit; say so in one line, add them to the spec's files, and go on.
   Code left in the main folder still stops here.
1. Read `workflow/specs/<topic>.md`.
2. `npm run gate:ship` must pass (the phase decides how much it runs: the whole suite in pilot and production, the tests the
   change reaches in a prototype; its last line says which). A second `gate:ship` on the same files stops at once and says so; it runs again after any change. Report a failure with its output; do not continue. A `scope:` line names a changed file the spec
   does not mention: add it to the spec's files (say why in the report) or take the change out.
   For anything bigger than a small fix, have fresh eyes review it before the commit: start a subagent that has not seen this
   chat (the Task tool, on Opus: judging needs the strong model), with only this as its task: "Follow `.claude/skills/review/SKILL.md` for <topic>, in <the session
   folder>. Change no file. Report the list." Fix what it finds that the spec backs, and show the owner the rest.
   **A fix that changes what it does** (other numbers, other rules, another screen) means the owner's check was of another
   version: hand it over again (`try-it.md`, with what the fix changed and an example before and after) and stop until they say
   done. Only fixes that keep the behaviour (a rename, a test, a comment) go on without a new check.
   **A sensitive file changed** (the gate's *signoff* line): the review is not optional. Then stop and hand the owner the check:
   the files, the spec's *Sources*, and `cd <session folder> && npm run signoff` to run in their own terminal. You never run it,
   never write `docs/company/SIGNOFFS.md`, and never call the change checked before the gate passes with their row.
3. Docs: every file under "Docs that change" is in `git diff main --stat`. Missing one: fix it first.
4. Security: if "Security triggers" says yes, review **this feature's changes, never the folder this chat runs in**: the
   `security-review` skill reviews its own folder against `origin/HEAD`, which from the main folder is main's newest commit,
   not this feature. Start a subagent that has not seen this chat (the Task tool, on Opus) with only this task: "Do a security
   review, following the `security-review` skill's method, of exactly this diff and nothing else:
   `git -C <session folder> diff $(git -C <session folder> merge-base main HEAD)` (it includes uncommitted work). Read files
   only under <session folder>. Change no file. Report each finding with its file and line." Fix what it finds first.
5. The spec and its try command (`workflow/specs/<topic>.*`) stay until step 7: `--finish` deletes them in both folders once the feature is on main.
6. No commit of your own: step 7 commits everything left under the approved subject, as ONE commit. Subject = what changed for the user ("Area: what changed, and what else"),
   body = a few lines of what the feature now does. Add the Co-Authored-By line the session gives. The subject is also the
   line users read in the changelog (`npm run changelog` groups the subjects by area; a release writes them into `CHANGELOG.md`
   with `--release <version>`), so show it to the owner first as "Changelog: <subject>" and change it if it says how, not what.
   Keep the approved subject and body: step 7 passes them, so the finished commit carries them even when the session already
   had a commit (a checkpoint a stacked session saved, an earlier round).
7. `node workflow/scripts/session.mjs --finish <topic> --subject "<approved subject>" --body "<body, with the Co-Authored-By line>"` (commits what is left, squashes under that message, rebases on the local `main`, and checks only what changed since `gate:ship` passed: nothing, when main did not move; the feature is on the local `main`, NOT pushed, and the session's card moves to Waiting for your check; when the spec's "Card stays open after this spec" line says yes, add `--partial "<what is left>"`: the card stays in In progress and the comment says what is left). Tell the owner how many features wait and that `node workflow/scripts/session.mjs --push` sends them; run it only when the owner says so.
   A session built on another one ("Starts on: <topic>") is refused until that one is finished: ship that one first. Finishing a
   base moves the sessions on it onto main by itself; pass on what it says about them (one that could not move names
   `--restack <topic>`). Combined cards (`Card: #12, #14`) all move with the one commit.
   With `"flow": "pr"` in the config it opens a pull request instead: give the owner its address, and run `node workflow/scripts/session.mjs --merge <topic>` only when the owner says so.
8. When the spec has a *How we will know it worked* line, write it under *Signs to look at* in `docs/PRODUCT.md` as
   `- <date to look>: <sign> (<the commit's subject>)` (in the same commit), and when there is a card, on the card too:
   `gh issue comment <n> --repo <board.repo> --body-file <file>` ("Shipped. How we will know it worked: <sign>, look on <date>.").
   `npm run retro` reads both back once the date has come.
9. Report in plain language, with an example where a term is technical: what changed, what the tests check. Anything still
   open is a question with a recommendation, or a card made now (`.claude/skills/build/try-it.md`, *Open points become cards*), never a bare "unsure".

**This project's own**: when `.claude/project/ship.md` exists, read it before you start: it holds this project's own steps and rules for /ship, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
