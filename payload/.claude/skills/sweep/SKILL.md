---
name: sweep
description: Go over every open card on the {{PROJECT}} board and clean it up ("/sweep", "/sweep UI", "go over all the tickets", "clean up the whole board"), one theme at a time, a page of 25 cards per round: which to close (done already, out of date, nobody would miss it), which are the same, which to split, and the area, value and effort each one lacks. Proposes each page for a yes and does only what was approved. /tidy is the quick weekly version; this is the full pass. Run from the main folder.
model: sonnet
---

# /sweep  or  /sweep <theme>

The full clean-up of the board: every open card is looked at once, so the list is short enough to steer by and each card
that stays can be ranked. The script lists, you propose, the owner decides, the board commands do it. Nothing is closed,
merged or labelled without the owner's yes.

It is long on a big board (a page of 25 cards takes about five minutes of the owner's time), so it goes one theme at a
time and can stop after any page: what is done stays done.

## 1. Where to start

Run `npm run board -- --sweep`: the open cards per theme (a theme is an area label), the theme with the most to settle
first.

- **A theme was named** (`/sweep UI`): go to step 2 with it.
- **Otherwise** say the counts in three lines at most, and ask which theme to start with (AskUserQuestion, the first four
  themes, the script's first one recommended). "No area" is a theme too: its cards get an area in this pass.

## 2. One page

`npm run board -- --sweep "<theme>"` prints 25 cards, the most incomplete first: number, title, column, what it lacks
(area, type, value, effort) and how many days it is untouched. `--from 25` gives the next page.

Judge each card from its line. Read a card's text only when its title does not say what it is
(`npm run board -- --show <n>`), at most five per page. For a card that may be built already, check before you say so:
`npm run map -- --find <word>`, or `git log --oneline -5 --grep "<word>"`.

Put every card of the page in exactly one group:

- **Close**: built already (name the commit or file), out of date (what replaced it), or untouched for months with nothing
  that says it still matters. `npm run board -- --close <n> "<reason>"`. A closed card can be reopened; say so once.
- **Merge**: the same wish as another open card (`npm run board -- --search "<words>"` finds it). Copy what the newer one
  adds as a comment on the older, then `--close <newer> "duplicate of #<older>"`.
- **Split**: one card that is really several. Name the parts; each approved part becomes a card through `/idea`, and the
  old card is closed with "split into #a, #b".
- **Complete**: the card stays and gets what it lacks, each with your guess for the owner to correct:
  - area: `gh issue edit <n> --repo <board.repo> --add-label "<area>"` (only an existing area; performance, refactoring and
    test work is `area: Code health` when the board has it);
  - value: `npm run board -- --rate <n> value <high|medium|low>`, from `docs/PRODUCT.md` when it decides it, else medium
    for what a user would notice and low for the rest;
  - effort: `npm run board -- --rate <n> effort <small|medium|large>`, from the code (`npm run map -- --find <word>`);
  - type: `gh issue edit <n> --repo <board.repo> --add-label <type>`.
- **Fine as it is**: say only how many.

## 3. Ask, then do

Show the page as a short table per group (number, title in a few words, what you propose and why in a few words). Then ask
with AskUserQuestion (multiSelect), one choice per group: "Close these <n>", "Merge these <n>", "Split these <n>",
"Complete these <n> as guessed". The owner unticks a group or names the cards to leave out ("all but #12"). A card the
owner corrects is done their way.

Do the approved ones with the commands above, one line per change in the report. A command that fails is said and the
rest goes on.

## 4. Next page, or stop

Say how far the theme is ("UI: 25 of 61 looked at; 9 closed, 3 merged, 13 completed") and ask: the next page, another
theme, or stop here. On stop, or when every theme is done:

1. the totals: how many cards were open before and are open now;
2. `npm run board -- --focus`: with the board clean, offer to pick what the coming days are about (`/tidy focus`).

**This project's own**: when `.claude/project/sweep.md` exists, read it before you start: it holds this project's own steps and rules for /sweep, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
