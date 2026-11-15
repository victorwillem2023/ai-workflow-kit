# Infrastructure as code: test, plan, review, apply

How a change to the servers, networks and databases goes out: nothing changes in a cloud until a plan of it was made, read
against what the spec meant, and applied by the owner exactly as it was read. Works for the tool `/launch` chose
(`launch.iac`: OpenTofu, Terraform, Pulumi or Ansible) on any platform, cloud or your own servers. Read by the section.

## The four steps

| Step | Command | Needs a cloud account | Who | What it proves |
|---|---|---|---|---|
| 1. Check | `npm run infra-check` (and the gate, when `infra/` changes) | no | anyone, the agent | formatted, valid, the stack's own tests pass with mocked providers, startup scripts clean, Trivy finds no open firewall or public bucket |
| 2. Expect | write `plan.expect` in the stack's folder, from the spec | no | the agent, in the build | what the change is meant to do, written down before anyone sees the plan |
| 3. Plan | `npm run infra-plan -- infra/<stack>` | read only | the agent or the owner | what the tool would really do against the real state, and that it matches step 2 |
| 4. Apply | `npm run infra-apply -- infra/<stack>` | yes, writes | **only the owner**, at a terminal: every destroy is listed by name, each one that holds data is typed out in full, then a code | exactly the saved plan goes out, or nothing |

Why write the expectation first: a plan of 40 lines is easy to nod through. "1 to create, 1 to change" against a spec that said
"add a firewall rule" is a question nobody can miss. The script compares, the agent explains the difference, the owner decides.

### plan.expect
```
# what the spec "open port 8443 for the admin" should do in infra/prod
update hcloud_firewall.web
create hcloud_firewall_attachment.*      # * matches any part of the address
```
One line per change: `create`, `update`, `delete`, `replace` (destroyed and made again) or `any`, then the address the plan uses.
Commit it with the change: the review in `/review` reads it next to the diff. The plan fails when:
- a change in the plan is not in the file (the code does more than the spec said), or a line in the file is not in the plan;
- something that holds data or names would be destroyed or replaced (a database, volume, disk, bucket, DNS zone or record,
  key vault, backup). Expecting it is not enough: the owner plans again with `--allow-destroy <address>` at their own terminal (agents are
  refused it, by the settings and by the script), after a backup
  and a restore drill (`docs/RECOVERY.md`). Which kinds count: `launch.protect` in the config, a pattern;
- there is no `plan.expect` at all.

A change to a startup script is a warning, not a failure: see *Startup scripts* below for why it matters.

### The saved plan
The plan is saved beside git's own data (`.git/infra-plans/`), never committed: it can hold secrets. The apply refuses when
the plan did not pass, when any file of the stack changed after it was made (plan again, so what goes out is what was read),
or when it was already applied once. OpenTofu and Terraform apply the saved plan file itself; Pulumi uses its update plans
(`preview --save-plan`, `up --plan`), which stop when the real change would differ from the preview. Ansible has no plan file:
`infra-plan` runs it with `--check --diff` and the owner runs the playbook after reading that.

Credentials come from the environment (`HCLOUD_TOKEN`, `AWS_*`, `ARM_*`, `GOOGLE_*`, `SCW_*`, `OVH_*`, `DIGITALOCEAN_*`,
`TF_VAR_*`, `PULUMI_*`, and any name in `launch.credentials`). They are handed to the container by name and never printed.
Give the planning account read-only rights where the platform allows it (a separate token or role), and keep the one that
can write for the apply.

### In CI
Once more than one person changes `infra/`, the plan also runs in CI on each push that touches it, with the read-only
credentials, and its summary goes into the job's summary. The apply stays a person at a terminal, or a deploy job behind a
GitHub environment that needs an approval. Tools that do the whole loop on pull requests: Atlantis and Digger (open source,
self-hosted), Spacelift, env0, Scalr, HCP Terraform (paid, each with a free tier). They earn their place with a team, not before.

## Testing without a cloud

| Tool | What it fakes | Cost | Use it for |
|---|---|---|---|
| `tofu test` / `terraform test` with `mock_provider` | any provider: the plan runs, values are made up | free, built in (OpenTofu 1.8+, Terraform 1.7+) | the rules in the code: "the server is in hel1", "the firewall never opens 22 to the world", "prod has 2 servers". The infra check runs every `*.tftest.hcl` |
| `command = apply` in a test, with a real account | nothing: makes real resources and destroys them | the minutes they run | a module many stacks share, in a test project, before a big change |
| Pulumi's unit-test mocks (`setMocks`) | the engine, in the project's own test runner | free | the same rules as above, in TypeScript tests |
| LocalStack | AWS APIs on your computer (S3, SQS, Lambda, DynamoDB, IAM...) | a free tier needs an account now; many services are paid | apps and stacks on AWS. Check what its current free tier covers before you plan on it |
| Moto | AWS APIs, in Python tests or as a small server | free, open source | the same, lighter, for the services it knows |
| Azurite, the GCP emulators (Pub/Sub, Firestore, Bigtable, Spanner) | one storage or data service each | free | the app's code against those services, not the infrastructure |
| kind, k3d, minikube | a whole Kubernetes cluster in Docker | free | manifests, Helm charts, `kubectl diff` and `--dry-run=server` before the real cluster |
| Molecule with Docker | a fresh machine for an Ansible role | free | a role runs twice and changes nothing the second time |
| A staging stack | the real platform, smaller | the platform's price | the last proof before production: same code, other variables |

The order of trust: tests with mocks (seconds, catch your own mistakes), the plan against the real state (catches drift and
what the provider really does), staging (catches what only running shows). None replaces the next.

## Startup scripts

Most platforms run a script on a server's first boot: AWS user data, GCP `startup-script` metadata, Azure custom data,
Hetzner, DigitalOcean, Scaleway and OVHcloud `user_data`. Almost all of them hand it to **cloud-init**, so one cloud-config
file works on all of them, and on your own servers from an image that has cloud-init.

| Rule | Why | Checked |
|---|---|---|
| A cloud-config file starts with `#cloud-config` and passes `cloud-init schema` | otherwise it is ignored, or half runs, and the server starts without its setup | the infra check |
| No secrets in it | anyone who can read the server's metadata or the console's settings reads them, and the plan shows them | the infra check, and gitleaks |
| No `curl ... \| sh` | runs whatever that address serves that day | the infra check |
| Keep it small: install the runtime, add the user, start the app from its image | a long script is a server nobody can make again the same way | review |
| Fetch secrets at boot from the platform's secret store (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, a Vault or OpenBao), with the server's own identity | the secret never sits in the script | review |
| A change to it means a new server | it runs on the first boot only; most providers replace the server when it changes, some update the setting and change nothing | the plan review warns |
| Bake what does not change into the image (Packer, or the platform's image builder) | faster boots, and the same server every time | `/launch` decides |

The startup script's file sits next to the stack (`cloud-init.yaml`, `user-data.yaml`, `startup.sh`, or a `.tftpl` template)
and the code reads it (`user_data = file("${path.module}/cloud-init.yaml")`, or `templatefile` for one with values). Its log is
on the server: `/var/log/cloud-init-output.log`, and `cloud-init status --long`.
