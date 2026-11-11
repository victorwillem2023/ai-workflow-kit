// Which IP addresses are not on the public internet (this computer, the local network, link-local, shared
// address space, multicast, and the IPv6 forms that carry an IPv4 address). Pure, so the browser build can
// use it too; the DNS lookup that feeds it is in src/server/hostguard.ts.

const v4 = (s: string): number[] | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
};

function privateV4(p: number[]): boolean {
  const [a, b, c] = p as [number, number, number, number];
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 0)
    || (a === 198 && (b === 18 || b === 19));
}

/** An IPv6 address as eight 16-bit groups (an IPv4 tail counts as two), or null when it isn't one. */
function groups(s: string): number[] | null {
  let t = s.toLowerCase();
  const z = t.indexOf('%');
  if (z >= 0) t = t.slice(0, z);
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t);
  if (tail) {
    const q = v4(tail[1]!);
    if (!q) return null;
    t = t.slice(0, tail.index) + ((q[0]! << 8) | q[1]!).toString(16) + ':' + ((q[2]! << 8) | q[3]!).toString(16);
  }
  const halves = t.split('::');
  if (halves.length > 2) return null;
  const part = (x: string) => (x === '' ? [] : x.split(':'));
  const head = part(halves[0]!), rest = halves.length === 2 ? part(halves[1]!) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array<string>(fill).fill('0'), ...rest];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

const embedded = (hi: number, lo: number): number[] => [hi >> 8, hi & 255, lo >> 8, lo & 255];

/** Whether an address given as text (IPv4 or IPv6, brackets allowed) is not a public one. Text that isn't an address gives false. */
export function isPrivateAddress(ip: string): boolean {
  const s = ip.trim().replace(/^\[|\]$/g, '');
  const a = v4(s);
  if (a) return privateV4(a);
  const g = groups(s);
  if (!g) return false;
  if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return true; // :: and ::1
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return privateV4(embedded(g[6]!, g[7]!)); // ::ffff:a.b.c.d and ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return privateV4(embedded(g[6]!, g[7]!)); // NAT64
  if (g[0] === 0x2002) return privateV4(embedded(g[1]!, g[2]!)); // 6to4
  return (g[0]! & 0xfe00) === 0xfc00 || (g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xffc0) === 0xfec0 || (g[0]! & 0xff00) === 0xff00 || (g[0] === 0x2001 && g[1] === 0xdb8);
}
