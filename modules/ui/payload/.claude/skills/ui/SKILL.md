---
name: ui
description: Work on one {{PROJECT}} ui card (a screen, a part, or a tweak to one): stage 1 draws an HTML board with variants A, B, C and its pictures, and stops for the owner's pick; stage 2 builds the pick in src/web in the same chat, in numbered feedback rounds with before and after pictures. Only for a card with the ui label. Run from the main folder.
---

# /ui <card number>

UI work has two stages and stops twice: after the board (for the pick) and after every build round (for the owner to try
it). `/work <n>` sends a `ui` card here. Never commit before the owner says done.

## 0. Is this a ui card?
`npm run board -- --show <n>` (one card, never the whole board). Closed, *Done* or *Blocked*: as `/work` step 1.
- **Already picked**: `grep -l "Card: #<n>" specs/*.md` finds a spec with "Owner approval: approved on ...": the board is
  drawn and picked, and this new chat is stage 2. Go straight to *Stage 2*.
- **No `ui` label** (another type, or none): stop. Say "Card #n is labelled `<type>`, not `ui`, so /ui does not run on it", and ask
  which type it is (with a recommendation). Relabel only on the owner's yes (`gh issue edit <n> --repo <board.repo> --add-label ui
  --remove-label <old>`). A `feature` card that turns out to need a new screen is relabelled `ui`, or split into a `ui` card and a
  `feature` card, with the owner's yes; it is never run through `/ui` halfway.
- **Read only this** for UI work: `src/web/CLAUDE.md` (rules and done checklist), the core of `docs/STYLE.md` (tokens, components,
  rules; stop at *Board notes*), and the one notes file in `docs/design/notes/` for the board this card is about
  (the *Board notes* index at the end of `docs/STYLE.md` says which; a board with no notes file: `grep -n` its number in
  `docs/design/README.md`, never read that whole). Not the other notes files.

## Short path: a small tweak to a part that exists
"The button feels clunky", a spacing, a label, a colour that breaks a rule: no board. Say in two lines what changes and which file
in `src/web`, start the session (`node scripts/session.mjs <topic> --card <n>`), make it as a fast live draft, one pass, take the
after picture (below), and stop for the owner to try it. The style rules and the done checklist still apply. If it grows into a new
part or a second screen, stop and go to stage 1.

## Stage 1: design (no app code)
1. Start the session now (`node scripts/session.mjs <topic> --card <n>`, from the main folder): the board is committed with the
   feature. Work only in `../{{PREFIX}}-<topic>`, with absolute paths, every Bash command starting `cd <folder> &&`.
2. Draw **one HTML board** in `docs/design/<Name>.html` (the next board number: `tail -5 docs/design/README.md`):
   Start from `docs/design/board-template.html` (copy it; it already has the variants A, B, C, the phone width and the states).
   - on the real tokens: `<link rel="stylesheet" href="../../src/web/styles.css">` for the variables (light on `:root`, dark on
     `data-theme='dark'`), the board's own layout in a short `<style>` built from those variables; no hex, no new size or radius;
   - **variants A, B, C** side by side on the one page, each with a letter, a one-line name and what it costs or gives up; mark the
     one you recommend and say why in one sentence; the phone width (400 px) drawn for at least the recommended one;
   - the real words the app would show (short, plain, measured), the states that matter (empty, loading, error) where they apply.
3. Pictures with the T1 script, four of them, in `docs/design/png/`:
   ```sh
   node scripts/shots.mjs docs/design/<Name>.html --width 1320 --theme light --full --out docs/design/png/<n>-<Name>.png
   node scripts/shots.mjs docs/design/<Name>.html --width 1320 --theme dark --full --out docs/design/png/<n>-<Name>-dark.png
   node scripts/shots.mjs docs/design/<Name>.html --width 400 --theme light --full --out docs/design/png/<n>-<Name>-phone.png
   node scripts/shots.mjs docs/design/<Name>.html --width 400 --theme dark --full --out docs/design/png/<n>-<Name>-phone-dark.png
   ```
   Look at each picture (Read the png) before showing it: text cut off, overlaps, a variant that reads wrong in dark.
4. Add the board's row to `docs/design/README.md` ("proposed <date>") with its notes link, and start its notes file
   `docs/design/notes/<n>-<topic>.md` (title, what the board asks, the variants in one line each) plus its link in the *Board notes*
   index of `docs/STYLE.md`.
5. **Stop.** Show the four pictures' paths and the recommendation, and ask for the pick in the owner's words ("B, with A's header").
   Move the card to *Needs a board or decision* while waiting.
6. **On the pick** (same chat): write `specs/<topic>.md` in the main folder from `tools/workflow/templates/spec.md`, short: the
   board file, its picture paths and the pick in the owner's words, "Owner approval: approved on <date>", the files (all in
   `src/web`; anything outside it said out loud, and then it needs a test as for a feature), the docs (`docs/STYLE.md` only for a
   new token, component or rule; the notes file; the README row; the guide part in `docs/guide/` and README when what the user
   can do changes). Write the pick and the date into the notes file. Then **stop**: tell the owner to open a new chat in the main
   folder and run `/ui <n>` again. The build starts from the spec and the pictures, so the board's HTML (often 35 to 100 KB)
   isn't sent again on every build and feedback round.

## Stage 2: build (a new chat, in the session folder; no `/build` subagent)
1. Read the spec and copy it into `../{{PREFIX}}-<topic>/specs/` (as `/build` step 3). Then read only `src/web/CLAUDE.md`, the core
   of `docs/STYLE.md`, the board's notes file and its four pictures. Open the board's HTML only with
   `grep -n` for the part you are building, never whole. Work only in the session folder, with absolute paths, every Bash command
   starting `cd <folder> &&`. Move the card to *In progress*.
2. Take the **before** pictures of the live app at the session's port (only for a part that exists), then build the pick in
   `src/web` from the tokens. `npm run gate` until it passes.
   ```sh
   node scripts/shots.mjs http://127.0.0.1:<port> --width 1400 --theme dark --click "<selector>" --out <scratchpad>/before-1.png
   ```
   The owner runs `npm run dev` in the session folder (offer to start it in the background); never tell them to rebuild.
3. Take the **after** pictures with the same command (same width, theme, clicks), look at them, then **stop**: move the card to
   *Waiting for your check*, give the URL `http://127.0.0.1:<port>`, the before and after paths, what differs from the board and
   why, and the "unsure" list.
4. **Feedback rounds.** Ask for feedback as one numbered list per round ("1. the chip is too tall 2. ..."). One pass per round:
   answer every number (done, or why not), change only `src/web` (a number that needs core logic is said out loud and becomes its
   own card: `/idea`), new after pictures from the same commands, stop again. No commit between rounds.
5. **Done** only when the owner says so ("finish it", "commit and push"): add to the notes file what was built and how it differs
   from the board, update `docs/STYLE.md` only for a new token, component or rule, then `/ship <topic>`.

## Done checklist (say it in every stop of stage 2)
Tokens only, no inline styles, matches the board (or the difference said), one primary button per view, meaning not by colour
alone, 44 px targets, keyboard works, light and dark, phone width, before and after pictures shown, the notes file and the README
row current.

**Blocked** (waiting for the pick, an outside service, another card): `npm run board -- --block <n> "waiting for <what>"`. If the
board cannot be reached, say so in one line and carry on.
