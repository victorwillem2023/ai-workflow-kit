# Performance: how fast it must be, and how we know

Speed is a feature people feel before they read a word, and capacity is what keeps a launch day from being an outage. The kit
treats both like the rest: goals written down, checked by scripts that pass or fail the same way every run. Read by the section.

## Goals first
`performance` in `workflow/config.json` holds the pass lines; every test below checks against them:
| Goal | Start with | Why that number |
|---|---|---|
| `maxKb`: what a page downloads before it works, compressed (each page on its own: `pages`, [{ name, html, maxKb }]) | 250 KB | a mid-range phone on a slow 4G network shows it in about 3 seconds |
| `speed`: each page on a slow phone (`speed.pages.<name>`: `ready`, a test true once a person can use it; `tap`, the main button; `tapDone`, a test true once its answer shows) | today's numbers | the first run in the main folder is the baseline (`workflow/tools/speed-baseline.json`); slower fails, Google's lines (2.5 s, 200 ms) are said as advice |
| `goals.p95ms`: 95% of requests answered within | 300 ms | below this a click feels immediate; the slowest 5% are allowed to be slower |
| `goals.errorRate`: failed requests | under 1% | under load some may fail; more means something is breaking |
| `load.users`: people at the same time on a normal busy hour | 20 | change it to what you expect: the number from your analytics, or users a day / 10 for a start |
Raise a goal only with the owner's yes and why, the same as a file that grows.

## The screens
| Check | How | When |
|---|---|---|
| **Page weight** | the gate's `page weight` check (`workflow/tools/perfbudget.mjs`): each page with what it loads at start-up, compressed, against `maxKb` | every change to screens or the build; advice in a prototype, a failure from pilot on |
| **The steps a person takes** (open the app, plan, swipe to the next card), each on slow 4G with a slowed phone and on fast 4G, with what it downloaded | the same check: the walks `speed.walks` names (`tests/smoke/`, a name per step), against the built app `speed.serve` starts; `npm run speed -- --walks` | the same; at the hand-over of a card that changes a walk, its before and after |
| **Speed on a slow phone** (first screen, usable, a tap answered) | the gate's `speed` check (`workflow/tools/speed.mjs`, `npm run speed`): each built page in a headless Chrome slowed like a phone, against its baseline | the same; it needs the ui module's browser |
| **Core Web Vitals of real people** (how fast the main content shows, how fast a tap answers, how much the page jumps: LCP under 2.5 s, INP under 200 ms, CLS under 0.1) | `src/web/vitals.ts` (the production module, with Google's `web-vitals` library) sends them, with the page's path only, to the server log: `logs.mjs <topic> --page` in development, the log service in production (a poor one is a warning) | always, once wired; your own phone's numbers while you try a build |
| **Accessibility and a working main action** | the e2e smoke tests with the axe scan (`stack.md` part 7) | every change to screens |
Fixes, in order of how much they give: load a heavy part only on the screen that uses it (`import()`), smaller images in a modern
format with their size set, fewer and smaller libraries, fonts that do not block the first paint, and caching of the built files.

## The server: load, stress, spike and soak
`npm run load -- <kind>` runs **k6** (Grafana's open-source load tester) in Docker, against the dev server, staging or an
address you give, never production unless planned (`--yes-production`). It walks `load.paths`, then sends `load.requests`
(the heavy ones with their body: `[{ "name", "method", "path", "body" }]`, `docs/run/SCALING.md`, *The heavy work*), with `load.users` people and
judges the result against the goals in plain lines; it fails when they are not met.
| Kind | What it does | Answers | When |
|---|---|---|---|
| `smoke` | one user, 30 seconds | does it answer at all | after every deploy (as the canary's error check: `"errors": "npm run load -- smoke --url {url}"` with the url of staging) |
| `load` | the expected users for a few minutes | does a normal busy hour meet the goals | before a launch, after a change to a hot path, monthly |
| `stress` | two, then four times the users | where it starts to fail, and whether it recovers | before a launch: write the number down in `docs/run/RECOVERY.md` |
| `spike` | ten times the users at once | survives a newsletter, a post that spreads | before a launch or a campaign |
| `soak` | the expected users for an hour | memory leaks, connections that run out, disks that fill | before a launch, after a library upgrade |
A test of your own (a sign-in, a flow with several steps, made-up data): `npm run load -- load --script-only > load/load.js`,
change it, and `npm run load -- load` uses it from then on. Results from a laptop are a guide; the real numbers come from
staging on the same size of server as production.

## Code and the database
- **The slow path first, measured**: the logs carry each request's time (`docs/PRODUCTION.md`); sort by the slowest route
  before guessing. A benchmark (`tinybench` or `mitata`, or `node:test` timing a loop) for a function that runs often, kept as a
  test when it guards a rule ("plans a year in under 50 ms").
- **Queries**: one query per screen, not one per row (the N+1 trap: a list that asks the database once per item); an index for
  every column you filter or sort on; `EXPLAIN QUERY PLAN` (SQLite) or `EXPLAIN ANALYZE` (Postgres) on the slow ones; pages,
  never unbounded lists (`workflow/guides/API.md`).
- **Work that can wait goes to a queue**: emails, exports, AI calls, image resizing; the request answers at once.
- **Caching** only where the data allows it, with the time it may be stale named, and never one user's data for another.
