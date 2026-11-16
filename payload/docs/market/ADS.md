# Paid ads and AdSense

> **Not yet tried in a real project.** This guide was written before the kit's rule that a part comes from a real project's need
> (README). Read it as a starting point, not as tested advice: check each step against the tool's own docs, and when a project
> first uses it, the kit's version is reworked from what that project found (or removed).

From the kit's library (`npm run library -- --add ads` brought it here): paying to be found (Google Ads) and earning from ads on
your own pages (AdSense). `/market` reads it when the owner asks about ads; the rest of bringing the product to market is in
`docs/market/GROWTH.md`. Read by the section.

## Google Ads: paying to be found
| Campaign | What | Start with it when |
|---|---|---|
| **Search** | text ads on Google's results for the words people type | **the first paid test**: people searching "half marathon plan app" already want it |
| Performance Max | Google places ads everywhere (search, YouTube, Display, Gmail, Maps) and decides | conversions are tracked and there are 30+ a month; it needs data to learn and gives less control |
| Demand Gen, YouTube | image and video ads in feeds | the message is proven and you have good images or video |
| Display | banners on other sites | rarely for a small product: cheap clicks, few customers |

**A first Search campaign, step by step:**
1. **Conversion tracking first**: the Google tag on the sign-up's "thank you" step (or the server sends the conversion), with
   **Consent Mode v2** and a consent banner: in the EEA, Google requires consent signals for ads measurement and personalisation.
   Enhanced conversions only with consent and hashed data.
2. **Keywords**: 10 to 20 phrases in two or three tight groups, each with its own ad and the page that answers it; phrase and
   exact match first; **negative keywords** from day one ("free", "jobs", "pdf", whatever brings the wrong people).
3. **Ads**: responsive search ads with the positioning's words; several headlines; the same promise as the page.
4. **Budget and bids**: a daily budget you can lose for a month while learning (for example €10 to €30 a day, about €300 to
   €900 a month), "maximise clicks" or manual bids at first, "maximise conversions" or target cost per sign-up once there are
   about 30 conversions a month. Location: only the countries you serve; language: the page's.
5. **Read it weekly**: the search terms report (add negatives), cost per sign-up, which ad and page convert. Stop a keyword
   whose cost per sign-up stays above what a user is worth.
6. **The number that decides**: what a user costs to win (ad cost / paying users) against what they bring (price x months
   they stay). Below one third: grow it. Above: fix the page, the price or the audience before spending more.

**Health and other sensitive products**: Google's healthcare and personalised-ads policies forbid targeting people by health
conditions and limit remarketing; ads must not imply they know the viewer's health. Some health products need certification.
Read the policy for your category before the first ad; keep tracking tags off every page that shows health data.

## AdSense: earning from ads on your own pages
AdSense is the other side: Google shows ads on your site and pays you per view or click.
- **It fits** a content site with a lot of free traffic (guides, tools, calculators), where ads pay for the hosting.
- **It does not fit** a paid app, a sign-up page, or any page with personal or health data: ads slow the page, distract from
  the one action, and personalised ads on sensitive pages are a legal risk.
- **Rules**: original content and enough traffic to be approved; in the EEA and UK a Google-certified consent manager using
  the IAB TCF framework; an `ads.txt` file on the domain.
- **Money**: typically a few euros per thousand page views, often less; for most small products a single paying user is
  worth more than months of ads.
- **Instead**: one sponsor per guide or newsletter, affiliate links to tools you really recommend (marked as such), or
  privacy-friendly ad networks for developer audiences (EthicalAds, Carbon Ads).
