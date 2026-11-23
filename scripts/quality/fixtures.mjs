// The planted projects of the quality scenarios (scripts/qualitytest.mjs): each a few files with a known flaw and, in
// qualitytest.mjs, the answer a good skill reaches. Kept in the kit's scripts/, which is never installed into a project, so the
// skill under test cannot read the answer; qualitytest.mjs also checks that no installed text names it.

/** A small route planner where "to a top" is spread over the shared steps, with its rules written two and three times. */
export const SPREAD_SUMMIT = {
  'src/geo.ts': String.raw`// Distances and points on the map: plain maths, no I/O.
export interface Point { lat: number; lon: number }
export function distanceM(a: Point, b: Point): number {
  const k = 111_320;
  const dx = (a.lon - b.lon) * k * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dy = (a.lat - b.lat) * k;
  return Math.sqrt(dx * dx + dy * dy);
}
export const between = (a: Point, b: Point, t: number): Point => ({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
`,
  'src/plan/request.ts': String.raw`// What someone asked for, read from their words: the shape of the outing, where it starts, how far, how many days.
import type { Point } from '../geo';
export type Shape = 'loop' | 'summit' | 'trail';
export interface Top extends Point { height: number; name: string }
export interface Request { shape: Shape; start: Point; km?: number; top?: Top; trail?: string; days: number }

export function readRequest(text: string, start: Point, top?: Top): Request {
  const days = Number(/(\d+)\s*days?/.exec(text)?.[1] ?? 1);
  const km = Number(/(\d+)\s*km/.exec(text)?.[1]) || undefined;
  if (/\b(top|summit|climb)\b/i.test(text) && top) return { shape: 'summit', start, top, days, km };
  const trail = /along the ([\w ]+?) trail/i.exec(text)?.[1];
  if (trail) return { shape: 'trail', start, trail, days, km };
  return { shape: 'loop', start, days, km: km ?? 20 };
}
`,
  'src/plan/route.ts': String.raw`// One route from the router, and what the planner adds to it.
import type { Point } from '../geo';
export interface Route { points: Point[]; km: number; highest: number; end: Point; wayUp?: string; reached?: boolean; score?: number; notes?: string[] }
export interface Router { route(from: Point, to: Point, opts?: { back?: boolean }): Route | null }
`,
  'src/plan/plan.ts': String.raw`// Plans an outing: the candidates, each scored, the best picked, and the notes that go with them.
import type { Request } from './request';
import type { Route, Router } from './route';
import { candidates } from './candidates';
import { score } from './score';
import { select } from './select';
import { notes } from './notes';

export function plan(req: Request, router: Router): Route[] {
  const scored = candidates(req, router).map((r) => ({ ...r, score: score(req, r) }));
  return select(req, scored).map((r) => ({ ...r, notes: notes(req, r) }));
}
`,
  'src/plan/candidates.ts': String.raw`// The routes to choose from, for every kind of outing.
import type { Request } from './request';
import type { Route, Router } from './route';
import { dayUp } from './summit-day';
import { tripUp } from './summit-trip';
import { alongTrail } from './trail';
import { loops } from './loops';

export function candidates(req: Request, router: Router): Route[] {
  if (req.shape === 'summit' && req.days > 1) return tripUp(req, router);
  if (req.shape === 'summit') return dayUp(req, router);
  if (req.shape === 'trail') return alongTrail(req, router);
  return loops(req, router);
}
`,
  'src/plan/summit-day.ts': String.raw`// A day hike to a top: up and back the same way, trying points back from the top when the router cannot reach it.
import { between, distanceM } from '../geo';
import type { Request } from './request';
import type { Route, Router } from './route';

const TRIES = [0, 0.1, 0.25, 0.5];
const NEAR_TOP_M = 100;

export function dayUp(req: Request, router: Router): Route[] {
  const top = req.top!;
  let best: Route | null = null;
  for (const t of TRIES) {
    const r = router.route(req.start, between(top, req.start, t), { back: true });
    if (r && (!best || r.highest > best.highest)) best = r;
  }
  if (!best) return [];
  return [{ ...best, wayUp: 'direct', reached: distanceM(best.end, top) < NEAR_TOP_M }];
}
`,
  'src/plan/summit-trip.ts': String.raw`// A climb over several days: one way up, split into days, with the same idea of stepping back from the top.
import { between } from '../geo';
import type { Request } from './request';
import type { Route, Router } from './route';

const BACK_OFF = [0, 0.1, 0.25, 0.5];
const NEAR_TOP_M = 150;

export function tripUp(req: Request, router: Router): Route[] {
  const top = req.top!;
  for (const t of BACK_OFF) {
    const r = router.route(req.start, between(top, req.start, t));
    if (r) return [{ ...r, wayUp: 'trip', reached: top.height - r.highest < NEAR_TOP_M / 5 }];
  }
  return [];
}
`,
  'src/plan/trail.ts': String.raw`// Along a named trail: from the start to the trail's far end.
import type { Request } from './request';
import type { Route, Router } from './route';
export function alongTrail(req: Request, router: Router): Route[] {
  const r = router.route(req.start, { lat: req.start.lat + 0.1, lon: req.start.lon });
  return r ? [r] : [];
}
`,
  'src/plan/loops.ts': String.raw`// Loops of about the length asked for, out in four directions and back.
import type { Request } from './request';
import type { Route, Router } from './route';
export function loops(req: Request, router: Router): Route[] {
  const d = (req.km ?? 20) / 400;
  return [[d, 0], [0, d], [-d, 0], [0, -d]].map(([a, b]) => router.route(req.start, { lat: req.start.lat + a, lon: req.start.lon + b }, { back: true }))
    .filter((r): r is Route => !!r);
}
`,
  'src/plan/score.ts': String.raw`// How good a route is for what was asked: closer to the length is better, and some kinds of outing count more.
import type { Request } from './request';
import type { Route } from './route';
export function score(req: Request, r: Route): number {
  let s = req.km ? 10 - Math.abs(r.km - req.km) / 2 : 10;
  if (req.shape === 'summit') s += r.highest / 100;
  if (r.wayUp === 'trip') s += 2;
  if (req.shape === 'trail') s += 1;
  return s;
}
`,
  'src/plan/select.ts': String.raw`// The routes shown: the best three, after dropping those that do not do what was asked.
import type { Request } from './request';
import type { Route } from './route';
export function select(req: Request, scored: Route[]): Route[] {
  const sorted = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (req.shape === 'summit' && req.days > 1) return sorted.filter((r) => r.reached).slice(0, 2);
  if (req.shape === 'summit') return sorted.filter((r) => r.reached || r.wayUp === 'direct').slice(0, 3);
  return sorted.slice(0, 3);
}
`,
  'src/plan/notes.ts': String.raw`// What is said under each route.
import { distanceM } from '../geo';
import type { Request } from './request';
import type { Route } from './route';
export function notes(req: Request, r: Route): string[] {
  switch (req.shape) {
    case 'summit': {
      const reached = req.days > 1 ? distanceM(r.end, req.top!) < 120 : r.reached;
      return [reached ? 'Reaches the top.' : 'Stops below the top: no mapped path goes higher.'];
    }
    case 'trail': return ['Follows the trail.'];
    default: return [];
  }
}
`,
  'tests/plan.test.ts': String.raw`// The planner on a fake router: a loop of about the length asked for.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../src/plan/plan';
import { readRequest } from '../src/plan/request';
const router = { route: (from: { lat: number; lon: number }, to: { lat: number; lon: number }) => ({ points: [from, to], km: 20, highest: 100, end: to }) };
it('plans a loop of about the length asked for', () => {
  const routes = plan(readRequest('a 20 km loop', { lat: 50, lon: 4 }), router);
  assert.ok(routes.length > 0 && routes.every((r) => Math.abs(r.km - 20) < 5));
});
`,
};

/** A built change waiting for /review: the week's total, with two mistakes against its spec and a test that catches neither. */
export const WEEK_TOTAL = {
  main: {
    'src/core/rides.ts': String.raw`// A ride as it is stored: its date and, when it was outside, its distance.
export interface Ride { date: string; km?: number }
export const ridesOn = (rides: Ride[], date: string) => rides.filter((r) => r.date === date);
`,
  },
  spec: String.raw`# Spec: week-total

Card: none, type feature
End state: the week page shows the week's total distance. This spec: is it.
Owner approval: approved on 2026-11-20

## What the user sees
The week page shows the week's total distance in km, rounded to one decimal ("12.3 km"). A ride with no distance (an indoor
ride on a trainer) counts as 0 km, so the total is never blank.

## Files that change
- src/core/week.ts: weekTotalKm(rides), new.
- tests/week.test.ts: new.

## Tests (written first)
- tests/week.test.ts: "adds up the week to one decimal", "a ride with no distance counts as 0".
`,
  session: {
    'src/core/week.ts': String.raw`// The week's total distance, shown on the week page.
import type { Ride } from './rides';
export function weekTotalKm(rides: Ride[]): number {
  const total = rides.reduce((t, r) => t + r.km!, 0);
  return Math.round(total);
}
`,
    'tests/week.test.ts': String.raw`// The week's total on the week page.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { weekTotalKm } from '../src/core/week';
it('adds up the week', () => {
  assert.equal(weekTotalKm([{ date: '2026-11-16', km: 10 }, { date: '2026-11-17', km: 20 }]), 30);
});
`,
  },
};

/** A card that asks for a special case in a shared step, in a project where the rule has a home and three callers. */
export const GRAVEL_PACE = {
  'src/core/pace.ts': String.raw`// How fast each kind of outing goes, in km an hour: the one place the planner's times come from.
export type Activity = 'ride' | 'run' | 'hike';
export const PACE_KMH: Record<Activity, number> = { ride: 25, run: 10, hike: 4.5 };
export const paceFor = (activity: Activity): number => PACE_KMH[activity];
`,
  'src/core/estimate.ts': String.raw`// How long an outing takes, shown beside each route.
import { paceFor, type Activity } from './pace';
export interface Outing { activity: Activity; km: number; surface?: 'paved' | 'gravel' }
export function hoursFor(o: Outing): number {
  const hours = o.km / paceFor(o.activity);
  return Math.round(hours * 10) / 10;
}
`,
  'src/core/plan-day.ts': String.raw`// Splits a long outing into days of at most eight hours.
import { paceFor } from './pace';
import type { Outing } from './estimate';
export const daysFor = (o: Outing): number => Math.max(1, Math.ceil(o.km / paceFor(o.activity) / 8));
`,
  'src/web/summary.ts': String.raw`// The line under the map: distance and the time it takes.
import { paceFor } from '../core/pace';
import type { Outing } from '../core/estimate';
export const summary = (o: Outing): string => o.km + ' km, about ' + Math.round(o.km / paceFor(o.activity)) + ' h';
`,
  'tests/pace.test.ts': String.raw`// The paces every time in the app comes from.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { paceFor } from '../src/core/pace';
it('a ride goes 25 km an hour', () => assert.equal(paceFor('ride'), 25));
`,
  'docs/ARCHITECTURE.md': String.raw`# Skill Test: architecture

## Rules and where each lives
The kinds of case a rule can be shared by: a ride, a run, a hike.

| Rule | Its home | Its check | Who keeps to it | Copies today |
|---|---|---|---|---|
| How fast an outing goes | src/core/pace.ts, paceFor | tests/pace.test.ts | src/** | none |
`,
};
