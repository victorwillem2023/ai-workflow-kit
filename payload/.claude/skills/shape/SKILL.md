---
name: shape
description: Ask whether a {{PROJECT}} idea is worth building before any plan ("/shape 14", "/shape a coach for runners"): the problem, what people do today, the first ten users, the smallest useful version, how we will know it worked and when to stop; writes the answers on the card and proposes its value label and whether it belongs in the first version. For a new product, /setup runs it first.
model: opus
---

# /shape <card number>  or  /shape <an idea in a sentence>

Ten minutes of questions that can save weeks of building the wrong thing. Write no code and no spec. Ask in the owner's
words, one batch of questions at a time (AskUserQuestion, with your best guess as the first option); skip what is already
answered on the card or in `docs/PRODUCT.md`.

0. **Fit the questions to the project** (`project.audience` in `workflow.config.json`). For `me` (personal, learning, a hobby):
   ask only the smallest useful version and the sign it works for the owner; never argue that it already exists or will not
   sell: wanting it is the reason. For `team` or `customers`: all of them. Either way, "something like it exists" is a fact to
   say once, with what it means (copy what works, or differ on purpose), never a verdict, and never repeated.
1. **Read** the card (`npm run board -- --show <n>`) and `docs/PRODUCT.md` (the product's own answers to these questions).
2. **Ask** what is not yet answered:
   - **The problem**: what goes wrong for whom, today, in one sentence; how often; what it costs them (time, money, risk).
   - **Today instead**: what those people do now (a spreadsheet, another app, nothing). If they do nothing, is it a real problem?
   - **The first ten users**: who, by name or by place where they gather; how you will reach them; would they use it this month?
   - **The smallest useful version**: the one thing it must do for those ten to use it; what is left for later.
   - **How we will know it worked**: one sign you can see within weeks (people come back weekly, ten plans made, a sentence
     someone says), and when you will look.
   - **When to stop**: what would make you drop it or change course (nobody uses it after a month, the data cannot be had).
   For a feature inside a working product, the same questions in small: whose problem, what they do now, the smallest
   version, the sign it worked, and the stop rule.
3. **Say what you think**, plainly: is it worth building now, later or not, and why, in three lines. Name the riskiest
   assumption and whether a spike (`/spike`) should test it first. The owner decides.
   **Could AI make it better?** One line, only when a use in `docs/workflow/AI-AGENTS.md` (*Where AI could make the app better*)
   fits the smallest version or a later one, and the project's rules let the data it needs go to a model (they come first;
   say so when they rule it out): what the person would get, in plain words, and that it is a choice for later or for `/spec`,
   never the reason to build. Nothing fits: say nothing.
4. **Write it down**, on the owner's yes:
   - A card: a comment that starts with **Pitch** (`/spec` looks for it before a large card) with the answers (`npm run board` has no edit; use `gh issue comment <n> --repo <board.repo> --body-file <file>`),
     and the labels: one `value: ...` (the owner's, from the answers), one `effort: ...` you estimate from the smallest version
     and the code it touches (`npm run map -- --find <word>`), and `first version` when it belongs in the smallest useful version
     (`npm run board -- --rate <n> value <word>` and `--rate <n> effort <word>` replace any old one; `gh issue edit <n> --repo
     <board.repo> --add-label "first version"`).
   - A new product (from `/setup`): the answers become `docs/PRODUCT.md`, and the smallest version becomes the first cards,
     each with its `Depends on: #n` line where it needs another first (the rules before the screen that shows them, the store
     and sign-in before anything is saved), then `npm run board -- --graph` shown to the owner: the order of work is that tree.
   - Shaping a card: say what it needs first and write it (`npm run board -- --depends <n> <m>`).
5. **Report** in two lines: the verdict and the labels set. Next step: `/spike <n>` for the riskiest assumption, or `/work <n>`.
