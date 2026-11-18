---
name: secops
description: Act on {{PROJECT}}'s weekly security report ("/secops", "what did the security scan find?", "fix the security findings"): reads the latest report, says in plain words what needs the owner, proposes a fix for each finding, and on the owner's yes makes it a card or a small fix. Never fixes without a yes; never commits by itself.
model: sonnet
disable-model-invocation: true
---

# /secops

The weekly run (`.github/workflows/secops.yml`) writes the report; this skill turns it into decisions. Run it from the main folder.

## 1. Read the latest report

- `gh issue list --repo <board.repo> --label security-report --state open --limit 1`, then `gh issue view <n> --repo <board.repo>`.
- No report yet, or one older than a week: `npm run secops -- --scan` makes one here (it needs Docker). Say that the weekly run
  starts on the Monday after the first push, or by hand: Actions, *secops*, *Run workflow*.
- Also `npm run updates`: library fixes that already wait as pull requests are not to be done twice.

## 2. Say what it means

In plain words, worst first, ten lines at most:
- each finding under *Needs you*: what could happen to the app or its users, and whether a pull request already fixes it;
- *Worth a look* and *Low*: one line with the count, and anything that stands out;
- findings under *In the kit's own files* belong to the ai-workflow-kit: say so, and do not fix them here.

## 3. Propose one fix per finding

Each with your recommendation:
- **A library with a fixed version and a waiting pull request**: take that pull request.
- **A library with a fixed version and no pull request**: a small fix (`npm install <lib>@<version>`, or the library that pulls
  it in), checked by `npm run gate:all`.
- **Our own code**: the change, with a test whose name says what is now refused (`docs/SECURITY.md`, *Rules for code*). When
  the code is safe by design instead: a `nosemgrep: <rule>` comment with the reason, on the line before; never without a reason.
- **A secret in the history**: **first** the owner changes it at its provider. Then take it out of the code, and say that the old
  value stays in git's history and must be treated as leaked.
- **A setup mistake** (the Dockerfile, the infrastructure files): the change the report names.

Stop for the owner's yes, per fix or for all of them.

## 4. On yes

- **A fix of a few lines** goes through the bug route in a session, as `/work` does: `node workflow/scripts/session.mjs <topic>`,
  the test first, the gate, the owner tries it, one commit on "done".
- **Anything larger** becomes a card: `/idea` with the finding, the label `bug`, and the `area` from the file.

Then comment on the report issue: what was decided for each finding.

## 5. Write it down

A fixed or accepted finding gets its line in `docs/SECURITY.md`: under *Fixed*, or under *Known gaps* with its card.

**This project's own**: when `.claude/project/secops.md` exists, read it before you start: it holds this project's own steps and rules for /secops, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
