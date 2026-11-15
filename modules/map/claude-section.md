
## The app map
`docs/flow/map.js` holds every decision the app makes as yes/no trees, each end marked built, `weak` (a known problem), `gap`
(not built) or `building`. The owner opens `docs/flow/index.html` in a browser to see where things stand. When a change adds,
removes or changes a decision, update its node in the same commit and name it in the report. `grep -n` the file for the words,
never read it whole, and never read `index.html` (the viewer). The format is in the file's first lines.
What a kind of request does, and whether the owner decided it, is a row in `docs/requests/<kind>.md` (index: `docs/REQUESTS.md`):
read the kind's page before changing what it does, update its row in the same commit, then run
`node docs/flow/build-requests.mjs` (it rewrites `docs/flow/requests.js`; never edit that file by hand).
