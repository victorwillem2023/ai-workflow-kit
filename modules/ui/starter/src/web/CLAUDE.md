# src/web: notes for AI coding agents

Loaded when you work on the UI (`src/web`, the style sheet, `index.html`). The overall flow and rules are in the root CLAUDE.md;
`docs/MAP.md` lists every file.

**New feature here**: <where a new action, a new style and a new panel go: one line, folder names>. Rules: root CLAUDE.md,
*Code structure* and *Changing existing code*.

## Rules here
<Only the rules for this folder, as bullets: which narrow context each area file gets, where start-up code goes, how the
style sheet is split. Keep this file short: it is loaded with every file read in `src/web`.>

**Where things are**: `docs/code/web.md` holds the notes on where each part of the UI lives and how it connects.
`grep -n` it for the feature or name you touch; read it whole only for work across the area.

## UI style (the bible: `docs/STYLE.md`)
Every screen, panel and popup follows `docs/STYLE.md`. It is binding, not advice. The mockups are in `docs/design/png/` (index in
`docs/design/README.md`: grep it for the board number, don't read it whole); what still has to move to the style is on the board (label `ui`, one card per screen or part): read that
card first and leave a comment on it when you stop.

**Before writing or changing any UI code:**
1. Read the core of `docs/STYLE.md` (tokens, components, rules; it ends with the *Board notes* index), then the one board for that
   screen: its picture in `docs/design/png/` and its notes file in `docs/design/notes/`. Not the other notes files. Build what the board shows.
2. Use only the tokens and components in `docs/STYLE.md`. No new hex colours, font sizes, radii, shadows or inline `style` attributes.
3. Behaviour rules: one primary button per view; meaning never rests on colour alone; taps are 44 px; works at phone width, in light
   and dark, with the keyboard.
4. <Project rules that came out of boards: shared empty/loading/error states, the one bottom sheet on phones, and so on.>
5. **A new screen or part** (nothing on a board yet) is never invented in code: it goes through `/ui <n>` stage 1 (an HTML board with
   variants A, B, C and its pictures, `.claude/skills/ui/SKILL.md`), the owner picks, and stage 2 builds the pick, in the same commit
   as the board, its notes file and its README row. A card that is not labelled `ui` and turns out to need one: stop and ask to
   relabel or split it. **A small tweak to a part that exists**: a fast live draft is allowed, no board, one pass, then the owner tries it.
6. If you must deviate from a board, say so in the commit body and in your reply, and write it in the board's notes file (`docs/STYLE.md`
   too when a token, component or rule changes). Never leave code and style sheet disagreeing.

Rules 1 to 4, 6 and the checklist below hold for every edit in `src/web`, whatever the card's label; only the board, the
pictures and the numbered feedback rounds are kept to `ui` cards.

**Done checklist for any UI change** (say it in the reply): tokens only, no inline styles, matches the board, 44 px targets,
keyboard works, light and dark, phone width, the board card closed if one shipped.
