#!/usr/bin/env node
// The infra check: the infrastructure code under infra/ is formatted, valid and free of known misconfigurations, whatever tool
// `/launch` chose (`launch.iac` in workflow/config.json). Runs in Docker, nothing installed. A `checks` entry of the gate, when
// infra/ changes. Never plans or applies: it needs no cloud account.
//   OpenTofu / Terraform: fmt -check, then init -backend=false and validate per stack
//   Pulumi (TypeScript): the project's typecheck covers the code; here only Trivy
//   Ansible: ansible-playbook --syntax-check per playbook
//   OpenTofu / Terraform with *.tftest.hcl files: `test`, with mock_provider so no cloud account is needed
//   startup scripts (cloud-init*.yaml, user-data*, startup*.sh): no secrets, no curl | sh, cloud-init's schema check
//   Helm charts (deploy/helm/<chart>/, the cluster module): helm lint and helm template per values-<env>.yaml, kubeconform
//   all: Trivy's configuration scan of infra/ (open firewalls, public buckets, unencrypted disks...)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stacks, startupFiles, startupProblems } from './lib/infracheck.mjs';

const IMAGES = {
  tofu: 'ghcr.io/opentofu/opentofu:1.10.0', // renovate: docker
  terraform: 'hashicorp/terraform:1.12.0', // renovate: docker
  python: 'python:3.13-slim', // renovate: docker
  trivy: 'aquasec/trivy:0.76.2', // renovate: docker
  ubuntu: 'ubuntu:24.04', // renovate: docker
  helm: 'alpine/helm:3.16.4', // renovate: docker
  kubeconform: 'ghcr.io/yannh/kubeconform:v0.6.7', // renovate: docker
};

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const dir = config.map?.infraDir ?? 'infra';
// Helm charts (the cluster module: deploy/helm/<chart>/), each rendered per environment it has a values-<env>.yaml for
const charts = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'deploy/helm'], { encoding: 'utf8' }).split('\n').filter((f) => /^deploy\/helm\/[^/]+\/Chart\.yaml$/.test(f)).map((f) => f.slice(0, -'/Chart.yaml'.length));
if (!existsSync(dir) && !charts.length) { console.log(`infra: no ${dir}/ folder yet (/launch makes it)`); process.exit(0); }
const here = process.platform === 'win32' ? execFileSync('cmd', ['/c', 'cd'], { encoding: 'utf8' }).trim() : process.cwd();
const docker = (image, args, workdir = '/src', input) => spawnSync('docker', ['run', '--rm', ...(input != null ? ['-i'] : []), '-v', `${here}:/src`, '-w', workdir, image, ...args], { input, encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' }, timeout: 10 * 60_000, maxBuffer: 64 << 20 });
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', dir], { encoding: 'utf8' }).split('\n').filter(Boolean);
const found = stacks(files, dir, config.launch?.iac);
const problems = [], tested = [];
const say = (r) => String((r.stdout ?? '') + (r.stderr ?? '')).trim().split('\n').slice(-15).join('\n');

for (const s of found) {
  if (s.tool === 'tofu' || s.tool === 'terraform') {
    const bin = s.tool === 'tofu' ? IMAGES.tofu : IMAGES.terraform;
    const fmt = docker(bin, ['fmt', '-check', '-recursive', '-diff'], `/src/${s.dir}`);
    if (fmt.status !== 0) problems.push(`${s.dir}: not formatted (run ${s.tool} fmt -recursive there)\n${say(fmt)}`);
    const init = docker(bin, ['init', '-backend=false', '-input=false', '-no-color'], `/src/${s.dir}`);
    const valid = init.status === 0 ? docker(bin, ['validate', '-no-color'], `/src/${s.dir}`) : init;
    if (valid.status !== 0) problems.push(`${s.dir}: ${s.tool} validate failed\n${say(valid)}`);
    // the stack's own tests (*.tftest.hcl), with mock_provider: what the code would build, tried with no cloud account
    if (valid.status === 0 && files.some((f) => f.startsWith(`${s.dir}/`) && f.endsWith('.tftest.hcl'))) {
      const test = docker(bin, ['test', '-no-color'], `/src/${s.dir}`);
      if (test.status !== 0) problems.push(`${s.dir}: ${s.tool} test failed\n${say(test)}`);
      else tested.push(s.dir);
    }
  } else if (s.tool === 'ansible') {
    const books = files.filter((f) => f.startsWith(`${s.dir}/`) && /\/(playbook|site|main)\.ya?ml$/.test(f));
    for (const b of books) {
      const r = docker(IMAGES.python, ['sh', '-c', `pip install --quiet --root-user-action=ignore ansible-core && ansible-playbook --syntax-check -i localhost, ${b}`]);
      if (r.status !== 0) problems.push(`${b}: ansible syntax check failed\n${say(r)}`);
    }
  }
}
// startup scripts (cloud-init user data): no secrets, no curl | sh, and the cloud-config files pass cloud-init's own schema check
const boot = startupFiles(files);
for (const f of boot) problems.push(...startupProblems(f, readFileSync(f, 'utf8')));
const configs = boot.filter((f) => /\.ya?ml$/i.test(f));
if (configs.length) {
  const r = docker(IMAGES.ubuntu, ['sh', '-c', `apt-get update -qq >/dev/null && apt-get install -y -qq cloud-init >/dev/null 2>&1 && for f in ${configs.map((f) => `'${f}'`).join(' ')}; do cloud-init schema --config-file "$f" || exit 1; done`]);
  if (r.status !== 0) problems.push(`a startup script fails cloud-init's schema check\n${say(r)}`);
}
// charts: helm lint, then each environment rendered and checked against the Kubernetes schemas (custom kinds like HTTPRoute
// and Argo CD's Application are skipped by kubeconform when it has no schema for them)
const rendered = [];
const renderDir = mkdtempSync(join(tmpdir(), 'infra-check-'));
for (const c of charts) {
  const envs = files.concat(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', c], { encoding: 'utf8' }).split('\n'))
    .map((f) => new RegExp(`^${c}/values-([a-z0-9-]+)\\.ya?ml$`).exec(f)?.[1]).filter(Boolean);
  for (const env of envs.length ? envs : [null]) {
    const vals = ['-f', `${c}/values.yaml`, ...(env ? ['-f', `${c}/values-${env}.yaml`] : []), '--set', 'image.tag=check'];
    const lint = docker(IMAGES.helm, ['lint', c, ...vals]);
    if (lint.status !== 0) { problems.push(`${c}${env ? ` (${env})` : ''}: helm lint failed\n${say(lint)}`); continue; }
    const out = docker(IMAGES.helm, ['template', 'check', c, ...vals]);
    if (out.status !== 0) { problems.push(`${c}${env ? ` (${env})` : ''}: helm template failed\n${say(out)}`); continue; }
    const valid = docker(IMAGES.kubeconform, ['-strict', '-ignore-missing-schemas', '-summary', '-'], '/src', out.stdout);
    if (valid.status !== 0) problems.push(`${c}${env ? ` (${env})` : ''}: the rendered manifests are not valid Kubernetes\n${say(valid)}`);
    else {
      rendered.push(`${c.split('/').pop()}${env ? `/${env}` : ''}`);
      // Trivy scans what was rendered with the real values: a chart scanned raw renders with defaults, or not at all
      writeFileSync(join(renderDir, `${c.split('/').pop()}-${env ?? 'default'}.yaml`), out.stdout);
    }
  }
}
const scanTargets = [...(existsSync(dir) ? [[`/src/${dir}`, `${dir}/`, []]] : []), ...(rendered.length ? [['/rendered', 'the rendered charts', ['-v', `${renderDir}:/rendered`]]] : [])];
for (const [path, name, mount] of scanTargets) {
  const scan = spawnSync('docker', ['run', '--rm', '-v', `${here}:/src`, ...mount, IMAGES.trivy, 'config', '--quiet', '--exit-code', '1', '--severity', 'HIGH,CRITICAL', path], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' }, timeout: 10 * 60_000, maxBuffer: 64 << 20 });
  if (scan.status === 1) problems.push(`Trivy found high or critical misconfigurations in ${name} (fix them, or add a .trivyignore line with the reason)\n${say(scan)}`);
  else if (scan.status !== 0) problems.push(`Trivy did not run on ${name} (is Docker running?)\n${say(scan)}`);
}
rmSync(renderDir, { recursive: true, force: true });

if (problems.length) { console.log(problems.join('\n\n')); process.exit(1); }
console.log(`infra: ${found.length} stack${found.length === 1 ? '' : 's'} (${found.map((s) => `${s.dir} ${s.tool}`).join(', ') || 'none yet'}) formatted and valid`
  + `${tested.length ? `; tests pass in ${tested.join(', ')}` : ''}${rendered.length ? `; charts render valid for ${rendered.join(', ')}` : ''}${boot.length ? `; ${boot.length} startup script${boot.length === 1 ? '' : 's'} clean` : ''}; Trivy found nothing high`);
