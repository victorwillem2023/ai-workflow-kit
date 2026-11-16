# Agent to agent (A2A)

> **Not yet tried in a real project.** This guide was written before the kit's rule that a part comes from a real project's need
> (README). Read it as a starting point, not as tested advice: check each step against the tool's own docs, and when a project
> first uses it, the kit's version is reworked from what that project found (or removed).

From the kit's library (`npm run library -- --add a2a` brought it here): when agents of different makers hand work to each
other. The rules of `workflow/guides/AI-SECURITY.md` hold for all of it; tools and MCP are in `workflow/guides/AI-AGENTS.md`.

The Agent2Agent protocol (A2A, started by Google, now under the Linux Foundation) lets agents of different makers hand work to
each other: each agent publishes an Agent Card (what it can do, how to reach it, how to sign in) and they exchange tasks over
HTTP. Use it when the app must work with another organisation's agent; inside one app, plain function calls or a queue are
simpler. The rules are those of an API between companies: signed-in calls, the least scopes, every answer from the other agent
treated as untrusted input, a budget and a time limit per task, and a log of what was asked and answered (not the content).
