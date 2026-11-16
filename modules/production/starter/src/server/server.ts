// The app's start: the settings checked, the logger, the assembled server (http.ts) with the routes, and a stop that cuts no
// one off (shutdown.ts), and the built pages (pages.ts). The image runs it as dist/server.js (`npm run build:server`); `npm start` runs it from the source.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { defineSettings, loadSettings } from './config';
import { createApp } from './http';
import { createLogger } from './log';
import { routes } from './routes';
import { gracefulStop } from './shutdown';

export const settingsSpec = defineSettings({
  PORT: { kind: 'number', default: '8787', min: 0, max: 65535 },
  /** the address our pages are served from, when it is not the server's own (the CSRF guard allows it) */
  APP_ORIGIN: { kind: 'url', optional: true },
  /** how many proxies in front add to x-forwarded-for (one load balancer: 1); 0: the connection's own address */
  TRUST_PROXY: { kind: 'number', default: '0', min: 0, max: 5 },
  /** the folder of the built pages, served for a GET that is no route ("" for none) */
  PAGES_DIR: { kind: 'text', default: 'dist' },
});

/** Starts the server; `exit` and `signals` are for tests. Resolves once it listens, with its port and stop(). */
export async function start(
  o: {
    env?: Record<string, string | undefined>;
    exit?: (code: number) => void;
    signals?: { once(e: string, f: () => void): unknown };
  } = {},
) {
  const settings = loadSettings(settingsSpec, o.env ?? process.env);
  const log = createLogger({ base: { version: process.env.APP_VERSION ?? 'dev' } });
  // sign-in: pass `signIn` here once the app has accounts (workflow/guides/PERMISSIONS.md); every route not marked public then needs it
  const app = createApp({
    routes,
    log,
    origins: settings.APP_ORIGIN ? [settings.APP_ORIGIN] : [],
    trustProxy: settings.TRUST_PROXY,
    pages: settings.PAGES_DIR || undefined,
  });
  const server = createServer(app.handle);
  // slow clients cannot hold a connection open for ever
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  await new Promise<void>((ok) => server.listen(settings.PORT, ok));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : settings.PORT;
  log.info('listening', { port });
  const stop = gracefulStop({
    server,
    state: app.state,
    log: (m) => log.info(m),
    exit: o.exit,
    signals: o.signals,
    settleMs: o.exit ? 0 : undefined,
  });
  return { port, stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void start();
