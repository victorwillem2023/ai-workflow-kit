# The AI workflow kit: notes for agents working on the kit itself

This repository is the kit, not a project that uses it: `install.mjs` copies `payload/`, `starter/` and `modules/` into a project.
This file is never installed (a project's `CLAUDE.md` comes from `starter/CLAUDE.md`).

## Every change
- **Quick checks**: `npm run test:quick` (seconds). Text agents read may not grow without a reason: `node scripts/text-sizes.mjs`
  says which grew and how to record why (`--accept <file> "<why>"`). Shorten first.
- **Kit tests that need a project** (`payload/workflow/tests`): install into a throwaway folder in the scratchpad and run them
  there. The full self-test (`npm test`) is the owner's: they run it after several releases.
- **Review before every commit**: `npm run review` (`scripts/kitreview.mjs`) hands the uncommitted change to a fresh agent that
  had no part in it and looks for bugs only. Fix each finding, or tell the owner in plain words why it is not one. Say what it
  found in the report, even when it found nothing.
- **A change to `/anatomy`, `/review` or `/spec`**: `npm run test:quality -- <scenario>` (`scripts/qualitytest.mjs`, costs tokens;
  `--list` names them) grades what the skill answers on a planted project; a score below the "was" it prints (that scenario's last run in
  `scripts/quality-scores.jsonl`) is a finding. Before a release, run every scenario once.

## A release
Two commits: the change ("What changed for the person using the kit", then why), then "Kit X.Y.Z: ..." with `CHANGELOG.md`,
`VERSION` and the version in `README.md`. An annotated tag `vX.Y.Z` on the release commit, with its subject. Push only when the
owner says so. Commit messages end with the co-author line the conversation gives.
