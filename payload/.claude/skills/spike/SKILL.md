---
name: spike
description: Try an unproven {{PROJECT}} idea cheaply before building it ("/spike 14", "/spike can we read Garmin files"): a throwaway prototype in a session folder with a time limit and no spec, tests or gate, ending in a decision note (build it as a card, or drop it). The code is never merged. Run from the main folder.
model: sonnet
---

# /spike <card number>  or  /spike <question>

A spike answers one question fast ("can we read a FIT file in the browser?", "does the plan feel right on a phone?"). It is
not the feature: its code is thrown away, so it skips the spec, tests first and the gate. What it taught is kept.

## 1. The question and the limit

Read the card (`npm run board -- --show <n>`) or take the question. Say back, in two lines:
- the one question the spike answers, and what counts as "yes" (something the owner can see, or a number);
- the time limit (by default this one chat, about an hour of work).

On the owner's yes, go on. No card yet: make one with `npm run board -- --add "Spike: <question>" --label spike --label "<area>"`.

## 2. A session of its own

`node workflow/scripts/session.mjs spike-<topic> --card <n>`: the topic must start with `spike-`.
- Work only in `../{{PREFIX}}-spike-<topic>/spikes/<topic>/`; nothing in `src/` changes.
- Hard-code, skip the edge cases, use fake data.
- Still: no real secrets in it, no personal or health data, and nothing sent to an outside service the owner has not named.

## 3. Show it

How to run it (a URL, a command), what it shows, and the answer to the question in plain words. Stop for the owner to try it.
Feedback rounds stay inside the limit; when the limit runs out, stop and write the note anyway.

## 4. The decision note

`docs/decisions/spike-<topic>.md`, in the **main** folder, short:
- `# <question>`, `Date`, `Card #<n>`;
- `## What we tried`;
- `## What we learned`: numbers where there are any, and what surprised;
- `## Decision`: build it, change the idea, or drop it, and why;
- `## If we build it`: what the real card must cover, the risks, and the libraries it showed are fit, with their licence.

## 5. After the owner's yes on the decision

- **Build it**: make or update the real card with what the spike proved (`npm run board -- --add ... --body-file`, or a
  comment). It then goes the normal way: `/work <n>`, spec, tests first.
- **Drop it, or the idea changed**: say so on the card, and close or reword it.
- Then `node workflow/scripts/session.mjs --drop spike-<topic>`: the code goes (it refuses without the note). Commit only the
  note, in the main folder, when the owner says to commit ("Decisions: <question>").

Never move spike code into `src/` by copying: the real card rebuilds it with tests. The gate fails when `spikes/` reaches main.

**This project's own**: when `.claude/project/spike.md` exists, read it before you start: it holds this project's own steps and rules for /spike, each saying where it goes ("after step 3", "instead of step 5", "always"). Follow it there. It never replaces the owner's yes or "done", the gate, or a sign-off; where it seems to, ask the owner. The kit's updates never write that file (`.claude/project/README.md`).
