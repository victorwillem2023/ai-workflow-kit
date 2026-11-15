# Running on a Kubernetes cluster

The cluster module (`install.mjs --with cluster`) adds a Helm chart for the app (`deploy/helm/app/`) and an Argo CD application
per environment (`deploy/gitops/argocd/`). Use it when `/launch` chose a cluster (`docs/LAUNCH.md`, *One server, a container
host, serverless or a cluster*); one server needs none of it. Read by the section.

## What is in the chart
| File | What | Secure by default |
|---|---|---|
| `values.yaml` | shared settings, keys sorted | 2 replicas, requests and a memory limit, the health and ready paths |
| `values-<env>.yaml` | only what differs per environment | staging: 1 replica; production: autoscaling 2 to 4 |
| `templates/deployment.yaml` | the app | not root (65532), read-only filesystem with a small `/tmp`, every capability dropped, no service account token, seccomp, rolling updates with no pod down |
| `templates/service.yaml` | the service, a disruption budget, the autoscaler | at most one pod down during node upgrades |
| `templates/network.yaml` | a NetworkPolicy and an HTTPRoute (Gateway API) | traffic in only from the gateway's namespace; out only DNS and HTTPS |

Names and labels follow `docs/CONVENTIONS.md`: every object is `<app>-<env>` and carries `app`, `env` and `managed-by`.
Secrets come from a Kubernetes Secret named in `envFromSecret`, filled by External Secrets or Sealed Secrets from the
platform's secret store, never from a file in git.

## Checked before it goes out
`npm run infra-check` (and the gate, when `deploy/helm/**` changes): `helm lint` and `helm template` for each
`values-<env>.yaml`, the result checked against the Kubernetes schemas (kubeconform), and Trivy over what was rendered
(not the raw chart, which would render with the wrong values). Before a change reaches the real cluster: `kubectl diff` with
the rendered manifests is the plan, read against what the spec meant (`docs/IAC.md`), and a kind or k3d cluster is the
place to try it.

## Deploying: Argo CD and the deploy script
Argo CD keeps each environment equal to the chart in git. The deploy script still decides when a version goes out, checks it
and rolls back:
```json
"deploy": {
  "environments": {
    "staging": {
      "url": "https://staging.example.com",
      "command": "argocd app set {{PREFIX}}-staging --helm-set image.tag={version} && argocd app sync {{PREFIX}}-staging --timeout 300",
      "rollback": "argocd app set {{PREFIX}}-staging --helm-set image.tag={version} && argocd app sync {{PREFIX}}-staging --timeout 300"
    }
  }
}
```
The deploy workflow runs it for staging, then for production after the approval; the Argo CD token lives in each GitHub
environment's secrets (`DEPLOY_TOKEN`, read as `ARGOCD_AUTH_TOKEN`). Purer GitOps, where every version is a commit: Argo CD
Image Updater writing the tag back to `values-<env>.yaml`, or the release workflow opening that commit; then the deploy
script only watches and the rollback is a revert.

## Setting up the cluster itself
The cluster (a managed one: Scaleway Kapsule, OVHcloud, GKE, EKS, AKS, DigitalOcean; or k3s on your servers) is
infrastructure like any other: OpenTofu in `infra/`, planned and reviewed (`docs/IAC.md`). On it, installed as code and pinned:
a Gateway API implementation (Envoy Gateway, Istio, Traefik or Cilium), cert-manager for certificates, External Secrets,
Argo CD, metrics and logs (`docs/MONITORING.md`), Kyverno or Gatekeeper policies once more than one team deploys, and Velero
for backups of the cluster's state (the data's backups stay in `docs/RECOVERY.md`). A service mesh only when `docs/MESH.md`
says so.
