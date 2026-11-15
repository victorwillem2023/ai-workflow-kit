---
name: lesson
description: Turn a correction from the owner into something that lasts in {{PROJECT}} ("/lesson never rename a public function without listing its users", or "remember this"). Makes a check when it can be checked, else one line in the right file.
model: haiku
---

# /lesson <what went wrong, or what to do from now on>

A correction that is only said once is made again next week. Pick the first that fits, and do only that:

1. **It can be checked by a machine** (a file that must not grow, a folder that must not import another, a word that must not
   appear): say which check in `tools/workflow/` would catch it and make a card: `npm run board -- --add "<title>" --label workflow`.
   Do not write the check here.
2. **It is about one folder**: one line in that folder's `CLAUDE.md`, under *Rules here*.
3. **It is about how we work**: one line in the root `CLAUDE.md`, in the section it belongs to.

Rules for the line: one sentence, what to do and why in a few words. First `grep -n` for a line that already says it: sharpen
that one, never add a second. If the file is over its size (root about 13 KB, a folder file about 2 KB), take out the line
that matters least and say which. Show the owner the line before writing it. No commit: it rides with the next feature.
