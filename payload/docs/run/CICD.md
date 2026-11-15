# CI/CD: where the checks run and how a release reaches the servers

The options for running the gate on every push (CI) and for getting a release onto the servers (CD), with what each costs,
how much work it is, and how well an AI agent can work with it. Prices are rough, from late 2026: `/launch` looks them up on
the day it decides. Read by the section.

## What the kit already does (GitHub Actions)

| Workflow | When | What |
|---|---|---|
| gate | every push and pull request | the same gate as on your computer, the whole suite |
| release (deploy module) | after the gate passes on main | builds the image, names it after the commit, pushes it to GitHub's registry (GHCR) |
| deploy (deploy module) | after a release, or by hand | staging first, the smoke check and the watch; production only when you run it by hand, or after a required reviewer's approval (below) |
| secops | weekly | the scanners and the report (`npm run secops`) |
| setup check | when the kit is updated | that a fresh install still passes |

The scripts do the work (`npm run gate`, the deploy module's deploy script with --env staging); a workflow only calls them. So moving to another
CI later is a few small files, not a rewrite.

## CI: the choices

| Service | Cost | Convenience | With AI agents | Pick it when |
|---|---|---|---|---|
| **GitHub Actions** | public repositories free; private: 2,000 minutes a month on Free, 3,000 on Pro and Team, then under a cent a minute on Linux (Windows 2x, macOS 10x) | built in where the code and the board are; a large catalogue of actions; environments with approvals | the best today: the `gh` CLI (`gh run view --log-failed`), GitHub's MCP server, Claude Code's GitHub Action and Copilot's coding agent all read runs and open pull requests | **the default**: the kit's board, Renovate and releases already live there |
| GitHub Actions, self-hosted runner | your server's price; check GitHub's current terms for self-hosted minutes | runs on your machine: big builds, fixed cost, inside your network | the same as above | long builds or many minutes; a runner on a separate small server, never on production |
| GitLab CI | Free: 400 compute minutes a month; Premium per user | strong pipelines, its own registry, self-hostable | its CLI (`glab`) and MCP server; Duo is GitLab's own assistant | the company is on GitLab |
| Forgejo Actions (Codeberg, or your own Forgejo) | free (Codeberg runs on donations, in the EU); your own server's price | GitHub Actions syntax, mostly compatible; fewer ready actions | fewer agent tools: the API and `tea` CLI | code must stay in the EU on open source, or off US platforms |
| Woodpecker CI | free, self-hosted | small, simple, container steps | the API only | next to a self-hosted Forgejo or Gitea |
| CircleCI, Buildkite | a free tier, then by usage or by user | fast, good caching, big-team features | APIs and MCP servers exist | a team with heavy builds |
| Dagger | free (the engine), runs inside any CI | pipelines written in TypeScript, the same on your computer and in CI | an agent can run the same pipeline locally | pipelines grow complicated; the kit's scripts cover this until then |

**Our pick**: GitHub Actions. Public repositories run free; a private one on the Free plan uses about 3 to 6 minutes per push
for the gate, so 2,000 minutes is a few hundred pushes a month.

**Production never deploys by itself by default.** After staging, the deploy workflow stops and says production waits for
you; you run it by hand and pick production (Actions, deploy, Run workflow), and that click is the approval. To let
production follow staging with an approval instead, add required reviewers to the "production" environment (public
repositories, or private ones from the Team plan; Free and Pro cannot have them) and set the repository variable
`PRODUCTION_AFTER_STAGING` to `true`. The job checks the reviewers are there before it deploys and stops if they are not, so
the variable alone never makes production deploy unapproved.

Rules that hold on any CI: actions pinned to a commit (Renovate updates them), the least permissions per job (`permissions:`
at the top), secrets only in the environment that needs them (production's token only in the production environment), and
no job that runs code from a fork's pull request with secrets.

## CD: getting a release onto the servers

| Tool | Cost | Convenience | Fits |
|---|---|---|---|
| **The kit's deploy script** (the deploy module, `deploy.command`) | free | the host's own command, then the health check, the watch, and a rollback on failure | any host: the command is a `docker pull` and restart over SSH, `kamal deploy`, `kubectl set image`, a platform's CLI |
| **Kamal** | free, open source | Docker over SSH to plain servers, zero-downtime swaps through its proxy, certificates from Let's Encrypt | **one to a few servers** (Hetzner, Scaleway, OVHcloud, your own): our default with `deploy.command: "kamal deploy --version {version}"` |
| Coolify, Dokploy | free self-hosted (Coolify's hosted panel costs a few euros a month) | a Heroku-like panel on your own server, deploys on push | owners who prefer a panel to config; check how it handles rollbacks and secrets |
| Docker Compose over SSH | free | the simplest, a short downtime on each deploy unless a proxy swaps | a side project, an internal tool |
| Argo CD, Flux (GitOps) | free, run on the cluster | the cluster pulls the desired state from git, shows drift, rolls back by revert | **Kubernetes**: pair with Argo Rollouts or Flagger for canaries |
| A platform: Fly.io, Render, Railway, Scaleway Serverless Containers, Clever Cloud | per instance or per use; free or small tiers on some | no servers to run, deploys from the image | early products; Scaleway and Clever Cloud keep data in the EU |
| The cloud's own (AWS CodeDeploy or ECS, Cloud Run, Azure Container Apps) | the cloud's price | deep in that cloud | already all-in on that cloud |

Whatever the tool: the image is built once and promoted (the same image goes to staging and then production, never a rebuild),
the health address names the commit it runs, and every deploy can be undone with one command. The infrastructure under it
changes only through `docs/run/IAC.md`'s plan and review.

## What works well with AI

- **Text in, text out.** An agent fixes a red build fastest when the log is a few clear lines: the kit's scripts print only
  failures. Prefer CI and deploy tools with a CLI and plain output over dashboards.
- **Read rights for agents, write rights for people.** An agent may read runs, logs and the deploy log (`gh run view`, an MCP
  server with a read-only token). It may open a pull request. It never holds the production deploy token or the apply rights.
- **Agents in CI** (Claude Code's GitHub Action, Copilot's coding agent): useful for "explain this failure" or "propose a fix
  as a pull request", paid per run or per seat (`docs/workflow/TOOLS.md`, *AI tools*). Their pull requests go through the same gate
  and the owner, and their prompts treat issue and log text as untrusted (`docs/workflow/AI-SECURITY.md`).
