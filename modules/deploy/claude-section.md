
## Deploying (`docs/run/DEPLOY.md`)
Only when the owner says "deploy": `npm run deploy` (it proves the new version runs, or puts the old one back), `npm run smoke`,
`npm run rollback`. The app answers `GET /health` with `{ "ok": true, "version": "<commit>" }` from `APP_VERSION`. A database
change ships with its migration and must work with the old version still running. Secrets live in the host's settings and in
`.env` (never committed); `.env.example` lists every name the app reads.
