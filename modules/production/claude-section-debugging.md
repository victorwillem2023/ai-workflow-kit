<!-- into: src/server/CLAUDE.md (the server's folder note, read when working there); the root CLAUDE.md when the project has none -->
## Requests, errors and logs
- Each request: `startRequest` (`src/server/trace.ts`) in, `req.done(status)` out, `x-request-id: req.id` on the answer; log
  through `req.log`, call other services with `req.outbound()`.
- Each error a person or a service can cause: an `AppError` (`src/server/errors.ts`: code, words, `doing`, ids, `cause`), all
  answered by `answerError`. The page: `apiError` for a failed call, `reportPageErrors` at start-up (`logPageError` on the server).
- How it felt, in development: `watchFeel` at start-up (`src/web/feel.ts`, `logPageEvents` on the server) puts each motion,
  busy moment and timing in the session's log; read them after every try (`logs.mjs <topic> --page`).
- Something wrong: `/debug`. A session's log: `node workflow/scripts/logs.mjs <topic> --follow` (`--ref <reference>`).