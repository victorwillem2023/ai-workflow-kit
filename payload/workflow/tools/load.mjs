#!/usr/bin/env node
// Load testing with k6 (Grafana's open-source load tester), run in Docker so nothing is installed: the kind of test, the
// address and the goals come from `performance` in workflow/config.json; the verdict is a few plain lines, and it fails when
// the goals are not met. Never against production unless the owner planned it: use the dev server or staging, made-up data.
//   npm run load -- smoke | load | stress | spike | soak   [--url <address>]   [--script-only]
//   (--script-only prints the k6 script to keep and change by hand in load/, which then wins over the made one)
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { KINDS, k6Script, readSummary } from './lib/load.mjs';
import { isProduction } from './lib/production.mjs';

const K6 = 'grafana/k6:1.0.0'; // renovate: docker

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const args = process.argv.slice(2);
const kind = args.find((a) => KINDS[a]);
if (!kind) { console.log(`usage: npm run load -- <kind> [--url <address>]\n${Object.entries(KINDS).map(([k, v]) => `  ${k.padEnd(7)} ${v}`).join('\n')}`); process.exit(1); }
const load = config.performance?.load ?? {};
const goals = config.performance?.goals ?? {};
const url = (args.includes('--url') ? args[args.indexOf('--url') + 1] : load.url) ?? `http://127.0.0.1:${config.session?.mainPort ?? 8787}`;
// production is deploy.url or deploy.environments.production.url (what /launch writes), any path on the same host: lib/production.mjs
if (isProduction(url, config) && !args.includes('--yes-production')) {
  console.log(`load: ${url} is production. A load test there is planned, never by the way: add --yes-production when the owner said so.`);
  process.exit(1);
}
const own = join('load', `${kind}.js`);
const script = existsSync(own) ? readFileSync(own, 'utf8') : k6Script(kind, load, goals);
if (args.includes('--script-only')) { console.log(script); process.exit(0); }

const dir = mkdtempSync(join(tmpdir(), 'load-'));
writeFileSync(join(dir, 'test.js'), script);
// an address on this computer is reached from inside the container through the host's name
const target = url.replace(/\/\/(127\.0\.0\.1|localhost)(?=[:/]|$)/, '//host.docker.internal');
console.log(`load: ${kind} against ${url} (${KINDS[kind]})...`);
const r = spawnSync('docker', ['run', '--rm', '--add-host=host.docker.internal:host-gateway', '-v', `${resolve(dir)}:/work`, '-e', `BASE_URL=${target}`,
  K6, 'run', '--quiet', '--summary-export=/work/summary.json', '/work/test.js'], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' }, maxBuffer: 64 << 20 });
const file = join(dir, 'summary.json');
if (!existsSync(file)) {
  console.log(`load: k6 did not finish (is Docker running?)\n${String(r.stdout + r.stderr).trim().split('\n').slice(-15).join('\n')}`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}
const v = readSummary(JSON.parse(readFileSync(file, 'utf8')), kind, goals);
rmSync(dir, { recursive: true, force: true });
console.log(v.lines.join('\n'));
process.exit(v.ok ? 0 : 1);
