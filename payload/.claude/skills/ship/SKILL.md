---
name: ship
description: Finish a {{PROJECT}} feature after the owner says it is done: the gate, docs check against the spec, one fresh review (with security when flagged) when the phase asks for it, one commit, session finish. Never run before the owner says done.
model: sonnet
---

# /ship <topic>

Run this only when the owner has said the feature is done ("commit and push", "finish it") **after trying this version**,
handed over as `.claude/skills/build/try-it.md` says.
- Not said: stop and ask. "continue" or "ok" is not "done".
- Never handed over (no link or try command was ever given): hand it over now, and stop.

Work in the session folder `../{{PREFIX}}-<topic>`.

## 0. The main folder is ready

In the main folder, run `node workflow/scripts/session.mjs --check-main`. It fast-forwards a `main` that is only behind
`origin/main`. Finished features that are not pushed yet are fine; waiting specs do not count (`workflow/specs/` is ignored).

- **It fails** (uncommitted files there, or unpushed features while origin has new commits, when it says to run `--push`):
  stop and show the owner its message.
- **Only docs and settings are left there**: its message says "docs and settings that are not committed yet" (from `/docs`,
  `/lesson`, `/shape` or the owner's own edits). That is no reason to stop or ask. Where they go is the project's choice,
  `commits.notes` in `workflow/config.json`:
  - `"own"` (the default): they are the owner's, never folded into this feature. Run
    `node workflow/scripts/session.mjs --commit-notes "<Area: what changed>"`, with a subject from their diff (e.g. "Product:
    the problem and the first users"). Say in one line that they went in first as their own commit, run `--check-main` again,
    and go on. When its quick gate fails, stop and show the owner the failure: a hand edit broke a check. Say they can have it
    explained in plain words, with nothing changed (/check).
  - `"with-feature"` (a project that allows no commit of docs alone): `node workflow/scripts/session.mjs --carry-notes <topic>`
    moves them into the session folder, so they go in with this feature's one commit. Say so in one line, add them to the
    spec's files, and go on.
- **Code is left in the main folder**: that still stops here.

## 1. Read the spec

`workflow/specs/<topic>.md`.

## 2. The gate, then fresh eyes

**`npm run gate:ship` must pass.** The phase decides how much it runs: the whole suite in pilot and production, the tests the
change reaches in a prototype; its last line says which. A second `gate:ship` on the same files stops at once and says so; it
runs again after any change.
- It fails: report the failure with its output, and stop.
- A `scope:` line names a changed file the spec does not mention: add the file to the spec's files (and say why in the
  report), or take the change out.

**Fresh eyes, once.** A review is needed when any of these holds:
- `npm run levels -- --needs review <the card's effort>` says yes (large cards in a prototype, medium and up after; a card
  with no effort label counts as medium);
- the spec's "Security triggers" says yes;
- a sensitive file changed.

Then start ONE subagent that has not seen this chat (the Task tool, on Opus: judging needs the strong model), with only this
as its task:

> In <the session folder>, read the change once: the diff `git diff $(git merge-base main HEAD)` (it includes uncommitted
> edits) and the new files no diff shows, listed by `git ls-files --others --exclude-standard`, each read whole. Follow
> `.claude/skills/review/SKILL.md` for <topic>[, and, on the same change, a security review following the `security-review`
> skill's method: read files only under <the session folder>]. Change no file, and stage nothing. Report one list, worst
> first, each finding with its file and line.

The part in brackets goes in only when "Security triggers" says yes. Fix what it finds that the spec backs, and show the
owner the rest. No review needed: say so in one line ("no review: a medium card in a prototype").

**A fix that changes what the feature does** (other numbers, other rules, another screen) means the owner checked another
version: hand it over again (`try-it.md`, with what the fix changed and an example before and after), and stop until they
say done. Only fixes that keep the behaviour (a rename, a test, a comment) go on without a new check.

**A sensitive file changed** (the gate's *signoff* line): the review is not optional. Then stop and hand the owner the check:
the files, the spec's *Sources*, and `cd <session folder> && npm run signoff` to run in their own terminal. Never run it
yourself, never write `docs/company/SIGNOFFS.md`, and never call the change checked before the gate passes with their row.

## 3. Docs

Every file under the spec's "Docs that change" is in `git diff $(git merge-base main HEAD) --stat`, or, for a new doc, in
`git ls-files --others --exclude-standard`. A missing one: fix it first.
- The user guide and the app map are not missing when the phase lets them wait (`npm run levels -- --needs upkeep <effort>`
  says no): the next `/docs catch-up` brings them up for every feature since.
- Never rebuild the generated pages (`docs/MAP.md`, `docs/README.md`) by hand for this: `--finish` writes them once, on top of main.

## 4. Security

Done in step 2's one review when "Security triggers" says yes. It reviews **this feature's change (its diff and its new files), never the folder this chat
runs in**: the `security-review` skill alone would compare its own folder with `origin/HEAD`, which from the main folder is
main's newest commit, not this feature. Fix what it finds first.

## 5. The spec stays until the end

The spec and its try command (`workflow/specs/<topic>.*`) stay until step 7: `--finish` deletes them in both folders once the
feature is on main.

## 6. The subject, approved by the owner

No commit of your own: step 7 commits everything left as ONE commit, under the approved subject.
- **Subject**: what changed for the user, "Area: what changed, and what else".
- **Body**: a few lines on what the feature now does, ending with the Co-Authored-By line the session gives.

The subject is also the line users read in the changelog (`npm run changelog` groups the subjects by area; a release writes
them into `CHANGELOG.md` with `--release <version>`). So show it to the owner first as "Changelog: <subject>", and change it
when it says how instead of what. Keep the approved subject and body: step 7 passes them on, so the finished commit carries
them even when the session already had a commit (a checkpoint a stacked session saved, an earlier round).

**The sign, before the commit**: when the spec has a *How we will know it worked* line, write it now, in the session folder,
under *Signs to look at* in `docs/PRODUCT.md`, as `- <date to look>: <sign> (<the approved subject>)`. Step 7 then commits it with
the feature; written after step 7, it would be left behind.

## 7. Finish

    node workflow/scripts/session.mjs --finish <topic> --subject "<approved subject>" --body "<body, with the Co-Authored-By line>"

It commits what is left, brings main in when it moved (a clash is left open in the folder: settle it, run the same command
again), squashes under that message, and checks only what changed since `gate:ship` passed (nothing, when main did not move).
The feature is then on the local `main`, NOT pushed, and its card moves to *Done*.

- The spec's "Card stays open after this spec" line says yes: add `--partial "<what is left>"`. The card stays in
  *In progress*, and its comment says what is left.
- Tell the owner how many features wait, and that `node workflow/scripts/session.mjs --push` sends them. Run it only when the
  owner says so.
- A session built on another one ("Starts on: <topic>") is refused until that one is finished: ship that one first.
  Finishing a base moves the sessions on it onto main by itself; pass on what it says about them (one that could not move
  names `--restack <topic>`).
- Combined cards (`Card: #12, #14`) all move with the one commit.
- With `"flow": "pr"` in the config it opens a pull request instead: give the owner its address, and run
  `node workflow/scripts/session.mjs --merge <topic>` only when the owner says so.

## 8. How we will know it worked

When the spec has a *How we will know it worked* line, its sign is already in `docs/PRODUCT.md` (step 6). Now that the
feature has shipped, put it on the card too, when there is one: `gh issue comment <n> --repo <board.repo> --body-file <file>`
("Shipped. How we will know it worked: <sign>, look on <date>.").

`npm run retro` reads both back once the date has come.

## 9. Report

In plain language, with an example wherever a term is technical: what changed, and what the tests check.
- A `flaky:` line the gate printed becomes a card, unless one is there already (`npm run board -- --search "Flaky test"`; the
  line names the `--add` to run; add `--label "area: Code health"` when the board has it).
- Anything still open is a question with your recommendation, or a card made now (`.claude/skills/build/try-it.md`, *Open
  points become cards*, made with `--unsorted`), never a bare "unsure".
- **What it took**: `--finish` kept the size of the change by itself. Add what only this chat knows, once, never asking the
  owner:

      npm run shipped -- --note <topic> --rounds <n> --review "<kind>=<n>, ..." --hard "<file>: <what got in the way>"

  - `--rounds`: how often the owner tried it and sent it back before saying done (0 when the first version was it).
  - `--review`: what step 2's review found, counted by kind: `missing`, `extra`, `tests`, `two-ways`, `messier`,
    `rule-copied`, `safety`, `data`, `other`; `--review none` for a review that found nothing. No review ran: leave it out.
  - `--hard`, at most three, only when true: a file that made this card harder than it had to be, and why in a few words
    ("src/core/plan.ts: every caller builds its own week"). A file named on two cards becomes a suggestion in
    `npm run health` and under the next card that will change it, so name the cause, never a complaint. Nothing got in the
    way: leave it out.
- **Where it leaves off**: one line for the next session, `npm run board -- --stopped "<what shipped; what comes next>"`, for
  example "Shipped #380, rides to a top; next in the goal: #379". The next `/next` starts with it. Never put in it what git
  can say (pushed or not, committed, which folders): `--next` asks git that each time it shows the line, so it cannot go stale.

**This project's own**: when `.claude/project/ship.md` exists, read it before you start: it holds this project's own steps and rules for /ship, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
