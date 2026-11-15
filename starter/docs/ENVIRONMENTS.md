# {{PROJECT}}: environments
<!-- covers new files: infra/**, k8s/** -->

Where the app runs, what each place is for, and what data it may hold. Start with the fewest that are safe and add one when
a real need appears, not because big companies have four: each environment costs money, upkeep and drift. `/launch` fills
this page when the first deploy card comes.

## The usual path
| Stage of the product | Environments | Why |
|---|---|---|
| Building alone, no users | `dev` (your computer) | nothing to protect yet |
| First users | `dev`, `prod` | every commit on main is checked by the gate and rolled out health-gated, rolled back by itself |
| Users who depend on it, or database changes that worry you | `dev`, `staging` (or `test`), `prod` | a release is tried on a copy of production's setup first |
| A customer or a team signs off before release | `dev`, `test`, `uat`, `prod` | `uat` is where the customer accepts a version; it is never changed by hand |

## Rules
- **Codes** are short and the same everywhere (names, DNS, tags, settings): `dev`, `test`, `uat`, `staging`, `prod`. The names
  of servers, buckets and databases carry them (`docs/CONVENTIONS.md`, *Names of things in the system*).
- **One image, promoted**: the image that passed `staging` is the one that goes to `prod`, by its commit; nothing is rebuilt
  for production.
- **Settings differ, code does not**: what differs is in the environment's settings (`.env.example` lists every name), never an
  `if (env === 'prod')` in the code beyond the settings file.
- **No production personal data below production.** Test data is made up, or a copy with the personal data taken out. This is
  the law in the EU (GDPR), not only good practice.
- **Each environment has its own secrets and accounts**: a `staging` key never opens `prod`.
- **Production changes only through the pipeline**: no hand edits on the server; an emergency fix by hand is written in the
  runbook the same day and made into code after.
- **Infrastructure as code per environment**: one folder or workspace per environment, the same modules with other sizes.

## This project
| Environment | Address | What runs it | Data | Who deploys, how |
|---|---|---|---|---|
| dev | http://127.0.0.1:<port> | the owner's computer | made up | the owner |
