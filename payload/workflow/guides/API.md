# APIs: how they are built, documented and shared

The kit's rules for an API the app offers, to its own screens first and to customers later. The kit ships **no API check of its
own**: the description and breaking-change checks below are `checks` entries the project adds with its first public route (two
lines of config, shown in each rule); until then these rules are held by `/spec` and `/review`. Read by the section.

## One description, made from the code
- The API is described in **OpenAPI 3.1**, generated from the code, never written beside it: with Hono and Zod
  (`@hono/zod-openapi`), each route declares its input and output schemas once, and they validate the request, type the code and
  write `openapi.json`. Fastify, NestJS, FastAPI (Python) and huma (Go) do the same.
- `openapi.json` is committed and checked like the file map: a `checks` entry runs the generator and fails when the committed
  file differs, so the description can never be older than the code.
  `{ "name": "openapi", "command": "npm run openapi && git diff --exit-code openapi.json", "when": ["src/server/**"] }`
- **Breaking changes are caught in the pipeline**: `oasdiff breaking` (open source) compares `openapi.json` with `main`'s and
  fails on a removed field, a new required input or a changed type. A breaking change needs a new version (below).
  `{ "name": "api-breaking", "command": "git show origin/main:openapi.json > /tmp/base.json && oasdiff breaking /tmp/base.json openapi.json --fail-on ERR", "when": ["openapi.json"] }`

## Design rules
| Rule | Why |
|---|---|
| Nouns in the plural, kebab-case: `GET /v1/training-plans/{id}`; actions as sub-resources: `POST /v1/plans/{id}/publish` | predictable for every reader |
| The version in the path (`/v1`); inside a version only **additive** changes (new optional fields, new endpoints) | a customer's integration never breaks on a deploy |
| A deprecated endpoint answers with `Deprecation` and `Sunset` headers and a link, months before it goes | customers get warned by their own tools |
| Errors as **problem details** (RFC 9457): `{ type, title, status, detail }`, plus an `errors` list per field; never a stack trace | one shape every client can handle |
| Lists are paged by a **cursor** (`?after=...&limit=50`, a maximum limit), never an unbounded list | the response size and the database stay bounded |
| Writes that may be retried take an **`Idempotency-Key`** header; the same key gives the same answer | a retry after a timeout never pays or books twice |
| Times in UTC as ISO 8601, amounts in the smallest unit with their currency, ids opaque strings | no time-zone, rounding or guessing bugs |
| **Rate limits** per key, with `RateLimit` and `Retry-After` headers; a `429` explains when to try again | fair use, and protection |
| Requests and answers have size limits; inputs are validated by the schema before any code runs | hostile input never reaches the logic |

## Who may call it
- **Its own screens**: the user's session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`), CSRF protection on writes.
- **Customers' servers**: API keys made per customer and per purpose, shown once, stored only as a hash, with scopes
  (`plans:read`) and an end date, revocable in the app; or OAuth 2 client credentials when a customer needs it. A key never in a URL.
- **On behalf of a user** (another app acting for someone): OAuth 2 with PKCE and scopes the user agrees to.
- Every call is logged with the key's id (never the key), the route, the status and the time, for the audit and for support.
- **Webhooks** to customers: signed (HMAC-SHA256 over a timestamp and the body, the Standard Webhooks format), retried with
  back-off, and the receiver checks the signature and the timestamp. Webhooks *to* the app are verified the same way first.

## The documentation, for the team and for customers only
The docs are made from `openapi.json`, so they are always right, and shown only to people who may see them:
| Who | Where | How it is kept private |
|---|---|---|
| The people building it | `/docs/api` in the app, rendered by Scalar or Redoc from `openapi.json`, behind sign-in with a `developer` role | the app's own sign-in; not linked from public pages; `noindex` |
| Possible customers, before they sign | the same page, for invited accounts (an invite link with an end date) | an account per company, removed when the talk ends |
| Customers | the same page plus their keys, usage and webhook log: a small developer area in the app | their own sign-in and keys |
| Everyone (when the API is public or a product) | a public docs page (the tools below) | public on purpose; internal endpoints left out of that copy |
GitHub Pages on a private repository is public unless the plan is Enterprise, so it is not the place for private docs.

The tools that turn `openapi.json` into a docs page (all read the same file, so switching is cheap):
| Tool | Kind | Good at |
|---|---|---|
| **Swagger UI** | open source, the classic | the "Try it out" button on every endpoint; known by every developer |
| **Scalar** | open source, modern | a clean reference with a built-in API client and code samples per language; one line to serve it from Hono (`@scalar/hono-api-reference`), Express, Fastify or Next.js |
| **Redoc** | open source | a readable three-column reference; Redocly adds a hosted portal (paid) |
| **Stoplight Elements** | open source | a reference with a try-it panel as a web component |
| **Mintlify**, **ReadMe** | hosted, paid | a full developer portal: guides beside the reference, search, keys per reader, changelogs, analytics |
| **Docusaurus** or **Starlight** with an OpenAPI plugin | open source sites | guides and reference in one site you host |
The kit's default: **Scalar served by the app at `/docs/api`**, behind sign-in while the API is private, and the same page made
public (internal routes left out) when the API becomes a product. A hosted portal like Mintlify or ReadMe when guides,
onboarding and analytics matter more than the cost.
Examples in the docs are made-up data, never a real customer's.

## Tests
- **Contract tests**: each route's real answer is checked against its own schema in the tests (the generator's validator), so
  the description and the behaviour cannot drift.
- Hostile-input tests per route (too big, wrong type, missing field, another user's id); the gate's hostile-input advice
  asks for them.
- Every endpoint is a security trigger in the spec (limits listed, a security review before it ships).
