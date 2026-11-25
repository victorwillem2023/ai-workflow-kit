# The parts every app ends up needing: email, payments, uploads, scheduled jobs, time, and outside services that fail

Each of these is built once per app and then trusted for years, and each has a mistake that is cheap to make and expensive to
find: a double charge, a public file with someone's address in it, a job that ran twice, a race day that moved by an hour.
`/spec` reads the section for a card that touches one, `/review` checks the change against it, `/estimate` for what it costs.
The legal side (consent, terms, VAT) is `workflow/guides/LIFECYCLE.md`; where it runs is `/launch`. Read by the section.

## The same four rules for all of them
- **One file per part** in the server folder (mail, payments, uploads, jobs: a file named after each), the only one that talks
  to its provider, with a fake for the tests (the fakes pattern of the testing module). A provider's SDK used anywhere else is a
  finding.
- **Buy the hard part**: a mail provider, a payment provider, object storage, the platform's scheduler. Never your own mail
  server, card form or file server (`docs/run/BUY-OR-HOST.md`; a new provider is the owner's decision and a line in
  `docs/STACK.md` and `security.egress`).
- **Everything that comes back from a provider is checked** like any input: signatures on webhooks, sizes, types.
- **It can happen twice**: every step that sends, charges or writes on behalf of a provider's message is idempotent, keyed by an
  id it already has (an event id, an order id), so a retry does nothing the second time.

## When an outside service fails
Every service the app calls will be slow or down some day (a route planner, a mail provider, a weather API, a model). A plan
written before that day turns it into a short wait and a clear message, never a hung request or a raw error:
- **A plan per service**, kept in the file that talks to it and listed in `docs/ARCHITECTURE.md`, *Outside services*: the time
  limit of one try, the retries (only for a call safe to repeat: a read, or a write with an idempotency key), the fallback (a
  cached answer, a simpler result, the work queued for later) and the words a person reads when there is none.
- **Every call goes through it**: `callOutside` (`src/server/outside.ts`, the production module) aborts a try at its limit,
  retries, falls back, or throws the plan's message as a 503 with the cause in the log.
- **A drill test per service**: its fake cut off (`cutOff('down')`, `cutOff('hangs')`), and the test checks what the person
  gets. A service with a quota (requests a day, a block after a few hundred) has the quota in its row, and the scale plan
  says what happens at it (`docs/run/SCALING.md`, *The heavy work*).

## Email
- **Sent after the answer, not in it**: the request records "send this" and a job sends it with retries, so a slow provider
  never slows a page and a failed send is retried, not lost.
- **Proven to come from you**: SPF, DKIM and DMARC set for the sending domain (the provider's setup page), checked before launch.
- **What goes in a mail**: no password or secret, ever. A sign-in or reset link works once and expires (minutes, not days), and
  says what it is for. Marketing mail has an unsubscribe link that works in one click (the law where your users live).
- **Bounces and complaints come back**: the provider's webhook marks an address that bounces; you stop sending to it.
- **Limits**: a cap per address and per hour, so a form cannot be used to send a thousand mails.
- **Tests**: the fake records what would be sent; a test asserts the right mail to the right address with the right link, and
  that a second identical request sends nothing more.

## Payments
- **Never touch card numbers**: the provider's hosted checkout or its own fields (Stripe Checkout or Elements, for example). Then
  the card data never passes through your server, and most of PCI is the provider's.
- **Money is a whole number of the smallest unit with its currency**: 1999 and "EUR", never 19.99. One file holds the money
  rules (`docs/ARCHITECTURE.md`, *Rules and where each lives*), and it is under `sensitive.paths`: the numbers come from a source
  (`workflow/guides/SENSITIVE.md`).
- **The server sets the price**: the browser says what, never how much.
- **The webhook is the truth, not the redirect**: a payment counts when the provider's signed webhook says so. Check the signature,
  act once per event id, and handle events that arrive late or out of order (a refund before the payment's own event).
- **Every state has a way out**: paid, failed, refunded, disputed, a subscription that lapsed. The spec names what the person
  sees in each (`workflow/guides/SCREENS.md`, *Every screen has four states*).
- **Test mode first**: the provider's test keys in development and staging, the live key only in production's secrets; its test
  cards for the paths that fail.
- **Tests**: the money rules as rule tests from the source's own examples; the webhook handler with a fake signed event, the same
  event twice, and an unsigned one refused.

## File uploads
- **The size is checked before it is read**: a limit on the request, enforced by the server, not only in the browser.
- **The type from the content, not the name**: the first bytes say what a file is; `photo.jpg` can be anything. Accept a short
  list of types and refuse the rest.
- **Stored under a name you make** (a random id), never the uploaded name as a path, and outside anything the app serves as
  pages (object storage, or a folder the web server does not serve).
- **Served so it cannot run**: from another domain, or with `Content-Disposition: attachment` and the type you checked; an
  uploaded HTML or SVG file shown on your own domain can run script in your users' sessions.
- **Personal data inside**: photos carry where and when they were taken (EXIF); strip it unless the app needs it, and say so.
- **Who may see it**: a private file is fetched through a short-lived signed link, checked against who asks
  (`workflow/guides/PERMISSIONS.md`).
- **Tests**: too big refused, a wrong type refused (an HTML file named `.jpg`), a path in the name ignored, someone else's file
  refused.

## Scheduled jobs
- **One scheduler** (the platform's cron, a queue, or one job runner), never a timer inside each copy of the web server: with two
  servers, a timer in each runs the job twice.
- **Each job can run twice safely**, can be run by hand (one command, named in the job's opening comment), and records when it
  last finished.
- **It cannot overlap itself**: a lock (a row, a lease) so a slow run and the next one do not both work.
- **It has a time limit and says when it fails**: a failure is logged with the job's name and an alert reaches someone
  (`docs/run/MONITORING.md`). A job that silently stopped is found by its "last finished" being old.
- **After downtime**: decide per job whether it catches up (every missed run) or only runs once.
- **Tests**: the job's work as a function with the fake clock (`tests/clock.ts`); twice in a row does the work once.

## Time and time zones
- **A moment is stored in UTC** (an instant: when a payment happened), and shown in the person's own time zone.
- **The person's time zone is stored as its name** (`Europe/Brussels`), never as an offset: the offset changes with summer time.
- **A day is a date, not a moment**: a birthday or a race day is stored as `2026-05-03`, not midnight UTC, or it moves a day for
  someone west of you.
- **"Today" depends on where**: the end of a day, a weekly summary, a deadline are worked out in the person's zone.
- **Something that repeats** ("every Monday at 7") is stored as the local time and the zone, and each next time worked out from
  them, so it stays at 7 after the clocks change.
- **Tests**: with the fake clock, the days the clocks change (a 23-hour and a 25-hour day) and a person on the other side of the
  date line.
