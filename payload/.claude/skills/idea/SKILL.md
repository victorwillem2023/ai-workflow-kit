---
name: idea
description: Add an idea, bug or workflow wish to the {{PROJECT}} board as a Backlog card ("/idea a button to export a PDF", or in plain words: "add this idea: ...", "add this issue", "add this bug", "put this on the board"). Looks for the same card first, picks the labels, asks at most one question.
model: haiku
---

# /idea <a sentence>

Cheap and quick: use a small model, read no other file (not the docs, not the code), and do not plan or build anything.
Run from any {{PROJECT}} folder.

1. **Same idea already there?** Take the 2-3 main words of the sentence and run `npm run board -- --search "<words>"`.
   If the result is thin, search once more with a different main word. If a card looks like the same idea (open or closed),
   show it (number, title, column) and ask: "Same as this one?". Only on "no" go on; on "yes" stop and give that card's number.
2. **Pick the labels**. Exactly one type: `ui` = a screen or part of the UI; `feature` = something the app does; `bug` =
   something broken; `workflow` = how we work (nothing in the app changes). One existing area label, one `effort: ...` and one
   `feasibility: ...` label. Run `npm run board -- --labels` once: it prints the names the config allows, grouped; use only those,
   spelled exactly (a group that says "none in the config" is skipped).
   Ask at most ONE question, and only when the type or the area cannot be told from the sentence (give your best guess with it).
   Never create an area label: if none fits, ask the owner.
3. **Write the body** to a file in the scratchpad directory, short, in the shape of card #1: `**What it would do.**` (one or two
   sentences), `**Touches.**` (files or screens, a guess is fine), `**Effort** <words>. **Feasibility** <words>.`
4. **Make the card**: `npm run board -- --add "<short title>" --label <type> --label "<area>" --label "<effort>" --label "<feasibility>" --body-file <file>`
   (one `--label` per label, exactly one of them a type).
5. **Report**: the first line names the type you chose and why in a few words ("Type: ui, it is a screen."), the second is
   `#<n> made in Backlog: <url>`. Nothing more.
