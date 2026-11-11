# {{PROJECT}} UI style

The binding style guide. Every screen follows it; `/ui` boards are drawn on these tokens. Change this page in the same commit as
any new token, component or rule. (Skeleton from the workflow kit: fill each section from your first board, keep it short.)

## Colour (N tokens, light and dark)
A table: token name, light value, dark value, what it means. Define them as CSS variables on `:root` (light) and
`[data-theme='dark']`. Rule of thumb: ~16 tokens, one brand/primary colour, status colours (ok, warn, alert), neutral surfaces and text.

## Type (N sizes, 2 voices)
Six sizes at most, named (not pixel values in code). Say which voice is for headings and which for body.

## Shape, space, depth
Three radii, one spacing scale (4, 8, 12, 16, 24...), one shadow.

## Components
One line each: name, anatomy, sizes, states. Buttons (primary / secondary / ghost), chips, cards, rows, inputs, toasts, popups,
sheets, empty / loading / error states.

## Rules for every new feature
1. Only tokens: colours, sizes, radii and gaps come from this page.
2. Only these components. If none fits, design the new part as a board first.
3. One primary button per view.
4. Meaning never rests on colour alone: icon and words too.
5. Works on a phone: 44 px taps, the panel is a bottom sheet, the feature is mocked at phone width.
6. No inline styles in the UI code: classes in the style sheet, built from the tokens; check both themes.
7. Text is short, plain and measured: "5.8 km new to you", not "Great news!".
8. <your own rules, added as boards agree them>

## Adding a screen or a part
1. Check this page. Use what is there.
2. If a part is missing, draw it as a board first (`/ui`, stage 1: an HTML board in `docs/design/`, same tokens), say what it replaces, and get it agreed.
3. Build it in `src/web` from the tokens. No new colours, sizes or radii.
4. Look at it in light and dark, on desktop and phone width.
5. In the same commit: a new token, component or rule goes on this page; what the board agreed and how it was built goes in its notes file (below).

## Board notes (one file per board, in `docs/design/notes/`)
What each board agreed, when, and how it was built differently. Read the one for the screen you work on, not all of them; a new board
gets its own file and a row in `docs/design/README.md`. (The `/ui` skill reads this page only down to this heading.)
