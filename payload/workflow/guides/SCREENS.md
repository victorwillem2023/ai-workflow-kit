# Screens: building them, not only drawing them

`/ui` draws a screen (the board, the variants, the pictures, the tokens: `docs/STYLE.md`). This page is what comes after the
pick: how the screen holds its state, gets its data, takes input and says what went wrong, so every screen behaves the same
way. `/spec` reads it for a card with a screen, `/ui` in its build stage, `/review` when it judges one. Read by the section.

## Every screen has four states, and each is designed
| State | What the person sees | Never |
|---|---|---|
| **Loading** | the screen's shape at once (the layout, a placeholder where the data goes); a spinner only past about a second | a blank page, or the old data shown as if it were new |
| **Empty** | what this place is for and the one action that fills it ("No rides yet. Plan your first ride") | an empty table with headers, or "No data" |
| **Error** | what went wrong in the person's words, whether it is their doing, and what they can do now (try again, change the input, come back later) | a code, a stack trace, "Something went wrong" with no next step |
| **Full** | the data, with what to do with it | — |
The spec names all four for every screen it adds or changes; the board shows them (the template has them); a screen test checks
each (`workflow/guides/TESTING.md`, *The levels*). A part that waits on data (a list, a chart) has the same four, on its own.

## State: one place for each piece
- **Where it lives**: data from the server is the server's (fetched, cached, refreshed; never copied into a second store by hand);
  what the person is typing lives in the form; what only one screen needs lives in that screen; only what many screens share
  (who is signed in, the theme) is shared. A value kept in two places will disagree.
- **Derived, not stored**: a total, a filtered list or "is this valid" is worked out from the state each time, never stored beside it.
- **The address holds what can be shared**: a filter, a page, an open item go in the URL, so a link and the back button work.

## Getting data
- **One way per app**, written once (a small fetch helper or the framework's data loader): it adds the request id
  (`docs/PRODUCTION.md`), times out, reads the error answer (`workflow/guides/API.md`, problem details) into a message the screen
  can show, and never retries a write by itself.
- **The screen asks, the helper fetches**: no `fetch` inside a component's body; a component gets data and callbacks.
- **Stale is shown as stale**: while new data loads over old, the old stays visible and quietly marked; a failed refresh keeps
  the old data and says the refresh failed.
- **Writes**: the button shows it is busy and cannot be pressed twice; on success the screen shows the new state from the
  server's answer (or refetches); an optimistic change is only for what is cheap to undo, and is undone, with a message, on failure.

## Forms and their messages
- **Every field has a label** that stays visible (not only a placeholder), and the required ones say so.
- **Check on the server, always; in the browser, to help**: the browser's check is for speed, the server's is the rule
  (`docs/SECURITY.md`). Both use the same rule where the core can run in the browser (`src/core`).
- **Messages next to the field, in plain words, saying what to do**: "Enter a date after today", never "Invalid input". A
  form-wide message at the top for what is not one field's (the server was unreachable), and focus moves to the first problem.
- **When to show them**: after the person leaves the field or presses submit, never while they are still typing the first letters.
- **Nothing typed is lost**: a failed submit keeps every field as it was; leaving a half-filled long form asks first.

## Accessibility: rules, not a checklist at the end
- **Use the element that is the thing**: a button for an action, a link for a place, a real `<label>` for a field, headings in
  order. Then the keyboard and screen readers work without extra code.
- **Everything works with the keyboard**: every action reachable with Tab, visible focus (never `outline: none` without a
  replacement), Escape closes what opened, focus goes back where it was.
- **Contrast**: text at least 4.5:1 against its background (large text 3:1); the tokens in `docs/STYLE.md` are chosen for that,
  so a screen that uses only the tokens passes.
- **Never by colour alone**: an error is red *and* says so in words; a chart has labels or patterns.
- **Images say what they show** (`alt`), or `alt=""` when they are decoration; an icon-only button has a name (`aria-label`).
- **Changes are announced**: a message that appears after an action (saved, failed) is in a live region.
- **Motion respects the setting**: `prefers-reduced-motion` turns animations off.
The screen tests check what can be checked in a DOM (a field has a label, an error is announced, the keyboard reaches the
action); a browser check in CI (a smoke test and an axe scan per main screen) is the next step once the app has a few screens:
the recipe is in `.claude/skills/setup/stack.md`, *7. Tests*.

## Speed on a slow phone
The page-weight check holds what is downloaded (`performance` in `workflow/config.json`). On the screen itself: images sized for
where they show and lazy below the fold; a long list paged or windowed; nothing heavy on every keystroke (debounce a search).

## Feel: gestures, scrolling, animation, loading
How a screen moves decides whether it feels fast, and a computer's browser cannot judge how it feels on a phone. So:
- **Start from the best known way.** The plan says how the leading apps do it and uses what the phone or browser does itself
  first: native scrolling with scroll snap for a deck or a carousel, CSS transitions on `transform` and `opacity`, the
  system's own back swipe. Code that moves things frame by frame (a touch handler setting positions) is the exception, and the
  plan says why the native way cannot do it.
- **Prove the risky part on the phone first.** A card that names a part to prove, or whose result depends on how it feels,
  starts with a spike (`/spike`) the owner tries on their own phone (`session.mjs --serve <topic> --lan`), before the build.
- **Measure before the hand-over** (the ui module): `node workflow/scripts/smooth.mjs <url> --swipe "300,500 40,500"` (or
  `--scroll`, `--step`) moves the page as a phone with a slowed processor and says the dropped frames, the longest frame and
  the work per frame. A STUTTERS line is fixed before the owner tries it.
- **Read the page's events after every try**: with `src/web/feel.ts` wired (in development only; its first lines say how), each
  motion, busy moment and key action's time reaches the session's log: `node workflow/scripts/logs.mjs <topic> --page`. Read it
  yourself and ask the owner only whether anything felt off. A project that already records its own trace keeps it and
  sends that to the log instead: the page events are for one that has none. Without the production module:
  `node <kit>/install.mjs . --update --with production` adds its helper files (TypeScript: the logger, the request id, the page
  events, the vitals); the project's own server stays its own, so wiring them in is a card of its own.
- **Time the steps a person takes**: a walk in `tests/smoke/` with a name on each step ("swipe to the next card"), listed in
  `performance.speed.walks`, is timed by the speed check on slow 4G with a slowed phone and on fast 4G, with what each step
  downloaded (a map library before the first card shows at once). Today's numbers are the reference; a step clearly slower
  fails from pilot on. It sits beside the trace your phone records, never in its place.
- **The same feel problem twice: stop patching.** Measure (the two above), plan again from the best known way, and show the
  owner the new plan for a yes. No third patch.

## What the gate checks, and what it does not
- **Checked**: the page weight; the screen tests that run; the browser checks, once the project has them.
- **Not checked**: that the four states exist, that messages say what to do, that it works with a keyboard. `/review` reads the
  spec's states against the diff and the board, and names a missing one.
