---
name: ship
description: Finish a {{PROJECT}} feature after the owner says it is done: full gate, docs check against the spec, security review if flagged, one commit, session finish. Never run before the owner says done.
model: sonnet
---

# /ship <topic>

Only when the owner has said the feature is done ("commit and push", "finish it"). If not, stop and ask.
Work in the session folder `../{{PREFIX}}-<topic>`.

0. In the main folder run `node scripts/session.mjs --check-main`. It fast-forwards a `main` that is only behind `origin/main`;
   if it fails (uncommitted files there, or unpushed features while origin has new commits: it then says to run `--push`) stop and show
   the owner its message. Finished features that are not pushed yet are fine. Waiting specs don't count (`specs/` is ignored).
1. Read `specs/<topic>.md`.
2. `npm run gate:all` must pass. Report a failure with its output; do not continue. A `scope:` line names a changed file the spec
   does not mention: add it to the spec's files (say why in the report) or take the change out.
   For anything bigger than a small fix, have fresh eyes review it before the commit: start a subagent that has not seen this
   chat (the Task tool, on Opus: judging needs the strong model), with only this as its task: "Follow `.claude/skills/review/SKILL.md` for <topic>, in <the session
   folder>. Change no file. Report the list." Fix what it finds that the spec backs, and show the owner the rest.
   **A sensitive file changed** (the gate's *signoff* line): the review is not optional. Then stop and hand the owner the check:
   the files, the spec's *Sources*, and `cd <session folder> && npm run signoff` to run in their own terminal. You never run it,
   never write `docs/SIGNOFFS.md`, and never call the change checked before the gate passes with their row.
3. Docs: every file under "Docs that change" is in `git diff main --stat`. Missing one: fix it first.
4. Security: if "Security triggers" says yes, run the `security-review` skill and fix findings first.
5. Delete `specs/<topic>.md` in the session folder and in the main folder (`/build` copied it from there; it is ignored, so nothing else removes it).
6. Commit everything as ONE commit: subject = what changed for the user ("Area: what changed, and what else"),
   body = a few lines of what the feature now does. Add the Co-Authored-By line the session gives. The subject is also the
   line users read in the changelog (`npm run changelog` groups the subjects by area; a release writes them into `CHANGELOG.md`
   with `--release <version>`), so show it to the owner first as "Changelog: <subject>" and change it if it says how, not what.
7. `node scripts/session.mjs --finish <topic>` (squash, rebase on the local `main`, typecheck, tests; the feature is on the local `main`, NOT pushed, and the session's card moves to Waiting for your check; when the spec's "Card stays open after this spec" line says yes, add `--partial "<what is left>"`: the card stays in In progress and the comment says what is left). Tell the owner how many features wait and that `node scripts/session.mjs --push` sends them; run it only when the owner says so.
   With `"flow": "pr"` in the config it opens a pull request instead: give the owner its address, and run `node scripts/session.mjs --merge <topic>` only when the owner says so.
8. When the spec has a *How we will know it worked* line, put it on the card: `gh issue comment <n> --repo <board.repo> --body-file <file>`
   ("Shipped. How we will know it worked: <sign>, look on <date>.").
9. Report in plain language, with an example where a term is technical: what changed, what the tests check, what you were unsure of.
