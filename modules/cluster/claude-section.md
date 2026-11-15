
## Kubernetes (`docs/CLUSTER.md`)
The app runs from the Helm chart in `deploy/helm/app/`; each environment differs only in its `values-<env>.yaml`. Keep the
security settings of `templates/deployment.yaml` (not root, read-only filesystem, no capabilities); a change that loosens one
says why in the spec. `npm run infra-check` renders every environment and scans it; the image tag is set by the deploy, never
written by hand.
