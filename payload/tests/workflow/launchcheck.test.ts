// The launch check (lib/launchcheck.mjs): what a landing page needs before people are sent to it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pageProblems, robotsProblems, sitemapUrls } from '../../tools/workflow/lib/launchcheck.mjs';

const good = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Training Coach: a plan that fits your week</title>
<meta name="description" content="An adaptive half marathon plan that changes with the week you actually had, three or four runs a week.">
<link rel="canonical" href="https://coach.example/">
<meta property="og:title" content="Training Coach"><meta property="og:description" content="A plan that fits your week">
<meta property="og:image" content="https://coach.example/share.png">
</head><body><h1>Stop guessing whether to run today</h1><img src="a.png" alt="the week view"><img src="b.svg" alt="">
<footer><a href="/privacy">Privacy</a></footer></body></html>`;

describe('the launch check', () => {
  it('passes a page that has what search, sharing and the law need', () => {
    assert.deepEqual(pageProblems(good), { problems: [], warnings: [] });
  });
  it('reads attributes without quotes too, as HTML allows', () => {
    const bare = good.replace('name="viewport"', 'name=viewport').replace('rel="canonical"', 'rel=canonical').replace('href="/privacy"', 'href=/privacy').replace('alt=""', 'alt');
    assert.deepEqual(pageProblems(bare), { problems: [], warnings: [] });
  });
  it('names each thing a bare page misses', () => {
    const { problems } = pageProblems('<html><body><h1>a</h1><h1>b</h1><img src="x.png"></body></html>');
    for (const want of [/no <title>/, /no <meta name="description">/, /no lang/, /viewport/, /no og:title/, /no og:image/, /2 <h1>/, /1 image without alt/, /privacy notice/]) {
      assert.ok(problems.some((p) => want.test(p)), `missing: ${want}`);
    }
  });
  it('fails trackers without a consent manager, and only warns when one is there', () => {
    const ads = good.replace('</head>', '<script async src="https://www.googletagmanager.com/gtag/js?id=AW-1"></script><script>fbq("init","1")</script></head>');
    assert.match(pageProblems(ads).problems[0], /Google Analytics or Google Ads \(gtag\), the Meta pixel on the page with no consent manager/);
    const withConsent = ads.replace('</head>', "<script>gtag('consent', 'default', { ad_storage: 'denied' })</script></head>");
    assert.deepEqual(pageProblems(withConsent).problems, []);
    assert.match(pageProblems(withConsent).warnings[0], /check they really wait for consent/);
  });
  it('reads robots.txt and the sitemap', () => {
    assert.match(robotsProblems('User-agent: *\nDisallow: /\n').problems[0], /shuts every search engine out/);
    assert.deepEqual(robotsProblems('User-agent: *\nDisallow: /admin\nSitemap: https://coach.example/sitemap.xml\n'), { problems: [], warnings: [] });
    assert.deepEqual(robotsProblems(null).problems, ['no robots.txt']);
    assert.deepEqual(sitemapUrls('<urlset><url><loc>https://coach.example/</loc></url></urlset>'), ['https://coach.example/']);
    assert.equal(sitemapUrls('<html>404</html>'), null);
  });
});
