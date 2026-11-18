---
name: arch
description: The {{PROJECT}} architecture board ("/arch one repo or several for the portal?", "/arch should we split the importer out"): the architecture panel of /advise (simplicity and cost, operations and scale, security and data, product and time), for decisions that are hard to undo. Read-only. Run from the main folder.
model: opus
disable-model-invocation: true
---

# /arch <question>  or  /arch <card number>

This is `/advise architecture <question>`: follow `.claude/skills/advise/SKILL.md` with the architecture panel
(`docs/company/ADVISORS.md`, `docs/run/SCALING.md`, *The architecture board*).

- **Use it for what is hard to undo**: a new service or datastore, a platform or provider, a boundary, the repository shape.
- **A small or easily undone question** does not need it: say so, and answer it directly.
- **Calls between services (a service mesh), or agents of other makers**: the kit's library has a guide for each
  (`npm run library -- --show mesh`, `--show a2a`). Bring it into the brief, and into the project only on a yes.

**This project's own**: when `.claude/project/arch.md` exists, read it before you start: it holds this project's own steps and rules for /arch, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
