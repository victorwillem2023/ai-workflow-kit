# More than one person: who decides, who builds, who checks

The kit starts with one owner who decides and an AI that builds. A second person changes three things: who says yes to a plan,
how two people's sessions share one board, and who looks at a change before it lands. This page is the working flow for that;
access (who has which account) is `docs/company/ACCESS.md`. `/setup` reads it when the project is for a team
(`project.audience: team`), `/work` and `/ship` when a card has someone else on it. Read by the section.

## The roles, written down once
Put them in `CLAUDE.md`, *This project's own rules*, one line each, by GitHub name:
- **Product owner**: decides what gets built and in what order (the board's value labels, `/tidy`'s choices), and says yes to
  plans. One person; with two, write down who decides a tie.
- **Builders**: start sessions, hand changes over to be tried, ship. Anyone on the team.
- **Reviewer**: looks at a change before it lands, and is never the person who built it. For a sensitive file
  (`sensitive.paths`) the sign-off is still the product owner's own (`docs/workflow/SENSITIVE.md`).
The skills say "the owner": in a team that is the product owner for a yes to a plan or a sign-off, and the builder for "done"
with their own change.

## Who says yes to whose plan
- **The builder writes the plan** (`/spec`), the product owner says yes. Typing `/build` is the yes, so in a team the product
  owner types it, or writes "approved" on the card and the builder types it in a new chat, saying so.
- **A small fix** (no spec) needs no yes from someone else; a fix to a sensitive file always does.
- **A plan that changes another person's area** (the area labels): that person reads it first.

## Two people on one board
- **One card, one person**: whoever starts a card takes it (`gh issue edit <n> --repo <board.repo> --add-assignee @me`) before
  `/work <n>`, so the other person's `/next` sees it is taken. A card in *In progress* with someone else's name is theirs.
- **Each person has their own clone**, their own main folder and their own session folders. Sessions never cross computers; the
  board and GitHub are the only shared place.
- **Shared files** (`README.md`, the guide, and the others `CLAUDE.md` names under *Git and sessions*): small edits to your own
  lines only, as for parallel sessions. A conflict keeps both sides.
- **Talk on the card**: a question about a card is a comment on it, not a chat message, so the next person finds it.

## Review between people
- **Pull requests, not straight to main**: `"flow": "pr"` under `session` in `workflow.config.json`. `--finish` opens a pull
  request; `node scripts/session.mjs --merge <topic>` lands it only when its checks are green and, with the rule below, a review.
- **Make GitHub hold it**: `node tools/workflow/protect.mjs` sets the rule against force pushes and deleted branches; in the
  repository's settings, add *Require a pull request before merging* with one approval (needs a public repository or a paid
  plan, as `protect.mjs` says). A `CODEOWNERS` file can ask a named person for the folders that are theirs.
- **What a reviewer looks at**: the spec and the diff, as `/review` does (anyone can run it for a second opinion), then tries the
  change the way its hand-over says (`.claude/skills/build/try-it.md`). Approve, or comment with what to change; never fix
  someone else's branch without asking.
- **A builder never approves their own pull request**, and an agent never approves at all: the approval is a person's.

## Working with each other's AI sessions
- An agent works only in the session folder it made. A folder, branch or card it does not know is someone else's: it leaves it
  and says so (`CLAUDE.md`, *Git and sessions*).
- The project's own rules and command steps (`CLAUDE.md`, *This project's own rules*; `.claude/project/`) are shared through git,
  so everyone's agent works the same way. A rule one person wants is proposed as a commit like any change.
- `/retro` is for the team: each person's view of what got in the way, and the rule it becomes is agreed, not decided alone.
