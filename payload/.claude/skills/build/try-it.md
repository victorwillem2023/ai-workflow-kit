# Handing a build to the owner to try

Used by `/build` step 5, `/work` step 4, `/ui` stage 2, and every feedback round. The owner should only have to open a link (or
paste one command) and follow the steps. Never "what do you think?" with nothing to try.

## 1. Make it ready to try

**A link only for something to see.** A change that shows nothing new on a screen (rules, a calculation, an API, data, a
screen that is still the placeholder) gets no link and no "open it in the browser": the page would show nothing of it. Then
it is the try command alone.

- **It shows something new on a screen** (the spec's "What the user sees" names a screen this change adds or changes): run
  `node workflow/scripts/session.mjs --serve <topic>` in the main folder. It starts the session's dev server in the background,
  waits until the link answers, and prints it. When the server does not come up, it stops with the server's last lines: fix
  that first, and never hand over a link that does not open. For a check on the owner's phone add `--lan` (it prints the
  address on the Wi-Fi), and for a check that needs their real data add `--copy-data` (it runs on a copy; the real data is
  never opened). Never edit the session's `.env` for either: both end by themselves when the server is stopped.
  **Walk it first, from pilot on** (the ui module; `node workflow/scripts/walk.mjs --on` says "off" in a prototype: then skip
  this). Write `tests/smoke/<topic>.json`: three to eight steps from the spec's "What the user sees", in the owner's words
  (`{ "type": "Goal distance", "text": "10" }`, `{ "click": "Make plan" }`, `{ "see": "14 weeks" }`; the form is at the top of
  `workflow/scripts/walk.mjs`). Then `cd <session folder> && node workflow/scripts/walk.mjs <topic>`: one line when it passes,
  the failed step when not. Fix a failed step before the hand-over; never read the page yourself to check it. The walk is
  committed with the feature, and *Try this* below gives the steps it passed.
- **It has no screen** (rules, a calculation, an API, an import): the builder writes a small try command,
  `workflow/specs/<topic>.try.<ext>`, in the session folder, in the project's language (`npx tsx workflow/specs/<topic>.try.ts ...`,
  `python workflow/specs/<topic>.try.py ...`). `workflow/specs/` is ignored, so it is never committed, and it goes with the spec
  at `/ship`. The try command:
  - takes the owner's own inputs as arguments, in the words of the spec (`--goal 21.1 --race 2027-04-11 --weekly 25 ...`);
  - runs the real code;
  - prints the result as a person reads it (a table of weeks, not JSON), with any warning or refusal in words;
  - without arguments, prints its usage with one example.

  Give the command with `cd <session folder> &&` in front.
- **Both** (a new screen and rules behind it): the link, and the command for the cases the screen cannot reach yet.

## 2. The message: plain words, real examples

Write it so the owner can check each step in about a minute and never needs to ask a follow-up question. No file names,
function names or code terms. Where a word needs explaining, show it with an example instead ("the long run, the one run a
week over 15 km"). Short sentences, one idea each. In this order:

1. **Open**: the link, or the one command to paste. With a server, also its log, as `--serve` printed it
   (`node workflow/scripts/logs.mjs <topic> --follow`): what each click did on the server, one line per request. When something
   looks wrong, the reference on the screen or in the console goes to `/debug`.
2. **What is new**: one or two sentences on what a person can now do.
3. **Try this**: two or three numbered steps. Each gives exactly what to type or click, with the real values, and exactly what
   should appear, with its numbers ("Type 10 km, race on 1 March, three free days, then press Make plan. You should see 14
   weeks; week 1 has three runs; the longest is 5 km"). Never "check that the plan looks right": say what right is. The
   expected results come from the tests, or from running the example yourself, never from a guess.
4. **Then try your own**: invite the owner's own numbers ("your real goal and your usual week"), and say what to look for: would
   you follow this plan?
5. **Edge cases**: two to four, each with the input and the answer it should give (a date in the past: refused, and it says why;
   a goal far beyond the usual week: a warning). Take them from the spec's cases and the tests.
6. **On the app map** (with the map module): the ends this change built or moved, in their own words, and that
   `docs/flow/index.html` shows them (open it in the browser).
7. **Not in this card**: what is deliberately missing, so it is not reported as a fault, with the card each one is on now.
8. **Questions for you**: the builder's *Questions*, each asked as a choice with the recommendation first, and what each answer
   would change, with an example. None: leave the part out.

End with: "Say **done** when it works, or tell me what is wrong." Before you send it: `node workflow/scripts/session.mjs --handover <topic>`
(main comes in, so a clash shows now, while the work is fresh: settle it and run it again; the card moves to *Waiting for your check*).

### Feedback that comes from the orchestrator

With Orca (`workflow/guides/ORCHESTRATOR.md`) `--serve` opens the link in the session's own browser tab (`--phone`: as a phone),
and the owner's feedback may arrive without a typed list:

- **A clicked element** (Orca's *Annotate*): its HTML, styles, a picture and often the source file and line, with a few words.
- **Notes on the diff**: comments on lines of the change, sent as one batch.

Each one is an item of the round, like a line of the numbered list. Number them yourself in your answer ("1. the chip you
clicked: ...") and answer every one: done, or why not. An element with no words: ask what should change, never guess. The
source line it names is where to look first, not proof the fault is there.

### Open points become cards

Before the message, every *Later* item from the builder (and anything else noticed and left out) becomes a Backlog card,
without asking: the owner should never have to ask for them. They wait for the owner's yes before they are offered
(`--unsorted`), so the list to choose from only grows by what the owner let in. For each item:

1. Search first: `npm run board -- --search "<2-3 main words>"`. An open card with the same idea gets a comment instead of a twin.
2. Otherwise make it as `.claude/skills/idea/SKILL.md` steps 2 to 4 say: your best guess for the labels, no question, a short
   body, and `Depends on: #<this card>` when it builds on this one; add `--unsorted` to its `npm run board -- --add`.

An item that is really a decision is not a card: it goes under *Questions for you*. One inside the card goes back to the
builder, done before the hand-over. The message lists the new card numbers
under *Not in this card*.

## 3. After the check

- A change after the owner tried it (feedback, or a review fix in `/ship`) that changes **what it does** (other numbers, other
  rules, another screen) is handed over again with this page, showing what changed. Only a change that keeps the behaviour
  the same (a rename, a test, a comment) needs no new check.
- "done", "finish it", "commit and push" mean done. "continue", "ok" or "next" while a card waits for the check do not: ask
  whether it works.
