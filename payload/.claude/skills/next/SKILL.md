---
name: next
description: The front door of {{PROJECT}}'s workflow, safe to type at any moment ("/next", "what now?", "what should I work on?", "which command for ...?"): what waits from outside (a security alert, an update that needs you), where the project is (a look back due, a roadmap to fill, the next stage), the cards to start, best first, by a script; it ends with the next steps as one question in plain words, and says how to start the one picked in a new chat. Changes nothing.
model: haiku
---

# /next  or  /next <which command for ...?>

This is the one command that is safe at any moment: change no file, set no label, start nothing. Answer in at most eight
lines, then the closing question.

## Asked which command

For "how do I check what this costs?" or "where do I start the deploy?": find it in `workflow/guides/WORKFLOW.md`, *The
commands, by stage* (`grep -n` the words, and read only that table). Answer with the command and one line on what it does,
then stop.
- Not in the table: say so, and offer `/find`.
- A command whose skill is not in `.claude/skills/` was left out of a lean install: say so, and that
  `node <kit>/install.mjs . --update --with <part>` adds it. Never offer a skill that is not installed as the next step.

## Otherwise: four read-only commands

1. **`npm run updates -- --short`**: a security alert comes first. An update counts only when it needs the owner (its "to look
   at" part); the ones that merge by themselves are not the owner's job.
2. **`node workflow/tools/stage.mjs`**: where the project is, from facts (a look back due, the roadmap empty, the first
   version built and nowhere to run it, a card that must come before the first deploy). Each `stage:` line is a next step.
   Then **`npm run phase -- --next`**: its `phase:` line goes into your answer as it is, one quiet line, never a question. A
   line under it is said once, as a next step in plain words:
   - `New:` (a fact appeared): "people now <fact>: the checks could get stricter (the pilot/production phase), and the goals
     would then come from what your users report and what the running app says, before the product's own; I can show what is
     still missing".
   - `The facts fit ...` (the phase is stricter than anything depends on): "a lighter phase would make shipping faster; the
     safety checks stay".

   Switching the phase is the owner's job, in `workflow/levels.json`: never offer to make the switch, and never bring the
   phase up again when no such line is printed.
3. **`npm run board -- --next 3`**: the cards to start, best first (the dependency graph first, then the owner's labels).
   - **`today:`**: the free room filled in the goal's order. Offer it first, as one choice in plain words ("Start three things
     side by side today: ... (/work 561 131 383)"), with its `after:` line; one card at a time is one of the other choices.
   - **`where you stopped:`**: the line the last session left. Say it first; a fact in it git can tell (pushed, committed, a
     folder or branch) is checked with git first, and git wins.
   - **`STOP:`**: more work in progress than the limit. The next step is finishing or parking one (the board tidy-up), never
     a new card; say which are in progress.
   - **`you were on:`**: start your answer with it, in one line of plain words ("You were building #12 and #9 waits for you
     to try"). A card that waits to be tried is the first next step: trying it is quicker than starting another. More in
     progress than `board.wip` in `workflow/config.json` (2 when not set): the next step is to finish or park those (the
     board tidy-up), never a new card.
   - **`goal:`** (or `focus:` for a block of one area): the owner picked what the coming days are about. Say the line as it
     is, with its count ("A hike to a top: 14 of 26 done"), and offer only the cards listed: the others wait on purpose. An
     "outside the focus but urgent" card is the one exception: name it. "Things left with no card yet": the next step is
     making them (`/tidy focus`).
   - **No goal picked**, **the goal is done**, or a goal is **due** (each a line the script prints): one next step, "Pick
     what the coming days are about (2 minutes): I show a few goals with a finish line, for example one kind of request made
     really good, one part of the app finished, or speed and cleaning up the code; you pick one and the rest waits. (/tidy
     focus)". When a goal is due, recommend it and say why in the script's words.
   - **Cards made along the way wait for your yes** (the script's line): one next step, "Let in or drop the <n> cards made
     while building (2 minutes) (/tidy)".
   - A card that "starts on top of #m" does not wait for #m's check: say so.
   - **A `code:` line under a card**: the card is likely to change a file that is already costly (changed often and too
     big, changed often with no test, in the way of earlier cards). Say it with the card, in plain words, as part of the same
     choice: "Build #42, the filter on the route page. It will change the page's main file, which is 600 lines and changed
     every few days: I plan the split first, about one more session, and the next cards on that page get cheaper. (/work 42)".
     When the line names a card that is that work ("#77 is that work"), offer #77 first instead, with that reason.
   - **"measured" in a card's reason** ("effort medium (measured: 3.2 small ones)"): the order uses what cards of that size
     really took in this project. Say it only when the owner asks why a card is where it is.
   - **A tie** ("#a, #b are equal"): never present the card numbers as an order. Deciding it is a next step of its own: the
     board tidy-up asks it once and keeps the answer.
4. **The board's notes**: with the app map, `npm run board -- --gaps`, together with the board's notes (cards with no value,
   issues off the board, "the board needs ... decisions"). All of them make one next step: the board tidy-up.

   **The guide and app map catch-up**, when the phase lets them wait (`npm run levels -- --needs upkeep small` says no) and
   five or more commits came since the last catch-up. Count them with
   `git rev-list --count <the hash in docs/.caught-up>..HEAD`. When that commit is gone after a squash:
   `git rev-list --count --since=<its date> HEAD`. With no file: since the last commit that changed `docs/guide` or
   `docs/flow/map.js`. Then one next step: "bring the guide and the app map up to the <n> features since (/docs catch-up)".

**Nothing to start**: offer `/idea` or `/shape` for the next thing in `docs/PRODUCT.md`. No `docs/PRODUCT.md` and no cards: `/setup`.

## Faster, together

The script says which cards go together: each `together, ...` line of `npm run board -- --next` is one offer, with its reason
and its command. Pass on at most two of them as choices, in plain words:
- **one session**: "Do #a and #b together, one change and one check (both small, both on the route page). (/work a b)"
- **one after another**: "Build #a, and #b right on top of it while you try #a (#b needs #a). (/work a b)"
- **side by side**: "Build #a, #b and #c at the same time (about as long as the longest; it costs about the three together,
  and you try three things at the end). (/work a b c)"

It is a guess from the labels, the dependencies and the app map; `/work` reads the cards and may sort them again. With no
such line, the rules below still hold. Offer this only when it pays for itself. Several builders cost a session each, so the
offer follows the size of the work, from the cards' effort labels:

- **Two or three cards to start** that do not depend on each other, have different area labels (so they are unlikely to touch
  the same files), and are each `effort: medium` or `large`: add one choice. "Build #a, #b and #c at the same time (about as
  long as the longest; it costs about the three together, and you try three things at the end). (/work a b c)"
- **Two `effort: small` cards in the same area**: not worth a builder each, so offer them as one session. "Do #a and #b
  together, one change (/work a b)". Small ones in different areas simply go one after the other.
- Cards that depend on each other are never offered together; `/work` sorts them again (combined, one after the other, or
  side by side).

## End with ONE question

The next steps you found, at most four, most urgent first: a security alert, the `stage:` lines, the board tidy-up when it
has decisions, a card waiting to be tried, picking a focus, the top card. Mark the one you recommend, with why in a few words. The quick ones that keep the rest honest
come first: a look back due, an empty roadmap, decisions waiting; then the card.

**On the answer, do not run it here**: a new chat gives the command its own model and none of this chat's reading. With
`"orchestrator": "orca"` (`session` in `workflow/config.json`), open it for them: `node workflow/scripts/session.mjs --chat
"<command>"`, then say "It is open in a new Orca terminal of the main folder." Otherwise, or when Orca did not start it, say:
"Start it in a new chat (so it begins clean, on the right model): type `<command>`". "1" or a card's number is enough of an
answer; "Not now" ends it.

**Each choice in plain words**, as someone who never heard of the workflow would follow it: what will happen, what you get,
how long. The command goes after it in brackets, never as the choice itself:

- `/retro`: "Look back on the week (about 10 minutes): what shipped, what went well, what got in the way. Each lesson becomes a
  check or a rule, so it does not happen again. (/retro)"
- `/advise roadmap`: "Say where the project is and what would show it is ready for the next step (a few minutes), for example
  'first users; the sign: most of the ten use it every week'. Then the kit reminds you at the right moment. (/advise roadmap)"
- `/advise ai`: "See whether AI could make the app better for the people using it (a few minutes), for example a three-line
  summary of their week, or their own assistant reading the app. It starts from what your rules let go to a model, and 'not
  now' is a fine answer; either way it stops asking. (/advise ai)"
- `/tidy focus`: the sentence in step 3.
- `/sweep`, when more than half of the startable cards have no value label, or more than `board.backlogMax` (30) are open:
  "Go over every card once (about five minutes per 25 cards, stop when you like): I say which to close, which are the same
  and what each one lacks; you approve each round. After it the order of the cards means something. (/sweep)"
- `/tidy`: "Clean up the board (about 5 minutes): I propose small fixes, like merging two cards that are the same, setting how
  much a card matters, deciding which of two equal cards comes first, linking a missing piece of the app to its card. You tick
  what you agree with. (/tidy)"
- `/work <n>`: "Build #n, <its title in plain words> (<its effort>): it is planned, you say yes, it is built, you try it. (/work n)"
- `/launch`: "Decide where the app runs online and set it up (an hour or two, over a few sittings). (/launch)"
- `/market`: "Work out who it is for and how they will find it (a few short sessions). (/market)"
- the owner says the checks fail, or asks why something is refused: "See what fails and where, in plain words; nothing is
  changed (a minute). (/check)"
- the owner asks where things are written down, or what the project looks like now: "Open every doc in one page in the
  browser, with the phase, the board and the latest decisions at the top. (/portal)"
- a security alert: "A package the app uses has a known security hole: update it first (minutes). (npm run updates)"
- an update to look at: "An update needs you: helm 3.16 to 3.22, a tool the checks never run. Try it once, then take it
  (minutes). (npm run updates)"

**This project's own**: when `.claude/project/next.md` exists, read it before you start: it holds this project's own steps and rules for /next, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
