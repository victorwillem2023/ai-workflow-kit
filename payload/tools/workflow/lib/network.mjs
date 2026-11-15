// Traffic rules as code (no I/O here).
// Egress: every outside host the code calls is on the allowlist `security.egress` in workflow.config.json (exact hosts, or
// "*.example.com" for its subdomains), so a new outbound call is a decision the owner sees, and the same list becomes the
// firewall's outbound rules and the network policy. Found by scanning the code for https:// addresses in strings.
// IP rules: `security.ipRules`, [{ "cidr": "203.0.113.0/24", "action": "allow" | "block", "for": "admin", "why": "...",
// "until": "2027-01-31" }]: who may reach the admin pages or the SFTP server, and who is blocked. Each has a reason and an end
// date, so a list never only grows; the weekly report raises one past its date.

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|[a-z0-9-]+\.(test|example|invalid|localhost)|example\.(com|org|net))$/i;
// addresses that appear in code without being called: schemas, namespaces, licences
const NOT_CALLED = /^(www\.w3\.org|json-schema\.org|schemas\.[a-z.]+|opensource\.org|spdx\.org)$/i;

/** The outside hosts named in https:// (or http://) strings of the code: Map host -> [file:line]. */
export function outboundHosts(files) {
  const out = new Map();
  for (const [file, text] of files) {
    String(text).split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|#)/.test(line)) return;
      for (const m of line.matchAll(/["'`]https?:\/\/([a-z0-9.-]+\.[a-z]{2,}|localhost|\[::1\]|\d+\.\d+\.\d+\.\d+)(?=[:/"'`?$]|$)/gi)) {
        const host = m[1].toLowerCase();
        if (LOCAL.test(host) || NOT_CALLED.test(host)) continue;
        if (!out.has(host)) out.set(host, []);
        out.get(host).push(`${file}:${i + 1}`);
      }
    });
  }
  return out;
}

/** Whether `host` is on the allowlist (exact, or "*.domain" for any subdomain of it). */
export const allowed = (host, list = []) => list.some((a) => a === host || (a.startsWith('*.') && (host === a.slice(2) || host.endsWith(a.slice(1)))));

/** The hosts the code calls that are not on the allowlist: [line]. */
export function unlistedEgress(files, list = []) {
  return [...outboundHosts(files)].filter(([h]) => !allowed(h, list))
    .map(([h, at]) => `${at[0]}${at.length > 1 ? ` (and ${at.length - 1} more)` : ''} calls ${h}, which security.egress does not list: add it (the owner's decision: what data goes there), or take the call out`);
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/(\d|[12]\d|3[0-2]))?$/;
const IPV6 = /^[0-9a-f:]+(\/(\d|[1-9]\d|1[01]\d|12[0-8]))?$/i;

/** Problems in the IP rules: [{ severity, what, where }] (a bad address, no reason, no end date, past its date, all of the internet allowed). */
export function ipRuleProblems(rules = [], now = new Date()) {
  const out = [];
  for (const r of rules ?? []) {
    const where = `security.ipRules ${r.cidr ?? '?'}`;
    const v4 = IPV4.exec(String(r.cidr ?? ''));
    if (!(v4 ? v4.slice(1, 5).every((x) => Number(x) <= 255) : IPV6.test(String(r.cidr ?? '')) && String(r.cidr).includes(':'))) { out.push({ severity: 'high', what: `"${r.cidr}" is not an IP address or range`, where }); continue; }
    if (r.action === 'allow' && /^(0\.0\.0\.0\/0|::\/0)$/.test(r.cidr)) out.push({ severity: 'high', what: `allows all of the internet${r.for ? ` to ${r.for}` : ''}: an allowlist that lets everyone in is no allowlist`, where });
    if (!r.why) out.push({ severity: 'medium', what: 'has no reason ("why")', where });
    if (!r.until) out.push({ severity: 'medium', what: 'has no end date ("until"): every entry is reviewed and ends', where });
    else if (new Date(`${r.until}T23:59:59Z`) < now) out.push({ severity: r.action === 'allow' ? 'high' : 'medium', what: `ended on ${r.until}: take it out or renew it with a reason`, where });
  }
  return out;
}
