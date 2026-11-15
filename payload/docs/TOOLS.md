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
| Containers | Docker or Podman, BuildKit | | |
| The image that runs | distroless nonroot, Docker Hardened Images | Chainguard, Wolfi with apko | full OS images (`node:26`), running as root |
| Infrastructure as code | OpenTofu | Pulumi (code instead of HCL) | Terraform for new open projects (licence) |
| Server setup | cloud-init, then Ansible | | hand-made servers, shell scripts over SSH |
| A small PaaS on your own server | Kamal, Coolify, Dokku | | |
| Cluster | k3s or the cloud's managed Kubernetes; Talos Linux on your own hardware | | |
| GitOps | Argo CD or Flux | | `kubectl apply` from a laptop |
| Packaging for a cluster | Helm, Kustomize | | |
| Proxy and TLS | Caddy, Traefik | | hand-renewed certificates, ingress-nginx (retired) |
| Certificates on a cluster | cert-manager | | |

## Screens and content
| Area | Use | Try | Leaving |
|---|---|---|---|
| React apps | Vite (single page), Next.js (public pages), Astro (content) | React Router 7 framework mode, TanStack Start | Create React App, Gatsby, Remix as a separate name (now React Router) |
| Headless CMS | Storyblok (visual editor, EU), Payload (open source, in the repo) | Sanity, Directus, Strapi | a WordPress install as the site |
| API description and docs | OpenAPI 3.1 from the code (zod-openapi), Scalar, Swagger UI, Redoc | Mintlify, ReadMe (hosted portals) | hand-written API docs |
| API breaking changes | oasdiff | | |
| Files from partners | HTTPS uploads to object storage; SFTPGo when SFTP is required | | FTP, FTPS |

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
| Bad addresses | CrowdSec, Spamhaus DROP, fail2ban | | hand-kept block lists with no end date |
| Traffic out | firewall outbound rules, NetworkPolicy (Cilium) | an egress proxy (Squid, Envoy) | open outbound |

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

## AI tools: where they help, and what they cost
Tools that use a language model to find or fix security problems, or to run deploys. The kit's base stays the free,
repeatable scanners and scripts (a model can be wrong in a new way each run; a scanner is wrong the same way and is fixed
once). An AI tool is worth it on top when it saves the owner's time on judgement: telling a real finding from noise, explaining
it, or writing the first fix. Prices change: look them up the day you decide, and write the choice in `docs/STACK.md`.

| Tool | What it does | Cost (late 2026, roughly) | What it sees and needs |
|---|---|---|---|
| **Claude Code security review** (`/security-review`, and Anthropic's `claude-code-security-review` GitHub Action) | reads a change and reports likely vulnerabilities in plain words; the kit's `/ship` already runs it for flagged changes | API tokens per review: cents to a few dollars a change | the diff goes to Anthropic; an API key as an Actions secret |
| **GitHub Copilot Autofix** (with CodeQL) | proposes a fix for each code-scanning alert, in the pull request | free on public repositories; on private ones with GitHub Code Security, per active committer per month | stays in GitHub; a paid plan for private code |
| **Aikido Security** | one tool for libraries, code, containers, secrets, cloud setup and the domain, with AI triage that hides findings that cannot be reached, and AI fixes as pull requests; a Belgian company, EU hosting | a free tier for a small team; paid per seat beyond it | read access to the repository and, for cloud checks, the cloud account |
| **Snyk** (DeepCode AI) | libraries, code, containers and infrastructure files, with AI fixes in the editor and pull requests | a free tier with a monthly test limit; paid per developer | the code and lock files; an account and a token |
| **Semgrep Assistant** | AI triage and fix suggestions on top of the Semgrep rules the kit already runs | free for small teams on Semgrep's platform, paid beyond | the findings and the code around them go to Semgrep |
| **Socket** | catches malicious or hijacked packages before install (install scripts, network calls, obfuscation), partly by AI | free for open source and small teams | the dependency list; a GitHub app |
| **GitHub Copilot coding agent**, **Claude Code in GitHub Actions** | takes an issue (a security report row, a card) and opens a pull request with the fix | the plan's seats, or API tokens per run | write access to a branch; every pull request still goes through the gate and the owner |
| **k8sgpt** (open source, CNCF) | explains why a cluster is unhealthy in plain words | free, plus the model it calls (can be a local one) | read access to the cluster |
| **Pulumi Neo**, Harness AI, Spacelift Saturnhead | write or explain infrastructure code and failed pipeline runs | part of their paid plans | the infrastructure state and logs |

What any of them adds to manage:
- **Data**: the code (and sometimes logs or the cloud setup) goes to the vendor. Check where it is hosted and whether it trains on
  it; for an app with health or other sensitive data, the code may go, the data never (`harness.private` folders stay out).
- **Access**: a GitHub app or a token is one more row in `docs/ACCESS.md`, with the least rights and a review every 90 days.
- **Noise and trust**: an AI finding or fix is a suggestion; it goes through the same gate, `/review` and the owner's yes (the
  kit's SecOps choice: reports and cards, no AI pull requests merged by themselves).
- **Deploys stay deterministic**: the pipeline deploys the image the gate passed, health-gated, rolled back by a script. A model
  may explain a failed deploy or propose a fix; it does not decide to deploy. That keeps a bad guess from reaching users.
- **Lock-in and cost growth**: per-seat prices grow with the team; keep the free scanners as the base, so dropping a paid tool
  loses convenience, not safety.

For this kit's projects: the base as it is (OSV-Scanner, Trivy, Semgrep, gitleaks, Renovate, the weekly report), `/security-review`
on flagged changes, and, when the team or the stakes grow, one all-in-one tool with AI triage (Aikido for an EU company, Snyk
otherwise) plus Socket against malicious packages. Not more than one all-in-one tool: they overlap.
