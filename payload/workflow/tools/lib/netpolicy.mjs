// The network policy as data (no I/O here): what may reach the app, what the app may reach, and the IP rules, made from
// workflow/config.json (`security.ingress`, `security.egress`, `security.ipRules`) into one JSON file every infrastructure
// tool can read (OpenTofu and Terraform as variables, Pulumi as config, Ansible as vars). `npm run map` writes it to
// infra/network.json once there is an infra folder, and the gate fails when it is out of date, so the firewall can never
// disagree with the lists the gate checks the code against.

/** The ingress rules: the config's, or the safe start (HTTPS, and HTTP only to redirect, open to all; the rest closed). */
export function ingressRules(security = {}) {
  if (Array.isArray(security.ingress) && security.ingress.length) return security.ingress;
  return [
    { port: 443, protocol: 'tcp', from: 'internet', why: 'HTTPS to the proxy' },
    { port: 80, protocol: 'tcp', from: 'internet', why: 'redirect to HTTPS only' },
  ];
}

/** The policy file's content: stable order, so a change shows as a small diff. */
export function networkPolicy(config = {}) {
  const s = config.security ?? {};
  const allows = (s.ipRules ?? []).filter((r) => r.action === 'allow');
  const blocks = (s.ipRules ?? []).filter((r) => r.action === 'block');
  const policy = {
    _comment: 'Made by npm run map from workflow/config.json (security.ingress, security.egress, security.ipRules): do not edit. Read it from the infrastructure code.',
    ingress: ingressRules(s).map((r) => ({ port: r.port, protocol: r.protocol ?? 'tcp', from: r.from ?? 'internet', why: r.why ?? '' })),
    egress: [...(Array.isArray(s.egress) ? s.egress : [])].sort(),
    allow: allows.map((r) => ({ cidr: r.cidr, for: r.for ?? 'everything', until: r.until ?? null, why: r.why ?? '' })).sort((a, b) => a.cidr.localeCompare(b.cidr)),
    block: blocks.map((r) => ({ cidr: r.cidr, until: r.until ?? null, why: r.why ?? '' })).sort((a, b) => a.cidr.localeCompare(b.cidr)),
  };
  return `${JSON.stringify(policy, null, 2)}\n`;
}
