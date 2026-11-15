# {{PROJECT}}: deploying

`/setup` fills the `<...>`. A deploy happens only when the owner says so.

| | |
|---|---|
| Where it runs | <the host, the region, the plan> |
| Address | <https://...> (`deploy.url` in `workflow.config.json`) |
| Deploy | `npm run deploy` |
| Is it up? | `npm run smoke` |
| Put the old version back | `npm run rollback` (the version before; or `npm run rollback -- <commit>`) |
| Secrets | <their names only, and where they are kept: the host's settings, never the repository> |

## What `npm run deploy` does
1. Refuses when there are uncommitted files or the commit is not on GitHub yet: what runs is always a commit you can find again.
2. Asks the running app which version it is.
3. Runs `deploy.command` from `workflow.config.json`; `{version}` in it becomes the commit, for example `3f2a9c1d04be`.
4. Waits until the app answers with the new version (`deploy.waitSeconds`, 120 by default).
5. If it never does, runs `deploy.rollback` with the version from step 2 and says so.

## The health address (the app's side of the deal)
`GET /health` answers 200 with `{ "ok": true, "version": "<commit>" }`. The version is the environment variable `APP_VERSION`,
which the `Dockerfile` sets when the image is built (`--build-arg APP_VERSION=<commit>`). The answer is 200 only when the app
can do its work (the database answers), and it is fast: nothing slow belongs in it.

## The database
Migrations run <when, and the command>. A migration must still work with the old version of the app running: add a column in
one deploy, stop using the old one in the next, remove it in a third. Otherwise putting the old version back breaks the app.

## From GitHub instead of your computer
<Not set up. When wanted: a workflow that runs `node scripts/deploy.mjs` after the gate passes on main, with the host's token as a
repository secret.>
