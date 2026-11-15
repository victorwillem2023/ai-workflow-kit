// The launch check's pure parts (no I/O here): what a landing page needs before people are sent to it (found by search,
// shared with a good preview, readable, legal) and the trackers that need consent before they load in the EU.

// scripts that set cookies or send personal data to an ads or analytics company: in the EU they wait for consent
export const TRACKERS = [
  ['Google Analytics or Google Ads (gtag)', /googletagmanager\.com\/gtag|google-analytics\.com|gtag\(\s*['"]config/],
  ['Google Tag Manager', /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/],
  ['Google AdSense', /pagead2\.googlesyndication\.com|adsbygoogle/],
  ['Google Ads remarketing (DoubleClick)', /doubleclick\.net|googleadservices\.com/],
  ['the Meta pixel', /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init/],
  ['the LinkedIn Insight tag', /snap\.licdn\.com|_linkedin_partner_id/],
  ['the TikTok pixel', /analytics\.tiktok\.com/],
  ['Hotjar', /static\.hotjar\.com|hotjar\.com\/c\/hotjar/],
  ['Microsoft Clarity', /clarity\.ms\/tag/],
];
// a consent manager, or Google's Consent Mode defaults, on the page
const CONSENT = /cookiebot|onetrust|didomi|usercentrics|iubenda|klaro|tarteaucitron|consentmanager|cookieyes|axeptio|gtag\(\s*['"]consent['"]\s*,\s*['"]default/i;

// an attribute's value, quoted or not (HTML allows name=viewport)
const attr = (tag, name) => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag)?.slice(2).find((v) => v != null) ?? null;
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => m[0]);
const meta = (html, key) => tags(html, 'meta').find((t) => (attr(t, 'name') ?? attr(t, 'property'))?.toLowerCase() === key);
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** What is wrong with one page: { problems, warnings }. A problem should be fixed before launch; a warning is a judgement. */
export function pageProblems(html) {
  const problems = [], warnings = [];
  const title = text(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  if (!title) problems.push('no <title>: search results and browser tabs show the address instead');
  else if (title.length < 10 || title.length > 60) warnings.push(`the title is ${title.length} characters ("${title}"); 10 to 60 show in full in search results`);
  const desc = attr(meta(html, 'description') ?? '', 'content');
  if (!desc) problems.push('no <meta name="description">: search engines make one up from the page');
  else if (desc.length < 50 || desc.length > 160) warnings.push(`the description is ${desc.length} characters; 50 to 160 show in full`);
  if (!/<html\b[^>]*\blang\s*=/i.test(html)) problems.push('no lang on <html>: screen readers and search engines guess the language');
  if (!meta(html, 'viewport')) problems.push('no <meta name="viewport">: on a phone the page shows tiny, zoomed out');
  if (!tags(html, 'link').some((t) => attr(t, 'rel')?.toLowerCase() === 'canonical')) warnings.push('no canonical link: say which address is the real one (<link rel="canonical" href="...">)');
  for (const key of ['og:title', 'og:description', 'og:image']) if (!meta(html, key)) problems.push(`no ${key}: a shared link shows ${key === 'og:image' ? 'no picture' : 'a guess'} (Open Graph)`);
  const h1 = (html.match(/<h1\b/gi) ?? []).length;
  if (h1 !== 1) problems.push(h1 ? `${h1} <h1> headings: one main heading says what the page is` : 'no <h1>: the main heading says what the page is');
  const noAlt = tags(html, 'img').filter((t) => !/\salt(\s*=|[\s>/])/i.test(t)).length;
  if (noAlt) problems.push(`${noAlt} image${noAlt === 1 ? '' : 's'} without alt text (alt="" for a decoration)`);
  if (!tags(html, 'a').some((t) => /privacy|privacybeleid|datenschutz|confidentialite|privacidad/i.test(attr(t, 'href') ?? ''))) problems.push('no link to the privacy notice (the footer of every page)');
  const found = TRACKERS.filter(([, re]) => re.test(html)).map(([name]) => name);
  if (found.length && !CONSENT.test(html)) problems.push(`${found.join(', ')} on the page with no consent manager: in the EU they may only load after the visitor agrees (docs/GROWTH.md)`);
  else if (found.length) warnings.push(`${found.join(', ')} found, with a consent manager: check they really wait for consent, and that no page with sensitive data has them`);
  return { problems, warnings };
}

/** robots.txt: present, not shutting everything out on the live site, and naming the sitemap. */
export function robotsProblems(robots) {
  if (robots == null) return { problems: ['no robots.txt'], warnings: [] };
  const problems = [], warnings = [];
  const groups = String(robots).split(/\n(?=\s*user-agent)/i);
  if (groups.some((g) => /user-agent:\s*\*/i.test(g) && /^\s*disallow:\s*\/\s*$/im.test(g))) problems.push('robots.txt shuts every search engine out (Disallow: /): right for staging, wrong for the live site');
  if (!/^\s*sitemap:/im.test(robots)) warnings.push('robots.txt does not name the sitemap (Sitemap: https://.../sitemap.xml)');
  return { problems, warnings };
}

/** The sitemap's addresses, or null when it is not a sitemap. */
export function sitemapUrls(xml) {
  if (xml == null || !/<(urlset|sitemapindex)\b/i.test(xml)) return null;
  return [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
}
