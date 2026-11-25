---
name: ui
description: Work on one {{PROJECT}} ui card (a screen, a part, or a tweak to one): stage 1 draws an HTML board with variants A, B, C and its pictures, and stops for the owner's pick; stage 2 builds the pick in src/web in a new chat, in numbered feedback rounds with before and after pictures. Only for a card with the ui label. Run from the main folder.
---

# /ui <card number>

UI work has two stages, and stops twice: after the board (for the owner's pick), and after every build round (for the owner
to try it). `/work <n>` sends a `ui` card here. Never commit before the owner says done.

## 0. Is this a ui card?

`npm run board -- --show <n>`: one card, never the whole board. Closed, *Done* or *Blocked*: as `/work` step 1.

- **Already picked**: `grep -l "Card: #<n>" workflow/specs/*.md` finds a spec with "Owner approval: approved on ...". The board is
  drawn and picked, and this new chat is stage 2: go straight to *Stage 2*.
- **No `ui` label** (another type, or none): stop. Say "Card #n is labelled `<type>`, not `ui`, so /ui does not run on it", and
  ask which type it is, with a recommendation. Relabel only on the owner's yes:
  `gh issue edit <n> --repo <board.repo> --add-label ui --remove-label <old>`.
  A `feature` card that turns out to need a new screen is relabelled `ui`, or split into a `ui` card and a `feature` card, with
  the owner's yes. It is never run through `/ui` halfway.
- **Read only this** for UI work:
  - `src/web/CLAUDE.md`: the rules and the done checklist;
  - the core of `docs/STYLE.md`: the tokens, components and rules; stop at *Board notes*;
  - the one notes file in `docs/design/notes/` for the board this card is about. The *Board notes* index at the end of
    `docs/STYLE.md` says which; for a board with no notes file, `grep -n` its number in `docs/design/README.md`, and never read
    that whole. Not the other notes files.

## Short path: a small tweak to a part that exists

Which cards need a board is the owner's call, in `workflow/levels.json`: `npm run levels -- --needs uiBoard <the card's effort>`.
That is from small cards in production, and only large ones in a prototype. Below it, a new part is built as a live draft too.

For "the button feels clunky", a spacing, a label, a colour that breaks a rule, there is no board:
1. Say in two lines what changes, and which file in `src/web`.
2. Start the session: `node workflow/scripts/session.mjs <topic> --card <n>`.
3. Make it as a fast live draft, in one pass, and take the after picture (below).
4. Stop for the owner to try it.

The style rules and the done checklist still apply. When it grows into a new part or a second screen: stop, and go to stage 1.

## Stage 1: design (no app code)

1. **Start the session now**, from the main folder: `node workflow/scripts/session.mjs <topic> --card <n>`. The board is committed
   with the feature. Work only in `../{{PREFIX}}-<topic>`, with absolute paths, every Bash command starting `cd <folder> &&`.
2. **Draw one HTML board** in `docs/design/<Name>.html`, with the next board number (`tail -5 docs/design/README.md`). Start from
   `docs/design/board-template.html`: copy it; it already has the variants A, B, C, the phone width and the states.
   - **On the real tokens**: `<link rel="stylesheet" href="../../<the tokens file>">` for the variables (light on `:root`, dark on
     `data-theme='dark'`). The tokens file is `ui.tokens` in `workflow/config.json`, or `src/web/styles.css` when that is not set
     (a project whose tokens live elsewhere sets it). The board's own layout goes in a short `<style>` built from those
     variables: no hex, no new size or radius.
   - **Variants A, B, C**, side by side on the one page, each with a letter, a one-line name, and what it costs or gives up.
     Mark the one you recommend, and say why in one sentence. Draw each width of `npm run surfaces -- --widths` at least for
     the recommended one (400 px when it is used on phones; for a phone app only, just that one).
   - **The real words** the app would show (short, plain, measured), and the states that matter (empty, loading, error) where
     they apply.
3. **Pictures** with the T1 script, in `docs/design/png/`: light and dark at each width the surfaces have
   (`npm run surfaces -- --widths`). The computer width is 1320; the phone pictures only when there is a phone width, so four
   for `web-phone`:
   ```sh
   node workflow/scripts/shots.mjs docs/design/<Name>.html --width 1320 --theme light --full --out docs/design/png/<n>-<Name>.png
   node workflow/scripts/shots.mjs docs/design/<Name>.html --width 1320 --theme dark --full --out docs/design/png/<n>-<Name>-dark.png
   node workflow/scripts/shots.mjs docs/design/<Name>.html --width 400 --phone --theme light --full --out docs/design/png/<n>-<Name>-phone.png
   node workflow/scripts/shots.mjs docs/design/<Name>.html --width 400 --phone --theme dark --full --out docs/design/png/<n>-<Name>-phone-dark.png
   ```
   Look at each picture (Read the png) before showing it: text cut off, overlaps, a variant that reads wrong in dark.
4. **The record**:
   - the board's row in `docs/design/README.md` ("proposed <date>"), with its notes link;
   - its notes file, `docs/design/notes/<n>-<topic>.md`: the title, what the board asks, the variants in one line each;
   - its link in the *Board notes* index of `docs/STYLE.md`.
5. **Stop.** Show the pictures' paths and the recommendation, and ask for the pick in the owner's words ("B, with A's header").
   Move the card to *Needs a board or decision* while waiting.
6. **On the pick**, in the same chat: write `workflow/specs/<topic>.md` in the main folder from `workflow/tools/templates/spec.md`,
   short:
   - the board file, its picture paths, and the pick in the owner's words;
   - "Owner approval: approved on <date>";
   - the files, all in `src/web`. Anything outside it is said out loud, and then it needs a test, as for a feature;
   - the docs: `docs/STYLE.md` only for a new token, component or rule; the notes file; the README row; the guide part in
     `docs/guide/` and README when what the user can do changes.

   Write the pick and the date into the notes file. Then **stop**: tell the owner to open a new chat in the main folder and run
   `/ui <n>` again. The build starts from the spec and the pictures, so the board's HTML (often 35 to 100 KB) is not sent again
   on every build and feedback round.

### Stage 1 with a UI framework

With `"ui": { "boards": "components" }` in `workflow/config.json`: the same stops and the same record, but the variants are real
components, so the pick is already half built, and no HTML board is written.

- **Steps 1 and 4 to 6** as above.
- **Instead of step 2**: write A, B and C as components in `src/variants/<topic>/` (the folder is `ui.variants` in the config),
  from the project's own tokens and parts, with made-up data. Show them side by side, each with its letter, name, cost and
  states, on a page that exists only while developing (the dev server's `/variants`; it must not be in the built app).
  - The page is `src/variants/index.tsx` (or the framework's equivalent), inside the variants folder.
  - Only the app's start file loads it, behind the framework's development switch (with Vite:
    `if (import.meta.env.DEV) import('./variants')`).
  - Never put the page in `src/web`: the app may not import a variant. The start file is the one stated exception (`except`
    on that import rule), so keep the line there and nowhere else.
- **Step 3's pictures** are taken of that page (`node workflow/scripts/shots.mjs http://127.0.0.1:<port>/variants ...`). The
  pictures and the notes file are the record: the README row links the pictures, and there is no board file.
- **Stage 2** moves the picked variant into `src/web` and deletes `src/variants/<topic>/`. `npm run gate:all` fails while a
  variant file is left.

**A picture from outside** (a sketch from a chat, a design tool's export, a photo of paper): the owner may bring one to any
stage 1. It is a brief, not the design: redraw it on the project's tokens and parts as variant A, and still offer B and C.

## Stage 2: build (a new chat, in the session folder; no `/build` subagent)

1. **Read and set up**: read the spec, and copy it into `../{{PREFIX}}-<topic>/workflow/specs/` (as `/build` step 3). Then read
   only `src/web/CLAUDE.md`, the core of `docs/STYLE.md`, the board's notes file and its pictures. Open the board's HTML only
   with `grep -n` for the part you are building, never whole. Work only in the session folder, with absolute paths, every Bash
   command starting `cd <folder> &&`. (The session moved the card to *In progress*.)
2. **Before, then build**: take the **before** pictures of the live app at the session's port (only for a part that exists):
   ```sh
   node workflow/scripts/shots.mjs http://127.0.0.1:<port> --width 1400 --theme dark --click "<selector>" --out <scratchpad>/before-1.png
   ```
   Then build the pick in `src/web` from the tokens, with its four states, its data through the app's one fetch helper, its
   form messages, and the keyboard rules of `workflow/guides/SCREENS.md` (read the sections the screen needs). Run
   `npm run gate` until it passes.

   The server runs through `node workflow/scripts/session.mjs --serve <topic>` (in the main folder; it waits until the link
   answers). Never tell the owner to start or rebuild anything.
3. **After, then stop**: take the **after** pictures with the same command (same width, theme and clicks), and look at them.
   Then stop and hand it over as `.claude/skills/build/try-it.md` says: the link, what to click with example values, and edge
   cases such as an empty list or a long name; the before and after paths; what differs from the board, and why. The hand-over
   starts with `--handover <topic>` (try-it.md): main comes in and the card moves to *Waiting for your check*.
4. **Feedback rounds**: ask for feedback as one numbered list per round ("1. the chip is too tall 2. ..."); with Orca, elements
   the owner clicked in the session's browser tab count as items too (`try-it.md`, *Feedback that comes from the orchestrator*). One pass per round:
   - answer every number: done, or why not;
   - change only `src/web`. A number that needs core logic is said out loud and becomes its own card (`/idea`);
   - new after pictures from the same commands, then stop again;
   - the same problem with how it moves, a second time: stop patching (`try-it.md`, *After the check*).

   No commit between rounds.
5. **Done** only when the owner says so ("finish it", "commit and push"): add to the notes file what was built and how it
   differs from the board, update `docs/STYLE.md` only for a new token, component or rule, then `/ship <topic>`.

## Done checklist (say it at every stop of stage 2)

The one in `src/web/CLAUDE.md`, *Done checklist for any UI change*: tokens only, no inline styles, it matches the board, one
primary button per view, meaning never by colour alone, 44 px targets, the keyboard, light and dark, and each width the
surfaces have. For a board also: the before and after pictures shown, and the notes file and the README row current. A change
to the list is made there, never only here.

**Blocked** (waiting for the pick, an outside service, another card): `npm run board -- --block <n> "waiting for <what>"`. When
the board cannot be reached, say so in one line and carry on.

**This project's own**: when `.claude/project/ui.md` exists, read it before you start: it holds this project's own steps and rules for /ui, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
