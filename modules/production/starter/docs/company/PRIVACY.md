# {{PROJECT}}: personal data

The record of what the app keeps about people, why, and for how long. It is the start of what privacy law (in the EU, the
GDPR) asks for; it is not legal advice. Before anyone outside the team uses the app, have it read by someone who knows the
law where your users live. A change to the tables updates this page in the same commit.

## What is kept
One row per kind of personal data. "Why" is the reason the law accepts: the person asked for it (a contract), they agreed
(consent, which they can take back), the law requires it, or a legitimate interest you can explain.

| Data | Why it is kept | Reason (legal basis) | How long | Where | Who else sees it |
|---|---|---|---|---|---|
| <e.g. email address> | <to sign in> | <contract> | <until the account is deleted> | <the database, EU> | <the sign-in provider> |

Special kinds need more care and usually explicit consent: health, religion, politics, sexual life, biometric data, and data
about children.

## Services that process it for us
Each one: what it gets, where it keeps it, and a data processing agreement (DPA) signed with it.

| Service | What it gets | Where | Agreement |
|---|---|---|---|
| <the host> | <everything in the database> | <country> | <signed on, link> |

## What a person can ask, and how the app answers
- **See everything** kept about them: an export, as one file. <where in the app>
- **Correct** it: <where>
- **Delete** it, and have it gone from backups within <n> days: <where>
- **Take back consent** where consent is the reason: <where>
A request by mail is answered within a month.

## In the code
- The fields of this page that hold personal data are in the logger's `personal` list (`src/server/log.ts`): they never reach
  a log.
- Personal data is never sent to a service not listed above, an AI model included.
- A breach (data seen by someone who should not) is written down at once, and reported to the data protection authority
  within 72 hours when it puts people at risk.

## Decided
- <date>: <what was decided, e.g. data is kept in the EU only>
