# Tool radar: what is in use now, and what it replaced

Tools move: Python went from pyenv, pip and virtualenv to uv in a few years, and a project started from old habits pays for it
later. This page is the kit's list of open-source tools that are the current choice, with what each replaces, so `/setup`,
`/spec` and `/launch` propose them and the owner hears of them. A tool here is a suggestion; the project's choice, with why,
goes in `docs/STACK.md`. Reviewed: 2026-11. Updated with each kit release; read by the section.

**Use** is the default for a new project. **Try** is proven elsewhere and worth it when the need comes. **Leaving** is still common
but no longer the choice for something new.

## Before taking a new tool
It solves a problem the project has now; it is open source with a licence that allows the use (watch for licence changes:
Terraform, Redis and Elasticsearch each changed theirs, and OpenTofu, Valkey and OpenSearch are the open forks); it has had
releases in the last six months and more than one maintainer; it is pinned (`.tool-versions`, the lock file) and Renovate
keeps it current. One line in `docs/STACK.md` with the reason, in the same commit.

## Languages and their tooling
| Area | Use | Try | Leaving |
|---|---|---|---|
| Tool versions | mise (one `.tool-versions` for Node, Python, OpenTofu...) | | nvm, pyenv, asdf (mise reads their files) |
| Python packages and venvs | uv (installs Python too, a lock file, fast) | | pip with requirements.txt, virtualenv, pipenv, Poetry for new projects |
| Python lint and format | Ruff | ty or Pyrefly (type checkers from Astral and Meta) | flake8, isort, Black, pylint |
| Python types | mypy or Pyright | | |
| JavaScript lint and format | Biome | Oxlint | ESLint with Prettier for new projects |
| JavaScript runtime | Node LTS (TypeScript runs natively) | Bun, Deno for scripts | ts-node |
| JavaScript packages | npm, or pnpm for workspaces | | Yarn 1 |
| JavaScript tests | node:test, Vitest; Playwright for the browser | | Jest for new projects, Cypress |
| Unused code and packages | knip | | |
| Go | the go tool, golangci-lint, govulncheck | | |
| Rust | cargo, clippy, cargo-deny, cargo-nextest | | |

## Building and running
| Area | Use | Try | Leaving |
|---|---|---|---|
| Containers | Docker or Podman, BuildKit, slim or distroless images | | |
| Infrastructure as code | OpenTofu | Pulumi (code instead of HCL) | Terraform for new open projects (licence) |
| Server setup | cloud-init, then Ansible | | hand-made servers, shell scripts over SSH |
| A small PaaS on your own server | Kamal, Coolify, Dokku | | |
| Cluster | k3s or the cloud's managed Kubernetes; Talos Linux on your own hardware | | |
| GitOps | Argo CD or Flux | | `kubectl apply` from a laptop |
| Packaging for a cluster | Helm, Kustomize | | |
| Proxy and TLS | Caddy, Traefik | | hand-renewed certificates, ingress-nginx (retired) |
| Certificates on a cluster | cert-manager | | |

## Data
| Area | Use | Try | Leaving |
|---|---|---|---|
| Small database | SQLite with Litestream | | |
| Database | Postgres (with pgBackRest, or managed) | | MySQL for new projects without a reason |
| Cache, queue on a key-value store | Valkey | | Redis for new open projects (licence) |
| Jobs and queues | a job table (pg-boss, River, SQLite); NATS when parts run apart | | RabbitMQ for small apps |
| Object storage on your own | Garage, SeaweedFS | | MinIO's community edition (moved to source-only) |
| Migrations | the ORM's own (Drizzle Kit, Alembic), Atlas | | |
| Backups | restic, Litestream, pgBackRest | | |

## Security and versions
| Area | Use | Try | Leaving |
|---|---|---|---|
| Dependency updates | Renovate | | Dependabot version updates (keep its alerts) |
| Vulnerabilities | OSV-Scanner, Trivy, Grype | | |
| Code scanning | Semgrep, CodeQL | | |
| Secrets in git | gitleaks, TruffleHog | | |
| Secrets in use | the host's secret store; SOPS with age in git; OpenBao | Infisical | HashiCorp Vault for new open projects (licence) |
| Supply chain | SBOMs (Syft), signed images (Cosign), pinned action SHAs, OpenSSF Scorecard | | |
| Sign-in for your users | Better Auth, Auth.js (in the app); Keycloak, Authentik, Zitadel (on their own) | | writing your own password storage |
| Policies on a cluster | Kyverno | OPA Gatekeeper | |

## Watching it run
| Area | Use | Try | Leaving |
|---|---|---|---|
| Telemetry from the app | OpenTelemetry | | vendor agents in the code |
| Metrics, logs, traces | Prometheus or VictoriaMetrics, Grafana, Loki, Tempo | SigNoz, OpenObserve (one tool) | ELK for small apps |
| Errors | Sentry, or GlitchTip (open, Sentry-compatible) | | |
| Uptime and status page | Uptime Kuma, Gatus | | |
| Product analytics without cookies | Plausible, Umami | PostHog (self-hosted) | Google Analytics in the EU (consent, transfers) |
| Feature flags | OpenFeature with Unleash or Flagsmith | | flags in `.env` |

## Working on the project
| Area | Use | Try | Leaving |
|---|---|---|---|
| Commits and releases | squash per feature, release-please or Changesets for versions and changelogs | | hand-written changelogs |
| Commit hooks | the kit's push guard; lefthook | | husky with long chains |
| Docs sites | the repository's Markdown; Starlight or MkDocs Material when public | | |
| Diagrams | Mermaid in Markdown, D2 | | pictures that cannot be diffed |
