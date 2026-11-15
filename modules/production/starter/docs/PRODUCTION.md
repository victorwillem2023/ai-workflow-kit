# {{PROJECT}}: running in production

What every feature keeps to from the first day, so the first deploy is not a rewrite. Nothing here needs a host to be chosen:
that comes later, with `/launch`, when the first card needs it (`docs/LIFECYCLE.md`, *Run*). Read by the section.

## Settings
- Read only through `src/server/config.ts`: one `defineSettings({ ... })` with every name, its kind and default, checked once at
  start-up. A wrong or missing setting stops the start with every problem named; never a crash later in a request.
- Every name the code reads is in `.env.example`, with a comment and an example value (never a real secret). The gate's
  *settings* check fails otherwise.
- Secrets (keys, passwords, the cookie secret) come from the environment: `.env` on a computer (never committed), the host's
  secret store in production. A secret is never logged: `describeSettings()` shows it as "set".

## Logs
- Only through `src/server/log.ts`: one JSON line per event, so a log service can search and count them.
- Fields named like a secret are hidden by the logger itself; the personal fields listed in `docs/PRIVACY.md` go in its
  `personal` list. Log what happened and the ids (`userId`), not what someone sent.
- Levels: `error` is something someone must look at; `warn` is wrong but handled; `info` is a step worth counting.

## Health and readiness
- `GET /health` answers 200 with `{ "ok": true, "version": "<commit>" }` (`healthAnswer()`): the process is alive and runs that
  commit. A deploy waits for the new version here. No sign-in, nothing slow.
- `GET /ready` answers 200 only when every check passes within 2 s and the app is not stopping (`readyAnswer()`), else 503
  with the names that fail. The checks: what the app cannot work without (the database answers).

## Stopping without downtime
- `gracefulStop()` (`src/server/shutdown.ts`) on SIGTERM: not ready at once, a short wait so the host stops sending requests,
  open requests finish, the database closes, exit.
- The process must receive SIGTERM itself: the container's command starts `node` directly (`CMD ["node", "dist/server.js"]`),
  not through `npm start`, which may not pass the signal on.
- **A database change works with the old version still running**, because for a moment both run: add a column in one deploy,
  use it in the next, remove the old one in a third. Migrations run before the new version starts.

## Releases
- `.github/workflows/release.yml` (with the deploy module): after the gate passes on `main`, the image is built once, named
  after the commit (`ghcr.io/<owner>/<repo>:<12 characters of the commit>`), scanned (known vulnerabilities with a fix, and
  mistakes in the `Dockerfile`), given a bill of materials (SBOM), and kept in GitHub's registry. Production only ever runs an
  image the pipeline built: what runs is a commit you can find again, and going back is running an older image.
- Third-party actions in the pipelines are pinned to a commit, not a tag (a tag can be moved by whoever controls it);
  Dependabot keeps the pins current.

## Personal data
- `docs/PRIVACY.md` lists every kind of personal data: what, why, how long, where, who else sees it. A change to the tables
  changes that page in the same commit (`together` in `workflow.config.json`).
- Each person can get everything stored about them, and have it deleted. Build both with the first table that holds personal
  data, not later.
