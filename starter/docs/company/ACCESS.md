# {{PROJECT}}: who has access

Who and what can reach the project, the server, the data and the accounts it depends on, and why. Least access by default: a
person or a key gets only what their job needs, for as long as they need it. `npm run access` checks the GitHub rows against
GitHub itself and lists the rest to check by hand; the weekly security report says when the review is due (every 90 days).

Last review: not yet

## Who has access
One row per person, key or service account, in every place (GitHub, the cloud console, the server, the database, the domain
registrar, the email and sign-in providers, the payment provider, monitoring). For GitHub, Where is "GitHub" (people, by their
login), "GitHub deploy key" or "GitHub secret".

| Who | Where | Role | Why |
|---|---|---|---|
| @{{OWNER}} | GitHub | admin | the owner |

## Rules
- **Two-step sign-in everywhere** (GitHub, the cloud, the registrar, email, the payment provider); a hardware key or an app, not SMS.
- **No shared accounts.** Each person has their own; a machine has its own key or service account with only the rights it uses.
- **Keys expire.** Tokens get an end date (90 days or less); deploy keys are read-only unless they must write.
- **A break-glass account** for the cloud and the registrar: its recovery codes printed and kept offline, used only when the
  owner's account is locked out, and its every use written below.
- **Production data**: only the app and the owner; nobody reads personal data to debug (use logs with ids, or a copy with the
  personal data taken out).
- **Someone leaves**: the same day, take their access away everywhere on this list, change the secrets they could read, and
  write the date below.

## Reviews and changes
| Date | What changed | By |
|---|---|---|
