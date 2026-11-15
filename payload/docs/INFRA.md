# Infrastructure choices: the network edge, DNS, private networks and certificates

The kit's advice for what sits between the internet and the app, read by `/launch` and by the owner when a card needs it. Each
part starts small and says what would make it grow. Prices and products change: `/launch` looks them up the day it decides.
The project's own answers go in its docs (`docs/ENVIRONMENTS.md`, `docs/RECOVERY.md`, and the deploy docs). Read by the section.

## The path of a request
```
person -> DNS -> (CDN / WAF) -> load balancer -> reverse proxy (TLS) -> app -> database, object storage, queue
                                                                        \-> other services: direct, or through a mesh
```
Every box you add can fail and must be watched, so each one below waits for its reason.

## Reverse proxy and TLS
| Start | Grow when |
|---|---|
| **Caddy** in front of the app on the same server: HTTPS by itself (Let's Encrypt), renews by itself, HTTP/2 and 3, a small config file | many routes or services on one host with labels: **Traefik**; a cluster: the ingress controller (ingress-nginx was retired in 2026, so Traefik or a Gateway API controller such as Envoy Gateway) |
The proxy holds the timeouts, body-size limits and security headers; the app trusts the client address only from it.

## Load balancer
| Start | Grow when |
|---|---|
| none: one server, health-gated deploys roll back by themselves | two or more app servers, or deploys with no gap: the host's load balancer (Hetzner, Scaleway, the cloud's), health checks on `/ready`, sessions in the database or cookies, never in one server's memory |

## CDN
| Start | Grow when |
|---|---|
| the app serves its own built files with long cache headers (file names carry a hash) | people far away, big images or video, or traffic spikes: Cloudflare (free plan), or Bunny CDN for an EU company; the CDN caches files only, never a signed-in page |

## Web application firewall and rate limits
| Start | Grow when |
|---|---|
| rate limits in the app on sign-in, sign-up and every costly endpoint; the proxy refuses huge bodies | the app is attacked, or the law or a customer asks: Cloudflare's WAF rules, or Coraza (the OWASP Core Rule Set) inside Caddy; bot protection on forms |

## API gateway
| Start | Grow when |
|---|---|
| none: the app's own router does auth, limits and versions | several services behind one public API, keys and quotas per customer, or a public API product: Kong, Tyk or KrakenD (open source), or the cloud's own gateway with serverless |

## Service mesh
| Start | Grow when |
|---|---|
| none. Services on one private network call each other over TLS with a token | many services, a team per service, and a need for mutual TLS, retries and traffic splitting everywhere: Istio's ambient mode or Linkerd, only on a cluster. A mesh is a large thing to run: it waits for a real need. The questions, the choices and how to run Istio: `docs/MESH.md` |

## DNS
- **Public DNS** at a provider with an API and DNSSEC (Cloudflare, deSEC, Bunny DNS, or the cloud's), written as code with
  OpenTofu; on a cluster external-dns writes the records from the app's routes.
- **Names**: `<app>.<domain>` for production, `<env>.<app>.<domain>` for the rest (`staging.coach.example.com`); mail records
  (SPF, DKIM, DMARC) before the first email goes out.
- **Private DNS** for what only the inside reaches (`db.internal`, `api.prod.internal`): the cloud's private zones, or a small
  resolver on the private network (CoreDNS, Unbound). Never a private name in public DNS.
- **Split horizon** (one name, other answers inside and outside) only when it must be; it is hard to debug.
- Time-to-live of 5 minutes before a move, an hour or more otherwise (`docs/RECOVERY.md`, *A cutover*).
- The registrar account has two-step sign-in and a registrar lock on the domain; the domain renews by itself.

## Private networks: staying inside
- The database, the cache, the queue and the admin pages have **no public address**: they sit on the provider's private
  network (Hetzner networks, a VPC on AWS, Google Cloud, Azure or Scaleway), reached only by the app.
- Managed services on a cloud are reached through the cloud's private endpoints (AWS PrivateLink and VPC endpoints, Google
  Private Service Connect, Azure Private Link), so data to object storage or a managed database never crosses the internet.
- People reach the inside through a VPN, never an open SSH port: WireGuard, or Tailscale (or Headscale, its open-source
  control server) with two-step sign-in; on a cluster, `kubectl` only over the VPN.
- Firewalls as code: deny everything inward, then open 443 (and 80 for the redirect) on the proxy only; outward traffic
  limited where the platform allows it. Security groups per part (proxy, app, data) on a cloud.

## Certificates
| Where | How | Watch |
|---|---|---|
| One server | Caddy gets and renews Let's Encrypt or ZeroSSL certificates by itself | the weekly security report reads each address's certificate (`security.domains` in the config) and raises one ending within 21 days |
| A server with another proxy | certbot with its timer, or the proxy's own ACME support | the same |
| A cluster | cert-manager with a Let's Encrypt issuer, DNS-01 for wildcards | the same, plus cert-manager's own alerts |
| Inside (service to service, the database) | the cloud's private certificate authority, or step-ca; a mesh does it by itself | short lives, renewed by a tool |
Never pay for a certificate for a website: the free ACME ones are as trusted. Renewal is always automatic; one renewed by hand
is a broken automation hidden. The private key never leaves the server or the secret store.

## Container images
The image that runs holds only what runs: the built app, its production libraries and the runtime. No shell, no package
manager, no compilers, no source, tests, docs or git history; it runs as a user that is not root, from a base pinned to a
version (Renovate moves it). The gate's *image* check holds these rules; Trivy scans the image at each release.

| Base for the running image | What it is | Cost and catch |
|---|---|---|
| **Distroless** (`gcr.io/distroless/nodejs26-debian13:nonroot`, and for Java, Python, static binaries) | Google's: the runtime and its libraries, nothing else; no shell | free; few tags, so no shell to debug with (a `:debug` tag has busybox, only for looking) |
| **Docker Hardened Images** (`dhi.io`) | Docker's minimal images, rebuilt quickly when a fix appears, signed, with SBOM and provenance, near-zero known vulnerabilities; Debian or Alpine based, drop-in names | free and open source for the images; an enterprise plan adds longer support, FIPS images and fix-time promises; a Docker account to pull |
| **Chainguard Images** (`cgr.dev/chainguard/node`) | built on Wolfi, minimal, zero-CVE focus, signed | free only for the latest tag; pinned versions and older lines are paid |
| **Wolfi with apko** | build your own minimal image from Wolfi packages, as code | free; you own the build |
| **Ubuntu Chiseled** | Canonical's sliced Ubuntu, no shell | free; for teams standardised on Ubuntu, best for .NET and Java |
| **Red Hat UBI micro** | minimal Red Hat base | free to redistribute; for RHEL shops and OpenShift |
| `node:26-trixie-slim` | Debian slim with Node | fine for the build step; as the running image it carries a shell and apt (remove npm at least) |
| Alpine | very small | musl instead of glibc: some native libraries break or run slower; a hardened Alpine (DHI) is the safer form |
The kit's TypeScript `Dockerfile` builds on `node:26-trixie-slim` and runs on distroless nonroot (the same Debian 13 under
both, so native libraries match). Switch the last `FROM` to a DHI or Chainguard image when you want faster fixes or signed
provenance; the rules stay the same.
- **A frontend only** (no server code): build it, then serve the files from a small web server image: Caddy, or
  `nginxinc/nginx-unprivileged`, or the host's static hosting or a CDN with no container at all.
- **Next.js**: `output: 'standalone'` in `next.config`, then copy only `.next/standalone`, `.next/static` and `public` into the
  running image; it starts with `node server.js`.
- **Other languages**: Go and Rust build one static binary for `gcr.io/distroless/static:nonroot` (or `scratch`); Python with
  uv into a virtual environment copied onto a distroless or DHI Python image.
- **Run it read-only**: `read_only: true` (Compose) or `readOnlyRootFilesystem` (Kubernetes), a temp folder mounted for what
  must be written, all Linux capabilities dropped, no privilege escalation.

## Traffic in and out (ingress and egress)
- **In**: only the proxy is reachable from the internet, on 443 (and 80 to redirect); everything else listens on the private
  network or on 127.0.0.1. Admin pages, metrics and the database are never public: over the VPN, or limited by IP rules.
- **Out**: the app may call only the hosts it needs. `security.egress` in the config lists them (the gate fails on a call in the
  code to a host not listed), and the same list becomes the firewall's outbound rules (Hetzner and every cloud firewall have
  them), a Kubernetes NetworkPolicy (default deny, then allow DNS and the listed hosts; Cilium can match by name), or an egress
  proxy (Squid, Envoy) on a bigger setup. In the app, fetches of addresses that come from users go through the guard
  (`safeFetch` in the security module): no private ranges, no metadata address (169.254.169.254).
- Why it matters: when the app is broken into, egress rules stop the data leaving and the attacker downloading tools; and a
  list of every outside host is what the privacy record (who gets which data) needs anyway.
The project's own lists: `docs/NETWORK.md`.

## IP allow and block lists
| Use | How | Watch |
|---|---|---|
| Admin pages, SFTP, the database console: **allowlist** | the VPN first; IP rules in the firewall or the proxy for a partner's fixed addresses | every entry in `security.ipRules` has a reason and an end date; the weekly report raises one past its date |
| Known bad addresses: **blocklist** | CrowdSec (open source, a community list, a bouncer for Caddy or the firewall), Spamhaus DROP and FireHOL level 1 lists on the firewall, fail2ban for SSH-style logins | lists from the provider, refreshed by a timer; your own blocks with an end date |
| Abuse of one endpoint | rate limits per user and per IP in the app or the proxy, then the WAF | a block for hours, not forever |
| Countries | only when the law or a contract asks: geo lists are coarse, VPNs pass them, and real users are blocked | |
Blocking by IP alone is weak (addresses change hands, attackers rotate); allowing by IP is strong only together with sign-in.
Lists live in code (the config, the firewall's OpenTofu file), never as hand edits in a console.

## Files from partners: SFTP
Avoid it when you can: an upload over HTTPS to object storage with a short-lived signed address, or an API, is simpler and
safer. When a partner, bank or old system requires it:
- **SFTP only** (over SSH), never FTP or FTPS. A managed service (AWS Transfer Family, Azure Blob SFTP) or **SFTPGo** (open
  source, storage in S3-compatible buckets, users per partner, its own web admin) instead of OpenSSH on the app server.
- One account per partner, key-only sign-in (no passwords), each in its own folder (chroot), read or write as needed, an IP
  allowlist with the partner's addresses (`security.ipRules`), keys rotated yearly and on any staff change on their side.
- Every file is hostile input: size and type limits, a virus scan (ClamAV) before use, parsed by the same guards as uploads,
  moved out of the inbox after processing, kept only as long as `docs/PRIVACY.md` says. PGP encryption on top when the data is
  sensitive or the partner asks.
- A job picks files up (a queue or a timer), never the partner's upload starting code directly; every pick-up is logged.
