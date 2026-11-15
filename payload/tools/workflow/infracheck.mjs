#!/usr/bin/env node
// The infra check: the infrastructure code under infra/ is formatted, valid and free of known misconfigurations, whatever tool
// `/launch` chose (`launch.iac` in workflow.config.json). Runs in Docker, nothing installed. A `checks` entry of the gate, when
// infra/ changes. Never plans or applies: it needs no cloud account.
//   OpenTofu / Terraform: fmt -check, then init -backend=false and validate per stack
//   Pulumi (TypeScript): the project's typecheck covers the code; here only Trivy
//   Ansible: ansible-playbook --syntax-check per playbook
//   OpenTofu / Terraform with *.tftest.hcl files: `test`, with mock_provider so no cloud account is needed
//   startup scripts (cloud-init*.yaml, user-data*, startup*.sh): no secrets, no curl | sh, cloud-init's schema check
//   all: Trivy's configuration scan of infra/ (open firewalls, public buckets, unencrypted disks...)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { stacks, startupFiles, startupProblems } from './lib/infracheck.mjs';

const IMAGES = {
  tofu: 'ghcr.io/opentofu/opentofu:1.10.0', // renovate: docker
  terraform: 'hashicorp/terraform:1.12.0', // renovate: docker
  python: 'python:3.13-slim', // renovate: docker
  trivy: 'aquasec/trivy:0.76.2', // renovate: docker
  ubuntu: 'ubuntu:24.04', // renovate: docker
};

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const config = JSON.parse(readFileSync('workflow.config.json', 'utf8'));
const dir = config.map?.infraDir ?? 'infra';
if (!existsSync(dir)) { console.log(`infra: no ${dir}/ folder yet (/launch makes it)`); process.exit(0); }
const here = process.platform === 'win32' ? execFileSync('cmd', ['/c', 'cd'], { encoding: 'utf8' }).trim() : process.cwd();
const docker = (image, args, workdir = '/src') => spawnSync('docker', ['run', '--rm', '-v', `${here}:/src`, '-w', workdir, image, ...args], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' }, timeout: 10 * 60_000, maxBuffer: 64 << 20 });
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
const scan = docker(IMAGES.trivy, ['config', '--quiet', '--exit-code', '1', '--severity', 'HIGH,CRITICAL', `/src/${dir}`]);
if (scan.status === 1) problems.push(`Trivy found high or critical misconfigurations in ${dir}/ (fix them, or add a .trivyignore line with the reason)\n${say(scan)}`);
else if (scan.status !== 0) problems.push(`Trivy did not run (is Docker running?)\n${say(scan)}`);

if (problems.length) { console.log(problems.join('\n\n')); process.exit(1); }
console.log(`infra: ${found.length} stack${found.length === 1 ? '' : 's'} (${found.map((s) => `${s.dir} ${s.tool}`).join(', ') || 'none yet'}) formatted and valid`
  + `${tested.length ? `; tests pass in ${tested.join(', ')}` : ''}${boot.length ? `; ${boot.length} startup script${boot.length === 1 ? '' : 's'} clean` : ''}; Trivy found nothing high`);
