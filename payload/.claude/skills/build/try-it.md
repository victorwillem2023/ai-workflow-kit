# Handing a build to the owner to try

Used by `/build` step 5, `/work` step 4, `/ui` stage 2 and every feedback round. The owner should only have to open a link (or
paste one command) and follow the steps. Never "what do you think?" with nothing to try.

## 1. Make it ready to try

**A link only for something to see.** A change that shows nothing new on a screen (rules, a calculation, an API, data, a
screen that is still the placeholder) gets no link and no "open it in the browser": the page would show nothing of it. Then
it is the try command alone.

- **It shows something new on a screen** (the spec's "What the user sees" names a screen this change adds or changes): run `node scripts/session.mjs --serve <topic>` in the main
  folder. It starts the session's dev server in the background, waits until the link answers and prints it. Stops with the server's
  last lines when it does not come up: fix that first, never hand over a link that does not open.
- **It has no screen** (rules, a calculation, an API, an import): the builder writes a small try command,
  `specs/<topic>.try.<ext>` in the session folder, in the project's language (`npx tsx specs/<topic>.try.ts ...`, `python
  specs/<topic>.try.py ...`; `specs/` is ignored: it is never committed and goes with the spec at `/ship`). It
  takes the owner's own inputs as arguments, in the words of the spec (`--goal 21.1 --race 2027-04-11 --weekly 25 ...`), runs
  the real code, and prints the result as a person reads it (a table of weeks, not JSON), with any warning or refusal in words.
  Without arguments it prints its usage with one example. Give the command with `cd <session folder> &&` in front.
- **Both** (a new screen and rules behind it): the link, and the command for the cases the screen cannot reach yet.

## 2. The message: plain words, real examples

No file names, function names or code terms; where a term is needed, an example says what it means. In this order:

1. **Open**: the link, or the one command to paste. With a server, also its log, as `--serve` printed it
   (`node scripts/logs.mjs <topic> --follow`): what each click did on the server, one line per request. Something looks wrong:
   the reference on the screen or in the console goes to `/debug`.
2. **What is new**: one or two sentences on what a person can now do.
3. **Try this**: two or three numbered steps with real example values, each with what should appear ("Set a 10 km run on
   1 March with three free days: a plan of 14 weeks appears, week 1 has three runs, the longest 5 km"). The expected results
   come from the tests or from running the example yourself, never from a guess.
4. **Then try your own**: invite the owner's own numbers ("your real goal and your usual week") and say what to look for: would
   you follow this plan?
5. **Edge cases**: two to four, each with the input and the answer it should give (a date in the past: refused, and it says why;
   a goal far beyond the usual week: a warning). Take them from the spec's cases and the tests.
6. **On the app map** (with the map module): the ends this change built or moved, by their words, and that `docs/flow/index.html`
   shows them (open it in the browser).
7. **Not in this card**: what is deliberately missing, so it is not reported as a fault.
8. **Unsure**: the builder's "unsure" list in plain words.

End with: "Say **done** when it works, or tell me what is wrong." Move the card to *Waiting for your check*.

## 3. After the check

- A change after the owner tried it (feedback, or a review fix in `/ship`) that changes **what it does** (other numbers, other
  rules, another screen) is handed over again with this page, showing what changed. Only a change that keeps behaviour the
  same (a rename, a test, a comment) needs no new check.
- "done", "finish it", "commit and push" mean done. "continue", "ok" or "next" while a card waits for the check do not: ask
  whether it works.
