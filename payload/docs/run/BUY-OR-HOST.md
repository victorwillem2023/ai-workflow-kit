# Buy or host: a paid service or running it yourself

For each part the product needs from outside (maps, routing, email, search, sign-in, AI, analytics, error tracking), whether
to pay a provider or run the open-source equivalent yourself, decided with numbers: what each costs at today's use and at
10 times, how many hours it takes you, and what can go wrong. `/advise buy or host <part>` runs the panel; this is its method.
Read by the section.

## The method
1. **Today's use, and in a year**: requests, users, data, from the analytics or the provider's dashboard. A guess is marked as one.
2. **The paid option, from its price page** (`CLAUDE.md`, *Docs before memory*): the free tier, the price per unit, the
   plan you would need at 10 times; what is in the terms (caching allowed? data stored where? attribution required?).
3. **The hosted option, priced fully**: the server (from the provider's price page), storage and backups, the data it needs
   (a map extract, a model), the hours to set it up and to keep it running (updates, data refreshes, watching it), at your
   hourly rate from `docs/company/COSTS.md`. Hours are the cost people forget; an open-source server is free to download, not to run.
4. **Compare by script**: write the options as JSON and run `npm run costs -- --compare <file>`: each at 1, 12 and 36 months,
   and the use at which the other option starts to win.
5. **The rest of the decision**: what happens when it is down (theirs: you wait; yours: you fix it at night), lock-in (how hard
   is it to switch later), data rules (does personal data leave the EU, `docs/workflow/SENSITIVE.md`), and whether running it teaches
   you something you need.
6. **Decide per part, and set a trigger**: "paid until 200,000 requests a month, then self-host" goes in the decision record
   with the date to look again. Mixed is normal: pay for what is hard to run well, host what is cheap to run and costly to rent.

## Usual answers for a small product
| Part | Paid | Self-hosted | Usually start with |
|---|---|---|---|
| Map tiles | Mapbox, MapTiler, Stadia Maps, Google Maps | Protomaps (one PMTiles file on object storage, no server), OpenMapTiles with a tile server | a paid free tier; Protomaps when the region is fixed: a few euros of storage |
| Routing and directions | Mapbox, Google Routes, GraphHopper's API, openrouteservice | GraphHopper, Valhalla, OSRM, BRouter (bike and hiking profiles) on OpenStreetMap data | paid at low use; self-host when the profiles matter (hiking, cycling) or use grows: a server with enough memory for the region, plus refreshing the data |
| Geocoding (address to place) | Mapbox, Google, Geoapify, OpenCage | Nominatim, Photon, Pelias | paid; self-hosting a whole country's geocoder takes a big server |
| Elevation | Mapbox terrain, Google Elevation, Open-Elevation services | your own lookup from open DEM data (Copernicus) | self-host: a static file and a small function |
| Transactional email | Postmark, Brevo, Mailgun, Amazon SES | your own mail server | **always paid**: delivery to inboxes is the hard part |
| Sign-in | Auth0, Clerk, WorkOS | Keycloak, Authentik, Zitadel, or your framework's own sessions | the framework's own for one app; a hosted one when you need SSO for business customers |
| Search | Algolia, Typesense Cloud, Meilisearch Cloud | Meilisearch, Typesense, Postgres full text | Postgres; then the self-hosted one in a container |
| AI models | the provider's API (`docs/workflow/AI-SECURITY.md`) | Ollama or vLLM on a GPU server | the API: a GPU server costs hundreds a month before the first request |
| Analytics, errors, uptime | Plausible, Sentry, Better Stack | Umami, GlitchTip, Uptime Kuma | `docs/market/GROWTH.md` and `docs/run/MONITORING.md` |
| Payments | Stripe, Paddle, Lemon Squeezy | never | always paid |

## Before self-hosting, check
- the licence of the software (AGPL for a service you change and offer to others means you must share those changes) and of
  the data (OpenStreetMap: attribution required, share-alike for a changed database);
- the size of the data and the machine it needs (a routing graph for Europe needs far more memory than one country);
- who updates it, how often the data is refreshed, and how you know it is still right (a test route with a known result);
- that it gets the same care as the app: backups, monitoring, the restore drill, the weekly SecOps report.

## The record
`docs/decisions/<date>-<part>-buy-or-host.md`: the options with the script's table, the choice, the trigger to revisit, and the
line in `docs/company/COSTS.md` it adds. A pilot first when the hosted option is unproven: a `/spike` with a cost cap.
