---
name: spec
description: Write the spec for a new {{PROJECT}} feature (what the user sees, files, tests, docs, security) in specs/<topic>.md and wait for the owner's approval. Use before any feature bigger than a small fix.
---

# /spec <card number>  or  /spec <card numbers>  or  /spec <topic>

Plan before code. Write no source code in this skill.
The backlog is the GitHub board (`tools/workflow/README.md`, *Board*). Given a card number (`/spec 42`), the spec is for
that card; given several (`/spec 42,43`), name the topic after them and list every card in the spec. If the cards touch
separate areas or can ship alone, suggest splitting them into several specs. Given only a topic, ask whether a card
exists (or make one with `npm run board -- --add "<title>" --label <type>`). `/work <n>` calls this skill for a card.

1. Read the card: `npm run board -- --show <n>` (title, column, labels, text). Never read the whole board.
   Its type label (`ui`, `feature`, `bug`, `workflow`) goes on the spec's "Card:" line; a card with none: ask which.
   Find what the feature does now in the guide part for it (`docs/GUIDE.md` lists them; open only that file in `docs/guide/`) and the files in `docs/MAP.md` (search them, don't read them
   whole) and open only the ranges you need.
2. Ask the owner the open questions (use AskUserQuestion; only real decisions, with a recommendation).
3. Copy `tools/workflow/templates/spec.md` to `specs/<topic>.md`, put the card number(s) on its "Card:" line, and fill
   every section (the "Card stays open after this spec" line says `yes, what is left` when the card is only partly done, so `/ship` keeps it in In progress). Short, plain English.
   - Tests: name each as what the app now does; behaviour in `src/core` or `src/pipeline` needs one.
   - A `ui` card: name the mockup board it follows (or say one must be drawn first) and keep the files to `src/web`.
   - Work packages: for a big job that splits cleanly (see the template), list the packages, the files each owns and any `after:`
     order, so `/build` can run them as waves. Small or tangled work: leave the section out. The owner approves the split with the spec.
   - Security: any new endpoint, file reader or outbound fetch gets limits listed and a `security-review` before finish.
4. Fill in "Suggested model for the build" (Sonnet if mechanical and fully decided, Opus if a design decision is left, with one reason).
   Show the owner a summary, including that line, and stop.
5. When the owner approves: set "Owner approval" and move the card to Ready: `npm run board -- --move <n> "Ready"`.
   If the board cannot be reached, say so in one line and carry on; the owner moves it by hand.
   Then stop, and tell the owner to open a new chat in the main folder and run `/build <topic>`.
6. Building happens in that new chat: `/build <topic>` makes the session folder and starts a builder that reads the spec and
   the CLAUDE.md of each folder it touches, not this chat. It writes the tests first, and updates `## Status` at the end.

Finished features wait on the local `main` until the owner runs `node scripts/session.mjs --push`; a new session starts from them.

One spec, one feature, one commit. The spec file is deleted in the feature's commit (see /ship).
