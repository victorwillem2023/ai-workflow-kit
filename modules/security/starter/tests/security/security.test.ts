// The security building blocks: which addresses are private, the DNS check, the safe fetch (redirects, size cap), and the input guards.
// The names say what is refused; `npm run gate` looks for "refuses", "rejects", "caps", "too large", "hostile" in new test names.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress } from '../../src/core/netguard';
import { safeHref, parseJsonCapped, atMost, cleanText } from '../../src/core/guards';
import { dnsGuard, safeFetch, RefusedError } from '../../src/server/safefetch';
import { debugHandleOn } from '../../src/web/debug';

const lookup = (table: Record<string, string[]>) => async (host: string) => (table[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
const reply = (status: number, body: string | Uint8Array = '', headers: Record<string, string> = {}) => new Response(body as BodyInit, { status, headers });

describe('which addresses are private', () => {
  it('refuses loopback, private, link-local, shared, mapped and unspecified addresses, and lets public ones through', () => {
    for (const ip of ['127.0.0.1', '10.1.1.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '[::1]']) assert.equal(isPrivateAddress(ip), true, ip);
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.equal(isPrivateAddress(ip), false, ip);
  });
});

describe('the DNS check', () => {
  it('refuses a name that points at a private address, also when only one of its addresses does', async () => {
    const guard = dnsGuard(lookup({ 'evil.example': ['127.0.0.1'], 'mixed.example': ['93.184.216.34', '10.0.0.5'], 'ok.example': ['93.184.216.34'] }));
    await assert.rejects(guard(new URL('http://evil.example/a')), RefusedError);
    await assert.rejects(guard(new URL('http://mixed.example/a')), RefusedError);
    await guard(new URL('https://ok.example/a'));
  });
  it('refuses a name nobody can find, an address given as a number, and a scheme that is not http(s)', async () => {
    const guard = dnsGuard(lookup({}));
    await assert.rejects(guard(new URL('http://nowhere.example/')), RefusedError);
    await assert.rejects(guard(new URL('http://169.254.169.254/latest/meta-data')), RefusedError);
    await assert.rejects(guard(new URL('http://[::ffff:7f00:1]/')), RefusedError);
    await assert.rejects(guard(new URL('file:///etc/passwd')), RefusedError);
  });
});

describe('the safe fetch', () => {
  const guard = dnsGuard(lookup({ 'ok.example': ['93.184.216.34'], 'evil.example': ['10.0.0.1'] }));
  it('fetches a public page', async () => {
    const r = await safeFetch('https://ok.example/a', { guard, fetchImpl: async () => reply(200, 'hello') });
    assert.equal(r.status, 200);
    assert.equal(new TextDecoder().decode(r.body), 'hello');
  });
  it('refuses a redirect that leads to a private address, the check runs again at every hop', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (u: string) => { seen.push(u); return u.includes('ok.example') ? reply(302, '', { location: 'http://evil.example/secret' }) : reply(200, 'secret'); }) as unknown as typeof fetch;
    await assert.rejects(safeFetch('https://ok.example/a', { guard, fetchImpl }), RefusedError);
    assert.deepEqual(seen, ['https://ok.example/a'], 'the private target is never requested');
  });
  it('refuses a chain of redirects longer than the limit', async () => {
    const fetchImpl = (async () => reply(302, '', { location: 'https://ok.example/again' })) as unknown as typeof fetch;
    await assert.rejects(safeFetch('https://ok.example/a', { guard, fetchImpl, maxRedirects: 3 }), /too many redirects/);
  });
  it('refuses an answer that is too large, by its announced size and by what actually arrives', async () => {
    await assert.rejects(safeFetch('https://ok.example/a', { guard, maxBytes: 10, fetchImpl: async () => reply(200, 'x', { 'content-length': '999' }) }), /too big/);
    const stream = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(8)); } });
    await assert.rejects(safeFetch('https://ok.example/a', { guard, maxBytes: 20, fetchImpl: async () => new Response(stream, { status: 200 }) }), /too big/);
  });
  it('refuses an address that is not a web address', async () => {
    await assert.rejects(safeFetch('not a url', { guard }), RefusedError);
    await assert.rejects(safeFetch('javascript:alert(1)', { guard }), RefusedError);
  });
});

describe('the input guards', () => {
  it('refuses a link that is not http or https, and a link that is too long', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>', 'file:///etc/passwd', '//evil.example', '/relative', '', 42, null, 'https://x.example/' + 'a'.repeat(3000)]) assert.equal(safeHref(bad), null, String(bad).slice(0, 30));
    assert.equal(safeHref(' https://example.org/a '), 'https://example.org/a');
  });
  it('rejects JSON that is larger than the cap before parsing it, and returns null for text that is not JSON', () => {
    assert.throws(() => parseJsonCapped('[' + '1,'.repeat(1000) + '1]', 100), RangeError);
    assert.equal(parseJsonCapped('{oops', 100), null);
    assert.deepEqual(parseJsonCapped('{"a":1}', 100), { a: 1 });
  });
  it('caps a list at its limit without walking the rest', () => {
    let walked = 0;
    function* endless() { for (;;) { walked++; yield walked; } }
    assert.deepEqual(atMost(endless(), 3), [1, 2, 3]);
    assert.ok(walked <= 4);
  });
  it('cleans hostile text: control characters out, cut to the limit, non-text gives an empty string', () => {
    assert.equal(cleanText('a\u0000b\nc\u007fd', 50), 'a b c d');
    assert.equal(cleanText('x'.repeat(500), 10).length, 10);
    assert.equal(cleanText({ toString: () => 'x' }), '');
  });
});

describe('the debug handle', () => {
  it('is there on this computer and is not on a shared link or a look-alike host', () => {
    for (const h of ['localhost', '127.0.0.1', '[::1]', 'dev.localhost']) assert.equal(debugHandleOn(h, null), true, h);
    for (const h of ['abc.trycloudflare.com', '192.168.1.20', '127.0.0.1.evil.example', 'localhost.evil.example']) assert.equal(debugHandleOn(h, null), false, h);
  });
  it('is switched on for one browser by "1" in localStorage and by nothing else', () => {
    assert.equal(debugHandleOn('abc.trycloudflare.com', '1'), true);
    for (const v of [null, '', '0', 'true', ' 1']) assert.equal(debugHandleOn('abc.trycloudflare.com', v), false, String(v));
  });
});
