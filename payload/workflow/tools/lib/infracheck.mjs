// Which infrastructure tool each folder under infra/ uses (no I/O here), so the infra check runs the right validation for
// the tool `/launch` chose: OpenTofu, Terraform, Pulumi or Ansible. A folder is one stack (one environment, or one part).

/** The tool of one folder from its file names: 'tofu' | 'terraform' | 'pulumi' | 'ansible' | null. */
export function toolOf(files, preferred) {
  const names = files.map((f) => f.split('/').pop());
  if (names.some((n) => /^Pulumi(\.[\w-]+)?\.ya?ml$/.test(n))) return 'pulumi';
  if (names.some((n) => /\.(tf|tofu)$/.test(n))) return names.some((n) => n.endsWith('.tofu')) || preferred !== 'terraform' ? 'tofu' : 'terraform';
  if (names.some((n) => /^(playbook|site|main)\.ya?ml$/.test(n)) || names.includes('ansible.cfg')) return 'ansible';
  return null;
}

/** The stacks under `root`: [{ dir, tool }], one per folder that holds a tool's files directly. */
export function stacks(paths, root = 'infra', preferred) {
  const byDir = new Map();
  for (const p of paths) {
    if (!p.startsWith(`${root}/`)) continue;
    const dir = p.slice(0, p.lastIndexOf('/'));
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(p);
  }
  const out = [];
  for (const [dir, files] of [...byDir].sort(([a], [b]) => a.localeCompare(b))) {
    const tool = toolOf(files, preferred);
    // a modules/ folder is checked through the stacks that use it, not on its own
    if (tool && !/(^|\/)modules(\/|$)/.test(dir.slice(root.length))) out.push({ dir, tool });
  }
  return out;
}

// Startup scripts: cloud-init files (AWS user data, GCP startup-script, Azure custom data, Hetzner and DigitalOcean user_data).
/** The startup-script files among `paths`, by name: cloud-init*.yaml, user-data*, cloud-config*, startup*.sh (templates too). */
export const startupFiles = (paths) => paths.filter((p) => /(^|\/)(cloud-init|cloud-config|user-data|userdata|startup)[^/]*\.(ya?ml|sh|tftpl|tpl)$/i.test(p)).sort();

/** What is wrong in one startup script: secrets in it (anyone who can read the server's metadata or console reads them), a
 *  cloud-config without its first line, and downloads piped straight into a shell. */
export function startupProblems(file, text) {
  const out = [];
  const lines = String(text).split('\n');
  if (/\.ya?ml$/i.test(file) && !/^#cloud-config\s*$/.test(lines[0] ?? '')) out.push(`${file}: a cloud-config file must start with the line #cloud-config, or cloud-init ignores it`);
  for (const [i, line] of lines.entries()) {
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) out.push(`${file}:${i + 1}: a private key in the startup script`);
    else if (/(password|passwd|secret|token|api[_-]?key)\w*\s*[:=]\s*["']?[^\s"'$<{]{6,}/i.test(line) && !/plain_text_passwd:\s*$|lock_passwd/.test(line)) out.push(`${file}:${i + 1}: a secret written into the startup script`);
    if (/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/.test(line)) out.push(`${file}:${i + 1}: a download piped into a shell (pin a version and check its checksum, or bake it into the image)`);
  }
  return out;
}
