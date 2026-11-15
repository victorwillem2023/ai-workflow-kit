# The stack of a new project: the decisions that are expensive to change later

Read by `/setup` for a new project only. Go through the decisions that apply, in this order, one at a time: recommend one choice
with a one-sentence reason, say when another would be better, and let the owner confirm or pick. Skip what the app does not need
(no server: no backend, database or sign-in). Write the answers into `docs/STACK.md`.

Before recommending a library or service by name, check its site or repository (a web search is fine): still maintained, its
current major version, no announced end. Names below were right in November 2026; prefer what is current over what is written here.

Rules that keep a stack future-proof:
- **Boring and widely used** over new and clever: more answers, more agents that know it, less chance it disappears.
- **Open standards at the edges** (HTTP and JSON, SQL, OpenID Connect, OpenTelemetry), so a part can be swapped.
- **A paid or hosted service sits behind one small file of our own** (the outside-services folder), never called from everywhere.
- **Lock files committed, versions pinned, updates in small steps** (Dependabot or Renovate turned on at setup).
- **Every new library is a decision in `docs/STACK.md`** with the owner's yes; the gate prints an `advice:` line for one that isn't.

## 1. Language
Rust by default: the compiler catches most of an agent's mistakes before a test runs. TypeScript when most of the work is a
browser screen. Python for data, notebooks or machine learning (run through uv). Go for a small network service a team already runs
in Go. An existing project keeps its language. `starter/lang.json` in the kit has each one's commands.

## 2. Screens (web apps)
- **UI framework**: React with TypeScript by default (agents know it best). Svelte when the owner wants less code per screen.
  No framework only for a single page or a tool with one or two screens. A map or canvas app still uses one for the panels
  around the map (MapLibre in React: react-map-gl).
- **App framework**: Vite for a page that talks to its own API or works offline; Next.js (React) or SvelteKit when pages must come
  from the server (sign-in, search engines, many pages).
- **Styling and parts**: Tailwind CSS with shadcn/ui for React, the colours and sizes as tokens in `docs/STYLE.md` mapped to the
  Tailwind theme. One way of styling, never two.
- A brand-new folder: the framework's starter makes it first (`npm create vite@latest <name> -- --template react-ts`,
  `npx create-next-app@latest`, `npx sv create`), then the kit is installed into it. With a framework, the ui module's
  `src/web/dom.ts` and its test go (components replace them).

## 3. Backend
- **None** when the app runs in the browser alone or reads only public services (a static page, data in the browser's storage).
- **The app framework's own server** (Next.js route handlers, SvelteKit server routes) when the server is small and only serves
  these screens.
- **A separate API** when phones, other apps or jobs will use it too: TypeScript with Hono (runs on Node, Bun and edge hosts),
  Rust with Axum, Python with FastAPI, Go with the standard `net/http`.
- **The contract is typed at the edge**: every request and answer has a schema checked on arrival (Zod in TypeScript, serde in
  Rust, Pydantic in Python), and an OpenAPI description when anyone else calls the API.

## 4. Data
- **SQLite** for one machine and one user, or a small server (`node:sqlite`, rusqlite, the standard `sqlite3`).
- **Postgres** as soon as there are several users, several servers or a hosted deploy.
- **Queries through a typed layer** (Drizzle in TypeScript, sqlx in Rust, SQLAlchemy in Python, sqlc in Go), never strings glued
  together. **Migrations from the first table**, in the repository, run by one command; the gate fails a changed table with no
  migration (`together` in the config).
- Files people upload go to object storage (S3-compatible) behind one file of our own, not into the database.

## 5. Accounts and sign-in (only when there are users)
Never write password handling ourselves. A maintained library in the app (Better Auth or Auth.js in TypeScript) or a hosted service
(Clerk, Supabase Auth, Auth0) behind one file of our own. Sign-in with Google or GitHub (OpenID Connect) before passwords. Decide now
who may see what (a user's own data only, or teams): it shapes every table.

## 6. Where it runs
Decide before the first deploy-shaped decision: static hosting for a static page; one container (a `Dockerfile` in the repo) for
anything with a server, so it runs the same on a laptop, a small VPS or a cloud host. Settings come from the environment with a
checked-in `.env.example`; secrets never in the repository. One command starts it locally.
With the deploy module: pick a host where deploying and going back are one command each (Fly.io, Railway and Render take the
`Dockerfile` as it is; your own server works with Kamal). `npm run deploy` then proves the new version runs, or puts the old one
back; the app's part is `GET /health` answering with its version (`docs/DEPLOY.md`).

## 7. Tests
The language's own runner (Vitest with Vite and React, `cargo test`, pytest, `go test`); Playwright for a few end-to-end checks of
the main screens once there are screens. The quality score (`quality` in the config) is a set of real cases from the first week.
With Vitest: `testAll` and `testFiles` are `npx vitest run --reporter=dot`, and `tests` is `**/*.test.{ts,tsx}`.
Playwright: `npm init playwright@latest`, then in `checks` of the config (the gate then runs it when a screen changed, and always
with `--all`; `setup` runs on GitHub only, on your own computer the browser is installed once):
`{ "name": "e2e", "command": "npx playwright test --reporter=line", "when": ["src/web/**", "e2e/**"], "setup": "npx playwright install --with-deps chromium" }`

## 8. Decided once, costly later (ask only the ones that apply)
- **More than one language for the people using it** ever: all text through an i18n library from the first screen.
- **Phones**: an installable web app (PWA) from the start, or a native app later; the API has to allow both.
- **Offline**: decide early; it changes where data lives.
- **Errors in use**: structured logs from day one; an error service (Sentry or the host's) once others use it.
- **Accessibility**: keyboard and screen readers from the first component (the UI framework's accessible parts help).
