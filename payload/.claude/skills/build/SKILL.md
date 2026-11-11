---
name: build
description: Build an approved {{PROJECT}} spec without the owner changing folders: sets up the session folder, copies the spec, and starts a subagent that builds it there. Run from the main folder after /spec is approved.
---

# /build <topic> [<topic> ...]

Run from the main folder, in a fresh chat. The owner never switches folder or pastes a prompt.

With one topic, steps 1 to 7 below are all there is. With several, see *Several topics at once* at the end.

1. Read `specs/<topic>.md` in the main folder. If "Owner approval" is not "approved on ...", stop and say so.
2. Session folder `../{{PREFIX}}-<topic>` (next to the main folder):
   - missing: `node scripts/session.mjs <topic> --card <n>` (run in the main folder; `n` is the spec's "Card: #n" line, leave `--card` out when it has none); note the port it prints. A board warning line in its output is not a failure.
   - present: reuse it. Read its `.env` for `PORT`; do not recreate or reset it. Run `git -C ../{{PREFIX}}-<topic> status --short` and
     tell the owner if it already has changes (it may be half built).
3. Copy `specs/<topic>.md` into `../{{PREFIX}}-<topic>/specs/` (the spec is untracked, so the worktree does not have it).
   Overwrite only if the main folder's copy is newer or the folder's copy is missing.
4. Start one subagent (Agent tool, `model: sonnet` if the spec's "Suggested model" says Sonnet, `opus` if it says Opus; name it `build-<topic>`).
   Give it this prompt, with the real absolute folder:
   > Build the approved spec `<folder>/specs/<topic>.md`. Read it and `<folder>/tools/workflow/README.md` first, and the CLAUDE.md of each
   > folder you touch. Work ONLY in `<folder>`: use absolute paths and start every Bash command with `cd <folder> &&`. Never edit the
   > main folder or another session's folder. Write the tests first, then the code. Run `npm run gate` until it passes. Update the spec's
   > `## Status`. Do NOT commit, push or run `--finish`: the owner says when it is done. Start no dev server. Report in plain language:
   > what changed, what each test checks, what you were unsure of, anything noticed but left out of scope.
5. When it reports, tell the owner in a few lines: the folder, the URL `http://127.0.0.1:<port>`, and that `npm run dev` in that folder
   serves it (offer to start it in the background with `run_in_background`, `cd <folder> && npm run dev`). Pass on the subagent's
   "unsure" list. Stop there.
6. Feedback rounds: the owner talks here; forward it to the same subagent with SendMessage (it keeps its context). Do not start a second
   subagent for the same topic. Ask it to keep the diff small and to change only presentation code for UI feedback.
7. Never commit or finish. When the owner says it is done, run `/ship <topic>` (it works in the session folder).

## One spec with work packages
When the spec has a "Work packages" section with two or more packages, one topic is built by several builders in the same session folder:
1. Do steps 1 to 3 once. Check the packages: a file named by two packages, or a package under about 300 changed lines, is merged into
   the earlier or neighbouring package (say so). Packages are never split or invented here; the spec decides.
2. **Waves.** Wave 1 is every package with no `after:`; a package whose `after:` is done goes in the next wave. At most 3 builders per
   wave, started in **one message** (several Agent calls, named `build-<topic>-<package>`). Start the next wave when the whole wave has reported.
3. Add this to each builder's prompt (step 4): "You own only these files: <list>. Edit no other file; if you need one, say so in your
   report. Run only the tests that reach your files (`node --test` on them), not `npm run gate`: neighbours are mid-edit. Do not touch
   a shared file (the list under "Parallel work" in CLAUDE.md) unless your package owns them."
4. After the last wave, you (the lead) make the shared-file edits, run `npm run gate` once and fix the seams (or send them to the
   owning builder). Then step 5: one summary, with each package's "unsure" list.
5. Feedback goes to the builder that owns the file (SendMessage). Nothing is committed; `/ship <topic>` as usual.
No spec packages, or a single package: step 4 above, one builder.

## Several topics at once (`/build a b c`)
1. Read every spec (step 1 per topic). A topic whose spec is missing or not approved is left out and named; the others go on.
2. **Overlap check.** From each spec's "Files that change" list take the backticked paths. Two specs overlap when they name the
   same file. Ignore the shared files (the list under "Parallel work" in CLAUDE.md): the rebase at `--finish` handles them.
   Different files in the same folder do not overlap. Go through the topics in the order given: a topic that overlaps an earlier
   one that is starting or waiting becomes *waiting*; say which topic, which file, and that it is built after the first is shipped (`/ship`).
3. **Cap of 3.** Start at most 3 independent topics; the rest wait until one of the three is shipped (say so). Then `/build <waiting topic>` as usual.
4. Do steps 2 and 3 above for each starting topic (one session folder, its own port), then start all their subagents (step 4) in
   **one message**, several Agent calls, so they run at the same time. Name each `build-<topic>`.
5. When the builders have reported, give one summary: for each topic its folder, URL (`http://127.0.0.1:<port>`, `npm run dev` there)
   and its "unsure" list, plus the waiting topics with the reason. Stop there.
6. Feedback names a topic and goes to that topic's builder only (SendMessage, step 6). Shipping is one topic at a time: `/ship a`, then `/ship b`.
7. `ui` cards keep their own route (`/ui`): they join a batch only after the variant is picked. One topic behaves exactly as above.
