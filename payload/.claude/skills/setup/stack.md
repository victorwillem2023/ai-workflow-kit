# The stack of a new project: the decisions that are expensive to change later

Read by `/setup` for a new project only. Three steps: ask about the product (part A), choose every part from the answers
(parts 1 to 8), show the choices as one page the owner can change (part B). Skip what the app does not need (no server: no
backend, database or sign-in).

## A. The product questions
About the product and the people using it, never about technology. Batches of four, each with a suggested answer and "not sure"
(then take the choice that is cheapest to change later and say so). Skip a question an earlier answer settled.
1. **Who uses it**: only you, people you know, or anyone who signs up? How many in a year: tens, thousands, more?
2. **Where**: a phone on the go, a computer at a desk, or both? Must it be in the app stores, or is a web page they can put on
   their home screen enough?
3. **Accounts**: does each person have their own data? Are there roles (a trainer and clients, a team and its members)?
4. **What it remembers**: what is stored, and is any of it personal, about health, about children, or about money?
5. **Without internet**: must it work with no connection (a gym basement, a trail) and catch up later?
6. **Together**: do people see each other's changes at once (a chat, a shared plan), or is a refresh fine?
7. **Money**: do people pay? Once, a subscription, through the app stores?
8. **From outside**: which other services does it read or write (calendar, wearables, maps, mail, a payment provider)?
9. **AI**: does it generate or judge anything (plans, feedback, pictures)? Must that work without sending personal data out?
   If yes, what to start with: free with daily limits (fine to try it out, not for personal data), the cheapest paid model that
   does the job well, or the best there is whatever it costs?
10. **Messages**: mail, push notifications, reminders at a set time?
11. **Files**: do people upload photos, videos or documents? How large?
12. **Languages and places**: one language or several? One country or the EU and beyond (privacy rules, where data is kept)?
13. **Search engines**: must pages be found on Google, or is everything behind a sign-in?
14. **When it breaks**: is an hour of downtime an annoyance or a disaster? Who is told?
15. **Looking after it**: you with agents, or a team later? Any language or tool that team already knows?
16. **Money to run it**: what may it cost per month now, and at a thousand users?
17. **Where it runs, to start with**: what matters most: costs nothing or next to nothing, the least work to get it online and
    keep it there, or room to grow without moving later? (The page then names the host for that, and the runner-up.)

## B. The page: *What I would build*
One table, a row per part (the host with its two prices, and the AI model when there is one): the choice, why it follows from which answer ("phones and offline, so an installable web app with its
data in the browser first"), and what would make us change it. Aim at an app that is modern, grows without a rewrite and can
swap a part: the rules below. Under the table: what was left out on purpose and when to add it (a queue, a cache, a second
server), and what it costs per month now and at the size from question 1. The owner changes a line or says yes.

Before recommending a library or service by name, check its site or repository (a web search is fine): still maintained, its
current major version, no announced end. Names below were right in November 2026; prefer what is current over what is written here.

**Prices and limits are looked up, by you, every time**: a web search and the provider's own pricing page, during this interview,
for every host, database and AI model you put on the page. Never ask the owner for a price and never use one from memory or from
this file. Write the number, the link and the date into `docs/STACK.md` under `Prices checked: <YYYY-MM-DD>`; `npm run health`
says when that date is more than 90 days old, and then the same lookup is done again and the page updated.

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

## 1b. What runs the JavaScript (only for TypeScript)
Ask it, never assume it. Three sound choices; say which fits this app and why:
- **Node** (the current LTS): the default for an app that must simply work everywhere. Every library and every host is tested on
  it first. Pick it when the app leans on libraries with native parts (image handling, some database drivers) or on a host that
  only offers Node.
- **Bun**: one fast program that installs, runs TypeScript without a build step, tests and bundles. A good pick for a new
  project with ordinary libraries (Hono, Drizzle, React, Zod all run on it) whose host runs a container. Check each library with a
  native part first, and pin the version in the `Dockerfile`.
- **Bun for installing, Node for running**: most of the speed, none of the runtime risk.
The kit's own tools (the gate, the session script, the workflow tests) always run on Node, whatever the app runs on, so Node stays
installed. With Bun: `testAll` and `testFiles` in the config are `bun test`, the install step is `bun install`, and the
`Dockerfile` starts from `oven/bun` with a pinned version. Deno only when the owner asks for it.

## 2. Screens (web apps)
Which framework for which app, what server rendering asks for, and content from a CMS (Storyblok, Payload): `docs/FRONTEND.md`.
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
**Name the host, never leave it open.** Put two on the page, each with its price per month now and at the size from question 1,
looked up on the host's own pricing page that day: the **cheapest** that fits and the **easiest to get running**, and take the one
that matches the answer to question 17, saying why. Where to look, by the shape of the app:
- *Only pages, no server*: a static host with a free plan (Cloudflare Pages, Netlify, Vercel, GitHub Pages).
- *A framework with its own server* (Next.js, SvelteKit): the easiest is the host made for it (Vercel, Netlify); the cheapest
  is the container below.
- *A server in a container*: easiest is a host that takes the `Dockerfile` as it is (Railway, Render, Fly.io); cheapest at steady
  use is one small server of your own (Hetzner and the like) with Kamal or Coolify, at the price of looking after it.
- *The database*: SQLite on the app's own disk costs nothing; hosted Postgres with a free start (Neon, Supabase) when there are
  accounts. Count it in the price.
Say what the free plan does not do (sleeps when idle, a limit on data or build minutes), so the first bill is not a surprise.
With the deploy module: pick a host where deploying and going back are one command each. `npm run deploy` then proves the new version runs, or puts the old one
back; the app's part is `GET /health` answering with its version (`docs/DEPLOY.md`).

## 6b. AI inside the app (only when question 9 says so)
Every call goes through one file of our own (model name, prompt, limits), so the model can be swapped in a line. Choose by the job,
and look the prices and limits up that day: they change every few months.
- **Small or occasional** (a few calls a day, a personal tool, a first version): a free tier is enough. In November 2026:
  Google's Gemini API (Flash models), OpenRouter's free models, Groq, Cloudflare Workers AI. Say the catch: daily limits, and
  some free tiers may use what is sent to train their models, so never personal or health data.
- **Real use, or personal data**: a paid model, the cheapest that passes the app's own cases. Start with the small, cheap model
  of a provider (a "flash", "mini" or "haiku" class), write ten real cases with the answer that must come out, and move up a
  class only for the cases it fails. Put the price per thousand calls on the page.
- **Nothing may leave the machine**: a small open model run locally (Ollama), and say what it cannot do.
Always: a spending limit set at the provider, a cap on calls per user, answers kept when the same question comes again, and the
key in the environment, never in the code.

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
