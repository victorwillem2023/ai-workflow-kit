# Frontends: which React framework, the shape of a web app, and content from a CMS

The kit's advice for the screens: which framework fits which app, what each one asks of hosting and security, and how to
take content from a headless CMS such as Storyblok. `/setup` reads it with `stack.md` part 2; the choice goes in
`docs/STACK.md` with why. Read by the section.

## Which framework
| The app is | Take | Why | Hosting |
|---|---|---|---|
| Behind a sign-in, talks to its own API, maybe offline (a tool, a dashboard, a PWA) | **Vite + React** (a single-page app), React Router or TanStack Router | the simplest: static files and an API; no server rendering to secure or pay for | any static host or the app's own server; a CDN |
| Public pages that must be found and load fast, plus signed-in parts (a product with a marketing side, a shop) | **Next.js** (App Router) | server rendering and static pages per route, images, the biggest ecosystem, most agent knowledge | Vercel is easiest; a container with `output: 'standalone'` anywhere (`docs/run/INFRA.md`, *Container images*); OpenNext for AWS or Cloudflare |
| The same, wanting web standards and less framework magic | **React Router 7** (framework mode, what Remix became) or **TanStack Start** | loaders and actions on plain Request and Response; runs on Node, Cloudflare, Deno | a container or any edge host |
| Mostly content (docs, a blog, a landing site) with a few interactive parts | **Astro** (React only for the islands that need it) | ships almost no JavaScript by default; best with a CMS | static hosting, or Node for server parts |
| Phone apps from the same code | **Expo** (React Native), sharing `src/core` | one language; the core rules run on the phone too | the app stores, EAS builds |
| Fewer lines per screen, the owner prefers it | **SvelteKit** | not React, but the same shapes (routes, loaders, actions) | like Next.js |
Change only with a reason: a framework move rewrites every screen.

## The shape of a web app
How a web app loads decides how fast it feels before any screen is tuned: a page that sends the desktop map to a phone, or waits
for all its data before it draws, is slow whatever its code. Pick the shape at `/setup`, write it in `docs/STACK.md` (the Shape
row), and hold it with the gate's page weight and speed checks (`docs/run/PERFORMANCE.md`).

| The app is | Shape | What a person gets |
|---|---|---|
| One tool, one screen, used now and then | **One page**, everything in it, under the budget | nothing to wait for twice |
| Several screens, a phone and a desk use them differently | **A page per device or per main screen** (its own HTML entry and script), sharing `src/core` | the phone never downloads the desk's map or editor |
| A heavy part (a map, an editor, charts) on some screens | **The heavy part last**: the screen draws first, the part comes with `import()` when it is needed | a first screen in a second, the map a moment later |
| Used outside, on a bad network, or every day | **An offline cache** (a service worker caching the built files by version, the data in the browser's storage) | it opens at once, even without a network; a new version must replace the cached one on the next open |
| Pages that must be found, or show before any script runs | **Server-rendered** (the framework table above) | content on the first paint; the script only adds what moves |

In every shape: a **loading screen** that is the real screen's frame (its header, its empty list) shown at once, never a blank page
or a spinner alone; the data after the frame; and nothing heavy on the first screen that the first tap does not need. A change
that makes a page load more at start says so in its spec (the "Start-up cost:" line).

## What a server-rendering framework asks for
- **Server code is an endpoint**: a Next.js server action, route handler or a loader is reachable by anyone who finds it, like
  any API route. Check sign-in and rights inside each one, in the data layer, never only in middleware (a 2025 Next.js flaw let
  requests skip middleware altogether). Validate the input with the same schema as the API.
- **Secrets stay on the server**: only names starting `NEXT_PUBLIC_` (or `VITE_`) reach the browser, and nothing secret has one.
- **Caching is a security setting**: a page rendered for one user must never be cached for all; mark signed-in pages dynamic,
  and never put personal data in a statically built page.
- **Headers**: a Content Security Policy with a nonce, `frame-ancestors`, HSTS, set in one place (the proxy or middleware).
- **Updates**: the framework itself is a security dependency; Renovate keeps it current, and its security releases are taken
  the same week.

## Content from a headless CMS
A CMS lets people who do not code change texts, pages and images without a deploy. "Headless": it only stores and serves the
content through an API; the app renders it.

| CMS | Kind | Good at | Mind |
|---|---|---|---|
| **Storyblok** | hosted (EU data centre available) | a visual editor where editors see the page as they change it; components map to React components | priced per seat and traffic; content model kept in sync with the code |
| Contentful | hosted | large teams, many locales, a mature API | expensive beyond the free tier; US company (check the data terms) |
| Sanity | hosted, content studio as code | schemas as TypeScript, real-time editing, GROQ queries | per-seat and usage pricing |
| **Payload** | open source, runs inside a Next.js app | the content types are TypeScript in the repository; your own database | you host and update it |
| Strapi, Directus | open source, its own server | an admin panel over your own database | you host, secure and update it |
| Markdown or MDX in the repository | no CMS | developers editing, every change reviewed | editors need git |

How the kit wants it wired:
- **The content model is code**: component and field definitions live in the repository (Storyblok's CLI pulls and pushes the
  schema and generates TypeScript types; Payload and Sanity are code already), changed in the same commit as the components.
- **Fetched on the server, cached, refreshed by a webhook**: pages are built or cached from the CMS, and the CMS calls a signed
  webhook to refresh the changed page; the browser never holds the CMS's management token. A preview mode for editors uses a
  separate, read-only preview token.
- **CMS content is untrusted input**: rich text is rendered through the CMS's renderer or sanitised; no raw HTML from it; links
  and image addresses checked. Editors can be phished too.
- **No personal data in the CMS**: it holds content, not customers. Its users are rows in `docs/company/ACCESS.md`, with two-step sign-in.
- **Its host is an outbound host** (`security.egress`) and, when it holds anything personal (it should not), a row in the privacy record.
- **Prices, legal texts and health advice** written in the CMS are still sensitive (`workflow/guides/SENSITIVE.md`): give them a
  review step in the CMS's own workflow (Storyblok and Contentful have approval stages), or keep them in the code.
