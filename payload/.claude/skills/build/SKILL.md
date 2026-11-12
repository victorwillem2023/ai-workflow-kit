---
name: build
description: Build an approved {{PROJECT}} spec without the owner changing folders: sets up the session folder, copies the spec, and starts a subagent that builds it there. Run from the main folder after /spec is approved.
---

# /build <topic> [<topic> ...]

Run from the main folder, in a fresh chat. The owner never switches folder or pastes a prompt.

With one topic and one builder, steps 1 to 7 below are all there is. **Several topics** (`/build a b c`) or a spec with a
*Work packages* section of two or more packages: read `several.md` in this folder first (`.claude/skills/build/several.md`).

1. Read `specs/<topic>.md` in the main folder. If "Owner approval" is not "approved on ...", stop and say so.
2. Session folder `../{{PREFIX}}-<topic>` (next to the main folder):
   - missing: `node scripts/session.mjs <topic> --card <n>` (run in the main folder; `n` is the spec's "Card: #n" line, leave `--card` out when it has none); note the port it prints. A board warning line in its output is not a failure.
   - present: reuse it. Read its `.env` for `PORT`; do not recreate or reset it. Run `git -C ../{{PREFIX}}-<topic> status --short` and
     tell the owner if it already has changes (it may be half built).
3. Copy `specs/<topic>.md` into `../{{PREFIX}}-<topic>/specs/` (the spec is untracked, so the worktree does not have it).
   Overwrite only if the main folder's copy is newer or the folder's copy is missing.
4. Start one subagent (use your agent's task/subagent tool). Choose a model that matches the spec's "Suggested model" and the risk: for low-risk mechanical work (especially docs/copy) a free/cheap model is fine if your agent supports it; for normal implementation use a fast coding model (Claude Sonnet or a DeepSeek-class coder); for design-heavy or tricky work use a stronger reasoning model (Claude Opus or a DeepSeek-class reasoner). If no equivalent/suitable free model is available, use the best available coding model. Name it `build-<topic>`.
   Give it this prompt, with the real absolute folder:
   > Build the approved spec `<folder>/specs/<topic>.md`. Read it first, and the CLAUDE.md of each folder you touch; read
   > `<folder>/tools/workflow/README.md`, *What it checks*, only if a gate failure is unclear.
   > Work ONLY in `<folder>`: use absolute paths and start every Bash command with `cd <folder> &&`. Never edit the
   > main folder or another session's folder. Write the tests first, then the code. Run `npm run gate` until it passes. Update the spec's
   > `## Status`. Do NOT commit, push or run `--finish`: the owner says when it is done. Start no dev server. Report in plain language:
   > what changed, what each test checks, what you were unsure of, anything noticed but left out of scope.
5. When it reports, tell the owner in a few lines: the folder, the URL `http://127.0.0.1:<port>`, and that `npm run dev` in that folder
   serves it (offer to start it in the background if your environment supports background commands: `cd <folder> && npm run dev`). Pass on the subagent's
   "unsure" list. Stop there.
6. Feedback rounds: the owner talks here; forward it to the same subagent/session so it keeps context (use your agent's follow-up/message mechanism). Do not start a second
   subagent for the same topic. Ask it to keep the diff small and to change only presentation code for UI feedback.
7. Never commit or finish. When the owner says it is done, run `/ship <topic>` (it works in the session folder).
