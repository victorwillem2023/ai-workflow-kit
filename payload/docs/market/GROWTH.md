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

## Paid ads and AdSense
Paying to be found (Google Ads) and earning from ads on your own pages (AdSense) are in the kit's library: when the owner asks
about ads, `npm run library -- --show ads` reads the guide, and `--add ads` brings it into the project (`docs/market/ADS.md`).

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
