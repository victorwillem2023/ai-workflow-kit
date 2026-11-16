# Sign-in and permissions: who you are, and what you may do

Two separate questions. **Sign-in** answers "who is this?". **Permissions** answer "may this person do this, to this thing?".
Most serious holes in small apps are in the second: the app knows who you are and still hands you someone else's data.
`/setup` reads this page when it proposes the stack, `/spec` for any card with a route or stored data, `/review` for the diff.
This code is sensitive (`docs/workflow/SENSITIVE.md`, *What counts*: access), so it is listed under `sensitive.paths` and the
owner signs it off. Read by the section.

## Sign-in: take it, do not write it
Password storage, sessions, resets and the sign-in screens are solved problems with many ways to get them wrong. The app
uses something maintained by people who do only this, in this order of preference:
| Kind | When | Mind |
|---|---|---|
| The sign-in the platform or framework brings, or a well-kept library for the stack | most apps: the users live in the app's own database | it is a security dependency: updates the same week |
| A hosted sign-in service | sign-in with a company's own accounts (SSO), many sign-in methods, no wish to hold passwords at all | a cost per user, the users' data at another company (a row in `docs/company/PRIVACY.md`), an outside host (`security.egress`) |
| A sign-in server the project runs itself | several apps share one sign-in, or the data may not leave | one more thing to run, update and back up |

Which one is the owner's decision at `/setup` or in a card, looked up on that day in the official docs (CLAUDE.md, *Docs
before memory*): this field moves, and a library that was the usual choice a year ago may be unmaintained now. It gets its
line in `docs/STACK.md`. **Never written by hand**: hashing a password, making a session token, checking a signature.

## Sign-in: the rules, whatever provides it
| Rule | Why |
|---|---|
| Passwords are stored only as a slow, salted hash made for passwords (argon2id, or bcrypt or scrypt), by the library | a leaked table then gives no passwords |
| A minimum length, a check against known leaked passwords, no rules about symbols, no forced changes | length is what makes a password strong |
| A way in without a password where it fits: a passkey, a link by email, or another account (Google, Microsoft) | nothing to leak or forget |
| The same answer and the same time for "no such account" and "wrong password" | the form must not say who has an account |
| Tries are limited per account and per address, with a growing wait | guessing takes too long to be worth it |
| A reset link is one use, short lived, stored as a hash, and ends every other session when used | a stolen mailbox or an old link gets nothing |
| A second step (a passkey or an app code) for admins from day one, offered to everyone | one stolen password is not the whole system |
| The session is a random id in a cookie that is `HttpOnly`, `Secure` and `SameSite=Lax`; the session itself lives on the server | a script on the page cannot read it, and it can be ended |
| A new session id at sign-in; sign-out and a password change end sessions on the server | a session fixed or stolen before stops working |
| Sessions end after a time without use, and after a longest time | a forgotten browser is not a door for ever |
| Writes from a browser are protected against requests made by another site (CSRF) | the cookie is sent whoever made the request |
| Tokens that cannot be taken back (a signed token with a long life) are not used for a browser's session | signing out must work |

## Permissions: the rules
1. **Every request is checked on the server**, for the person the session names. What the screen shows or hides is for
   comfort, never a check.
2. **Checked per thing, not per page**: "may this user read *this* order", not "is this user signed in". Being signed in
   says nothing about whose order it is.
3. **Nothing is allowed until a rule allows it.** A new route with no rule refuses everyone.
4. **One function decides**, in the core: who, what action, which thing, in; yes or no out. Pure, so it is tested with a
   table of cases (the security module brings an example to make your own: permissions.ts in the core, with its table
   test). Routes and queries call it; none of them has a rule of its own. It has its row in
   `docs/ARCHITECTURE.md`, *Rules and where each lives*.
5. **The check is next to the data.** The function that fetches a thing takes the user or tenant it acts for and filters on
   it (`docs/workflow/DATA.md`), so a route that forgets the check gets nothing, never everything.
6. **Who the request is for comes from the session, never from the request.** A user id, tenant id, role or price in the
   body, the address or a header is input from a stranger.
7. **Someone else's thing does not exist**: the answer is "not found", the same as for an id that was never used. "Not
   allowed" tells the asker that it is there.
8. **Ids that cannot be guessed are no check.** They slow a guesser down; rule 2 is still needed.
9. **Few roles, named for what people do** (owner, member, support), written with what each may do in the table below. A
   new role is the owner's decision.
10. **Acting for someone else** (support looking at a customer's account) is its own permission, shown on the screen while
    it lasts, and written to the audit log.
11. **What changes who may do what is logged**: a role given or taken, a sign-in method added, an export, an account
    deleted: who, what, when, for whom (never the data itself).

The project's own table, filled at `/setup` and kept with the code (in `docs/SECURITY.md`):
| Role | May | May never |
|---|---|---|
| <role> | <the actions, in plain words> | <what stays the owner's> |

## Several customers in one app
- Every row that belongs to a customer carries the customer's id, and every query filters on it (rule 5).
- What must be unique is unique **per customer** (the constraint names both columns), so one customer cannot learn what
  another has by trying names.
- Files, caches, search indexes and background jobs are split the same way as the tables: the customer's id is part of the
  key or the path. A cache keyed only by the address serves one customer's page to the next.
- A second net where the database has one: Postgres row-level security, set per request, so a query that forgets the
  filter returns nothing.
- Staff who can see across customers use a separate, logged way in, never a flag on a normal account.

## Tests
- The deciding function: one table test with every role against every action, the "may never" rows too.
- **Every route**: refuses a signed-out caller; refuses another user's id (and another customer's) with "not found"; refuses
  a role that may not. `docs/workflow/TESTING.md`, *What every change needs*; the shape, runnable, in the security module's
  tests/security/routes.example.ts.
- Sign-in, where the app owns the screens: a wrong password and an unknown account give the same answer; the tries run out;
  a reset link works once.
- A test that passes only because a check was loosened is a finding, never a fix.

## What the gate checks
- With `security.signIn` true in `workflow.config.json`: a change that adds a route and no test named for who is refused
  ("signed out", "another user") gets an `advice:` line.
- A change to the sign-in or permission code (under `sensitive.paths`) needs the owner's sign-off.
- Not checked: that every route really calls the deciding function. That is `/review`'s first question.

## For the agent
- A failing permission test is never fixed by widening the rule, adding a role or skipping the check "in development".
  A stand-in sign-in for development is the owner's choice, said as one, and cannot be switched on in production.
- A new route's spec says who may call it and what each other caller gets (`docs/workflow/API.md`, *Who may call it*).
- No secret, session id, token or password in a log, an error, a test file or a chat.
