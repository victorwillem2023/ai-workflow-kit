# Security: what is protected, and what is known to be open

*Rules for code* is what every agent follows; the rest is the audit trail: what was checked, what is open.
Update it in the same commit as any change to an endpoint, file reader or outbound fetch.

## Rules for code
- **Untrusted input** (anything read from a request, an uploaded file or a third-party page): a size cap, a bound on every loop or
  step count that depends on the input, and a test with a hostile input whose name says what is now refused ("refuses ...",
  "rejects ...", "caps ...": the gate looks for those words). Name one existing function as the pattern to copy.
- **Outbound fetches** of a URL that came from a user or a third party: through <one HTTP client> with an `untrusted` flag that refuses
  private, loopback and link-local addresses at every redirect, caps the answer size and sends no contact details.
- **Links and HTML**: an `href` built from data must be `http(s)` only; `innerHTML` only for static markup; text goes through a helper.
- **A new endpoint, file reader or outbound fetch**: run a security review on the branch before `--finish`, and add its
  limits (body size, count, rate) in the same commit. (`npm run gate` prints an `advice:` line when it sees one.)
- **Whose it is**: every route and query checks on the server that the thing belongs to the person the session names; who
  that is never comes from the request; someone else's thing answers "not found" (`workflow/guides/PERMISSIONS.md`).
- **Queries**: values are passed as parameters, never joined into the SQL text; every list has a limit (`workflow/guides/DATA.md`).
- **Sign-in is taken, not written**: no hand-made password hashing, session tokens or signature checks.
- **Secrets** (keys, passwords, tokens) are read from the environment, never written into a file in git: the gate fails on one in a
  change, and on a tracked `.env`.
- **Before sharing a link** (tunnel): password set, empty data folder, stop the tunnel afterwards. Never print `.env` values.

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
