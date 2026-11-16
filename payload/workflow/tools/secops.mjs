#!/usr/bin/env node
// SecOps by hand or by schedule: the weekly report from the scanners' output (and the app's certificates, and whether the
// access review is due), its card on GitHub, and the repository's own security settings. The weekly run is .github/workflows/secops.yml; this is what it calls.
//   npm run secops -- --scan              run the four scanners here with Docker, then print the report (Docker needed)
//   npm run secops -- --scan-to <dir>     only run them, writing their results into <dir> (the weekly run)
//   npm run secops -- --report <dir>      the report from trivy.json, osv.json, semgrep.json, gitleaks.json in <dir>
//        [--out <file>]                   write it to a file instead of the screen
//   npm run secops -- --publish <file>    this week's report as an issue labelled "security-report" (last week's is closed)
//   npm run secops -- --enable            turn on Dependabot alerts and security updates for the repository
// Never fails on a finding (exit 0): it reports. The scanner versions live only in SCANNERS below (Renovate keeps them current).
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { connect as tlsConnect } from 'node:tls';
import { forOthers } from './lib/audience.mjs';
import { drillDue } from './lib/drill.mjs';
import { accessDue, combine, fromCerts, fromGitleaks, fromOsv, fromSemgrep, fromTrivy, report } from './lib/secops.mjs';
import { ipRuleProblems } from './lib/network.mjs';
import { productionHosts } from './lib/production.mjs';
import { ghRun } from './lib/gh.mjs';

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const repo = String(config.board?.repo ?? '').includes('/') ? config.board.repo : `${config.board?.owner}/${config.board?.repo}`;

export const SCANNERS = {
  trivy: 'aquasec/trivy:0.76.2', // renovate: docker
  osv: 'ghcr.io/google/osv-scanner:v2.7.1', // renovate: docker
  semgrep: 'semgrep/semgrep:1.185.0', // renovate: docker
  gitleaks: 'ghcr.io/gitleaks/gitleaks:v8.30.1', // renovate: docker
};
const COVERS = {
  osv: 'libraries with known vulnerabilities, from the lock files (OSV-Scanner)',
  trivy: 'libraries, the Dockerfile and infrastructure files, and secrets in the files (Trivy)',
  semgrep: 'our own code against common security mistakes (Semgrep, the p/default rules)',
  gitleaks: 'secrets anywhere in git\'s history (gitleaks)',
};

const gh = (a, input) => ghRun(a, input, { timeout: 60_000 }); // lib/gh.mjs
const readJson = (f) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch { return null; } };

// the app's public addresses: `security.domains` in the config, else the production hosts (deploy.url, and what /launch writes
// under deploy.environments: lib/production.mjs)
function domains() {
  if (config.security?.domains?.length) return config.security.domains;
  return productionHosts(config);
}
// one TLS handshake per address, reading when its certificate ends
const certOf = (host) => new Promise((done) => {
  const s = tlsConnect({ host, port: 443, servername: host, timeout: 10_000 }, () => { const c = s.getPeerCertificate(); s.end(); done({ host, validTo: c?.valid_to, ...(c?.valid_to ? {} : { error: 'no certificate' }) }); });
  s.on('error', (e) => done({ host, error: e.code ?? e.message }));
  s.on('timeout', () => { s.destroy(); done({ host, error: 'no answer in 10 seconds' }); });
});

async function build(dir) {
  const got = { trivy: readJson(join(dir, 'trivy.json')), osv: readJson(join(dir, 'osv.json')), semgrep: readJson(join(dir, 'semgrep.json')), gitleaks: readJson(join(dir, 'gitleaks.json')) };
  const hosts = domains();
  const certs = await Promise.all(hosts.map(certOf));
  // access reviews and restore drills are about other people's access and data: not raised for a project only the owner uses
  const access = forOthers(config) && existsSync('docs/company/ACCESS.md') ? readFileSync('docs/company/ACCESS.md', 'utf8') : null;
  const ranMore = [];
  // IP rules past their end date (the gate already refuses a bad one; dates run out on their own)
  const ipRules = ipRuleProblems(config.security?.ipRules).map((x) => ({ area: 'network', severity: x.severity, id: 'ip-rule', what: x.what, where: x.where, fix: 'take the entry out, or renew it in workflow/config.json with a reason and a new end date' }));
  const recovery = existsSync('docs/run/RECOVERY.md') ? readFileSync('docs/run/RECOVERY.md', 'utf8') : null;
  const drill = forOthers(config) || config.recovery?.drill ? drillDue(recovery, new Date(), Boolean(config.recovery?.drill)) : [];
  const findings = combine(fromOsv(got.osv), fromTrivy(got.trivy), fromSemgrep(got.semgrep), fromGitleaks(got.gitleaks), fromCerts(certs), accessDue(access), ipRules, drill);
  if (recovery != null) ranMore.push('when the restore drill was last done (docs/run/RECOVERY.md, every 3 months)');
  const ran = Object.keys(got).filter((k) => got[k] != null).map((k) => COVERS[k]);
  const failed = Object.keys(got).filter((k) => got[k] == null).map((k) => COVERS[k]);
  if (hosts.length) ran.push(`the certificates of ${hosts.join(', ')} (ending within 21 days)`);
  if (config.security?.ipRules?.length) ran.push(`the ${config.security.ipRules.length} IP allow and block rules (an end date that passed)`);
  if (access != null) ran.push('when the access review was last done (docs/company/ACCESS.md, every 90 days)');
  ran.push(...ranMore);
  return report(findings, { ran, failed });
}

// the four scanners, with Docker, writing their JSON into `dir`
function scan(dir) {
  const here = process.platform === 'win32' ? execFileSync('cmd', ['/c', 'cd'], { encoding: 'utf8' }).trim() : process.cwd();
  // the scanners run as their own users inside their containers: they must be able to write the results
  chmodSync(dir, 0o777);
  const vol = (from, to, ro) => ['-v', `${from}:${to}${ro ? ':ro' : ''}`];
  // git inside a container refuses a repository owned by another user unless it is told the folder is safe
  const safeGit = ['-e', 'GIT_CONFIG_COUNT=1', '-e', 'GIT_CONFIG_KEY_0=safe.directory', '-e', 'GIT_CONFIG_VALUE_0=*'];
  const docker = (image, rest) => spawnSync('docker', ['run', '--rm', ...safeGit, ...vol(here, '/src', true), ...vol(dir, '/out'), image, ...rest], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' }, timeout: 15 * 60_000 });
  docker(SCANNERS.trivy, ['fs', '--quiet', '--scanners', 'vuln,misconfig,secret', '--skip-dirs', 'node_modules', '--format', 'json', '--output', '/out/trivy.json', '/src']);
  docker(SCANNERS.osv, ['scan', 'source', '-r', '--format', 'json', '--output-file', '/out/osv.json', '/src']);
  spawnSync('docker', ['run', '--rm', ...safeGit, ...vol(here, '/src', true), ...vol(dir, '/out'), '-w', '/src', SCANNERS.semgrep, 'semgrep', 'scan', '--config', 'p/default', '--metrics=off', '--json', '--output', '/out/semgrep.json', '--exclude', 'node_modules', '--exclude', 'dist'], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' }, timeout: 15 * 60_000 });
  docker(SCANNERS.gitleaks, ['git', '/src', '--redact', '--report-format', 'json', '--report-path', '/out/gitleaks.json', '--exit-code', '0']);
}

function publish(file) {
  const text = readFileSync(file, 'utf8');
  const title = text.split('\n')[0].replace(/^# /, '');
  const body = text.split('\n').slice(1).join('\n').trim();
  gh(['label', 'create', 'security-report', '--repo', repo, '--color', 'B60205', '--description', 'The weekly security report', '--force']);
  const open = JSON.parse(gh(['issue', 'list', '--repo', repo, '--label', 'security-report', '--state', 'open', '--json', 'number,title', '--limit', '20']).stdout || '[]');
  const same = open.find((i) => i.title.split(':')[0] === title.split(':')[0]);
  if (same) gh(['issue', 'edit', String(same.number), '--repo', repo, '--title', title, '--body-file', '-'], body);
  else gh(['issue', 'create', '--repo', repo, '--title', title, '--label', 'security-report', '--body-file', '-'], body);
  for (const old of open.filter((i) => i !== same)) gh(['issue', 'close', String(old.number), '--repo', repo, '--comment', 'A newer security report replaces this one.']);
  console.log(`secops: ${same ? 'updated' : 'opened'} "${title}"`);
}

function enable() {
  const a = gh(['api', '-X', 'PUT', `repos/${repo}/vulnerability-alerts`]);
  const b = gh(['api', '-X', 'PUT', `repos/${repo}/automated-security-fixes`]);
  console.log(a.status === 0 ? 'secops: Dependabot alerts on' : `secops: Dependabot alerts not turned on (${String(a.stdout + a.stderr).trim().slice(0, 160)})`);
  console.log(b.status === 0 ? 'secops: Dependabot security updates on (a fix that exists comes as a pull request by itself)' : `secops: security updates not turned on (${String(b.stdout + b.stderr).trim().slice(0, 160)})`);
}

if (args.includes('--enable')) enable();
else if (opt('--publish')) publish(opt('--publish'));
else if (opt('--scan-to')) { mkdirSync(opt('--scan-to'), { recursive: true }); scan(resolve(opt('--scan-to'))); console.log(`secops: scanned into ${opt('--scan-to')}`); }
else if (opt('--report') || args.includes('--scan')) {
  let dir = opt('--report');
  if (!dir) { dir = mkdtempSync(join(tmpdir(), 'secops-')); scan(dir); }
  const r = await build(dir);
  const text = `# ${r.title}\n\n${r.body}\n`;
  if (opt('--out')) writeFileSync(opt('--out'), text);
  else console.log(text);
  if (!opt('--report')) rmSync(dir, { recursive: true, force: true });
} else console.log('usage: npm run secops -- --scan | --report <dir> [--out <file>] | --publish <file> | --enable');
