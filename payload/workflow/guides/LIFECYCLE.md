# From idea to product: the whole lifecycle

What {{PROJECT}} needs at each stage, what the kit already does for it, and what is decided only when a card needs it. The rule
for the later stages: lay the basis from the first day (it costs little and is hard to add later), ask the big questions when
they become real (choosing a cluster for an app with no users yet is waste). Read by the section.

| Stage | What it needs | Where it is | When |
|---|---|---|---|
| 1. Idea | a card per idea, bug or wish | `/idea`, the board | always |
| 2. Plan | the product questions, the stack, the layers; a spec per feature | `/setup`, `docs/STACK.md`, `/spec` | at the start; per card |
| 3. Build | tests first, a session per card, checks by scripts | `/work`, `/build`, the gate | per card |
| 4. Ship | one commit when the owner says done, the gate on GitHub, a release image per commit; browser smoke and accessibility tests (**not yet**) | `/ship`, `.github/workflows/` | per card |
| 5. Run | a host, infrastructure as code, secrets, data, monitoring, deploys without downtime | the basis now (`docs/PRODUCTION.md`); `/launch` for the rest | the first deploy card |
| 6. Grow | a launch, people finding it, feedback becoming cards | `/market`, `docs/market/GROWTH.md`, the launch check | when it works for its first users |
| 7. A small company | money in, a legal entity, terms, support, more than one person with access | *7. A small company* below | when someone pays, or a second person joins |

## 5. Run: what is laid from the first day
Without a question, in a TypeScript project with the default modules (production and deploy, `docs/PRODUCTION.md`):
- settings checked at start-up, every name in `.env.example` (a gate check);
- structured logs that never hold a secret or personal data;
- `/health` (alive, which version) and `/ready` (able to serve), and a stop that lets open requests finish;
- the rule that a database change works with the old version still running (written down, not checked);
- a release pipeline: the gate, then one image per commit, scanned, with a bill of materials, kept in a registry;
- the record of personal data (`docs/company/PRIVACY.md`), changed together with the tables.
**Not yet** for Python, Go and Rust: the production module's settings check, logger and health and stop handlers (the
Dockerfile and the release pipeline are there for every language).
Security as code from the start: secrets, audit, hostile-input tests and import rules in the gate; pinned pipeline actions;
image and configuration scans; agents that may not skip the push guard.

## 5. Run: decided when the first deploy card comes (`/launch`)
Each with a recommendation fitted to how big the app is, and what would make it change:

| Decision | The usual start | Later, when |
|---|---|---|
| Network and firewall | a private network; a firewall that refuses everything but HTTPS; no SSH open to the world (a VPN: WireGuard or Tailscale); rules written as code | a web application firewall and rate limits in front (Cloudflare, the host's, or Coraza with Caddy); security groups per part |
| Which cloud | by need, prices looked up that day: EU and cheap (Hetzner), EU with managed services (Scaleway, OVHcloud), the widest range (AWS, Google Cloud, Azure); Cloudflare in front | on-prem when data must stay in the building, the hardware is there, or the load is steady |
| Setting up servers | cloud-init for the first start | Ansible (hardening, firewall, updates, users, Docker); always on-prem |
| One app or several services | one app with clear modules (the import rules keep a later split cheap) | a part must scale, ship or fail on its own, or a second team owns it |
| Where it runs | one server (cheapest) or a container host (least work) | serverless for spiky or rare jobs; a cluster for many services or a team |
| Infrastructure as code | OpenTofu for the server, network, DNS and buckets; cloud-init for the server's first start | the same, in more files |
| How it is deployed | the pipeline's image, health-gated, rolled back by itself when the new version never gets healthy | GitOps on a cluster (Argo CD or Flux), canary releases (Argo Rollouts) |
| Packaging | the `Dockerfile` | a Helm chart, only on a cluster |
| Artifacts | images in GitHub's registry, named after the commit, never changed | the cloud's own registry, close to the cluster |
| Secrets | the host's secret store | encrypted in the repository (SOPS) for GitOps; External Secrets or Vault on a cluster |
| Data | SQLite on one server, Postgres from several users on; backups with a restore that was tried | a managed database, read copies |
| Files people upload | object storage (S3-compatible) behind one file of the app | a CDN in front |
| Messages between parts | none; then a job table in the database | a managed queue or pub/sub when parts run apart |
| Monitoring | OpenTelemetry from the app, an uptime check, error tracking, an alert that reaches the owner | Prometheus and Grafana, Loki, traces; goals for how often it may fail (SLOs) |
| TLS and DNS | Caddy or the host's own | cert-manager and an ingress on a cluster, a firewall in front |
| Cluster rules | not needed | Kyverno or OPA policies, Velero backups |

The network edge (proxy, load balancer, CDN, firewall, API gateway, service mesh), DNS (public and private), private networks and
certificates: `docs/run/INFRA.md`, each with where to start and what makes it grow. Environments (dev, test, uat, staging, prod):
`docs/run/ENVIRONMENTS.md`. Backups, migrations, cutovers and disaster recovery, each with its drill: `docs/run/RECOVERY.md`. Container
images (distroless, Docker Hardened Images and the rest), traffic in and out, IP allow and block lists, and SFTP: `docs/run/INFRA.md`;
the project's own lists: `docs/run/NETWORK.md`. APIs and their docs: `workflow/guides/API.md`. Frameworks and a CMS: `workflow/guides/FRONTEND.md`.

`/launch` walks through every choice in `docs/run/LAUNCH.md` (platform, cloud or on-prem; one server to a cluster; the database;
the load balancer; server sizes; the infrastructure tool: OpenTofu, Terraform, Pulumi or Ansible; analytics), then writes
`infra/` (one stack per environment), the deploy settings for staging and production, the restore drill, and the run docs.
Every infrastructure change goes out the same way (`docs/run/IAC.md`): checked offline with mocked providers, the expected change
written first, a plan reviewed against it, and the saved plan applied by the owner. CI/CD choices: `docs/run/CICD.md`; monitoring:
`docs/run/MONITORING.md`; releases and user testing: `docs/run/RELEASES.md`; a service mesh: `docs/run/MESH.md`; scaling, repositories,
the platform repository and the architecture board (`/arch`): `docs/run/SCALING.md`.

## Every stage: kept up to date, checked and written down
- **Names**: the gate's *naming* check per kind of thing (files, exported functions, types, components), from the language's
  norms; `docs/CONVENTIONS.md` says why, and holds the conventions a script cannot check.
- **A setup that is proven**: `docs/SETUP.md`'s marked commands (from a fresh clone to a running app) run on a fresh copy
  (`npm run setup-check`, and on GitHub when the guide or what it installs changes, and weekly).
- **Security without hands**: every Monday a scan of libraries (OSV-Scanner, Trivy), our own code (Semgrep), images and
  infrastructure files (Trivy) and secrets in the history (gitleaks) becomes one report issue in plain words; a library fix that
  exists comes as a pull request by itself once Renovate (or Dependabot's security updates) is switched on for the repository;
  `/secops` proposes the rest (`workflow/tools/README.md`, *Security without hands*).
- **Versions**: every tool pinned in `.tool-versions`, Node one version everywhere, OpenTofu stacks pinned with their lock file
  (the gate's *versions* check); Renovate (`renovate.json`) keeps them current, nothing younger than 7 days but security fixes.
- **Names of things in the system** (`<app>-<env>-<place>-<part>`, checked in the infrastructure files) and **order** (lists
  with no meaning in their order are alphabetical, checked where configured); **commits**: one per feature on `main`, squashed,
  a subject that says what changed for the user (`docs/CONVENTIONS.md`).
- **Sensitive work** (money, health, legal texts, personal data): every value from a named source, tests worked out by a person,
  a fresh-eyes review, and the owner's own sign-off for the exact files, which the gate requires (`workflow/guides/SENSITIVE.md`).
- **Performance**: goals in the config (page weight, 95% of requests within 300 ms, under 1% errors), the page-weight check in
  the gate, and `npm run load` (k6: smoke, load, stress, spike, soak) against staging before a launch (`docs/run/PERFORMANCE.md`).
- **AI inside the app** (the ai module, `--with ai`): every model call through one wrapper file (the gate's *ai* check),
  untrusted text as data, the answer checked by a schema, a spend cap, and injection attempts among the cases; tools that write
  only on a person's click are a rule in `workflow/guides/AI-SECURITY.md`, not checked by a script.
- **Access** (for a team or customers): who has access to what, and why (`docs/company/ACCESS.md`); `npm run access` checks GitHub
  against it and lists the rest; the weekly report says when the 90-day review is due.
- **Names of what the app builds in the cloud**: also checked in the infrastructure plan, the final names and the labels
  (`docs/run/IAC.md`).
- **Costs and advice**: the real bill in `docs/company/COSTS.md` (`npm run costs`), `/estimate` for a change, `/advise` for a choice,
  every platform fact from its docs (`CLAUDE.md`, *Docs before memory*).
- **Tools that moved on**: `workflow/guides/TOOLS.md` lists the current open-source choice per job and what it replaced (uv over pyenv and
  pip, Biome over ESLint and Prettier, OpenTofu over Terraform), reviewed with each kit release.
- **Models**: plans on the strong model, building on the fast one, small jobs on the small one, and a script before any model
  (`workflow/guides/TOKENS.md`).
- **One repository or several**: one by default (one product, one team, one gate); several when teams, release rhythms or access
  rules differ (`docs/run/SCALING.md`, with the platform repository for what they share). With several, the Renovate policy moves
  to that repository.

## 6. Grow
`/market` walks through `docs/market/GROWTH.md` and writes the answers in `docs/market/MARKET.md`: positioning (the real alternatives, what
only we have, the value, the best-fit users, the category), pricing, the landing page (`npm run launch-check` checks it: search,
share previews, the privacy link, trackers without consent, robots.txt, the sitemap, its weight), cookieless analytics on one
funnel, search and Search Console, the channels, paid ads (a first Google Ads Search campaign step by step with Consent Mode;
whether AdSense fits), the launch checklist, and a monthly review where each channel is kept, changed or stopped. User tests
before the launch: `docs/run/RELEASES.md`. Every piece of feedback becomes a card on the board (below).

## 7. A small company
When the first person pays, or a second person works on it, the product needs a business around it. The kit does not give
legal or tax advice: each line below names who to ask. A checklist, in about the order it comes:
- **The entity and the money**: a sole trader or a company (an accountant, before the first invoice); a business bank account;
  invoices with the legally required fields and VAT handled by the payment provider where it can (Stripe Tax, Paddle or Lemon
  Squeezy as merchant of record, which takes on EU VAT); bookkeeping from day one.
- **The texts**: terms of service, a privacy notice built from `docs/company/PRIVACY.md`, a cookie banner only if something needs
  consent (cookieless analytics need none), a processing agreement (DPA) with every provider that touches personal data, and
  one you can give your customers. A lawyer reads them once; they are sensitive files (`workflow/guides/SENSITIVE.md`).
- **Support**: one address people can write to, an answer time you can keep, a status page (Uptime Kuma or Gatus), and every
  question that comes twice becoming a guide part or a card.
- **People**: each person their own accounts, the least access their work needs (`docs/company/ACCESS.md`), a review every 90 days,
  offboarding the same day; with pull requests, a second person reviews sensitive changes.
- **Running it**: an on-call rule (who answers at night, or that nobody does and the status page says so), the runbook in
  `docs/run/RECOVERY.md`, an incident note after each outage, and goals for how often it may fail once customers pay.
- **Money it costs**: a monthly look at the bills (servers, email, providers), the tags on every resource say which part costs
  what (`docs/CONVENTIONS.md`), and an alert before a bill doubles.
- **Insurance and contracts**: professional liability when customers rely on it; written agreements with anyone who builds part
  of it, saying who owns the code.

## The loop back to the board
What happens after a feature ships comes back as cards, the same way security does (the weekly report and `/secops`):
| Signal | How it reaches the board |
|---|---|
| A person's feedback | the feedback form (`.github/ISSUE_TEMPLATE/feedback.yml`) opens an issue; `npm run board -- --inbox` lists it and `--adopt <n> --label <type>` makes it a card. **Not yet**: a help button in the app that links the form; add the link with the first screens |
| Errors in use | the error tracker (Sentry, or GlitchTip) groups them; Sentry's GitHub integration can open an issue for an alert, which lands in the inbox. **Not yet**: a workflow that turns a GlitchTip or Uptime Kuma webhook into an issue; until then, adopt those by hand |
| An outage | the incident note (`docs/run/RECOVERY.md`) ends with a card for what changes so it does not happen again |
| Did it work? | `/ship` puts the spec's *How we will know it worked* on the card with a date; on that date look, and write the answer on the card and in `docs/PRODUCT.md`, *What we learned* |
| Usage | cookieless analytics (Plausible, Umami) answer "is it used"; one look a month, a card when a screen is never used |
| A spike | its decision note (`docs/decisions/`) makes or changes a card |
`/work` with no number ranks what can be started (`npm run board -- --next`: first version first, then value for the effort)
and says how many issues wait in the inbox; `/tidy` sorts what piles up.

**Feature flags** (**not yet in the kit**: no flag code ships; this is how to add it), for a change that should reach a few
people first or be switched off without a deploy: one file reads them from the settings (`FEATURES=new-plan,export` in `.env`, so every name is in `.env.example`), the code asks that file and
nothing else, each flag names its card, and the card is not done until the flag and the old path are taken out. A flag
service (OpenFeature with Unleash or Flagsmith) only when flags must change per user or without a restart.

**The changelog** is made from the commits (`npm run changelog`, grouped by area; `--prepend` writes `CHANGELOG.md`): the
release note, the update for customers, the guide's "what is new", without writing it twice.
