---
name: build
description: Build a {{PROJECT}} spec without the owner changing folders (typing /build is the owner's approval of the spec): sets up the session folder, copies the spec, and starts a subagent that builds it there. Run from the main folder, in a new chat, after /spec.
model: sonnet
---

# /build <topic> [<topic> ...]

Run from the main folder, in a fresh chat. The owner never switches folder or pastes a prompt.

With one topic and one builder, steps 1 to 7 below are all there is. **Several topics** (`/build a b c`) or a spec with a
*Work packages* section of two or more packages: read `several.md` in this folder first (`.claude/skills/build/several.md`).

1. Read `specs/<topic>.md` in the main folder. **The owner typing `/build` is the approval**: when "Owner approval" says "not yet",
   set it to "approved on <today> (by running /build)" and move its card to Ready (`npm run board -- --move <n> "Ready"`), say so in
   one line, and go on. Stop only when the spec is not ready to approve: an open question it still asks the owner, or a sensitive
   number or rule without a source (*Sources*); name them. Only the owner's own `/build` approves: one started by another skill or
   agent goes on only when the spec says "approved on".
2. Session folder `../{{PREFIX}}-<topic>` (next to the main folder):
   - missing: `node scripts/session.mjs <topic> --card <n>` (run in the main folder; `n` is the spec's "Card: #n" line, `--card 12,14`
     for combined cards, left out when it has none; with a "Starts on: <other topic>" line add `--on <other topic>`: the session
     starts on top of that built card, `.claude/skills/work/together.md`); note the port it prints. A board warning line in its output is not a failure.
   - present: reuse it. Read its `.env` for `PORT`; do not recreate or reset it. Run `git -C ../{{PREFIX}}-<topic> status --short` and
     tell the owner if it already has changes (it may be half built).
3. Copy `specs/<topic>.md` into `../{{PREFIX}}-<topic>/specs/` (the spec is untracked, so the worktree does not have it).
   Overwrite only if the main folder's copy is newer or the folder's copy is missing.
4. Start one subagent (use your agent's task/subagent tool), named `build-<topic>`. The plan was made by the strong model, so
   building it is coding: **Sonnet** (in Claude Code `model: "sonnet"`; in OpenCode the config's `model`). **Opus** only when the
   spec's "Suggested model" says so (a design decision left open) or a sensitive file is in it (`sensitive.paths`). Never a free model for a build.
   Add to the prompt below, when the spec touches a sensitive file: "A failing *signoff* check is the owner's step, not yours:
   leave it failing and say so in the report."
   Give it this prompt, with the real absolute folder:
   > Build the approved spec `<folder>/specs/<topic>.md`. Read it first, and the CLAUDE.md of each folder you touch; read
   > `<folder>/tools/workflow/README.md`, *What it checks*, only if a gate failure is unclear.
   > Work ONLY in `<folder>`: use absolute paths and start every Bash command with `cd <folder> &&`. Never edit the
   > main folder or another session's folder. Write the tests first, then the code. Run `npm run gate` until it passes. Update the spec's
   > `## Status`. Do NOT commit, push or run `--finish`: the owner says when it is done. Start no dev server. If the change has no
   > screen, write the try command `specs/<topic>.try.<ext>` (`.claude/skills/build/try-it.md`, step 1) and run it once.
   > Report in plain language: what changed, what each test checks, two or three examples with their real inputs and what they
   > give, the edge cases with what they give, what you were unsure of, anything noticed but left out of scope.
5. When it reports, hand it to the owner as `.claude/skills/build/try-it.md` says: `node scripts/session.mjs --serve <topic>` for a
   screen (the owner only opens the link), the try command for no screen, then the message in plain words with examples, their own
   numbers and edge cases. Stop there.
6. Feedback rounds: the owner talks here; forward it to the same subagent/session so it keeps context (use your agent's follow-up/message mechanism). Do not start a second
   subagent for the same topic. Ask it to keep the diff small and to change only presentation code for UI feedback. A round
   that changes what it does is handed over again (`try-it.md`, step 3).
7. Never commit or finish. When the owner says it is done, run `/ship <topic>` (it works in the session folder).
