# {{PROJECT}}: conventions

How things are named and shaped, and why, so a reader (or an agent) finds things where the name says. Names are checked by the
gate (`naming` in `workflow.config.json`); the rest by review. A new convention is a line here and, when it can be, a rule in
the config, in the same commit.

## Names
| What | Style | Example | Why |
|---|---|---|---|
| Source files | kebab-case, named after the one thing they do | `order-total.ts`, `guards.ts` | one style on every file system; the name says the job |
| Screen components and their files | PascalCase | `OrderCard.tsx`, `export function OrderCard` | React tells components from HTML by the capital |
| Functions, variables, values | camelCase, a verb for a function | `buildInvoice`, `lineCount` | the language's own habit |
| Constants that are rules | UPPER_CASE with a comment saying what the number is | `MAX_UPLOAD_BYTES = 20_000_000` | a number in a formula hides a rule |
| Types, classes, interfaces | PascalCase, a noun | `Order`, `RefusedError` | |
| Tests | the file under test, `.test.ts`; each test named as behaviour | `it('refuses a 20 MB upload')` | a failing test says what broke for the user |
| Settings (environment) | UPPER_CASE, the thing first | `DATABASE_URL`, `SESSION_SECRET` | every name is in `.env.example` (the gate checks it) |
| API addresses | lower-case, kebab-case, nouns, plural for lists | `GET /api/orders`, `POST /api/refunds` | |
| Database tables and columns | snake_case, plural tables | `orders.created_at` | SQL folds case; snake_case survives every tool |
| Branches and session folders | `<prefix>-<topic>`, made by `scripts/session.mjs` | `{{PREFIX}}-export-pdf` | |
| Commits | "Area: what changed for the user", then why | `Orders: a refund shows on the invoice` | `git log` reads as what the app learned |

The rules the gate checks now (made from `naming` in workflow.config.json by `npm run map`):
<!-- generated: naming -->
<!-- /generated -->

## Names of things in the system
Servers, buckets, databases, networks, queues, DNS names, secrets, dashboards and alerts are named so the name alone says
**what it is, which environment, where, and which one**. Checked in the infrastructure files by `naming.resources` in the config.

`<app>-<env>-<place>-<part>[-<nn>]`, lower-case, joined by `-`:
| Part | Values | Example |
|---|---|---|
| app | one short code for the product, the same everywhere | `{{PREFIX}}` |
| env | `dev`, `test`, `uat`, `staging`, `prod` (`docs/ENVIRONMENTS.md`) | `prod` |
| place | the provider's own region or site code, never a made-up one | `hel1`, `fsn1`, `euw1`, `onprem1` |
| part | what it does, a noun | `web`, `db`, `backups`, `queue` |
| nn | a number, only when there are several alike | `01`, `02` |
So `{{PREFIX}}-prod-hel1-db-01`, `{{PREFIX}}-staging-fsn1-backups`. Where a provider forbids `-` or limits the length (some
storage accounts), drop the dashes in the same order. Tags or labels carry the same facts (`app`, `env`, `owner`, `cost-centre`),
so costs and alerts can be sorted by them.

**Decided before the first resource exists.** Most names cannot be changed later without destroying the thing (a server, a
bucket, a database, a DNS zone), so `/setup` fixes the app code and `/launch` fixes the rest before anything is made. Leave room
from the start, even if it looks like too much for one server:
- the **env** and **place** parts are there on day one, so a second environment or region is a new value, not a rename;
- the **nn** number has two digits from the first one (`web-01`), so the tenth server sorts after the ninth;
- a name is never built by hand in each file: one place builds it (a naming module or `locals` in OpenTofu, a function in
  Pulumi), from `app`, `env`, `place`, `part` and the index, so a new environment is a new variables file and `count` or
  `for_each` makes the next one;
- the same names carry into everything around the resource: the DNS name (`db-01.prod.hel1.internal`), the secret
  (`{{PREFIX}}/prod/db`), the dashboard and the alert ("{{PREFIX}}-prod-hel1-db-01: disk 90% full").

The plan review (`npm run infra-plan`, `docs/IAC.md`) checks the **final** names of everything it would create, whatever built
them, against `naming.resources`, and that each carries the labels in `launch.labels` (for example `app`, `env`,
`managed-by`). A kind with stricter rules (a globally unique bucket, a key without dashes) gets an `except` entry with the
reason, never a second style made up on the spot.

**Themed names** (planets, Harry Potter characters, cities) are fine for things people talk about and that live long: a team,
a release, a long-lived machine you would miss (a "pet"). They are wrong for anything code creates, scales or replaces (the
"cattle": app servers, containers, buckets, databases), and for anything whose name must say what it is when an alert wakes
someone at 3 a.m. Pick one style per kind of thing and write it in the table above.

## Order
- Lists that have no meaningful order are **alphabetical**: dependencies, settings in `.env.example` within their group, the
  labels and the lists in config files, the rows of tables like the one above, the imports (Biome sorts them). Checked for
  the files under `naming.sorted` in the config. A diff then shows the one line that changed, and a duplicate stands out.
- Lists that do have an order (steps, the stages of a pipeline, priorities) keep it, with a comment saying it matters.
- Settings are grouped by the part they belong to (the database, sign-in, email), each group alphabetical.

## Commits and pushes
History is read by people looking for when and why something changed, so it stays one line per change that mattered.
- **One feature, one commit on `main`.** In a session folder commit as often as you like; `--finish` squashes the branch into
  one commit (`tools/workflow/README.md`, *Commits and sessions*). With pull requests, GitHub squashes on merge.
- **No commits that only repair the last one** on `main` ("fix typo", "fix test", "review comments"): they go into the
  feature's commit before it lands. A real follow-up later is its own commit that says what it changes for the user.
- **Subject**: `Area: what changed for the user`, at most about 70 characters, in the present tense; the body says why, and
  names the card (`#42`). A revert is one commit that says what it undoes and why.
- **Pushes**: features wait on the local `main` and go out together with `node scripts/session.mjs --push` (or a pull request);
  never `--force` on `main`, never a rewrite of what was pushed.
- **Releases** are tags on `main` (`v1.4.0`), made by the pipeline; the changelog is built from the commit subjects, which is
  why they say what changed for the user.

## Shape
- One feature, one file; a file opens with a comment saying what it does (`CLAUDE.md`, *Code structure*).
- Errors the user sees are one plain sentence that says what to do; errors in logs carry the ids, not the data.
- Dates as `YYYY-MM-DD` text, times in UTC, amounts in their smallest unit (cents, metres, seconds) inside the code; units are made on the
  screen.
