# /spec: the rules for a change that has one of these

Read by `/spec` step 3, one section at a time: only the sections the change has. Each one adds to the spec; the rules every
spec keeps (when it fails, new rules, tests, security) are in the skill itself.

## The app map
The app map (with the map module): `npm run board -- --map` shows the ends this card is on, and `grep -n` in
`docs/flow/map.js` finds the decisions it touches. Name each end the change moves (gap to built, a new end, a weak one
fixed), put `docs/flow/map.js` under "Files that change", and give every decision it touches its file (`f: 'src/...'`),
so the gate can tell when that code changes without its node.

## Stored data
**Stored data** (a table, a column, a query, a migration): the spec names them as `workflow/guides/DATA.md`, *In a spec*,
says: the migration and whether it destroys anything (then it is an open question for the owner), the constraint that
holds each new rule, the index.

## Who may do it
**Who may do it**: a new route, screen or stored thing says who may read and change it and what everyone else gets,
with a test per refusal (`workflow/guides/PERMISSIONS.md`, *Permissions: the rules*). Sign-in and permission code is sensitive.

## A `ui` card
A `ui` card: name the mockup board it follows (or say one must be drawn first) and keep the files to `src/web`.

## A screen
**A screen** (added or changed, on any card): its four states (loading, empty, error, full: what the person sees in each),
where its data comes from, and for a form each field's message ("Enter a date after today"): `workflow/guides/SCREENS.md`.

## Email, payments, uploads, a scheduled job or dates and times
**Email, payments, uploads, a scheduled job or dates and times**: the rules of that part's section in
`workflow/guides/COMMON.md` that the change must keep, each with its test (a payment's webhook twice, a file of the wrong type,
the day the clocks change). Payments are sensitive.

## Code no test reaches yet
**Code no test reaches yet** (an older project: in the gate's *untested* list): the first tests pin what it does today,
before the change (`workflow/guides/TAKEOVER.md`, *2. A test before the first change*).

## Work packages
Work packages: for a big job that splits cleanly (see the template), list the packages, the files each owns and any `after:`
order, so `/build` can run them as waves. Only when it pays for itself: a large card whose packages are each a few hundred
lines of real work on files of their own; small, medium or tangled work stays one builder (splitting it costs more in
set-up and joining than it saves). Offer the split as a choice in plain words, never decided silently: "One builder: about <time>. Or <n> builders at once, each on its own files: about <shorter
time>, for about the same cost in total plus a little for joining them, and one more thing to check at the seams."
The owner says which, before `/build`; the spec holds the packages only when they chose the split.

## Sensitive
Sensitive (a file under `sensitive.paths`: money, health, legal texts, personal data): a *Sources* list. Every number, rate,
limit or legal sentence the code will hold names where it comes from (a law with its article, a contract, a price list, a
file in `docs/sources/`), and the tests' expected values come from there, worked out by the owner. Anything with no source
is an open question for the owner, never filled in from what the model remembers (`workflow/guides/SENSITIVE.md`).
