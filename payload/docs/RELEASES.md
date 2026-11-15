# Releases and user testing

How a change goes from "done" to everyone using it, and how real people try it before that. Read by the section.

## The path of one change

| Step | What happens | Who | Proof |
|---|---|---|---|
| 1. Ship | `/ship`: the whole gate, one commit, pushed to main | the agent, on the owner's "done" | the gate in CI is green |
| 2. Release | the release workflow builds the image once, named after the commit, scanned, with its bill of materials | CI | the image is in the registry |
| 3. Staging | the deploy workflow puts it on staging, checks the health address names the commit, watches it | CI | the deploy log, the smoke check |
| 4. Try it | the owner (and testers, below) use it on staging | people | nothing broke that the tests missed |
| 5. Production | the same image, when the owner runs the deploy workflow for production (or approves it as the environment's required reviewer, `docs/CICD.md`) | the owner | the watch passes; else it rolled back by itself |
| 6. Tell people | the changelog and, for something users notice, a short note | `/ship` writes the changelog line | users know what changed |

The same image goes everywhere: never rebuild for production. A change to the infrastructure under it is its own change, with
its own plan and review (`docs/IAC.md`), and goes out before the app change that needs it.

## Versions and the changelog
- Every deploy is named by its commit (the health address answers with it). A **version number** is for people: `npm run
  changelog -- --release v1.4.0` writes the section in `CHANGELOG.md` from the commits since the last one and bumps
  `package.json`.
- **Semantic versions** (major.minor.patch) for anything others build on (an API, a library): major when something they use
  breaks. **Date versions** (2026.11.2) are fine for an app nobody builds on.
- Release often, small: a release a week is easier to undo than one a quarter.

## Releasing safely

| Technique | What it does | When |
|---|---|---|
| The watch after a deploy | the deploy script checks the new version for minutes and rolls back by itself | always (`deploy.watch`) |
| Feature flags | the code ships off, the owner turns it on, for some users first | a change you want to undo without a deploy, or to show to testers only. Start with a setting in the database; OpenFeature with Unleash, Flagsmith or GrowthBook (all self-hostable) when there are many |
| Canary | a small share of traffic gets the new version first | several servers, or a cluster (Argo Rollouts, Flagger, the mesh) |
| Blue-green | the new version runs next to the old, traffic switches at once, the old stays for a quick way back | a database that both versions can use (expand and contract, `docs/RECOVERY.md`) |
| A freeze | no releases in a risky window (a launch day, the holidays) | write it on the board; hotfixes only |

**A hotfix** is the same path, faster: a card, a small fix with its test, `/ship`, staging for minutes, production. Roll back
first when users are hurt, fix after. **A database change** that cannot be undone goes out in its own release, after a backup
that was restored once.

## Release channels

| Channel | Who | How |
|---|---|---|
| Internal | the owner and the team | staging, every merge |
| Beta | testers who signed up | staging or a beta address, or production behind a flag for their accounts |
| Everyone | all users | production |

A beta tester knows they are one: they agreed, they know it can break, and they have one way to report (the feedback form,
which lands in the board's inbox: `npm run board -- --inbox`).

## User testing: watching real people use it

Tests prove the code does what we meant. User testing shows whether what we meant is what people need, and what they cannot
find. Do it before a launch, and for every new screen that matters.

1. **What to learn**: two or three questions ("can a new user plan a week without help?"). Each becomes a task.
2. **Who**: five people who fit the user in `docs/PRODUCT.md` find most of the problems. Not the team, not friends who know the
   idea. Offer something for their time (a voucher, free months).
3. **The script**: a short welcome ("we test the app, not you; say what you think out loud"), the tasks in the user's words
   without the screen's names ("you want to move Tuesday's run to Thursday"), then three questions after. The same script for
   each person.
4. **The session**: 30 to 45 minutes, on a call with screen sharing, or in person. One person leads, one takes notes. Do not
   help; when they are stuck, ask "what would you try?". Note where they hesitate, what they said, what they expected.
5. **Consent and privacy**: before the session, a short consent text: what is recorded, why, who sees it, how long it is kept,
   and that they can stop. Recordings are personal data: keep them in the EU, delete them when the notes are written (or in at
   most 3 months). Use test accounts with made-up data; **never real health or personal data** of anyone in a session.
6. **After**: each problem becomes one line: what happened, how many of the five had it, how bad. The owner picks; each kept
   problem goes on the board with `/idea` (type bug or feature, labelled `user test`). A problem 3 of 5 had comes first.
7. **Again**: after the fixes, a new round with new people. Small rounds often beat one big study.

Unmoderated tools (Maze, Lyssna, UserTesting) let people do the tasks alone and record it: faster, less depth, and their data
terms must fit `docs/SENSITIVE.md`. In-app feedback (a short question after a task, the feedback form) runs all the time, beside
the sessions.
