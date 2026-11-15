# From idea to product: the whole lifecycle

What {{PROJECT}} needs at each stage, what the kit already does for it, and what is decided only when a card needs it. The rule
for the later stages: lay the basis from the first day (it costs little and is hard to add later), ask the big questions when
they become real (choosing a cluster for an app with no users yet is waste). Read by the section.

| Stage | What it needs | Where it is | When |
|---|---|---|---|
| 1. Idea | a card per idea, bug or wish | `/idea`, the board | always |
| 2. Plan | the product questions, the stack, the layers; a spec per feature | `/setup`, `docs/STACK.md`, `/spec` | at the start; per card |
| 3. Build | tests first, a session per card, checks by scripts | `/work`, `/build`, the gate | per card |
| 4. Ship | one commit when the owner says done, the gate on GitHub, a release image per commit | `/ship`, `.github/workflows/` | per card |
| 5. Run | a host, infrastructure as code, secrets, data, monitoring, deploys without downtime | the basis now (`docs/PRODUCTION.md`); `/launch` for the rest | the first deploy card |
| 6. Grow | a launch, people finding it, feedback becoming cards | `/market` and a launch page in docs (kit 2.3) | when it works for its first users |

## 5. Run: what is laid from the first day
Without a question, in every project (`docs/PRODUCTION.md`):
- settings checked at start-up, every name in `.env.example` (a gate check);
- structured logs that never hold a secret or personal data;
- `/health` (alive, which version) and `/ready` (able to serve), and a stop that lets open requests finish;
- database changes that work with the old version still running;
- a release pipeline: the gate, then one image per commit, scanned, with a bill of materials, kept in a registry;
- the record of personal data (`docs/PRIVACY.md`), changed together with the tables.
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

What `/launch` writes: `infra/` (the infrastructure as code), the deploy settings, the environments (staging, then
production), a runbook (what to do when it breaks), and checks on the infrastructure files in the pipeline.
`/launch` comes with kit 2.2 (network and firewall, one server, container hosts, on-prem) and 2.3 (cluster, serverless, queues).

## Every stage: kept up to date, checked and written down (kit 2.1)
- **Names**: a gate check per kind of thing (files, components, constants), from the language's norms, and a conventions page in docs that says why.
- **Setup that is proven**: the commands of a setup page in docs (from a fresh clone to a running app, and the infrastructure) run on
  GitHub against a fresh copy.
- **Security without hands**: a weekly run finds known vulnerabilities in libraries (Dependabot alerts, OSV-Scanner), in our own
  code (Semgrep), in images and infrastructure files (Trivy) and secrets in the history (gitleaks); a fix that exists comes as a
  pull request by itself; the rest is one report card a week in plain words, and `/secops` proposes the fixes.
- **Versions**: every tool pinned in one file (`mise.toml`), OpenTofu stacks with their versions and lock file, and Renovate with
  one shared policy for every repository, so nothing falls far behind.
- **One repository or several**: one by default (one product, one team, one gate); several when teams, release rhythms or
  access rules differ (kit 2.3 has the guide).

## 6. Grow
Positioning, a landing page, pricing, privacy-friendly analytics, a launch checklist, and every piece of feedback as a card on
the board: `/market` and a launch page in docs, with kit 2.3.
