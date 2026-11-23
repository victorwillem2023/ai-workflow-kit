# A worked example: hikes to a top

The first round of /anatomy, done by hand on a route planner (November 2026), before the skill existed. It shows what a round
finds and what it proposes; your project's words will differ.

## What the script would have shown

- About ten fix commits to hikes to a top in one week, spread over many files: no file stood out, so the hotspots said nothing.
- `[0, 0.04, 0.1, 0.2, 0.35, 0.55]` (the points tried back from the top when the router cannot reach it) in `generate/summit.ts`
  and, as `TOWARDS_FOOT`, in `multiday/climb-plan.ts`: one rule, two homes.
- `NEAR_TOP_M` in two files; once named as flags, `wayUp` branched on in twelve files outside the climb's own code, among them
  the shared `select.ts`, and `mustPass` in twenty-two.

## The shape today

| Job, in order | Its home | Marks |
|---|---|---|
| 1. Find the top asked for | `resolve/` (several files), `as-high-as.ts` `topAsked` | no clear home |
| 2. Find the ways up | `mapped-ways-up.ts`, `access-ways-up.ts`, `map-ways-up.ts`, `select-ways-up.ts` | spread over `src/pipeline/` |
| 3. Route a way up | `generate/mapped-way-route.ts` (a day), `multiday/climb-plan.ts` `wayUp` (a trip) | two homes |
| 4. Judge whether it reached the top | `generate/as-high-as.ts` (a day, by distance), `climb-plan.ts` (a trip, by height) | two homes |
| 5. Pick and order the options | `select.ts` with `if (run.wayUp)` | a flag in a shared step |
| 6. Say what happened (notes) | `finish.ts`, `climb-plan.ts`, `climb-notice.ts`, `mapped-ways-up.ts` | no clear home |

## The end state

A hike to a top is one small pipeline in one folder: the top (one object), the ways up (one list, every source, one order), the
climb (one way to route a way up and one judge of reaching the top by distance and height), fitted to one day or spread over
several; the loop planner never runs for a top.

## The move plan

1. `measure:tops`: a script that plans the real tops (Aconcagua, Rainier, Denali ...) and records every option, so a refactor
   can show it changed no route.
2. A refactor card: move everything a climb does into `src/pipeline/climb/` (`context`, `ways-up`, `route-up` with one
   `STEP_BACK`, `reach`, `notes`), callers left as thin calls, a test that `climb/` never imports the loop planner. Same routes.
3. Then the behaviour cards it unlocks: one way to route a way up for a day and a trip, and the day hike judged by height too.

The same round on named trails would ask the same question of job 4: "judge whether the goal was reached" is one job for a top
and for a trail, so it gets one home both use.
