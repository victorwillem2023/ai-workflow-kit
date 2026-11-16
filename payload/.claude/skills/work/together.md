# Cards that go together: combine, stack, or side by side

Used by `/work` (step 1 and *Several cards*) and `/spec`. The aim: the owner never waits for a commit on main when the work
could go on, and work that belongs together is not split into commits that only make sense as a pair. The owner sees the
choice with the plan and can say otherwise.

## Combine: one spec, one session, one commit for several cards

When **any** of these holds:
- one card only makes sense with the other (the rules and the only screen that shows them; an endpoint and the form that
  calls it, when nothing else uses the endpoint);
- they change the same files in the same places, so two sessions would conflict;
- both are small (`effort: small`), in the same area, and one review would cover both.

Then: one spec naming every card (`Card: #12, #14`), one session (`node workflow/scripts/session.mjs <topic> --card 12,14`), one commit
whose subject says both ("Plan: a week-by-week plan from a goal, and the screen to see it"). Every card moves with it and all
close together. Never combine to save planning time when the cards are independent: a combined commit is harder to undo
alone. At most three cards, and not when one of them touches a sensitive file (its sign-off would cover the others).

## Stack: start on top of a card that is built but not finished

When the card it needs is **built** (in *Waiting for your check*: the owner is trying it) or finished on the local main but not
pushed, the work does not wait:
- finished on the local main already: start from main as usual (main has it; `--push` is not needed first);
- built in its own session, not finished: start on top of it: `node workflow/scripts/session.mjs <topic> --card <n> --on <its topic>`
  (`/build` does this from the spec's "Starts on: <topic>" line). The new session has the other one's work as it is now:
  builders do not commit while the owner tries it, so `--on` saves the base's uncommitted work itself, as a checkpoint on the
  base's own branch (nothing reaches main, so it is not the owner's "done"; never run `git commit` for it yourself, the hook
  refuses that). When the base ships, `/ship` passes the approved subject to `--finish`, which replaces the checkpoint's.

The rules that keep it safe, all checked by `session.mjs`:
- the base is finished first (its check comes first); finishing the stacked one before it is refused;
- `--finish <base>` moves every session on it onto main by itself (only its own commits move); uncommitted work or a
  conflict there leaves it where it is, says so, and `--restack <topic>` moves it later;
- feedback on the base after the stacked one started is fine: the move picks up the base as it was finished.
Stack one level only (on a session that is not itself stacked), and only on one base. A card that needs two unfinished
cards: combine those two, or wait for one.

## Side by side: separate sessions from main

Independent cards (no dependency between them, different files) each get their own session from main, at most three at once
(`/build a b c`), and finish in any order.

## Wait

The card it needs is not built yet and is not close enough to combine: say which card it waits for and offer that card
first. Never a stand-in (a fake sign-in, a fake store) as the default; the owner may choose one, said as one.
