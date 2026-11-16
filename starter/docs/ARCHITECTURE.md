# {{PROJECT}}: architecture

How the parts fit. `/setup` writes the first version; a change to the layers or the flow updates it in the same commit.
The file-by-file map is `docs/MAP.md` (generated: `npm run map`).

## Layers
<!-- covers new files: src/*/CLAUDE.md -->
<one line per folder: what lives there and what it does.>

What each may import (made from `boundaries` in workflow/config.json by `npm run map`, enforced by the gate):
<!-- generated: layers -->
<!-- /generated -->

## How a request flows
<step by step, with the file that does each step>

## Rules and where each lives
A rule is something every feature must keep to (how a total is worked out, what counts as valid input, who may see what). Each
has one home. Before a fix, find the rule here and change it in its home (`CLAUDE.md`, *Fix it where the rule lives*). The last
column is honest about copies that exist: each is work to do, not a pattern to follow.

The kinds of case a rule can be shared by: <the kinds this app has, for example: a new item, an edit, an import; signed in, guest>

| Rule | Its home | Who calls it | Copies today |
|---|---|---|---|
| <the rule, in plain words> | <the file, and the function> | <the files that call it> | <none, or where the copy is> |

## Where state lives
<memory, browser storage, database, files; who writes and who reads>

## Outside services
<each one: what it is for, how it is reached, how tests fake it>
