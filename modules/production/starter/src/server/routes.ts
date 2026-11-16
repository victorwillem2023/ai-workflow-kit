// The app's own routes, one line each; the work of each is in its own file (CLAUDE.md here: "a new endpoint goes in its own
// file; the app only wires it in"). Every route already passes the guards of http.ts (headers, rate limit, same origin, body
// cap, idempotency keys) and answers errors as problem details; it only does its own work.
//   import { saveGoal } from './goals';
//   export const routes: Route[] = [{ method: 'POST', path: '/api/goals', handler: saveGoal }];
import type { Route } from './http';

export const routes: Route[] = [];
