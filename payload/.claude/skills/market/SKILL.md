---
name: market
description: Bring {{PROJECT}} to market ("/market", "/market ads", "/market launch", or in plain words: "get users", "how do people find it?", "start selling", "pricing"): positioning, pricing, the landing page and its launch check, analytics that count the funnel, search, the channels and paid ads (Google Ads, and whether AdSense fits), and the launch checklist; writes the answers in docs/market/MARKET.md and turns the work into cards. Never spends money, never opens ad accounts, never publishes. Run from the main folder.
model: opus
disable-model-invocation: true
---

# /market [positioning | pricing | page | convert | ads | launch | review]

The kit's guide is `docs/market/GROWTH.md` (read by the section); the project's answers live in `docs/market/MARKET.md`. With no part named,
start where `docs/market/MARKET.md` is still empty, in `docs/market/GROWTH.md`'s order. One part per message; stop for the owner after each.

0. **Only when it is wanted.** For `project.audience` other than `customers`, say in one line that marketing is optional for
   this project and stop unless the owner goes on (an internal tool may still want a short "how to start" page: offer that).
   **Start the market stage** when `docs/market/` is not there yet: `node workflow/tools/stage.mjs --enter market` brings the
   guide and the project's market page. Say so in one line.
1. **What we know.** Read `docs/PRODUCT.md` (the problem, the first users, how we will know it worked) and `docs/market/MARKET.md`.
   An empty `docs/PRODUCT.md`: run `/shape` first; marketing a product without a problem written down is guessing.
2. **positioning**: draft the five answers (`docs/market/GROWTH.md`, *Positioning*) from `docs/PRODUCT.md` and what the owner says,
   with two or three headline options and the button's words. Ask where the answers are thin (who the real alternative is,
   in users' words). Write the chosen ones in `docs/market/MARKET.md`.
3. **pricing**: the model and the price, from the value and the alternatives; look up the payment providers' fees that day;
   say what it means per month at 10, 100 and 1,000 users, with the running costs (servers, AI calls) taken off.
4. **page**: the landing page's text from the positioning (headline, three benefits, how it works, questions, the footer
   links). Building it is a card (`/idea`, type `ui` when the ui module is installed, so `/ui` draws it first). When it is up:
   `npm run launch-check -- <address>` and explain each line; problems become part of that card.
5. **The funnel**: which analytics tool (`docs/market/GROWTH.md`, *Analytics*; cookieless unless the owner chooses otherwise, and never
   on pages with sensitive data), which steps are counted, and the goals; the table in `docs/market/MARKET.md`. Setting it up is a card.
6. **convert**: from the funnel table, the step where most people drop (ask the owner for the numbers if the table is empty).
   For that step, three to five ideas from `docs/market/GROWTH.md`, *Converting*, fitted to this product (a feature, an onboarding
   change, a page change, an email), each with the step it should move, a guess of how much, the effort, and how it will be
   measured. Look at the product itself for the ideas (the first screens a new user sees: `npm run map -- --find` the sign-up and
   first-use parts; with the ui module, the screenshots). On a yes each becomes a card (`/idea`, labelled with its value);
   no dark patterns, ever.
7. **ads** (only once the page converts at a known rate): the channel that fits the users; for Google Ads Search the keyword
   groups, negatives, two ads per group, the daily budget, the stop rule and conversion tracking with Consent Mode
   (`docs/market/ADS.md`, *Google Ads*: from the kit's library, `npm run library -- --show ads` to read it, `--add ads` on the owner's
   yes). AdSense only for a content site with free traffic, never on the app or sensitive pages.
   Check the platform's policy for the product's category (health has its own) and say what it forbids. The owner creates the
   account, enters the card and presses start; you never hold the spending rights.
8. **launch**: the checklist from `docs/market/GROWTH.md` against the real state, each box with its proof (a command's output, a
   link, a date) or a card for what is missing; the launch day, places, posts and emails drafted for the owner to send.
9. **review** (monthly, or `/market review`): the owner pastes or exports the numbers (analytics, ads, sign-ups, payments);
   fill the funnel table, the cost to win a user against what one brings, and per channel keep, change or stop, with the
   reason. One line per lesson in *What we learned*. Every change becomes a card.

Every claim in a text that goes out is checked by the owner: what the product really does, prices, and anything about health
(EU health-claims rules; an app that diagnoses or treats can be a medical device). No personal data of real users in drafts,
prompts or reports: counts only. No commit from this skill: `docs/market/MARKET.md` goes in with the next card's commit.

**This project's own**: when `.claude/project/market.md` exists, read it before you start: it holds this project's own steps and rules for /market, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
