---
name: ship
description: Finish a {{PROJECT}} feature after the owner says it is done: full gate, docs check against the spec, security review if flagged, one commit, session finish. Never run before the owner says done.
---

# /ship <topic>

Only when the owner has said the feature is done ("commit and push", "finish it"). If not, stop and ask.
Work in the session folder `../{{PREFIX}}-<topic>`.

0. In the main folder run `node scripts/session.mjs --check-main`. It fast-forwards a `main` that is only behind `origin/main`;
   if it fails (uncommitted files there, or unpushed features while origin has new commits: it then says to run `--push`) stop and show
   the owner its message. Finished features that are not pushed yet are fine. Waiting specs don't count (`specs/` is ignored).
1. Read `specs/<topic>.md`.
2. `npm run gate:all` must pass. Report a failure with its output; do not continue.
3. Docs: every file under "Docs that change" is in `git diff main --stat`. Missing one: fix it first.
4. Security: if "Security triggers" says yes, run the `security-review` skill and fix findings first.
5. Delete `specs/<topic>.md` in the session folder and in the main folder (`/build` copied it from there; it is ignored, so nothing else removes it).
6. Commit everything as ONE commit: subject = what changed for the user ("Area: what changed, and what else"),
   body = a few lines of what the feature now does. Add the Co-Authored-By line the session gives.
7. `node scripts/session.mjs --finish <topic>` (squash, rebase on the local `main`, typecheck, tests; the feature is on the local `main`, NOT pushed, and the session's card moves to Waiting for your check; when the spec's "Card stays open after this spec" line says yes, add `--partial "<what is left>"`: the card stays in In progress and the comment says what is left). Tell the owner how many features wait and that `node scripts/session.mjs --push` sends them; run it only when the owner says so.
8. Report in plain language: what changed, what the tests check, what you were unsure of.
