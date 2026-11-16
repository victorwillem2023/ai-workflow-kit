# Launch choices: where it runs, on what, with which tools

The decisions `/launch` walks through before the first real deploy, each with the usual start for a small product and what
would make it change. Nothing here is tied to one provider: the platform, the infrastructure tool and the sizes are the
project's answers, written in `workflow/config.json` (`launch`) and in a decision record (`docs/decisions/`). Prices change:
`/launch` looks them up on the day. Read by the section.

## The order of the decisions
Each one narrows the next: 1. where the data may live (law, customers, `workflow/guides/SENSITIVE.md`); 2. the platform; 3. one server,
a container host, serverless or a cluster; 4. the database; 5. the load balancer and the edge; 6. the server type and size;
7. the infrastructure tool; 8. analytics and a data warehouse, if at all; 9. environments, CI/CD and monitoring.

## 1-2. The platform

| Platform | Good at | Weaker at | Data in the EU |
|---|---|---|---|
| Hetzner | very cheap servers, volumes, load balancers, firewalls, private networks, object storage | few managed services (no managed database) | yes (Germany, Finland) |
| Scaleway | managed Postgres, Kubernetes, serverless containers, object storage, cheap | a smaller catalogue than the big three | yes (France, Netherlands, Poland) |
| OVHcloud | servers, managed databases, Kubernetes, bare metal; strong on sovereignty | a console and API that take getting used to | yes |
| AWS, Google Cloud, Azure | every managed service, every region, compliance papers | price, complexity, bills that grow quietly | EU regions; check where support and backups go |
| DigitalOcean, Linode (Akamai), Vultr | simple, friendly, managed databases and Kubernetes | fewer services; check the region | EU regions exist |
| A platform as a service (Fly.io, Render, Railway, Clever Cloud) | no servers at all | less control, price per instance | depends; Clever Cloud is EU-based |
| On-prem (your own servers) | data that must stay in the building, steady load, hardware you already have | you run power, network, disks and spare parts; nothing scales by itself | yes, where the building is |

Many projects mix: servers at one provider, DNS and the CDN at Cloudflare or bunny.net, backups at another provider.

## 3. One server, a container host, serverless or a cluster

| Shape | Choose it when | Costs |
|---|---|---|
| **One server** (Docker, Caddy in front) | one app, users in one region, a few hours of downtime a year is fine | the least money; you patch it |
| Two servers and a load balancer | it must stay up during a deploy or a server's failure | about double, plus the balancer; the database must live off the app servers |
| A container host (Cloud Run, Azure Container Apps, Scaleway Serverless Containers, Fly.io) | little operations work, traffic that goes up and down | per use; cold starts; less control of the network |
| Serverless functions | rare or spiky jobs, webhooks | cheap at low use, costly at steady high use; another way to write code |
| **A cluster** (Kubernetes: the provider's managed one, or k3s on your servers) | many services, several teams, or the company already runs one | a cluster is a product of its own: upgrades, ingress, certificates, policies. Managed control planes cost little or nothing; the nodes cost what servers cost |

Start with one server unless a reason above says otherwise; the deploy script, the images and the infrastructure code all
move to the next shape without a rewrite.

## 4. The database

| Need | Choice | Run it how |
|---|---|---|
| One server, one app, modest writes | **SQLite** (with Litestream backups) | in the app's volume |
| Several app servers, many users, reports | **PostgreSQL** | managed (Scaleway, OVHcloud, the big clouds, DigitalOcean) when there is one; else on its own server with pgBackRest, never on the app server |
| MySQL already known by the team, or a tool that needs it | MySQL or MariaDB | the same |
| Caching, sessions, rate limits | Valkey (the open fork of Redis) or Redis | managed or a small container; it may lose data, so nothing lives only there |
| Search over text | Postgres full text first; then Meilisearch or Typesense; OpenSearch for large volumes | a container, or their cloud |
| Files and images | object storage (S3-compatible) | the provider's, never the database |
| Vectors for AI features | pgvector in Postgres first | a separate vector database only at large scale |
| Documents with no fixed shape | Postgres with JSONB first; MongoDB if the team knows it well | managed |

A managed database is worth its price as soon as the data matters: backups, point-in-time restore, upgrades and failover.
Whatever runs it: the restore drill (`npm run drill`) proves the backups.

## 5. The load balancer and the edge

| Type | What it does | When |
|---|---|---|
| None: Caddy or Traefik on the server | TLS, HTTP/2 and 3, one app | one server |
| The provider's layer 4 balancer (TCP) | spreads connections, health checks; TLS stays on the servers | two or more servers, any protocol |
| The provider's layer 7 balancer (HTTP) | ends TLS, routes by host and path, can add headers | several services behind one address |
| A global balancer or CDN (Cloudflare, bunny.net, the cloud's) | close to users everywhere, caching, DDoS protection, a firewall | users in many regions, or attacks |
| An ingress on a cluster (ingress-nginx, Traefik, Envoy Gateway, Istio's gateway) through the Gateway API | routing into the cluster | on a cluster |

The rest of the edge (WAF, API gateway, DNS, certificates, the mesh): `docs/run/INFRA.md` and `docs/run/MESH.md`.

## 6. The server type and size

| Question | Answer to start with |
|---|---|
| Shared or dedicated CPU | shared for a start; dedicated when the load test (`docs/run/PERFORMANCE.md`) shows CPU steal or the p95 jumps |
| x86 or Arm | Arm is cheaper for the same work at most providers; the image must be built for it (`docker buildx --platform`) |
| How big | the smallest that keeps the load test's p95 under its goal with the memory at most 70% full; measured, not guessed |
| Disk | the server's own for the system; a volume for data, so the server can be replaced without losing it |
| Grow how | up (a bigger server) first, it is one change; out (more servers) once a balancer and a shared database are there |

## 7. The infrastructure tool

| Tool | Language | Choose it when | Notes |
|---|---|---|---|
| **OpenTofu** | HCL | the default: open source (MPL), every provider | `launch.iac: "tofu"` |
| Terraform | HCL | the company already uses it, or HCP Terraform | BSL licence since 2023; the same code mostly runs on OpenTofu |
| Pulumi | TypeScript (and others) | the team prefers real code, loops and tests in the app's language | its state service is free for one person, paid for teams; or self-managed state in a bucket |
| Ansible | YAML | setting up servers you have (on-prem, or after OpenTofu made them): users, hardening, updates | pairs with OpenTofu; not for creating cloud resources |
| The cloud's own (CloudFormation, Bicep, Deployment Manager) | YAML or its own | one cloud forever | ties the code to that cloud |
| Crossplane | Kubernetes objects | a platform team that runs everything from a cluster | heavy for a small product |

State: kept in a bucket with locking (the provider's object storage, encrypted, versioned), never in git and never on one laptop.
How every change goes out (check, expect, plan, apply): `docs/run/IAC.md`.

## 8. Analytics and a data warehouse

| Need | Start | Later |
|---|---|---|
| How people use the product | cookieless page analytics (Plausible, Umami, Matomo self-hosted) | product analytics (PostHog, self-hostable, EU cloud) |
| Reports on the app's own data | SQL on a read copy of the database, or DuckDB on an export | a warehouse |
| A warehouse | not needed until reports slow the app or join several sources | ClickHouse (self-hosted or cloud), BigQuery, Snowflake; MotherDuck for small teams; dbt for the models |
| Moving data into it | a nightly export job | Airbyte or dlt; change data capture when it must be fresh |

Personal and health data stays out of analytics unless the purpose, the agreement and the EU region are written down first
(`workflow/guides/SENSITIVE.md`).

## 9. Environments, CI/CD and monitoring
Which environments and how they differ: `docs/run/ENVIRONMENTS.md`. Where the checks and deploys run: `docs/run/CICD.md`. Knowing it
works: `docs/run/MONITORING.md`. Releases and user testing: `docs/run/RELEASES.md`.

## What gets written
`launch` in `workflow/config.json`: `{ "platform": "hetzner", "iac": "tofu", "shape": "one server", "database": "sqlite",
"loadBalancer": "none", "region": "hel1", "protect": null, "credentials": [] }` (the values are the project's answers), a
decision record with the reasons and what would change them, `infra/<env>/` stacks, `deploy.environments`, and the project
docs: `docs/run/ENVIRONMENTS.md`, `docs/run/NETWORK.md`, `docs/run/RECOVERY.md`.
