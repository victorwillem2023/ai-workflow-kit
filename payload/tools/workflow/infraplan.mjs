#!/usr/bin/env node
// Plan, review, then apply: no infrastructure changes without a plan that was read and matches what the spec meant.
//   node tools/workflow/infraplan.mjs <stack>                     make the plan (reads the cloud, changes nothing), save it, and
//        [--allow-destroy <address>]...                           review it against <stack>/plan.expect (lib/infraplan.mjs)
//   node tools/workflow/infraplan.mjs --apply <stack>             apply exactly the saved plan: at a terminal, with a typed code,
//                                                                 only when the review passed and no file in the stack changed since
// OpenTofu / Terraform: plan -out, show -json, apply <saved plan>. Pulumi: preview --save-plan, up --plan. Ansible: --check --diff
// (the review is reading the diff; the owner runs the playbook). Runs in Docker like the infra check; the cloud credentials come
// from the environment (TF_VAR_*, HCLOUD_*, AWS_*, ARM_*, GOOGLE_*, SCW_*, OVH_*, DIGITALOCEAN_*, PULUMI_*, and launch.credentials)
// and are handed to the container by name, never printed. The saved plan can hold secrets: it stays beside git's own data.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stacks } from './lib/infracheck.mjs';
import { PROTECTED, destroyLines, fromPulumiPreview, fromTofuPlan, parseExpect, renderReview, reviewPlan } from './lib/infraplan.mjs';

const IMAGES = {
  tofu: 'ghcr.io/opentofu/opentofu:1.10.0', // renovate: docker
  terraform: 'hashicorp/terraform:1.12.0', // renovate: docker
};
const stop = (line) => { console.log(line); process.exit(1); };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const root = git('rev-parse', '--show-toplevel');
process.chdir(root);
const args = process.argv.slice(2);
const applying = args.includes('--apply');
const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--allow-destroy')?.replace(/\/+$/, '');
const config = JSON.parse(readFileSync('workflow.config.json', 'utf8'));
const files = git('ls-files', '--cached', '--others', '--exclude-standard', '--', config.map?.infraDir ?? 'infra').split('\n').filter(Boolean);
const stack = stacks(files, config.map?.infraDir ?? 'infra', config.launch?.iac).find((s) => s.dir === dir);
if (!stack) stop(`Name a stack: npm run infra-plan -- <folder>. The stacks: ${stacks(files, config.map?.infraDir ?? 'infra', config.launch?.iac).map((s) => s.dir).join(', ') || 'none yet (/launch makes them)'}.`);

const plans = join(resolve(root, git('rev-parse', '--git-common-dir')), 'infra-plans');
mkdirSync(plans, { recursive: true });
const slug = stack.dir.replaceAll('/', '-');
const metaFile = join(plans, `${slug}.json`);
// what the plan was made from: every file of the stack and the modules it can use, so a later edit voids the saved plan
const print = () => createHash('sha256').update(files.filter((f) => (f.startsWith(`${stack.dir}/`) || /(^|\/)modules\//.test(f)) && !/(^|\/)\.(terraform|pulumi)\//.test(f)).sort().map((f) => `${f}\0${existsSync(f) ? readFileSync(f) : ''}`).join('\0')).digest('hex').slice(0, 16);
const credentials = Object.keys(process.env).filter((k) => /^(TF_VAR_|TF_TOKEN_|HCLOUD_|AWS_|ARM_|AZURE_|GOOGLE_|CLOUDSDK_|SCW_|OVH_|DIGITALOCEAN_|PULUMI_)/.test(k) || (config.launch?.credentials ?? []).includes(k));
const here = process.platform === 'win32' ? execFileSync('cmd', ['/c', 'cd'], { encoding: 'utf8' }).trim() : process.cwd();
const docker = (image, a, opts = {}) => spawnSync('docker', ['run', '--rm', ...(opts.tty ? ['-it'] : []), '-v', `${here}:/src`, '-v', `${plans}:/plans`, '-w', `/src/${stack.dir}`, ...credentials.flatMap((k) => ['-e', k]), image, ...a], { encoding: 'utf8', stdio: opts.tty ? 'inherit' : 'pipe', env: { ...process.env, MSYS_NO_PATHCONV: '1' }, maxBuffer: 256 << 20 });
const local = (cmd, a) => spawnSync(cmd, a, { cwd: stack.dir, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 << 20 });
const tail = (r) => String((r.stdout ?? '') + (r.stderr ?? '')).trim().split('\n').slice(-20).join('\n');

if (applying) await apply(); else plan();

function plan() {
  let changes;
  if (stack.tool === 'tofu' || stack.tool === 'terraform') {
    const bin = IMAGES[stack.tool];
    const init = docker(bin, ['init', '-input=false', '-no-color']);
    if (init.status !== 0) stop(`${stack.dir}: init failed (are the state backend's credentials set?)\n${tail(init)}`);
    const p = docker(bin, ['plan', '-input=false', '-no-color', `-out=/plans/${slug}.tfplan`]);
    if (p.status !== 0) stop(`${stack.dir}: plan failed\n${tail(p)}`);
    const shown = docker(bin, ['show', '-json', `/plans/${slug}.tfplan`]);
    if (shown.status !== 0) stop(`${stack.dir}: could not read the plan\n${tail(shown)}`);
    changes = fromTofuPlan(shown.stdout);
  } else if (stack.tool === 'pulumi') {
    const p = local('pulumi', ['preview', '--json', '--non-interactive', `--save-plan=${join(plans, `${slug}.pulumi.json`)}`]);
    if (p.status !== 0) stop(`${stack.dir}: pulumi preview failed (is the pulumi command installed and logged in?)\n${tail(p)}`);
    changes = fromPulumiPreview(p.stdout);
  } else {
    const book = files.find((f) => f.startsWith(`${stack.dir}/`) && /\/(playbook|site|main)\.ya?ml$/.test(f));
    const r = local('ansible-playbook', ['--check', '--diff', book.slice(stack.dir.length + 1)]);
    console.log(tail(r).replace(/(password|token|secret)\S*/gi, '$1=***'));
    console.log(r.status === 0 ? `\n${stack.dir}: that is what the playbook would change. Read it against the spec; the owner runs the playbook.` : `${stack.dir}: the check run failed`);
    process.exit(r.status === 0 ? 0 : 1);
  }
  const expectFile = join(stack.dir, 'plan.expect');
  let expect = null;
  try { expect = existsSync(expectFile) ? parseExpect(readFileSync(expectFile, 'utf8')) : null; } catch (e) { stop(e.message); }
  const allowDestroy = args.flatMap((a, i) => (args[i - 1] === '--allow-destroy' ? [a] : []));
  // allowing a destroy is the owner's decision, typed at a terminal: an agent (no terminal) or CI is refused
  if (allowDestroy.length && (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI)) stop(`--allow-destroy is for the owner at a terminal: run "npm run infra-plan -- ${stack.dir} --allow-destroy ${allowDestroy.join(' --allow-destroy ')}" yourself, after a backup.`);
  const protect = config.launch?.protect ? new RegExp(config.launch.protect, 'i') : PROTECTED;
  const naming = { rules: config.naming?.resources ?? [], labels: config.launch?.labels ?? [] };
  const review = reviewPlan(changes, { expect, protect, allowDestroy, naming });
  // what the apply must spell out before anyone types the code: every destroy and replace, and which of them hold data
  const destroys = changes.filter((c) => c.action === 'delete' || c.action === 'replace').map((c) => ({ action: c.action, address: c.address, type: c.type, data: protect.test(c.type) }));
  writeFileSync(metaFile, JSON.stringify({ tool: stack.tool, print: print(), ok: !review.problems.length, changes: changes.length, destroys, allowDestroy, at: new Date().toISOString() }));
  console.log(renderReview(stack.dir, review));
  process.exit(review.problems.length ? 1 : 0);
}

async function apply() {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI) stop('The apply is for the owner at a terminal: run it yourself (npm run infra-apply -- ' + stack.dir + ').');
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null;
  if (!meta) stop(`No saved plan for ${stack.dir}: npm run infra-plan -- ${stack.dir} first.`);
  if (!meta.ok) stop(`The saved plan for ${stack.dir} did not pass its review: fix that and plan again.`);
  if (meta.print !== print()) stop(`Files in ${stack.dir} changed after the plan was made: plan again, so what is applied is what was read.`);
  if (!meta.changes) stop(`${stack.dir}: the plan has no changes, nothing to apply.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // every destroy is named here, and each one that holds data must be typed out in full: a code alone could be typed blind
  const destroys = meta.destroys ?? [];
  console.log(`\n${destroyLines(stack.dir, destroys).join('\n')}`);
  for (const d of destroys.filter((x) => x.data)) {
    if ((await rl.question(`Type the address to confirm destroying it (${d.address}): `)).trim() !== d.address) { rl.close(); stop(`Not confirmed: nothing applied. ${d.address} stays.`); }
  }
  const code = String(randomInt(1000, 9999));
  const typed = (await rl.question(`Apply the reviewed plan for ${stack.dir} (${meta.changes} change${meta.changes === 1 ? '' : 's'}, ${destroys.length} destroyed, made ${meta.at})? Type ${code}: `)).trim();
  rl.close();
  if (typed !== code) stop('The code did not match: nothing applied.');
  const r = stack.tool === 'pulumi'
    ? spawnSync('pulumi', ['up', '--yes', '--non-interactive', `--plan=${join(plans, `${slug}.pulumi.json`)}`], { cwd: stack.dir, stdio: 'inherit', shell: process.platform === 'win32' })
    : docker(IMAGES[stack.tool], ['apply', '-input=false', `/plans/${slug}.tfplan`], { tty: true });
  writeFileSync(metaFile, JSON.stringify({ ...meta, ok: false, applied: new Date().toISOString() })); // a plan is applied once
  console.log(r.status === 0 ? `Applied: ${stack.dir}. Run the smoke check (npm run smoke) and update docs/run/ENVIRONMENTS.md if it changed what runs where.` : `The apply failed part way: plan again to see where ${stack.dir} stands now.`);
  process.exit(r.status === 0 ? 0 : 1);
}
