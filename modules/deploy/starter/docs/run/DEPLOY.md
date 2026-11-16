# {{PROJECT}}: deploying
<!-- covers: Dockerfile, .env.example -->

`/setup` fills the `<...>`. A deploy happens only when the owner says so.

| | |
|---|---|
| Where it runs | <the host, the region, the plan> |
| Address | <https://...> (`deploy.url` in `workflow/config.json`) |
| The image | distroless Node 26, nonroot, holding only the built app, its production libraries and `package.json` (the `Dockerfile`; why: `docs/run/INFRA.md`, *Container images*) |
| Deploy | `npm run deploy` |
| Is it up? | `npm run smoke` |
| Put the old version back | `npm run rollback` (the version before; or `npm run rollback -- <commit>`) |
| Secrets | <their names only, and where they are kept: the host's settings, never the repository> |

## What `npm run deploy` does
1. Refuses when there are uncommitted files or the commit is not on GitHub yet: what runs is always a commit you can find again.
2. Asks the running app which version it is.
3. Runs `deploy.command` from `workflow/config.json`; `{version}` in it becomes the commit, for example `3f2a9c1d04be`.
4. Waits until the app answers with the new version (`deploy.waitSeconds`, 120 by default).
5. Watches it before calling it good (the canary: `deploy.watch`, 5 minutes by default, `/health` every 15 seconds, and
   `deploy.watch.errors` when the project names a command that counts errors).
6. If it never comes up or fails the watch, runs `deploy.rollback` with the version from step 2 and says so.
`--env <name>` does the same for one of `deploy.environments` (staging, production), with that environment's settings.

## The health address (the app's side of the deal)
`GET /health` answers 200 with `{ "ok": true, "version": "<commit>" }`. The version is the environment variable `APP_VERSION`,
which the `Dockerfile` sets when the image is built (`--build-arg APP_VERSION=<commit>`). The answer is 200 only when the app
can do its work (the database answers), and it is fast: nothing slow belongs in it.

## The database
Migrations run <when, and the command>. A migration must still work with the old version of the app running: add a column in
one deploy, stop using the old one in the next, remove it in a third. Otherwise putting the old version back breaks the app.

## From GitHub instead of your computer
`.github/workflows/deploy.yml` ships with this module: after the release workflow built the image on main, it deploys to staging by
itself (the same script: health check, the watch, a rollback), and to production only when a person runs it by hand (Actions,
deploy, Run workflow, production), or after staging when the repository variable `PRODUCTION_AFTER_STAGING` is `true` and the
`production` environment has required reviewers. Each environment is skipped while `deploy.environments` does not name it, so
nothing deploys from GitHub until `/launch` writes them. The host's credentials are that environment's secrets
(<their names: `DEPLOY_SSH_KEY`, `DEPLOY_TOKEN`>); `docs/run/CICD.md` says how it fits.
