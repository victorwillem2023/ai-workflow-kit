---
name: secops
description: Act on {{PROJECT}}'s weekly security report ("/secops", "what did the security scan find?", "fix the security findings"): reads the latest report, says in plain words what needs the owner, proposes a fix for each finding, and on the owner's yes makes it a card or a small fix. Never fixes without a yes; never commits by itself.
model: sonnet
---

# /secops

The weekly run (`.github/workflows/secops.yml`) writes the report; this skill turns it into decisions. Run it from the main folder.

1. **Read the latest report**: `gh issue list --repo <board.repo> --label security-report --state open --limit 1`, then
   `gh issue view <n> --repo <board.repo>`. No report yet, or older than a week: `npm run secops -- --scan` makes one here
   (needs Docker), and say the weekly run starts on Monday after the first push (or by hand: Actions, *secops*, *Run workflow*).
   Also `npm run updates`: library fixes that already wait as pull requests are not to be done twice.
2. **Say what it means**, in plain words, worst first, in at most ten lines: what could happen to the app or its users for
   each finding under *Needs you*, and whether a pull request already fixes it. *Worth a look* and *Low*: one line with the count
   and anything that stands out. Findings under *In the kit's own files* belong to the ai-workflow-kit: say so, don't fix them here.
3. **Propose one fix per finding**, each with a recommendation:
   - a library with a fixed version and a waiting pull request: take that pull request;
   - a library with a fixed version and no pull request: a small fix (`npm install <lib>@<version>`, or the library that pulls it
     in), checked by `npm run gate:all`;
   - our own code: the change, with a test whose name says what is now refused (`docs/SECURITY.md`, *Rules for code*); safe by
     design instead: a `nosemgrep: <rule>` comment with the reason on the line before, never without a reason;
   - a secret in the history: **first** change it at its provider (the owner does this), then take it out of the code and say
     that the old value stays in git's history and must be treated as leaked;
   - a setup mistake (Dockerfile, infrastructure files): the change the report names.
   Stop for the owner's yes, per fix or for all of them.
4. **On yes**: a fix of a few lines goes through the bug route in a session (`/work` style: `node scripts/session.mjs <topic>`,
   the test first, the gate, the owner tries it, one commit on "done"); anything larger becomes a card (`/idea` with the finding,
   the label `bug` and `area` from the file). Then a comment on the report issue: what was decided for each finding.
5. **Write it down**: a fixed or accepted finding gets its line in `docs/SECURITY.md` (*Fixed*, or *Known gaps* with the card).
