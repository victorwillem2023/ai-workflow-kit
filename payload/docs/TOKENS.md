# Keeping AI sessions cheap

Why the flow and the docs are shaped the way they are. An agent pays for every token it has read again on every later turn of
the same chat, so the cost of a session is mostly what it read early and carried along. Each rule below cuts one of those.
The binding rules are in `CLAUDE.md` (*Reading the code cheaply*, *Never read*); this page is the reasoning, for the owner.

## Chats
| Rule | Why |
|---|---|
| **A new chat per build.** `/work` plans and stops at the yes; `/build <topic>` runs in a new chat. A `ui` card: `/ui <n>` draws and stops at the pick; `/ui <n>` again in a new chat builds it. | The spec carries everything the build needs. Without the split, the whole planning read (cards, docs, code searched for the plan, a 35-100 KB board page) is sent again on every feedback round. A small bug without a spec stays in one chat. |
| **Builders are subagents** that read the spec and the `CLAUDE.md` of the folders they touch. | The lead chat stays small; feedback goes to the same builder, which keeps its own context. |
| **Cheap helpers on a small model**: `/idea`, `/docs`, `/check`, `/find` (`model: haiku` in Claude Code, the `cheapModel` in OpenCode). | They are easy to check and to rerun. The flow itself never runs on a free model: a free model that runs out mid-build stalls it. |

## What is loaded by itself
| Rule | Why |
|---|---|
| **Root `CLAUDE.md` short** (about 10-13 KB): each rule once, details behind a pointer. | It is read at the start of every chat. |
| **Folder `CLAUDE.md` files hold only their rules** (bullets, 1-4 KB). Where things are lives in `docs/code/<folder>.md`, read by `grep -n`. | A folder's `CLAUDE.md` is loaded with every file read in that folder. |
| **`/build` reads its rare cases only when needed** (`build/several.md` for several topics or work packages). | The skill text is loaded on every build. |

## Reading code and docs
| Rule | Why |
|---|---|
| **The file map is searched, never read**: `npm run map -- --find <word>` prints at most 25 lines, without imports (`--imports` adds them); `--uses <file>` lists importers. | The map of a grown project is 100 KB or more. |
| **The guide is an index plus one file per part** (`docs/GUIDE.md` + `docs/guide/*.md`); a part past about 15 KB is split by topic. | A session opens only the part a change touches. |
| **Big reference docs are read by the section** (`grep -n '^## '`): `docs/ARCHITECTURE.md`, `tools/workflow/README.md`, the design index of the ui module (by row). | Each is 15-25 KB once the project grows. |
| **Every source file opens with a one-line comment**; `head -5` before opening, `grep -n` for the function, read only that range. | The map is built from those comments, and a whole-file read is rarely needed. |
| **A never-read list** in `CLAUDE.md`: `node_modules/`, `dist/`, lock files, `.env`, data folders, generated files, recorded test output, board HTML pages. | One accidental read of a lock file or a results folder can cost more than the whole task. |

## Output
| Rule | Why |
|---|---|
| **`npm test` prints only failures and one total** (`tools/workflow/lib/quiet-reporter.mjs`); `npm run test:full` keeps a line per test. | The default reporter printed 684 KB for a passing run of about 1,300 tests. |
| **The gate is quiet when it passes** (one line per check) and prints only the tail of a failure (`failTailLines`). | The agent reads the result, not a log. |
| **Small files** (the size rule: 400 lines for a new file, baselined giants may only shrink). | A change reads and rewrites less, and the gate runs fewer tests. |

## Checking what a session spent
At the end of a normal `/work` chat and its `/build` chat, ask for a usage breakdown (`/explain-usage` where the agent has one, or
the agent's own cost view). Whatever reads dominate become the next rule here.
