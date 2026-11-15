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
| none. Services on one private network call each other over TLS with a token | many services, a team per service, and a need for mutual TLS, retries and traffic splitting everywhere: Linkerd (simplest) or Istio's ambient mode, only on a cluster. A mesh is a large thing to run: it waits for a real need |

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
