# src/server: notes for AI coding agents

Loaded when you work in `src/server` (the API, the store, what talks to other services). The overall flow and rules are in the
root CLAUDE.md; `docs/MAP.md` lists every file.

**New feature here**: a new endpoint or rule goes in its own file; the app only wires it in (one line in `routes.ts`).
`http.ts` already gives every route the security headers, the rate limit, the same-origin (CSRF) check, the body cap and
idempotency keys, and turns errors into problem answers: never add them per route, and never bypass `createApp`. Rules: root CLAUDE.md, *Code
structure* and *Security*.

## Rules here
<only this folder's rules, as bullets: how input is checked, where the store is, what may never be logged or sent>
