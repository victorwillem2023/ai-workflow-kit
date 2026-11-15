
## The app map
`docs/flow/map.js` holds every decision the app makes as yes/no trees, each end marked built, `weak`, `gap` or `building`; the
owner opens `docs/flow/index.html` to see where things stand. A change that adds, removes or changes a decision updates its node
in the same commit (`grep -n` the file, never read it whole, never read `index.html`). What a kind of request does is a row in
`docs/requests/<kind>.md` (index: `docs/REQUESTS.md`): read the page before changing it, update the row in the same commit, then
run `node docs/flow/build-requests.mjs` (never edit `docs/flow/requests.js` by hand).
