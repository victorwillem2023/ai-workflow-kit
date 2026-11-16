# Service mesh: whether you need one, which one, and how to run it

> **Not yet tried in a real project.** This guide was written before the kit's rule that a part comes from a real project's need
> (README). Read it as a starting point, not as tested advice: check each step against the tool's own docs, and when a project
> first uses it, the kit's version is reworked from what that project found (or removed).

A service mesh is a layer that handles the calls between your own services: every call encrypted and proven (mutual TLS),
retries and timeouts, splitting traffic for a canary, and a metric for every call, without code in the app. It costs a lot to
run. This doc helps decide if it is time, picks one, and says how to run it with the kit. Read by the section.

## Do you need one yet?

Answer these. Fewer than three yes: not yet.

1. More than about five services that call each other, on Kubernetes?
2. A rule (a customer, an auditor, a certification) that every call inside must be encrypted and the caller proven?
3. Several teams, each owning services, who need "service A may call B, not C" without asking each other?
4. Canary releases or traffic shifting between versions, per service, often?
5. Someone whose job includes running it (upgrades, certificates, debugging the proxy at 2 am)?

What to do instead until then:

| Need | Without a mesh |
|---|---|
| Encryption inside | a private network (`docs/run/NETWORK.md`), TLS from the app or the proxy, and a token per service |
| Who may call whom | Kubernetes NetworkPolicy (with Cilium or Calico, which enforce it), or the firewall rules in `infra/network.json` |
| Retries and timeouts | in the client code, one shared helper, with a test |
| Canary releases | the deploy watch (`deploy.watch`) on one server; on Kubernetes, Argo Rollouts or Flagger with the ingress |
| A metric per call | OpenTelemetry in the app (`docs/run/MONITORING.md`) |

## The choices

| Mesh | How it works | Good | Watch out | Fits |
|---|---|---|---|---|
| **Istio, ambient mode** | a small node proxy (ztunnel) gives every pod mutual TLS; a waypoint proxy per namespace or service only where you need HTTP rules | no sidecar per pod (far less memory, no restarts to join), the biggest feature set, Gateway API native, CNCF graduated, Apache 2.0 | still large to learn; some features came later than in sidecar mode | **the default pick on Kubernetes today**, and an easy step for a company already on Istio |
| **Istio, sidecar mode** | an Envoy proxy next to every pod | the longest track record, every feature, the most answers online | memory and CPU per pod, pods restart to join, upgrades touch every pod | companies already running it; new installs pick ambient |
| **Linkerd** | a small Rust proxy next to every pod | the simplest to run, very light, mTLS on by default | stable releases come from Buoyant (Buoyant Enterprise for Linkerd: free for small companies, paid beyond); the open project ships edge releases; fewer traffic features than Istio | a small team on Kubernetes that wants mTLS and metrics, little else |
| **Cilium service mesh** | eBPF in the kernel for the network part, a shared Envoy per node for HTTP rules | no sidecars, one tool for the network, NetworkPolicy, and the mesh, Hubble shows the traffic | needs Cilium as the cluster's network plugin; HTTP features are thinner | clusters that already use Cilium as their CNI |
| **Consul** (HashiCorp) | sidecars, on Kubernetes, VMs and Nomad alike | one mesh across VMs and clusters, service discovery built in | the licence is BSL, not open source, since 2023; heavier to run | mixed estates: VMs plus Kubernetes, several data centers |
| **Kuma / Kong Mesh** | Envoy sidecars, a control plane that spans zones | VMs and Kubernetes, multi-zone made simple, CNCF project | a smaller community than Istio or Linkerd | multi-zone or VM-heavy setups |
| **Managed**: GCP Cloud Service Mesh, the Istio add-on for AKS | the platform runs Istio's control plane | upgrades and certificates handled | tied to that cloud; AWS App Mesh is closing (end of support in 2026), use Istio or VPC Lattice there | already all-in on that cloud |

**Our advice**: none until the questions above say yes. Then Istio in ambient mode, or Linkerd for a small team that wants
only mTLS and metrics. Already running Istio with sidecars: stay, and plan the move to ambient namespace by namespace.

## Running Istio with the kit

**Install** with Helm charts or `istioctl install`, from code in `infra/` (a `helm_release` in OpenTofu, or a Helm chart in
the Kubernetes folder), never by hand: the infra map lists what is installed, and a new cluster gets the same.
Pin the version (`.tool-versions` and the chart version) and let Renovate propose updates.

**Ambient mode** in three steps: install with the `ambient` profile; label a namespace `istio.io/dataplane-mode=ambient`
(its pods get mTLS, no restarts); add a waypoint (`istioctl waypoint apply -n <ns>`) only for the services that need HTTP
rules (retries, header routing, L7 authorization).

**The rules worth having on day one**, as code in `infra/`:

| Object | What it does | Start with |
|---|---|---|
| `PeerAuthentication` | which calls must use mTLS | `STRICT` for the whole mesh (in `istio-system`), once every service is in it |
| `AuthorizationPolicy` | who may call whom | deny all in each namespace, then one allow per caller: the same list as `infra/network.json`, by service account |
| Gateway API (`Gateway`, `HTTPRoute`) | traffic in, and routing between versions | the way in for new setups: Istio recommends it over its older `Gateway` and `VirtualService` |
| `DestinationRule` | timeouts, retries, connection limits per service | only where a service needs them; set timeouts explicitly, retries carefully (they multiply load) |
| `Telemetry` | which metrics and traces go out | send traces to the OpenTelemetry collector (`docs/run/MONITORING.md`), sample them |

**Upgrades** with revisions (canary upgrades): install the new control plane next to the old one, move one namespace with its
label, watch, then the rest. Istio supports each minor version for about six months: put the upgrade on the board when a new
minor comes out, not when the old one ends. In ambient mode ztunnel upgrades node by node.

**Checking before it goes out** (the same order as `docs/run/IAC.md`):
1. `istioctl analyze` on the manifests: finds rules that point at nothing, conflicts, missing labels.
2. A kind or k3d cluster with Istio, the manifests applied, and a smoke test of the calls that must work and those that must
   be refused.
3. `kubectl diff` against the real cluster: the plan for Kubernetes, read against what the spec meant.
4. Then apply, by the owner, and watch the mesh's error rate (Kiali or the Grafana dashboards) during the deploy watch.

**Seeing it**: Kiali draws the call graph and flags policy problems; the Istio Grafana dashboards show each service's rate,
errors and latency; traces go through OpenTelemetry like the app's own.

**Common trouble**: a pod outside the mesh calling a `STRICT` service (refused: add it, or a `PERMISSIVE` exception with a
reason and an end date); a retry policy turning a slow service into a flood; a waypoint missing, so an HTTP rule does
nothing in ambient mode; certificates: the mesh rotates its own, but a custom root needs its own renewal on the calendar.

## With AI agents
The mesh's tools answer in text, which is what an agent reads best: `istioctl analyze`, `istioctl proxy-config`, `kubectl
get -o yaml`, and Kiali's validation list. Let an agent read them and explain a refused call or a rule that matches nothing;
never let it apply a mesh change: the steps above apply to it too, and a wrong `AuthorizationPolicy` can cut off every
service at once.
