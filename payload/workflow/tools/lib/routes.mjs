// What counts as a new server route, in one place: the security-review advice (securityscan.mjs) and the "who is refused" advice
// (datacheck.mjs) both ask here, so the two never disagree. No I/O.
//   anywhere in the code: a framework's route (`app.post('/api/goals'`, Hono, Express, Fastify, a router of any name), a Next.js
//   route handler (`export async function POST`, `export const GET =`), a Next.js API page (pages/api/), a server action
//   ('use server'), a Python decorator (`@app.get(`), Go's `HandleFunc("/`, an axum or actix `.route("/`
//   only in the server folder (`security.server`): the plain-Node shapes that also appear elsewhere (`pathname ===`, `req.url`,
//   `createServer(`, `case '/goals'`, a `routes[...]` table)
// A call that reads like a client is not a route: `api.get('/users')` with no handler after the path, a receiver that is a
// client or a store (axios, http, cache, map...), or any call in the browser's code (`security.clientFolders`: src/web, src/client...).

const METHODS = 'get|post|put|patch|delete|del|all|options|head|any|use|route|handle|Handle|HandleFunc|Get|Post|Put|Patch|Delete|on';
// a framework's route: `<name>.post('/path', <a handler>)`, the handler a function, `async (c) =>` or a name (and middleware
// before it); the receiver not a client or a store
const CLIENTS = /^(?:axios|http|https|client|ky|got|request|superagent|\$http|fetcher|cache|map|store|storage|params|searchparams|headers|cookies|redis|db|kv|localstorage|sessionstorage|url|query)$/i;
const ROUTE_CALL = new RegExp(String.raw`\b([\w$]+)\.(?:${METHODS})\s*\(\s*["'\`]\/[^"'\`]*["'\`]\s*,\s*(?:async\b|function\b|\(|[\w$.]+\s*(?:[,)]|=>))`);
// what a client sends after the path is data, named as data (api.post('/users', body)); a handler is not named so
const DATA_ARG = /\(\s*["'`]\/[^"'`]*["'`]\s*,\s*(?:body|data|payload|input|values|form|formdata|params|options|opts|init|config|json|query|item|record|row|dto|request|req)\s*[,)]/i;
const routeCall = (line) => { const m = ROUTE_CALL.exec(line); return !!m && !CLIENTS.test(m[1]) && !DATA_ARG.test(line); };
export const CLIENT_FOLDERS = ['src/web/', 'src/client/', 'src/components/', 'src/ui/', 'src/browser/', 'web/', 'client/'];
const STRONG = [
  /\bexport\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/,
  /\bexport\s+const\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/,
  /^\s*["']use server["']/,
  /@(?:\w+)\.(?:get|post|put|patch|delete|route|api_route|websocket)\s*\(/,
  /\bHandleFunc\s*\(\s*"\//,
  /\.route\(\s*["']\//,
];
const LOOSE = /\bpathname\s*(?:===|!==|\.startsWith\(|\.endsWith\()|\breq(?:uest)?\.url\b|\bcreateServer\(|\broutes?\s*\[|\bcase\s+['"`]\/[\w/-]*['"`]/;
const COMMENT = /^\s*(?:\/\/|\*|\/\*|#)/;
const API_PAGE = /(?:^|\/)pages\/api\/.+\.[mc]?[jt]sx?$/;

/**
 * True when the added lines of `file` open a server route. `server` is the server folder ('src/server/'); `clientFolders` the
 * browser's code, where a call is never a route (CLIENT_FOLDERS unless the config's `security.clientFolders` says otherwise).
 */
export function addsRoute(file, lines, server = 'src/server/', clientFolders = CLIENT_FOLDERS) {
  const code = lines.filter((l) => !COMMENT.test(l));
  if (!code.length) return false;
  if (API_PAGE.test(file) && code.some((l) => /\bexport\s+default\b/.test(l))) return true;
  if (code.some((l) => STRONG.some((re) => re.test(l)))) return true;
  if (!clientFolders.some((d) => file.startsWith(d)) && code.some(routeCall)) return true;
  return file.startsWith(server) && code.some((l) => LOOSE.test(l));
}

/**
 * Whether a test speaks for `file`: the test file is named after it (goals.test.ts for goals.ts) or its added lines import or
 * name it (`from '../src/server/goals'`). Advice about a file is quieted only by a test that speaks for that file, so one
 * refusal test somewhere in a change no longer silences the advice for every other file in it.
 */
export function testSpeaksFor(file, testFile, testLines) {
  const stem = file.split('/').pop().replace(/\.[^.]+$/, '');
  if (stem === 'index' || stem === 'route') {
    // a folder's index or a Next.js route.ts is named by its folder
    const dir = file.split('/').slice(-2, -1)[0];
    return testFile.includes(dir) || testLines.some((l) => l.includes(`/${dir}`));
  }
  const name = testFile.split('/').pop().replace(/(?:[._-]test|[._-]spec)?\.[^.]+$/, '').replace(/^test_/, '');
  // an import path ending in the file's name (`/goals'`, `/goals.ts"`), or Python's `from app.goals import` / `import goals`
  const named = (l) => [`/${stem}'`, `/${stem}"`, `/${stem}.`, `/${stem}\``, `.${stem} import`, `import ${stem}`].some((s) => l.includes(s));
  return name === stem || testLines.some(named);
}
