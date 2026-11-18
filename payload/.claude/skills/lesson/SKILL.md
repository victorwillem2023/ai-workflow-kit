---
name: lesson
description: Turn a correction from the owner into something that lasts in {{PROJECT}} ("/lesson never rename a public function without listing its users", or "remember this"). Makes a check when it can be checked, else one line in the right file.
model: haiku
---

# /lesson <what went wrong, or what to do from now on>

A correction that is only said once is made again next week. Pick the first of these that fits, and do only that one:

1. **A machine can check it** (a file that must not grow, a folder that must not import another, a word that must not
   appear): say which check in `workflow/tools/` would catch it, and make a card:
   `npm run board -- --add "<title>" --label workflow`. Do not write the check here.
2. **It is about one folder**: one line in that folder's `CLAUDE.md`, under *Rules here*.
3. **It is about how we work**: one line in the root `CLAUDE.md`, under *This project's own rules*.
   - A project from before that section has none: add `## This project's own rules` at the end.
   - Never write between the kit's `<!-- kit:... -->` markers: an update replaces those.

   **It is about one command** ("/spec must also ..."): one line in `.claude/project/<command>.md`, saying where it goes
   ("after step 3"; `.claude/project/README.md`).

## The line itself

- One sentence: what to do, and why in a few words.
- First `grep -n` for a line that already says it: sharpen that one, never add a second.
- Only what every reader of that file needs. A rule only some work needs belongs in a skill or a folder file, not the root.
- When the file is over its size (the root about 20 KB, a folder file about 4 KB), take out the line that matters least, and
  say which.
- Show the owner the line before writing it.

No commit: the next `/ship` puts it in, as its own commit or with the feature, as the project chose (`commits.notes`).

**This project's own**: when `.claude/project/lesson.md` exists, read it before you start: it holds this project's own steps and rules for /lesson, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
