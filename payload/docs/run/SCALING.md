# Scaling: the app, the code, and the way the product is run

What to decide early so growth is a new value and not a rewrite: how the app takes more load, how the code is split into
repositories, where configuration lives once there are several services, who owns what, and how big decisions are made
(`/arch`, the architecture board). Each part says where to start and what makes it change. Read by the section.

## Leave room on day one (cheap now, costly later)

| Decide now | Why it is hard to change later |
|---|---|
| Names with env, place and a two-digit number (`docs/CONVENTIONS.md`) | most cloud resources cannot be renamed, only destroyed and made again |
| The app keeps no state on its server: sessions in the database, files in object storage | a second server is then a setting, not a rewrite |
| One module per part of the domain, with import rules (`boundaries` in the config) | a module with clear edges becomes a service when it must; a tangle never does |
| Every part reached through its API, never through another part's tables | a shared database is the hardest thing to split |
| Configuration from the environment, secrets from a store | the same image runs in every environment and every region |
| Infrastructure as code from the first server, one stack per environment | a second environment or region is a new variables file |
| A service catalog line for each deployable thing (below) | the list of what runs and who owns it exists before anyone needs it at 3 a.m. |

## Scaling the app

In this order, each step measured first with the load test (`docs/run/PERFORMANCE.md`), never guessed:
1. **A bigger server.** One change, no new parts.
2. **Fix what the profile shows**: a missing index, a query in a loop, an image served by the app instead of the CDN.
3. **Cache** what many people read and few change (HTTP caching and the CDN first, then Valkey or Redis).
4. **Background jobs** for slow work (email, exports, AI calls): a job table, then a queue.
5. **Two or more app servers** behind a load balancer: needs step "no state on its server" from the table above.
6. **The database**: a managed one with a read copy for reports; partitioning or sharding only with numbers that demand it.
7. **Split a service out** only for the reasons below.

## The heavy work: where it runs and what limits it
One request usually costs more than all the others (planning a route, a report, an AI answer, an import). Name it at `/setup`,
and decide where it runs and what stops it growing, before real people find the wall:
| Decide | Why |
|---|---|
| **Where it runs**: our server, the browser (the person's own phone does the work), or an outside service | the cheapest place to grow is the one that grows with the users: the browser does; an outside service often does not |
| **The wall**: the outside service's quota, our server's CPU, the database | an outside service that blocks an address after a few hundred requests is the hard wall: real users need its own instance (self-hosted) or the work moved to the browser, with our instance behind it (`/arch`, `/estimate`) |
| **A limit per person** on the heavy request, keyed by the signed-in user or the caller (the production module's server: `perMinute` on its route, `src/server/http.ts`, and an older copy, or a project without that module, brings it in with a card; another server: its framework's rate limit on that route) | one person, or one script, cannot use up what everyone shares |
| **Answers people share are cached** (the same route, the same report for the same input, keyed by the input, with a lifetime) | the second person asking costs nothing; caching what is personal is never shared |
| **A load test of the real request**, with its body (`load.requests` in `workflow/config.json`, `npm run load`; behind sign-in, a test account's header in `load.headers`) | a test of `/health` says nothing about the request that costs the most. The test is one caller: start the server for it with limits above what it sends, or the answers are refusals (the verdict counts them) |

Write the answers here, under this heading, and the quota in the service's row of `docs/ARCHITECTURE.md`, *Outside services*.

## Background jobs and queues

Slow or failing work (emails, exports, imports, AI calls, webhooks to others) leaves the request: the request saves a job, a
worker does it, retries it, and records the result. In this order, each step only when the one before is too small:

| Step | Choice | Fits | Watch out |
|---|---|---|---|
| 1. A job table in the app's database | for Postgres: pg-boss (Node), Graphile Worker (Node), Oban (Elixir), Procrastinate (Python), River (Go); for SQLite: a `jobs` table and a worker loop | one database, up to thousands of jobs a minute; a job and the data it changes in one transaction | none worth a second system at this size |
| 2. A queue in Valkey or Redis | BullMQ (Node), RQ or Celery (Python), Sidekiq (Ruby), Asynq (Go) | many jobs, delays and rates, a dashboard | Valkey must be persistent (AOF) or jobs can be lost |
| 3. A message broker | NATS JetStream (light), RabbitMQ (rich routing) | several services that must not know each other, fan-out to many | one more system to run, back up and watch |
| 3. Managed | SQS and EventBridge (AWS), Pub/Sub and Cloud Tasks (GCP), Service Bus (Azure), Scaleway Queues | no broker to run, pay per message | tied to that cloud; local tests need its emulator (`docs/run/IAC.md`) |
| 4. A log of events | Kafka or Redpanda | many consumers replaying the same history, analytics streams | a large system: a team's worth of work |

Rules that hold at every step: every job can run twice without harm (idempotent: a job id, an "already done" check); a
retry waits longer each time and stops after a few, landing in a dead-letter list someone looks at; a job carries ids, not
personal data; the queue's length and the oldest job's age are on the monitoring (`docs/run/MONITORING.md`).

**Serverless functions** suit the same work when it is rare or spiky: a webhook, a nightly export, an image resize (Cloud
Run jobs, Lambda, Azure Functions, Scaleway Functions). They cost nothing when idle and a lot under steady load; keep the
logic in the app's own modules so a function is a thin entry, and the code can move back into a worker without a rewrite.

## Repositories: one or many

| Shape | Good | Costs | Choose it when |
|---|---|---|---|
| **One repository, one app** (the kit's start) | one gate, one deploy, one place to look | none yet | one product, one team: almost always the start |
| **A monorepo**: several apps and services, one repository (npm or pnpm workspaces; Turborepo or Nx when builds get slow) | a change across services is one commit and one review; shared types; one kit setup, one board | the gate must run only what a change reaches (the kit's gate already picks tests by what changed); CI caching | several services, one or a few teams. **Our default once there is more than one service** |
| **Many repositories**, one per service | each team ships alone, with its own rights | everything shared must be shared on purpose: the platform repository below; a change across services is several pull requests | several teams that must not block each other, different release speeds, open-sourcing a part |

## Shared configuration: the platform repository

Once there are several repositories, one repository holds what they share, owned by whoever runs the platform. It holds
**standards and building blocks, not every service's settings**: a central repo every deploy must touch becomes the
bottleneck and the place where one typo breaks everything.

| In the platform repository | How the services use it |
|---|---|
| Infrastructure modules (a server, a database, the naming module, the firewall) with version tags | each service's `infra/` pins a module version; Renovate proposes the update |
| The shared Renovate preset | each repository's `renovate.json` extends it (`"extends": ["github>org/platform"]`) |
| Reusable CI workflows (`on: workflow_call`): the gate, the release, the deploy | each repository calls them with its own inputs, pinned to a tag |
| The naming standard and the labels every resource carries | the services' `naming.resources` and `launch.labels` copy it; the plan review checks them |
| The service catalog (`services.yaml`): each service's name, owner, repository, tier, the data it holds, its on-call | read by people, by the architecture board, later by Backstage or Port |
| Organisation rules as code: branch protection, teams and their access, `CODEOWNERS` templates (the GitHub provider for OpenTofu) | applied with the same plan and review as other infrastructure (`docs/run/IAC.md`) |
| A service template: a new repository with the kit installed and the platform's defaults | `gh repo create --template`, then `/setup` |

**Where each kind of setting lives:**

| Setting | Lives in |
|---|---|
| How the service behaves (feature defaults, limits) | the service's own repository, with its code |
| Values per environment (addresses, sizes, replica counts) | the service's `infra/<env>/`, or on a cluster the GitOps repository (Argo CD or Flux: one folder per environment, Kustomize overlays or Helm values) |
| Secrets | the secret store (the platform's, Vault or OpenBao, SOPS-encrypted in the GitOps repository), never plain in any repository |
| What every service shares | the platform repository, versioned, pulled in by a pinned version |

## Ownership

- **Every deployable thing has one owner** (a person while the company is small, a team later), written in the catalog and
  in `CODEOWNERS`, so a review and an alert always reach someone.
- **A tier** per service (1: users notice within minutes; 3: an internal tool) sets its promises in `docs/run/RECOVERY.md`, its
  alerts and how carefully it is released.
- **Contracts between services** are written down: OpenAPI for calls (`workflow/guides/API.md`), AsyncAPI or a versioned schema for
  events, contract tests (Pact) once two teams depend on each other. A breaking change is a new version, the old one kept until
  its users moved.

## When to split a service out

Only when one of these is true and measured: a part needs to scale very differently (the importer needs 10 times the CPU for an
hour a night); a part must be released or fail on its own (payments must not go down with the reports); a second team owns it;
a part has different data rules (health data in its own place, with its own access). Then: move it behind its API inside the
app first (the module already has edges), then out (the strangler pattern: the old path calls the new service, then traffic
moves, then the old code goes). Every split is an architecture decision (`/arch`) with a decision record.

## The architecture board (`/arch`)

Big decisions get more than one view before the owner decides: `/arch <question>` (for example "one repository or several
for the coach app and the coaches' portal?") is the architecture panel of `/advise` (`docs/company/ADVISORS.md`). It asks up to three
AI reviewers, chosen from these points of view for what the question needs (more when the owner asks), with the same facts:
- **simplicity and cost**: the smallest thing that works, what it costs a month and in hours;
- **operations and scale**: what breaks at 10 times the load, how it is deployed, watched and recovered;
- **security and data**: where the data goes, who can reach it, what the law and `workflow/guides/SENSITIVE.md` say;
- **product and time**: what it does to the next three months of the board.

Each answers on its own (they do not see each other), with a recommendation, the risks, what would change its mind and the
evidence from the code and docs. The chair (`/advise`, which `/arch` runs) puts them side by side, says where they agree and disagree, and
writes a proposed decision record. **The owner decides**; the record says what was decided and why, and what would reopen it.
When to call it: a new service or datastore, a new platform or provider, a change to a boundary, anything that is hard to undo.
`/spec` suggests it when a spec does one of these.
