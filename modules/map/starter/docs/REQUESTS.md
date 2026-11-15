# What someone asks, and what the app does

One page per kind of request: what someone asks, what the app does, whether that is decided, and what proves it.
This is an index; open only the page of the kind you touch (`docs/requests/`). Rules every feature keeps live in
`docs/ARCHITECTURE.md`, *Rules and where each lives*; what one kind of request does lives here.

The one rule: what the person says beats what the kind assumes. A kind only fills in what was left out.

## The questions
What every request has to answer. `/setup` fills this in.

| Question | Said clearly | Not said, or vague | Cannot be done |
|---|---|---|---|
| 1. <what is asked for> | <what counts as clear> | <what the app assumes> | <what it says, and what it offers> |

## How to read a page
A table: **Someone asks** | **The app does** | **Status** | **Proof**.
- `open`: the owner has not decided; nothing is built on it. "The app does" says "Today: ..." .
- `decided`: the owner decided, not built (or built, with no test found yet).
- `being built`: a session is on it; the proof is the card (`#12`).
- `built`: the proof is the name of a test that exists, with its file.

A row is the owner's to decide: a bug whose kind has a page but no row for the case goes to the owner first.

## The kinds
One line per kind, in this shape; "Page:" once it has one.
1. <A kind of request> (`a-kind`): <how the app recognises it>. No page yet.
