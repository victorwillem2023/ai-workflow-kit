// Load, stress, spike and soak tests (no I/O here): the k6 script for each kind, made from `performance.load` and the goals in
// `performance.goals` (workflow/config.json), and the verdict from k6's summary in plain words. The goals are the pass line,
// so a load test passes or fails by script, the same way every run.
//   "performance": { "goals": { "p95ms": 300, "errorRate": 0.01 },
//                    "load": { "url": "http://127.0.0.1:8787", "paths": ["/health", "/api/plans"], "users": 20, "duration": "2m",
//                              "requests": [{ "name": "plan a route", "method": "POST", "path": "/api/plan", "body": { "from": "..." } }] } }
// `requests`: the heavy ones with their body, as a person sends them (docs/run/SCALING.md, *The heavy work*), after the paths;
// `headers`: sent with every one (a test account's sign-in).

/** The kinds of test and what each asks. */
export const KINDS = {
  smoke: 'a few requests by one user: does it answer at all (after every deploy)',
  load: 'the expected number of users for a while: does it meet the goals on a normal day',
  stress: 'two, then four times the expected users: where does it start to fail, and does it recover',
  spike: 'ten times the users at once for half a minute: a launch, a newsletter, a post that spreads',
  soak: 'the expected users for an hour: memory that leaks, connections that run out, logs that fill the disk',
};

/** k6's stages for a kind of test, from the expected number of users. */
export function stagesFor(kind, { users = 20, duration = '2m', soak = '1h' } = {}) {
  const u = Math.max(1, Number(users));
  switch (kind) {
    case 'smoke': return [{ duration: '30s', target: 1 }];
    case 'load': return [{ duration: '30s', target: u }, { duration, target: u }, { duration: '20s', target: 0 }];
    case 'stress': return [{ duration: '30s', target: u }, { duration: '1m', target: u * 2 }, { duration: '1m', target: u * 4 }, { duration: '30s', target: 0 }, { duration: '30s', target: 0 }];
    case 'spike': return [{ duration: '20s', target: u }, { duration: '10s', target: u * 10 }, { duration: '30s', target: u * 10 }, { duration: '10s', target: u }, { duration: '30s', target: u }];
    case 'soak': return [{ duration: '1m', target: u }, { duration: soak, target: u }, { duration: '30s', target: 0 }];
    default: throw new Error(`unknown kind of test "${kind}": ${Object.keys(KINDS).join(', ')}`);
  }
}

/** The k6 script: every virtual user walks the paths in turn, with a pause like a person's, and the goals as thresholds. */
export function k6Script(kind, load = {}, goals = {}) {
  const requests = (load.requests ?? []).map((q) => ({ name: q.name ?? `${q.method ?? 'POST'} ${q.path}`, method: String(q.method ?? 'POST').toUpperCase(), path: `/${String(q.path).replace(/^\/+/, '')}`, body: q.body ?? null, headers: q.headers ?? {} }));
  const paths = (load.paths?.length ? load.paths : requests.length ? [] : ['/health']).map((p) => `/${String(p).replace(/^\/+/, '')}`);
  const options = {
    stages: stagesFor(kind, load),
    thresholds: { http_req_duration: [`p(95)<${goals.p95ms ?? 300}`], http_req_failed: [`rate<${goals.errorRate ?? 0.01}`] },
    summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
  };
  return [
    "import http from 'k6/http';",
    "import { check, sleep } from 'k6';",
    "import { Counter } from 'k6/metrics';",
    // a 429 still fails the test (most answers being refusals measures nothing), and is counted apart so the verdict says why
    "const refused = new Counter('refused');",
    `export const options = ${JSON.stringify(options)};`,
    `const BASE = __ENV.BASE_URL;`,
    `const PATHS = ${JSON.stringify(paths)};`,
    `const REQUESTS = ${JSON.stringify(requests)};`,
    `const HEADERS = ${JSON.stringify(load.headers ?? {})};`,
    'export default function () {',
    "  for (const p of PATHS) { const r = http.get(BASE + p, { headers: HEADERS }); if (r.status === 429) refused.add(1); check(r, { 'answers below 500': (x) => x.status < 500 }); sleep(1); }",
    "  for (const q of REQUESTS) { const r = http.request(q.method, BASE + q.path, q.body == null ? null : JSON.stringify(q.body), { headers: { 'content-type': 'application/json', ...HEADERS, ...q.headers }, tags: { name: q.name } }); if (r.status === 429) refused.add(1); check(r, { 'answers below 500': (x) => x.status < 500 }); sleep(1); }",
    '}',
    '',
  ].join('\n');
}

const ms = (x) => (x == null ? '?' : `${Math.round(x)} ms`);

/** The verdict from k6's --summary-export JSON: { ok, lines }. */
export function readSummary(summary, kind, goals = {}) {
  const m = summary?.metrics ?? {};
  const d = m.http_req_duration ?? {};
  const failed = m.http_req_failed?.value ?? m.http_req_failed?.rate ?? null;
  const reqs = m.http_reqs ?? {};
  const p95 = d['p(95)'];
  const goalMs = goals.p95ms ?? 300;
  const goalErr = goals.errorRate ?? 0.01;
  const okTime = p95 != null && p95 < goalMs;
  const okErr = failed != null && failed < goalErr;
  const pct = (x) => `${Math.round(x * 10000) / 100}%`;
  const vus = m.vus_max?.max ?? m.vus_max?.value;
  return {
    ok: okTime && okErr,
    lines: [
      `${kind}: ${reqs.count ?? '?'} requests, ${reqs.rate ? Math.round(reqs.rate * 10) / 10 : '?'} a second, up to ${vus ?? '?'} user${vus === 1 ? '' : 's'} at once`,
      `95% answered within ${ms(p95)} (goal under ${goalMs} ms) ${okTime ? 'ok' : 'TOO SLOW'}; the slowest ${ms(d.max)}, the middle ${ms(d.med)}`,
      `failed requests: ${failed == null ? '?' : pct(failed)} (goal under ${pct(goalErr)}) ${okErr ? 'ok' : 'TOO MANY'}`,
      ...(m.refused?.count ? [`refused by a rate limit: ${m.refused.count} (429). The test is one caller: start the server for it with limits above what it sends (perMinute on a heavy route, requestsPerMinute), or give each user a test account, so it measures the work and not the refusals.`] : []),
      ...(okTime && okErr ? [] : [kind === 'stress' || kind === 'spike'
        ? 'Expected for a stress or spike test past what you plan for: note the number of users where it broke, and check it came back afterwards.'
        : 'Find the slow path first (the slowest route in the logs, a query without an index, work that could wait in a queue), then run it again.']),
    ],
  };
}
