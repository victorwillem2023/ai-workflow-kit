# This project's own steps and rules for the commands

The kit's skills (`.claude/skills/`) are the kit's: an update replaces them whole. What is truly this project's goes here, one
file per command, named after it: `.claude/project/spec.md` for `/spec`, `ship.md` for `/ship`, `work.md`, `ui.md` and so on.
Each skill reads its file before it starts. The kit's updates never write in this folder (this README aside).

Each line says where it goes and what to do, in plain words:

    # /spec, for this project
    - After step 3: fill the "Route kinds" line with the kinds this card touches (the list: docs/REQUESTS.md, *The kinds*).
    - Always: a request row the card changes is named under "Files that change" with its page.

    # /ship, for this project
    - Before step 6: the request rows the spec names say "being built" with the card, then "built" with the test.

"After step <n>", "before step <n>", "instead of step <n>" or "always". A line can add to a command or change one of its steps;
it never takes away the owner's yes or "done", the gate, or a sign-off (a skill that meets one asks the owner instead).

What goes elsewhere:
- a rule for all the work, not one command: `CLAUDE.md`, *This project's own rules* (the kit's parts there are between
  `<!-- kit:... -->` markers; an update replaces only those);
- a rule about one folder: that folder's `CLAUDE.md`;
- a setting the kit has (a path, a list, a choice): `workflow.config.json`;
- a rule a machine can check: a check (`/lesson` says which).
