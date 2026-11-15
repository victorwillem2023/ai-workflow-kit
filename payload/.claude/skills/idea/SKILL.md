---
name: idea
description: Add an idea, bug or workflow wish to the {{PROJECT}} board as a Backlog card ("/idea a button to export a PDF", or in plain words: "add this idea: ...", "add this issue", "add this bug", "put this on the board"). Looks for the same card first, picks the labels, asks at most one question.
model: haiku
---

# /idea <a sentence>

Cheap and quick: use a small/free model when available (Claude Haiku, or the free model OpenCode's `/idea` command names), read no other file (not the docs, not the code), and do not plan or build anything.
Run from any {{PROJECT}} folder.

1. **Same idea already there?** Take the 2-3 main words of the sentence and run `npm run board -- --search "<words>"`.
   If the result is thin, search once more with a different main word. If a card looks like the same idea (open or closed),
   show it (number, title, column) and ask: "Same as this one?". Only on "no" go on; on "yes" stop and give that card's number.
2. **Pick the labels**. Exactly one type: `ui` = a screen or part of the UI; `feature` = something the app does; `bug` =
   something broken; `workflow` = how we work (nothing in the app changes); `spike` = a quick throwaway try to answer one
   question. One existing area label, one `value: ...`, one `effort: ...` and one `feasibility: ...` label. Run
   `npm run board -- --labels` once: it prints the names the config allows, grouped; use only those, spelled exactly (a group
   that says "none in the config" is skipped).
   - **Effort and feasibility are yours to estimate**, from the code (`npm run map -- --find <word>`: what it would touch), never
     left out: a card without them can only be ranked by guesswork.
   - **Value comes from `docs/PRODUCT.md` when it decides it**: in the smallest useful version: high; for the first users, but
     later: medium; outside the first users (another sport, another kind of user): low. Say the reason in the report.
     When the doc does not decide it, the value is the one question (below), with your guess as the recommendation.
   Ask at most ONE question: the type or the area when the sentence does not tell them, else the value when the doc does not
   decide it (give your best guess with it).
   Never create an area label: if none fits, ask the owner.
3. **Write the body** to a file in the scratchpad directory, short, in the shape of card #1: `**What it would do.**` (one or two
   sentences), `**Touches.**` (files or screens, a guess is fine), `**Effort** <words>. **Feasibility** <words>.`, and when it
   cannot be built before another open card (it saves data and the store is a card; it shows a plan and the rules are a card;
   it needs who is signed in): a last line `Depends on: #<n>, #<m>` (`npm run board -- --graph` shows what is there). The
   order of work comes from these lines, so a missing one lets a card start too early.
4. **Make the card**: `npm run board -- --add "<short title>" --label <type> --label "<area>" --label "<value>" --label "<effort>" --label "<feasibility>" --body-file <file>`
   (one `--label` per label, exactly one of them a type).
5. **Report**: the first line names the type you chose and why in a few words ("Type: ui, it is a screen."), the second is
   `#<n> made in Backlog: <url>`. A new product or a big feature: a third line, "Worth asking first: /shape <n>". Nothing more.
