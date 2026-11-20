# Sensitive work: money, health, legal texts and personal data

A wrong number in a price, a tax rate, a medical limit, a contract clause or a privacy rule is not a bug like any other: it
can cost customers, fines or a lawsuit. A language model writes such numbers fluently and sometimes wrongly, and it sounds
just as sure either way. So for this work the kit trusts sources, scripts and a person, never the model's memory. Read by the
section.

## What counts
The folders and files listed under `sensitive.paths` in `workflow/config.json`, chosen at `/setup` and grown with the app (a
folder is written with its last slash, `src/server/accounts/`, and covers every file under it; the gate's *signoff* line names
an entry that covers no file, so a mistyped one is seen):
- **Money**: prices, totals, VAT and other taxes, discounts, invoices, refunds, payouts, currency and rounding.
- **Health and safety**: doses, limits, heart-rate zones, load advice, anything a person may act on with their body.
- **Legal texts and rules**: terms, privacy notice, consent, retention periods, age limits, cancellation rights.
- **Personal data**: the tables and code that store, export or delete it, and the privacy record (docs/company/PRIVACY.md, with the production module).
- **Access**: sign-in, roles, who may see whose data.

## The guards, in order
| # | Guard | Who | Where |
|---|---|---|---|
| 1 | Every number, rate, limit and legal sentence has a **source** named in the spec: a law and its article, a contract clause, a dated price list, a file in `docs/sources/` | the owner gives it; the model may only copy it | the spec's *Sources* |
| 2 | A value with no source is an **open question**, never filled in from what the model remembers | the planning model asks | `/spec` |
| 3 | The **tests' expected values** are worked out by a person or copied from the source (a worked example in the law, the accountant's sheet), never computed by the code under test or by the model | the owner | the tests |
| 4 | The rule lives in **one file**, named in *Rules and where each lives* in `docs/ARCHITECTURE.md`; a number is a named constant with its source in a comment | the builder | the code |
| 5 | A **fresh-eyes review** on the strong model reads the spec, the sources and the diff | `/ship`, never skipped here | `/review` |
| 6 | A **person signs off** this exact version: reads every changed line, checks each value against its source, answers the checklist | the owner, `npm run signoff` in their own terminal | `docs/company/SIGNOFFS.md` |
| 7 | The **gate refuses** the change until that sign-off matches the files as they are; any later edit needs a new one | a script | the gate's *signoff* check |
| 8 | In production: an **audit log** of who changed what (money moved, data exported, a role given), and a second person for payouts and data exports once there is a team | the app | docs/PRODUCTION.md (production module), `docs/company/ACCESS.md` |

## Why a script and a person, not the model
- The model cannot sign: `npm run signoff` needs a person typing at a terminal (input from a pipe or an agent is refused, and a
  typed-back code is asked), and the agent's settings deny it the command and the record files.
- **A signature, not a seal**: each row is signed with the signer's private key, which stays on their computer encrypted with a
  passphrase only they know (`npm run signoff -- --init` makes it, once per person). The public keys are committed in
  `docs/company/SIGNERS.md`, so every computer and GitHub's runners check a row the same way. An agent that reads every file
  still cannot sign without the passphrase, and a key it adds to SIGNERS.md counts for nothing: the gate trusts the signers on
  main, and a new one only when an existing signer endorsed it (`npm run signoff -- --add-signer "<name>" <key>`; the key from
  `--show-key` on the new person's computer, or copy your key file to your own second computer). The project's first signer goes
  in on its own commit on main, before the first sign-off (`node workflow/scripts/session.mjs --commit-notes "Sign-offs: the first signer"` from the main folder; it counts at once, no push needed). Trusting the local main is a convenience, not
  the lock: an agent that set out to cheat could put its own key there with git commands the hook does not hold. GitHub checks
  every row against the signers that are pushed, so a pull request or a push is where a sign-off is really held (and the gate says
  when only a signer on the local main signed it). What it does not stop: a person who means to cheat, and it is not meant to.
- The sign-off holds a fingerprint of the files, so it covers exactly what was read. A change after it fails the gate again.
- With pull requests on a paid or public repository, add a `CODEOWNERS` line for the same folders and require the owner's
  review on GitHub too: a second lock on the same door.

## What the kit does not do for you
It does not know the law, the tax office's rates or medical practice, and neither does the model: it checks that someone who
does has looked. Before money changes hands or health advice ships, the sources are checked by the right person (an accountant,
a lawyer, a doctor or a sports scientist), and the docs say who checked and when. The kit's texts are not legal advice.
