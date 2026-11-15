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

0. In the main folder run `node scripts/session.mjs --check-main`. It fast-forwards a `main` that is only behind `origin/main`;
   if it fails (uncommitted files there, or unpushed features while origin has new commits: it then says to run `--push`) stop and show
   the owner its message. Finished features that are not pushed yet are fine. Waiting specs don't count (`specs/` is ignored).
   **Only docs and settings left there** (its message says "docs and settings that are not committed yet": from `/docs`, `/lesson`,
   `/shape` or the owner's own edits) are not a reason to stop or ask: they are the owner's, never folded into this feature. Run
   `node scripts/session.mjs --commit-notes "<Area: what changed>"` (a subject from the diff, e.g. "Product: the problem and the first
   users"), say in one line that they went in first as their own commit, run `--check-main` again and go on. If its quick gate fails,
   stop and show the owner the failure: a hand edit broke a check. Code left in the main folder still stops here.
1. Read `specs/<topic>.md`.
2. `npm run gate:all` must pass. Report a failure with its output; do not continue. A `scope:` line names a changed file the spec
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
4. Security: if "Security triggers" says yes, run the `security-review` skill and fix findings first. It compares with
   `origin/HEAD`; when that is missing (a repo whose remote was added after `git init`), run `git remote set-head origin main`
   in the main folder (a local reference only; step 0's `--check-main` sets it too) and run the skill again: never review by hand
   instead.
5. Delete `specs/<topic>.md` (and its try command `specs/<topic>.try.*`, if any) in the session folder and in the main folder (`/build` copied it from there; it is ignored, so nothing else removes it).
6. Commit everything as ONE commit: subject = what changed for the user ("Area: what changed, and what else"),
   body = a few lines of what the feature now does. Add the Co-Authored-By line the session gives. The subject is also the
   line users read in the changelog (`npm run changelog` groups the subjects by area; a release writes them into `CHANGELOG.md`
   with `--release <version>`), so show it to the owner first as "Changelog: <subject>" and change it if it says how, not what.
7. `node scripts/session.mjs --finish <topic>` (squash, rebase on the local `main`, typecheck, tests; the feature is on the local `main`, NOT pushed, and the session's card moves to Waiting for your check; when the spec's "Card stays open after this spec" line says yes, add `--partial "<what is left>"`: the card stays in In progress and the comment says what is left). Tell the owner how many features wait and that `node scripts/session.mjs --push` sends them; run it only when the owner says so.
   A session built on another one ("Starts on: <topic>") is refused until that one is finished: ship that one first. Finishing a
   base moves the sessions on it onto main by itself; pass on what it says about them (one that could not move names
   `--restack <topic>`). Combined cards (`Card: #12, #14`) all move with the one commit.
   With `"flow": "pr"` in the config it opens a pull request instead: give the owner its address, and run `node scripts/session.mjs --merge <topic>` only when the owner says so.
8. When the spec has a *How we will know it worked* line, put it on the card: `gh issue comment <n> --repo <board.repo> --body-file <file>`
   ("Shipped. How we will know it worked: <sign>, look on <date>.").
9. Report in plain language, with an example where a term is technical: what changed, what the tests check, what you were unsure of.
