---
name: idea
description: Add an idea, bug or workflow wish to the {{PROJECT}} board as a Backlog card ("/idea a button to export a PDF", or in plain words: "add this idea: ...", "add this issue", "add this bug", "put this on the board"). Looks for the same card first, picks the labels, asks at most one question.
model: haiku
---

# /idea <a sentence>

Cheap and quick. Use a small or free model when there is one (Claude Haiku, or the free model OpenCode's `/idea` command
names). Read no other file (not the docs, not the code beyond the map search below), and plan or build nothing.
Run it from any {{PROJECT}} folder.

## 1. Is the same idea already there?

Take the 2 or 3 main words of the sentence and run `npm run board -- --search "<words>"`. When the result is thin, search once
more with another main word.

A card that looks like the same idea, open or closed: show it (number, title, column) and ask "Same as this one?".
- "yes": stop, and give that card's number.
- "no": go on.

## 2. Pick the labels

Run `npm run board -- --labels` once: it prints the names the config allows, grouped. Use only those, spelled exactly; a
group that says "none in the config" is skipped. The card gets:

- **Exactly one type**: `ui` (a screen or part of the UI), `feature` (something the app does), `bug` (something broken),
  `workflow` (how we work; nothing in the app changes) or `spike` (a quick throwaway try to answer one question).
- **One existing area label.** Never create an area label: when none fits, ask the owner.
- **One `effort: ...` and one `feasibility: ...`**: yours to estimate, from the code (`npm run map -- --find <word>` shows what
  it would touch). Never leave them out: a card without them can only be ranked by guesswork.
- **One `value: ...`**, from `docs/PRODUCT.md` when it decides it, with the reason in the report:
  - in the smallest useful version: high;
  - for the first users, but later: medium;
  - outside the first users (another sport, another kind of user): low.

**Ask at most ONE question**: the type or the area when the sentence does not tell them; otherwise the value when the doc
does not decide it, with your best guess as the recommendation.

## 3. Write the body

To a file in the scratchpad directory, short, in the shape of card #1:

- `**What it would do.**` one or two sentences;
- `**Touches.**` the files or screens (a guess is fine);
- `**Effort** <words>. **Feasibility** <words>.`;
- when it cannot be built before another open card (it saves data and the store is a card; it shows a plan and the rules are
  a card; it needs who is signed in), a last line `Depends on: #<n>, #<m>` (`npm run board -- --graph` shows what is there).
  The order of work comes from these lines, so a missing one lets a card start too early.

## 4. Make the card

One `--label` per label, exactly one of them a type:

    npm run board -- --add "<short title>" --label <type> --label "<area>" --label "<value>" --label "<effort>" --label "<feasibility>" --body-file <file>

## 5. Report

- First line: the type you chose and why, in a few words ("Type: ui, it is a screen.").
- Second line: `#<n> made in Backlog: <url>`.
- A new product or a big feature: a third line, "Worth asking first: /shape <n>".

Nothing more.

**This project's own**: when `.claude/project/idea.md` exists, read it before you start: it holds this project's own steps and rules for /idea, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
