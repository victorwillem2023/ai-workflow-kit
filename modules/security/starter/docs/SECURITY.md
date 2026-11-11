# Security: what is protected, and what is known to be open

The short rules Claude follows are in `CLAUDE.md` (*Security*). This page is the audit trail: what was checked, what is open.
Update it in the same commit as any change to an endpoint, file reader or outbound fetch.

## How to share a test link safely
<Password set, empty data folder, background jobs off, stop the tunnel afterwards. Never print `.env` values.>

## Checked and fine
- <One line per area reviewed and the date: request size caps, path handling, outbound fetch guard, HTML output, rate limits.>

## Known gaps
Nothing here lets anyone run code or read files; list what lets a user hurt the server or other users. One line each, with the
date found and the card number that will fix it.

## Fixed
- <date>: <what, and the test that now proves it is refused.>

## Before the app stays online or goes to people you don't know
- <The checklist you will not skip: auth, rate limits, logging without secrets, backups, dependency audit.>
