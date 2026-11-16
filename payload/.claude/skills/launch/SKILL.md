---
name: launch
description: Decide and set up where {{PROJECT}} runs before its first real deploy ("/launch", "/launch 31", or in plain words: "ready to deploy", "put it online", "go live", "where should this run?"): walks the owner through the platform (any cloud or on-prem), the shape (one server to a cluster), the database, the load balancer, server sizes, the infrastructure tool, environments, CI/CD and monitoring, then writes the decision record, the infra/ stacks, the deploy settings and the run docs, and plans the first change for the owner to apply. Never applies anything itself. Run from the main folder.
model: opus
---

# /launch [card number]

The kit's guide for every decision is `docs/run/LAUNCH.md` (read by the section, in its order); the edge, DNS and certificates are in
`docs/run/INFRA.md`, the mesh in `docs/run/MESH.md`, CI/CD in `docs/run/CICD.md`, monitoring in `docs/run/MONITORING.md`, how a change goes out
in `docs/run/IAC.md`, releases and user testing in `docs/run/RELEASES.md`. Nothing here is tied to one provider: the owner's answers are.

0. **Only when it is wanted.** For `project.audience: me` with no wish to put it online for others, say in one line that
   `/launch` is optional (a home server or the computer it runs on is fine) and stop unless the owner goes on.
   **Start the run stage** when `docs/run/` is not there yet: `node workflow/tools/stage.mjs --enter run` brings its guides and
   the project's run pages (deploy, environments, production, recovery). Say so in one line.
1. **What we know.** Read `docs/PRODUCT.md` (who uses it, how many, where), `docs/STACK.md`, `workflow/guides/SENSITIVE.md` and
   `sensitive.paths`, `docs/run/ENVIRONMENTS.md`, `docs/PRODUCTION.md` (what the app already does for production: settings,
   logs, health, stopping), `launch` in `workflow/config.json` if it is set, and the card if one was named. A cluster chosen:
   `docs/run/CLUSTER.md` too.
   Say back in five lines: the users and load expected in the first year, where the data may live, what must never be lost,
   how long it may be down, and the budget a month if the owner said one. Ask for what is missing, in one message.
2. **The decisions, one message each, in `docs/run/LAUNCH.md`'s order** (1 to 9). For each: the usual start from the doc, what it
   costs that day (look the prices up, give the date), what would make it change, and one recommendation with the reason.
   Ask only where the answer is not already clear from step 1; never more than three choices. Platform and tool are the
   owner's: never assume Hetzner, OpenTofu or GitHub because the examples use them. The naming parts (`docs/CONVENTIONS.md`,
   *Names of things in the system*): confirm the app code, the environment codes and the place codes for the chosen platform
   now, and the labels every resource carries (`launch.labels`), before any resource exists.
3. **The record.** Write `docs/decisions/<date>-launch.md`: each decision, the choice, the reason, the price that day, and what
   would change it. Set `launch` in `workflow/config.json` (`platform`, `iac`, `shape`, `database`, `loadBalancer`, `region`,
   `labels`, `credentials`: the names of the environment variables the tool needs, never their values). Stop for the owner's yes.
4. **The code, in a session** (`node workflow/scripts/session.mjs launch --card <n>`): `infra/<env>/` stacks in the chosen tool, one per
   environment, the names built in one place (`docs/CONVENTIONS.md`), state in a bucket with locking, a firewall that refuses
   all but what `docs/run/NETWORK.md` allows, a startup script that passes the infra check (`docs/run/IAC.md`, *Startup scripts*), and
   tests with mocked providers where the tool has them. `deploy.environments` (staging, production) with the host's deploy and
   rollback commands, `recovery.drill` with the backup tool's restore command, and the project docs filled in:
   `docs/run/ENVIRONMENTS.md`, `docs/run/NETWORK.md`, `docs/run/RECOVERY.md` (the promises, the backups, the runbook rows for this platform).
   `npm run infra-check` and the gate pass.
5. **The first plan.** Write each stack's `plan.expect` from the record **before** planning, then `npm run infra-plan --
   infra/<env>` (the owner sets the read-only credentials in their shell; never ask for the values). Explain the review in plain
   words: what will exist, what it costs a month, anything unexpected. Fix and plan again until it passes.
6. **Hand over.** The owner applies, staging first: `npm run infra-apply -- infra/staging` at their terminal (agents are denied
   it). Then the first deploy (`/ship` already released the image; the deploy workflow or the deploy script with `--env
   staging`), the smoke check, the first `npm run drill`, the uptime check and alert from `docs/run/MONITORING.md`. Production the
   same way after the owner tried staging. Ship the session with `/ship launch` when the owner says done.

Never apply, never run a deploy to production, never write a credential into a file. A destroy or replace of anything holding
data stops the plan: it is the owner's decision, with a backup first.

**This project's own**: when `.claude/project/launch.md` exists, read it before you start: it holds this project's own steps and rules for /launch, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
