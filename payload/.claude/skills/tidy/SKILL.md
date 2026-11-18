---
name: tidy
description: Keep the {{PROJECT}} board from piling up and make the focus clear ("/tidy", "what should I focus on", "the board is a mess"): reads the board's triage (too much in progress, cards waiting for the owner, stalled or long-blocked work, the inbox, cards without a value, duplicates, an old backlog), proposes one batch of tidy-ups for a yes, does the approved ones, and ends with this week's focus. Run from the main folder.
model: sonnet
---

# /tidy

The board's front desk: nothing waits without a decision, and the owner knows what matters this week. The script finds, you
explain and propose, the owner decides, and the board commands do it.

Run it when `npm run board -- --next` prints "the board needs ... decisions", at the start of a week, or whenever the owner
feels lost in the cards.

## 1. Read the triage

- `npm run board -- --triage` (lib/triage.mjs): the counts, the focus, and each finding with its cards.
- With the app map: `npm run board -- --gaps`, its `gap` and `weak` ends that no open card is on.
- Read a single card only when a proposal needs its text (`npm run board -- --show <n>`). Never read the whole board.

## 2. One batch of proposals

At most eight, the most blocking first, each one line with the command it would run:

- **Too much in progress**: which card to finish first, and which to move back (`--move <n> "Ready"`).
- **Waiting for your check**: "try #12 the way it was handed over (its link for a screen, its try command otherwise), then say
  done or what is wrong". Nothing to run: it is the owner's turn.
- **Stalled**: move it back, split it ("the part left becomes a new card"), or close it.
- **Blocked for long**: unblock it (`--move <n> "Ready"`), or close it with why (`--close <n> "<reason>"`).
- **The inbox**: adopt each with a type (`--adopt <n> --label <type>`), or close it with a reply.
- **The map's gaps**:
  - an end a card already covers gets that card on it (`card: [<n>]` on the end in `docs/flow/map.js`; `grep -n` the end's words);
  - a real gap gets a card (`/idea` with the end's words), or stays a gap on purpose (its note says why).
- **Unranked**: a value guess per card for the owner to confirm (`npm run board -- --rate <n> value medium`), or `/shape`.
- **A tie at the top of `npm run board -- --next`** ("#a, #b are equal"):
  1. first estimate a missing effort from the code (`npm run map -- --find <word>`, then
     `--rate <n> effort <small|medium|large>`), which may settle it;
  2. still tied: ask which comes first (`docs/PRODUCT.md` recommends a card for the first users before one outside them), and
     keep the answer as value labels: the first gets `--rate <n> value high`, then `medium`, then `low`, only on cards with no
     value yet.
- **Duplicates**: merge into the older card. Copy what the newer one adds as a comment, then
  `--close <newer> "duplicate of #<older>"`.
- **Prune**: close the listed old low-value cards with "closed in a backlog tidy-up; reopen if it matters again".

Ask with AskUserQuestion (multiSelect), every proposal ticked except the closing ones; the owner unticks what they disagree
with.

## 3. Do the approved ones

Each with its board command, and one line per change in the report. Nothing else changes: no labels the owner did not
approve, and no new cards except a split they said yes to.

## 4. The focus

Three lines: what to finish first, the one card to start after it (`npm run board -- --next 1`), and what to leave alone this
week. For `project.audience: me`, keep it light: lecture no limits; a hobby board may be messy.

**This project's own**: when `.claude/project/tidy.md` exists, read it before you start: it holds this project's own steps and rules for /tidy, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
