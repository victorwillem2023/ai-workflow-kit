// What may be written in the main folder: docs and settings, the owner's notes (any .md, the files under docs/ such as the app
// map and the data it is drawn from, the config, renovate.json, the agents' settings). Code is written only in a session folder:
// `--check-main` stops on code left there, and the stop-point hook refuses an agent's edit of it (stop-points.mjs --edit). A
// script under docs/ that node runs (.mjs, .cjs, .ts...) is code, not a note: docs/ is outside the tests' reach, so nothing
// would check an edit of it made there. A plain .js data file there (docs/flow/map.js) stays a note. No I/O here.
export const NOTE = /(\.md$|^docs\/(?!.*\.(?:[cm]js|[cm]?tsx?|jsx)$)|^workflow\/config\.json$|^renovate\.json$|^orca\.yaml$|^\.claude\/|^\.opencode\/)/i;
