---
name: build
description: Build a {{PROJECT}} spec without the owner changing folders (typing /build is the owner's approval of the spec): sets up the session folder, copies the spec, and builds it there (in this chat for a small or medium card, by a subagent for a large one). Run from the main folder, in a new chat, after /spec.
model: sonnet
---

# /build <topic> [<topic> ...]

Run from the main folder, in a fresh chat. The owner never switches folder or pastes a prompt.

With one topic and one builder, steps 1 to 7 below are all there is. **Several topics** (`/build a b c`), or a spec whose
*Work packages* section has two or more packages: read `several.md` in this folder first (`.claude/skills/build/several.md`).

## 1. The owner's yes

Read `workflow/specs/<topic>.md` in the main folder. **The owner typing `/build` is the approval.**

- "Owner approval" says "not yet": set it to "approved on <today> (by running /build)", move its card to Ready
  (`npm run board -- --move <n> "Ready"`), say so in one line, and go on.
- Stop only when the spec is not ready to approve: it still asks the owner an open question, or it holds a sensitive number or
  rule without a source (*Sources*). Name what is missing.
- Only the owner's own `/build` approves. One started by another skill or agent goes on only when the spec already says
  "approved on".

## 2. The session folder

The folder is `../{{PREFIX}}-<topic>`, next to the main folder. With an orchestrator (`workflow/guides/ORCHESTRATOR.md`) it is
the folder `session.mjs` prints (`--list` names it again): use that path wherever this says `../{{PREFIX}}-<topic>`.

- **Missing**: first `npm run board -- --room`. STOP there (more work in progress than `board.wip`): ask the owner which to
  finish or park before this one starts; their answer that this one goes ahead anyway is enough. Then run
  `node workflow/scripts/session.mjs <topic> --card <n>` in the main folder, and note the port it prints.
  - `n` is the spec's "Card: #n" line; `--card 12,14` for combined cards; leave `--card` out when there is none.
  - A "Starts on: <other topic>" line: add `--on <other topic>`, so the session starts on top of that built card
    (`.claude/skills/work/together.md`).
  - A board warning line in its output is not a failure.
- **This chat is in it** (an orchestrator started it there: `git branch --show-current` is the topic): run
  `node workflow/scripts/session.mjs --adopt --card <n>` (twice changes nothing) and go on as *Present*; the main folder is
  the first line of `git worktree list`.
- **Present**: reuse it. Read its `.env` for `PORT`; never recreate or reset it. Run `git -C ../{{PREFIX}}-<topic> status --short`
  and tell the owner when it already has changes: it may be half built.

## 3. The spec in the session folder

A new folder gets the spec from step 2 by itself: `session.mjs` copies `workflow/specs/<topic>.md`, which git does not carry.
A reused folder: copy it into `../{{PREFIX}}-<topic>/workflow/specs/` only when the main folder's copy is newer, or the
folder's copy is missing.

## 4. Who builds

**In this chat, yourself**, when all three hold:
- the card is small or medium (its effort label, `npm run board -- --show <n>`; no label counts as medium);
- the spec's "Suggested model" is Sonnet;
- it touches no sensitive file.

This chat is already fresh and on the building model, so a feedback round costs one context, not two. Follow the builder's
rules below as your own. Every file you write is under the session folder, by its absolute path; the main folder is only read
(a hook refuses code written there).

**Otherwise, one subagent** (a large card, Opus suggested, or a sensitive file): start it with your agent's task or subagent
tool, named `build-<topic>`.
- The plan was made by the strong model, so building it is coding: **Sonnet** (in Claude Code `model: "sonnet"`; in OpenCode
  the config's `model`).
- **Opus** only when the spec's "Suggested model" says so (a design decision left open) or a sensitive file is in it
  (`sensitive.paths`).
- Never a free model for a build.
- When the spec touches a sensitive file, add to the prompt: "A failing *signoff* check is the owner's step, not yours: leave it
  failing and say so in the report."

**The builder's rules**: the subagent's prompt, with the real absolute folder; your own rules when you build here.

> Build the approved spec `<folder>/workflow/specs/<topic>.md`. Read it first, and the CLAUDE.md of each folder you touch. Read
> `<folder>/workflow/tools/README.md`, *What it checks*, only when a gate failure is unclear.
>
> - Work ONLY in `<folder>`: use absolute paths and start every Bash command with `cd <folder> &&`. Never edit the main folder
>   or another session's folder.
> - Write the tests first, then the code.
> - Run `npm run gate` and fix what it names until it passes. A test that fails with nothing you changed under it is flaky:
>   put it under Questions with its output, and never run the gate again hoping it turns green (the gate lists flaky tests
>   by itself).
> - Update the spec's `## Status`.
> - Do NOT commit, push or run `--finish`: the owner says when it is done.
> - A failure main has fixed since, or a fix the spec needs from main: `cd <folder> && node workflow/scripts/session.mjs --catch-up <topic>`
>   brings main in and keeps your work (work in a file main also changed is saved as a checkpoint on the session's branch). When
>   it names files that clash, settle them in place (keep what both sides need, take the `<<<<<<<` lines out) and run the same
>   command again. Never `git stash`, `git merge` or `git rebase` yourself.
> - Start no dev server. When the change has no screen, write the try command `workflow/specs/<topic>.try.<ext>`
>   (`.claude/skills/build/try-it.md`, step 1) and run it once.
>
> End with a short report in plain words, exactly these four parts and nothing before them:
> - **Done**: what a person can now do; two or three examples with their real inputs and what each gives; the edge cases
>   with what they give.
> - **Tests**: one line per test, saying what it checks; an existing test you changed (rule 9): one line,
>   `Existing tests changed: <file>: <what>`.
> - **Questions**: only what needs the owner's decision (what the person sees, a design choice, a trade-off, a blocker outside
>   the card), each a choice with your recommendation, how sure you are and the step ready ("shall I apply it?"); or "none".
>   What a test or a run can settle is settled first, never asked. Unsure if it is in the card: ask.
> - **Later**: outside the card, no decision needed (a cleanup, a copied rule, a slow test): a title and why; or "none".
>
> Work inside the card (its *Touches*, or needed for what it says) is done before this report, never listed; what is decided
> or changes nothing is not written. Never a bare "not sure".

## 5. Hand it over

When the builder reports (or you finish, building here): make its *Later* items cards, then hand it to the owner as
`.claude/skills/build/try-it.md` says.
- A screen: `node workflow/scripts/session.mjs --serve <topic>`; the owner only opens the link.
- No screen: the try command.
- Then the message in plain words, with examples, the owner's own numbers and the edge cases. Stop there.

## 6. Feedback rounds

The owner talks here.
- Built here: change it here.
- Built by a subagent: forward the feedback to that same one, so it keeps its context (your agent's follow-up or message
  mechanism). Never start a second subagent for the same topic.

**The owner stops for now** ("tomorrow", "later"): one line for the next session,
`npm run board -- --stopped "<topic>: <what works, what is left of the feedback>"`, so the next `/next` starts with it.

Keep the diff small, and for UI feedback change only presentation code. A round that changes what the feature does is handed
over again (`try-it.md`, step 3).

## 7. Never commit or finish here

When the owner says it is done, run `/ship <topic>`; it works in the session folder.

**This project's own**: when `.claude/project/build.md` exists, read it before you start: it holds this project's own steps and rules for /build, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
