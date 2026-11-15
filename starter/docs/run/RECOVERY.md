# {{PROJECT}}: migrations, cutovers and disaster recovery
<!-- covers new files: infra/** -->

What happens when data moves, when the app moves, and when something is lost. A backup that was never restored is a hope, not
a backup, so every promise on this page has a drill. `/launch` fills the numbers when the first deploy card comes. Read by the
section.

## The promises
| | This project | What it means |
|---|---|---|
| How much data may be lost (RPO) | not decided | the time between the last good copy and the failure: "at most 1 hour of work" |
| How long it may be down (RTO) | not decided | from the failure to the app working again: "back within 4 hours" |
| Last restore drill | not yet | the date a backup was restored into a fresh place and the app ran on it |

## Backups
- **3-2-1**: three copies, on two kinds of storage, one in another place (another provider or region, still in the EU when
  the data must stay there), and one that cannot be changed or deleted for its retention time (object lock, or an append-only key).
- **Encrypted** before they leave the server; the key is kept apart from the backups (a password manager and on paper).
- **Tools**: SQLite: Litestream (streams every change to object storage, seconds of loss) or `sqlite3 .backup` on a timer.
  Postgres: pgBackRest or the managed database's point-in-time restore. Files and the rest: restic.
- **A drill every 3 months**, scripted: `npm run drill` restores the latest backup into a new place, starts the app on it,
  runs its health check and a few read-only requests, and writes the date and timings above (`recovery.drill` in the config
  holds the project's restore and start commands; the weekly SecOps report flags a drill older than 3 months). A drill that needed a step not written here adds the step.

## Database changes without downtime (expand and contract)
1. **Expand**: add the new column or table; the old code still works (new columns are nullable or have a default).
2. **Both**: the new version writes both shapes, reads the new one, and fills old rows in small batches.
3. **Contract**: once no running version reads the old shape (one release later), drop it in its own change.
Never rename or drop in the same release that stops using a thing. The gate's *together* check keeps a schema change and its
migration in one commit; a migration is tried on a copy of production's data before it runs there.

## A cutover (moving the app or the data to a new place)
| When | Step |
|---|---|
| A week before | lower the DNS time-to-live to 5 minutes; write the steps below for this move, with who does each |
| A day before | restore a fresh backup in the new place and run the app on it end to end (a dry run with timings) |
| Start | announce the window; put the app in read-only or maintenance mode; take a final backup and check it opens |
| Move | copy the last changes; start the new place; run the health check and the smoke tests against it |
| Switch | point DNS (or the load balancer) at the new place; watch errors and the uptime check for 30 minutes |
| Roll back if | the health check fails, errors rise, or data does not match: point back, the old place was never changed |
| After | keep the old place read-only for a week, then remove it; raise the DNS time-to-live again; write what was learned |

## When it breaks (the runbook)
| What happened | First step | Then |
|---|---|---|
| The app is down | the host's status page and the uptime check; `docker ps` or the platform's view; the last deploy | roll back to the last image that was healthy (docs/run/DEPLOY.md, with the deploy module) |
| A bad release | roll back first, find the cause after | a card with what the gate missed, and a test for it |
| Data is wrong or lost | stop writes (maintenance mode) so it does not spread | restore to a new place, compare, copy back only what was lost |
| The server or region is gone | build a new one from the infrastructure code | restore the latest backup, point DNS at it |
| A secret leaked | change it at its provider now | look in the logs for its use; tell the people affected when personal data was reached |
| Personal data was reached by someone who should not | contain it, write down what, when, whose | in the EU: tell the data protection authority within 72 hours, and the people when the risk to them is high |

Every incident gets a short note afterwards: what happened, how long, what was lost, what changes so it does not happen again.
No blame, just causes.
