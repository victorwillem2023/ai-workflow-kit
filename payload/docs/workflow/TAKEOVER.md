# Taking over existing code

The kit was made for a project it starts, but most code it meets already exists: an app someone wrote, with no tests in places,
long files and habits of its own. This page is the path from "installed" to "safe to change", in order. `/setup` reads it for a
project that already has code, `/work` before the first change to code that has no tests, `/retro` when it looks at the debt.
Read by the section.

## 1. Accept today as the starting line
- **The baseline**: `node tools/workflow/gate.mjs --update-baseline` records what the checks find today (long functions, big
  files, untested files, unused code, page weight) as known. From then on only what a change *adds* fails; the old debt does
  not block a fix. Commit the baseline on its own, with what it holds in the subject ("Baseline: 41 untested files, 12 long
  functions").
- **Nothing is fixed in the same breath**: the first commits change no behaviour. The install, the baseline, the map
  (`npm run map`) and the docs `/setup` writes are each their own commit, so a mistake later is never hidden among them.
- **The map before the first change**: `docs/MAP.md` and `docs/code/<folder>.md` say where things are; `/setup` writes the
  folder notes from the code as it is, not as it should be. Rules the code does not keep yet go in as "today: ...; aim: ...".

## 2. A test before the first change, around what is there
Code with no tests is changed safely in two steps: first pin down what it does now, then change it.
- **Pin what it does today**: before touching a function nobody tested, write tests that call it with the real inputs it gets
  (from the logs, the database, a recorded request) and assert what it returns *today*, even where today looks wrong. Name them
  so ("today: an empty name gives a blank greeting"). They are the safety net, not the spec.
- **Where it cannot be called alone** (it reads the clock, the network, a global), make one seam: pass the thing in as an
  argument with today's value as the default. That is the only change before the tests; it changes no behaviour.
- **Then the change**, with its own tests as usual (`docs/workflow/TESTING.md`). A test from step one that now fails is either
  the change working (the spec says the behaviour changes: rename the test to the new rule) or a mistake.
- **A bug found while pinning** is a card (`/idea`), not a fix in passing: the owner decides whether today's behaviour is a bug.

## 3. Work the baseline down, a little each week
- **Leave it better where you touch it**: a file a card changes loses its debt in that card when it is cheap (a test for the
  function you changed, the long function split where you were working). A file nobody touches keeps its debt.
- **Never a big clean-up card**: "refactor the importer" is a month with no visible change and the highest risk. Split it into
  cards that each change one thing behind tests and ship.
- **The numbers go one way**: the baseline only shrinks (a ratchet). `/retro` shows how it moved each week; when a number goes up,
  the change that did it says why in its commit.
- **The riskiest first**: what breaks most (the bug cards, the files the most changes touch: `git log --format= --name-only |
  sort | uniq -c | sort -rn | head`) and what costs most when it breaks (money, personal data) get their tests before the rest.

## 4. When the old shape fights the kit's
- **Layers that do not exist yet** (no `src/core`, logic inside the routes): the layer rules in `workflow.config.json` start with
  the folders that exist; a new feature goes in the new shape, and old code moves only when a card touches it.
- **A framework's own way** (a Next.js app, a Django project) wins over the kit's folder names: the folder notes say where its
  rules live, and the boundaries in the config follow the framework.
- **A different test runner**: keep it; set `commands.testAll` (and `commands.testFiles`, how to run some files) and `tests`
  (where they are) in `workflow.config.json`. The kit needs a command that passes or fails, not its own runner.

## For the agent
- Before changing a file, check whether a test reaches it: is it in the gate's *untested* list (`tools/workflow/baseline.json`),
  and do any of its importers (`npm run map -- --uses <file>`) have tests? None: step 2 first, and say so in the plan.
- Never "fix" what looks wrong in old code that the card does not ask about: name it at the end instead.
