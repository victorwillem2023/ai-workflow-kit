# Growth: bringing the product to market

How people find the product, decide to try it, and pay: positioning, pricing, the landing page, search, analytics, paid ads
(Google Ads, and AdSense for earning from ads), the other channels, the launch, and the rules that keep it legal. `/market`
walks through it and writes the project's answers in `docs/market/MARKET.md`. Prices and policies change: `/market` looks them up on
the day. Read by the section.

## The order
1. **Positioning** before any page or ad: a page with the wrong message gets no better with more traffic.
2. **The landing page and a way to say yes** (sign up, join the waitlist, start a trial), with analytics that count it.
3. **Free channels** that fit the first users in `docs/PRODUCT.md` (communities, search, people you can write to).
4. **Paid ads** only once the page turns visitors into sign-ups at a known rate: then a euro in can be compared with what a
   user is worth.
5. **Measure, keep what works, stop what does not**, every month.

## Positioning
Five answers, in this order, written in `docs/market/MARKET.md`:
| Question | Example (a training app) |
|---|---|
| What would they use if we did not exist (the real alternatives) | a spreadsheet from a forum, a coach at €80 a month, a generic running app |
| What we have that those do not | a plan that adjusts to the week you actually had |
| What that gives them (the value, in their words) | "I stop guessing whether to run today" |
| Who cares most about that value (the best-fit users) | runners training for a first half marathon, 3 to 4 runs a week |
| The category that makes the value obvious | an adaptive training plan, not "a fitness platform" |
The headline of the page, the first line of every ad and the store description come from these answers.

## Pricing
| Model | Fits | Watch out |
|---|---|---|
| Free while it is young | learning what people use | say so; plan the step to paid |
| Free trial (14 or 30 days), then paid | value shows within days | ask for the card at the start or at the end: test it |
| Freemium | many users, a few pay for more | the free part must cost little to run (AI calls do not) |
| One-off purchase | a tool used for a season | no income for updates |
| Subscription, monthly and yearly (yearly about two months free) | ongoing value | churn is the number to watch |
Price from the value and the alternatives (the coach at €80, the spreadsheet at €0), not from the cost. Two or three plans at
most. Payments: Stripe (you handle VAT, with Stripe Tax), or a merchant of record that sells on your behalf and handles EU VAT
(Paddle, Lemon Squeezy). Change prices for new users first; existing users keep theirs for a while.

## The landing page
One page, one promise, one action:
- **Above the fold**: the headline from the positioning, one sentence on how, the button (the same words everywhere),
  a picture of the product in use.
- **Below**: three benefits in the users' words, how it works in three steps, proof (a quote, a number, a logo, once you have
  them), the price or "free while in beta", common questions, the button again.
- **Trust**: who makes it, a contact address, the privacy notice and the terms linked in the footer.
- **Fast and found**: `npm run launch-check -- <address or file>` checks the title, the description, the share preview (Open
  Graph), one main heading, image texts, the language, `robots.txt`, the sitemap, the privacy link, the page weight, and
  trackers that would need consent.
- **Where it lives**: a static page beside the app (Astro, or the app's own framework, `workflow/guides/FRONTEND.md`), or a CMS when
  someone else writes the text. A different domain for the page and the app is fine; the same domain helps search.
- **A waitlist** before the product is open: a form that stores the email in the app's own database or a European email tool,
  with a clear "we will write when it opens, nothing else" and double opt-in. Emails are personal data: never in GitHub issues.
- **Feedback**: the help button's form opens an issue (`.github/ISSUE_TEMPLATE/feedback.yml`), which lands in the board's inbox
  (`npm run board -- --inbox`); every request heard twice becomes a card.

## Search (SEO)
- **Technical**: the launch check above; a sitemap; pages that load fast (`docs/run/PERFORMANCE.md`); one address per page
  (the canonical link); real text in the HTML, not only after JavaScript runs.
- **Search Console** (Google) and **Bing Webmaster Tools**: verify the domain with a DNS record, send the sitemap, read which
  searches show the page and which pages have errors. Free, and the only true source for "what do people type".
- **Content** that answers what the best-fit users search before they know the product: "half marathon plan 3 runs a week",
  "how to adjust a training plan after illness". One good page per question beats ten thin ones. AI may draft; a person who
  knows the subject checks every claim.
- **Patience**: search takes months. It is the cheapest channel in a year, never in a week.

## Analytics: counting without spying
| Tool | Cost | Notes |
|---|---|---|
| Plausible | from about €9 a month; open source to self-host | EU-hosted, no cookies, one script |
| Umami | free self-hosted; a hosted plan | no cookies, simple |
| Matomo | free self-hosted; a hosted plan | full analytics; configure it without cookies |
| Pirsch | a few euros a month | German, no cookies |
| Google Analytics 4 | free | needs consent in the EU before it runs; data goes to Google |
| PostHog | a free tier; EU cloud or self-hosted | product analytics: funnels, retention, flags; cookieless mode exists |

Count the steps of one funnel, not everything: **visit, sign up, the first useful moment** (the first plan made), **back in
week 2, pays**. One look a month; the numbers go in `docs/market/MARKET.md`. Cookieless tools that collect no personal data usually
need no consent banner; check the guidance of your country's data protection authority. **Never** count anything from pages
that show health or other sensitive data, and never send such data to an analytics or ads tool.

## Converting: from visitor to user to paying user
More traffic into a leaking funnel wastes the traffic. Find the step where most people drop (the funnel table in
`docs/market/MARKET.md`), fix that one, measure again. What usually moves each step:

| Step that leaks | What tends to help | How to see it worked |
|---|---|---|
| **Visit to sign-up** | a headline that names the visitor's problem in their words; the product shown working (a short video, a live demo without signing up); the button's words say what they get ("Make my plan"); proof near the button; the price or "free" visible; fewer fields (email only, or sign in with Google or Apple) | sign-up rate per visit, per channel |
| **Sign-up to the first useful moment** (activation) | time to value under two minutes: a starting template or sample data, an empty screen that says the one next step, a short checklist that ticks itself, asking only what the first result needs (the rest later); an email after a day only to those who did not reach it | share of sign-ups who reach the moment within a day, and how long it took |
| **First use to coming back** (retention) | a reason to return built into the product (next week's plan, a reminder they set, a weekly summary email); a habit at a fixed moment; fixing the top complaint from the feedback inbox | share active in week 2 and week 4 |
| **Using to paying** | the upgrade offered at the moment of value (when they hit the free limit doing something they want), not on day one; a trial that ends with a clear summary of what they did; yearly with about two months free; a plain pricing page with a question list; no card for a trial when you can afford it | trial-to-paid and free-to-paid rates; revenue per visitor |
| **Paying to staying** (churn) | a cancel flow that asks why (one question) and offers a pause; a month-end email with what they got; fixing what the cancel reasons say | monthly churn; the reasons, counted |
| **Users bringing users** | a share that shows their result (a plan, a route) with the product's name; "give a month, get a month" once they are happy | invites sent and accepted |

Rules that keep it honest:
- **One change at a time, measured** against the same weeks before. A/B tests only once a step has a few hundred conversions a
  week per variant (GrowthBook or PostHog experiments, both self-hostable); below that, ship the change and compare periods.
- **No dark patterns**: no fake timers, hidden cancel buttons, pre-ticked extras or fake scarcity; they are illegal in the EU
  (unfair commercial practices, the Digital Services Act) and they cost trust you cannot buy back.
- **Product changes are cards**: each conversion idea goes on the board with the step it should move, by how much, and how it
  will be measured; `/market convert` proposes them, the owner ranks them with the rest (`npm run board -- --next`).

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
> **Not yet tried in a real project.** This section was written before the kit's rule that a part comes from a real project's need
> (README). Read it as a starting point, not as tested advice: check each step against the tool's own docs, and when a project
> first uses it, the kit's version is reworked from what that project found (or removed).

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

## Other channels
| Channel | Cost | Good for |
|---|---|---|
| Communities (forums, subreddits, Discord, clubs) where the first users are | your time | the first hundred users; give before you post; follow each place's rules |
| Launch sites: Product Hunt, Hacker News (Show HN), Indie Hackers, BetaList | free | one day of attention and early feedback; prepare the page and answers |
| An email list: listmonk (self-hosted), Buttondown, Brevo (FR), MailerLite (EU) | free to small | telling people when it opens and what changed; double opt-in |
| Partnerships (coaches, clubs, schools, other tools) | a share or a free plan | trust that ads cannot buy |
| Referrals ("give a month, get a month") | the free months | once users like it |
| Meta (Facebook, Instagram) ads | by budget | consumer products with good images; the pixel needs consent, never on sensitive pages |
| LinkedIn ads | expensive per click | business customers by job title |
| Reddit, Microsoft Ads (Bing), TikTok | by budget | Reddit for niches; Bing is often cheaper per click than Google |
| App store search ads | by budget | a mobile app in the stores |

## The launch checklist
- [ ] Positioning written; the page's headline and every ad come from it
- [ ] `npm run launch-check` passes on the real address
- [ ] Privacy notice and terms linked, read once by a lawyer (`workflow/guides/SENSITIVE.md`); consent banner only if something needs it
- [ ] Sign-up works on a phone, in two browsers; the first useful moment is reached without help (a user test, `docs/run/RELEASES.md`)
- [ ] Analytics count the funnel's steps; Search Console and Bing verified, sitemap sent
- [ ] Monitoring and an alert reach the owner (`docs/run/MONITORING.md`); the load test passed at launch-day traffic (`docs/run/PERFORMANCE.md`)
- [ ] Support address answered; the feedback form reaches the inbox
- [ ] The launch posts and emails written, the day chosen (not a Friday, not during a freeze)
- [ ] The first paid test, if any: tracking with consent, the budget, the stop rule

## With AI
AI drafts well and checks badly: let it write positioning options, headlines, ad variants, keyword lists, page drafts and
email texts, and read the analytics and ads reports you export. A person checks every claim before it goes out: a promise the
product does not keep is false advertising, a health claim can fall under the EU rules on health claims, and an app that
diagnoses or treats can be a medical device. Agents never get the ad account's spending rights.
