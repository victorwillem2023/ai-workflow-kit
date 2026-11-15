# {{PROJECT}}: setting it up

From a fresh clone to a running app, for a new person or a new computer. The blocks marked `sh setup` and `sh start` are run as
written on a fresh copy by `npm run setup-check`, and by GitHub when this page or what it installs changes, and every week: if
a step here stops working, that check fails. Keep every step here; never "you also need to...".

## What you need
- git, and Node at the version in `.tool-versions` (`mise install` or `asdf install` installs it, or get that version from
  nodejs.org).
- On Windows: `dev.cmd` does the steps below for you.

The exact versions (made from `.tool-versions` by `npm run map`):
<!-- generated: versions -->
<!-- /generated -->

The settings the app reads (made from `.env.example`; copy it to `.env` and fill in the real values):
<!-- generated: settings -->
<!-- /generated -->

## From a fresh clone to a running app
Install exactly what the lock file says:

```sh setup
npm ci
```

The settings: `.env.example` lists every one, with a working value for this computer. Copy it once; never commit `.env`.

```sh setup
[ -f .env ] || cp .env.example .env
```

Start it; it restarts by itself when a file changes:

```sh start
npm run dev
```
<!-- ready: http://127.0.0.1:8787/ -->

Open http://127.0.0.1:8787.

## Checking that it works
`npm test` (the tests, offline) and `npm run gate` (every check, as before a commit).

## When it does not start
- **Port 8787 is taken**: another copy runs (close it), or set `PORT` in `.env`.
- **A setting is wrong**: the app says which at start-up; `.env.example` has the right shape.
