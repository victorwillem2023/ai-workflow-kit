# {{PROJECT}}: architecture

How the parts fit. `/setup` writes the first version; a change to the layers or the flow updates it in the same commit.
The file-by-file map is `docs/MAP.md` (generated: `npm run map`).

## Layers
<one line per folder: what lives there, what it may import. The same rules are enforced by `boundaries` in workflow.config.json.>

## How a request flows
<step by step, with the file that does each step>

## Where state lives
<memory, browser storage, database, files; who writes and who reads>

## Outside services
<each one: what it is for, how it is reached, how tests fake it>
