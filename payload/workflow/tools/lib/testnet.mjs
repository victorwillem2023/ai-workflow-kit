// Tests never reach the network: loaded before every test run (`node --import ./workflow/tools/lib/testnet.mjs --test ...`).
// A connection to another computer is refused, and so is one to this computer's dev servers (the main folder's port and the
// session ports in workflow/config.json) unless the test itself listens there: a stand-in browser whose page is
// http://127.0.0.1:8787/ once loaded a help video from the main folder's running server, and nothing noticed. The socket fails
// at once, and the test file fails at its end, naming each address it reached. A server a test starts (in its own process or
// a child it spawns) on any other port of this computer is fine. A test that must reach a real address (rare: an end-to-end
// run against a staging site) names it in WORKFLOW_TEST_NETWORK ("host:port,host:port").
import net from 'node:net';
import { existsSync, readFileSync } from 'node:fs';

const session = (() => { try { return existsSync('workflow/config.json') ? JSON.parse(readFileSync('workflow/config.json', 'utf8')).session ?? {} : {}; } catch { return {}; } })();
const mainPort = Number(session.mainPort ?? 8787);
const firstPort = Number(session.firstPort ?? 8788);
/** The dev servers' ports: the main folder's and the sessions' (8788 to 8999 by default). */
export const isDevPort = (port) => port === mainPort || (port >= firstPort && port <= firstPort + 211);
export const isLoopback = (host) => /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|0\.0\.0\.0|::ffff:127\.\d+\.\d+\.\d+)$/i.test(String(host ?? 'localhost'));
const allowed = new Set(String(process.env.WORKFLOW_TEST_NETWORK ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const own = new Set();

/** Why a connection from a test is refused, or null when it may go: { host, port } from net's own arguments. */
export function refusal(host, port, ownPorts = own) {
  const h = String(host ?? 'localhost'); const p = Number(port);
  if (allowed.has(`${h}:${p}`)) return null;
  if (!isLoopback(h)) return `${h}:${p} (another computer: a test uses a fake for every outside service)`;
  // WORKFLOW_TEST_PORTS=0: the session tests asked for the real range on purpose (workflow/tests/session-repo.ts)
  if (isDevPort(p) && !ownPorts.has(p) && process.env.WORKFLOW_TEST_PORTS !== '0') return `${h}:${p} (${p === mainPort ? "the main folder's dev server" : "a session's dev server"}: a test starts its own server, on port 0)`;
  return null;
}

/** host and port from the many shapes net's connect takes (options, [options, cb] as node passes it inside, port and host, a path). */
function target(args) {
  let a = args[0];
  if (Array.isArray(a)) a = a[0];
  if (a && typeof a === 'object') return a.path ? null : { host: a.host ?? 'localhost', port: a.port };
  if (typeof a === 'string' && !/^\d+$/.test(a)) return null; // a pipe or a unix socket: not the network
  return { host: typeof args[1] === 'string' ? args[1] : 'localhost', port: a };
}

const reached = [];
if (!globalThis.__workflowTestNet) {
  globalThis.__workflowTestNet = true;
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...args) {
    this.once('listening', () => { const at = this.address(); if (at && typeof at === 'object') own.add(at.port); });
    return listen.apply(this, args);
  };
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const t = target(args);
    const why = t && refusal(t.host, t.port);
    if (!why) return connect.apply(this, args);
    reached.push(why);
    const err = Object.assign(new Error(`refused: a test reached ${why}`), { code: 'ECONNREFUSED' });
    process.nextTick(() => this.destroy(err));
    return this;
  };
  process.on('exit', () => {
    if (!reached.length) return;
    process.stderr.write(`\nA test reached the network, which tests never do (workflow/tools/lib/testnet.mjs):\n${[...new Set(reached)].map((r) => `  ${r}`).join('\n')}\n`);
    process.exitCode = 1;
  });
}
