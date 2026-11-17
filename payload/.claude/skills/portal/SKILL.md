---
name: portal
description: Open the {{PROJECT}} docs portal in a new browser tab ("/portal", "show me the docs", "open the dashboard", "where is everything?"): every doc in one place, with the phase, the stage, the board and the latest decisions at the top. Starts it in the background when it is not running. Read-only.
model: haiku
---

# /portal

Cheap and read-only: change no file.

1. Run `npm run portal` in the main folder. It starts the portal in the background when it is not running and opens it in a
   new browser tab (the link is printed too).
2. Say in one or two lines, in plain words: the link, that every page is made from the docs when it is opened and an open tab
   reloads itself when a doc changes, and that it runs until the computer restarts or `npm run portal -- --stop`.
3. If it says the port is in use: another program (or another project's portal) has it. Say so, and that
   `"portal": { "port": <a free number> }` in `workflow/config.json` gives it another one (offer to add it; do it on a yes).

4. The portal wears the project's own style sheet (`docs/STYLE.md`: its colours, font, sizes and radii). When there is none
   yet, or only the kit's empty skeleton, the page says so and wears a plain look: offer, in plain words, to make the style
   sheet first ("the look of the app, written down once; the portal and every new screen follow it"), with `/ui` (the ui
   module). On a yes, that is its own piece of work; the portal follows the sheet as soon as it is written.

Nothing to do in the portal itself: it only reads. A doc to change is `/docs`; a question about the code is `/find`.
