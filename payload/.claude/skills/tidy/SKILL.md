---
name: tidy
description: Keep the {{PROJECT}} board from piling up and make the focus clear ("/tidy", "what should I focus on", "the board is a mess"): reads the board's triage (too much in progress, cards waiting for the owner, stalled or long-blocked work, the inbox, cards without a value, duplicates, an old backlog), proposes one batch of tidy-ups for a yes, does the approved ones, and ends with this week's focus. Run from the main folder.
model: sonnet
---

# /tidy

The board's front desk: nothing waits without a decision, and the owner knows what matters this week. The script finds; you
explain and propose; the owner decides; the board commands do it.

1. **Read the triage**: `npm run board -- --triage` (lib/triage.mjs: the counts, the focus, and each finding with its cards).
   Read single cards only when a proposal needs their text (`npm run board -- --show <n>`). Never read the whole board.
2. **One batch of proposals**, at most eight, the most blocking first, each one line with the command it would run:
   - too much in progress: which card to finish first and which to move back (`--move <n> "Ready"`);
   - waiting for your check: "try #12 the way it was handed over (its link for a screen, its try command otherwise), then say done or what is wrong" (nothing to run: it is the owner's turn);
   - stalled: move back, split ("the part left becomes a new card"), or close;
   - blocked long: unblock (`--move <n> "Ready"`) or close with why (`--close <n> "<reason>"`);
   - the inbox: adopt each with a type (`--adopt <n> --label <type>`), or close with a reply;
   - unranked: a value guess per card for the owner to confirm (`gh issue edit <n> --add-label "value: medium"`), or `/shape`;
   - duplicates: merge into the older card (copy what the newer adds as a comment, `--close <newer> "duplicate of #<older>"`);
   - prune: close the listed old low-value cards with "closed in a backlog tidy-up; reopen if it matters again".
   Ask with AskUserQuestion (multiSelect), every proposal pre-ticked except closing; the owner unticks what they disagree with.
3. **Do the approved ones**, each with its board command; report one line per change. Nothing else changes: no labels the
   owner did not approve, no new cards except a split they said yes to.
4. **The focus**, three lines: what to finish first, the one card to start after it (`npm run board -- --next 1`), and what to
   leave alone this week. For `project.audience: me`, keep it light: no limits lectured, a hobby board may be messy.

Run it when `npm run board -- --next` prints "the board needs ... decisions", at the start of a week, or whenever the owner
feels lost in the cards.
