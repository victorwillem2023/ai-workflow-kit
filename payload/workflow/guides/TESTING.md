# Testing: what to test, at which level, and with what data

The kit's rule is "tests first, named as behaviour". This page says what that means for each kind of code, so a plan can name
the right tests and a builder writes them the same way every time. `/spec` reads it when it names the tests, `/review` when it
judges them. Read by the section.

## What a test is for
A test is a promise about what the app does, written so a script can check it. It earns its place when it would fail for a
real mistake and for nothing else. Three questions decide whether one is worth writing:
- **Would a user or the owner notice if this broke?** Then it needs a test.
- **Does it fail for one reason?** A test that can fail for five reasons says nothing when it does.
- **Does its name say what broke?** "refuses a race date in the past", never "test goal" or "works".

## The levels, and how many of each
| Level | What it checks | Uses | How many | Speed |
|---|---|---|---|---|
| **Rule tests** | one rule of the core: a total, what counts as valid, who may do what | plain values in, plain values out; no files, network or clock | most of the suite: every rule, every edge | milliseconds |
| **Edge tests** | the code that talks to one outside service does what the core expects of it | a fake of that service, or a recorded answer | a few per service: the good answer, the bad one, the slow one | milliseconds |
| **Data tests** | queries, constraints and migrations do what they say | a real database of the same kind as production (below) | one per query that has a rule in it, one per constraint that matters | tens of milliseconds |
| **Route tests** | a request gets the right answer: status, shape, who is refused | the app started in the test, called in memory, fakes behind it | per route: one good call, each refusal | tens of milliseconds |
| **Screen tests** | a screen shows the right thing for a state, and an action does what it says | the component with made-up data, in a DOM made for tests | per screen: the states (empty, loading, error, full) and each action | tens of milliseconds |
| **Browser tests** | the few paths the product cannot live without work end to end | a real browser against a running app | a handful: sign in, the main thing the app does, paying | seconds each |

The shape is wide at the top of the table and narrow at the bottom. A rule is tested where it lives, once. A higher level
checks that the parts are joined, never the same rule again: a route test for an order checks that a bad total is refused,
the rule tests check every way a total can be bad.

## What not to test
- The framework, the library or the language: that a router routes or a schema library validates.
- A line that only passes a value on.
- How the code does it: which function was called, in what order, how many times. Test what came out.
- Text that changes often, character by character. Test that the fact is on the screen, with the number it should have.

## Names and shape
- The name is what the app now does, in the present tense, from the user's side: "caps an upload at 20 MB",
  "shows the plan in kilometres for a metric user".
- One behaviour per test. Three parts, in this order, with a blank line between: the situation, the action, what is expected.
- **Several inputs, one behaviour: one test over a list of cases**, each with its own words. The gate's *copies* check fails
  two tests that are the same body with other values.
- The expected value is written out, never worked out by the code under test. For a sensitive file it comes from the source
  the spec names (`workflow/guides/SENSITIVE.md`).

## Test data
- **Made by a builder function per kind of thing** (an order, a user) that returns a valid one and takes what differs:
  a test then shows only the values it is about. Kept in one helper file beside the tests (the testing module brings the
  pattern as builders.example.ts).
- **One fixed "now"** and a seeded random generator, passed in. A test that reads the real clock fails at midnight or in
  another time zone.
- **Never real people's data**, not even scrambled. Made-up names and addresses on reserved domains (example.com).
- Each test makes what it needs and leaves nothing behind. A test that needs another to run first is a bug.

## Fakes, not mocks
- **Fake only what is outside the app**: the network, the clock, the mail service, the payment provider. They come in as
  arguments (the testing module's fakes pattern), so a test hands over a fake and production hands over the real one.
- **Never fake the app's own code** to make a test easier. If a function is hard to test, it does too much: move the rule into
  the core, where it needs no fake.
- A fake that a test did not set up **throws and says what was called**, so a test can never reach the network by accident.
- A fake is a promise about the real service. When the real answer is known (a recorded reply, the provider's sandbox), one
  test checks the fake against it, so the fake cannot drift.

## The database in tests
The testing module brings the shape as data.example.ts (the schema from the migrations, each test rolled back, a constraint, a
query that shows only a person's own rows, a limit), runnable with Node's own SQLite; the security module brings a route test
as tests/security/routes.example.ts (a good call, signed out, someone else's thing and another customer's, each refused).
- **The same engine as production.** SQLite standing in for Postgres passes tests that fail in production (types, locking,
  constraints differ). SQLite in production: an in-memory or temporary file database. Postgres in production: a throwaway
  Postgres (a container, or a database per test run).
- **The schema comes from the migrations**, run at the start of the suite, so the migrations are tested on every run.
- **Each test is alone**: wrapped in a transaction that is rolled back, or given its own schema. Never a shared database that
  tests clean up afterwards: one failure then breaks the next ten.
- A migration that changes data gets a test of its own: rows as they were before, the migration, rows as they must be after
  (`workflow/guides/DATA.md`, *Migrations*).

## What every change needs
| The change | The tests it brings |
|---|---|
| A new or changed rule | a rule test per case the rule tells apart, the edges on both sides |
| A bug | first a test that fails for the bug's reason, then the fix; the test stays |
| A new route | the good call; each refusal: signed out, another user's id, bad input, too big (`workflow/guides/PERMISSIONS.md`) |
| Anything that reads outside input | a test per hostile input, named for what is refused ("refuses", "rejects", "caps") |
| A new query with a rule in it (a filter, a total, "only your own") | a data test with rows on both sides of the rule |
| A new screen or state | a screen test per state |

## Tests that fail sometimes
A test that fails one run in twenty hides the day it fails for a real reason. It is fixed or deleted the day it is seen,
never run again until it passes and never marked "skip". The usual causes, in the order to look:
1. the real clock or a real timeout (pass the clock in; the testing module's fake clock);
2. tests that share something (a database, a file, a port, a variable at the top of a file);
3. the order things finish in (wait for the thing itself, never for a number of milliseconds);
4. the network (a fake that throws finds it).

## Speed
The whole suite has a time budget (`testSeconds` in `workflow/config.json`); the gate says when it is passed. A slow suite
is run less, so it protects less. Keep rule tests free of I/O, start the database once per run, and keep browser tests few.

## What the gate checks, and what it does not
- **Checked**: the tests a change can reach pass; a source file no test reaches fails (where the gate can follow imports);
  two copies of one test fail; a changed input reader with no refusal test gets an advice line.
- **Not checked**: that a test asserts anything, or that it would fail for the mistake it is named for. That is `/review`'s
  job: it lists every test whose expectation changed, and reads the new tests against the spec's list.
- **Measured, not checked**: how much of the code the tests run (`npm run coverage`: the share of lines, and the files with the
  most lines no test runs; `/retro` shows it monthly). A file a test imports but hardly runs shows up there, where the
  *untested* check calls it tested. It is a pointer to where a test pays, never a number to chase.
- A changed expectation is only right when the behaviour was meant to change, and the spec says so.
