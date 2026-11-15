# Agents, tools, MCP and agent-to-agent

How an app gives a model tools, takes tools from others, and talks to other agents, and what each step adds to secure and pay
for. The rules of `docs/AI-SECURITY.md` hold for all of it; this page is about the parts that connect. Read by the section.

## Start with the smallest thing that works
| The job | Take | Not yet |
|---|---|---|
| Write, summarise, classify, extract | one model call through the wrapper, with a schema | tools, agents |
| A few steps the code can order (fetch, then ask, then save) | a workflow: the code calls the model at each step | an agent deciding the order |
| An open task where the next step depends on what was found | one agent: a model with a short list of tools, in a loop with a step limit and a budget | several agents |
| Work that splits into many independent parts (read 200 documents, then combine) | a lead agent with worker agents on a cheaper model | a mesh of agents talking freely |
Each step up costs more, is slower, and is harder to test; take it only when the cases show the simpler one cannot do the job.

## Tools the app gives a model
- Each tool is a function in code with a schema (strict: the arguments must match it), a one-line description that says what
  it does and does not do, and the **least rights**: read-only unless it must write, for the signed-in user only, and it checks
  those rights itself, never trusting the model's word for who the user is.
- **A person's click before anything that writes, sends, pays or deletes**: the model proposes, the screen shows exactly what
  will happen, the person confirms. The confirmation is checked in code, not asked of the model.
- **Tool results are untrusted text**: a web page, an email or a file a tool returns can carry instructions; they go back to
  the model marked as data, like any untrusted input.
- A loop has a step limit, a time limit and a budget (the wrapper's), and every tool call is logged with who and what, not
  the personal content.

## MCP: tools over a standard connection
The Model Context Protocol (MCP, an open standard started by Anthropic and now run under the Linux Foundation) lets a model use
tools and data from a server through one kind of connection: local over stdio, remote over HTTP with OAuth.
**Using MCP servers in the app**
- Only servers on a written allowlist (the config, with why), from their publisher, at a pinned version; a remote server is an
  outbound host in `security.egress` and an account in `docs/ACCESS.md`.
- **Tool poisoning and changed tools**: a server's tool descriptions are instructions the model reads. Read them before adding a
  server, and treat a change in them (a "rug pull") like a change in code: the pinned version and a review.
- The narrowest OAuth scopes, a token per user where the server acts for a user, never a token passed through from the user to
  another service (the "confused deputy"); the same click rule for anything that writes.
- Local servers run in a container or a sandbox with no access to the app's secrets or data folders.
**Offering an MCP server** (so customers' agents can use the app)
- It is an API like any other (`docs/API.md`): the same sign-in, scopes, rate limits, logs and hostile-input tests; the official
  SDK of the language (`@modelcontextprotocol/sdk` for TypeScript); remote over HTTP with OAuth 2.1, never a shared key.
- Tools mirror real API actions with the same rights checks; descriptions say plainly what each does; no tool that returns
  another user's data or runs arbitrary queries.
- Its docs sit with the API docs, for the people who may use it.

## Agent to agent (A2A)
The Agent2Agent protocol (A2A, started by Google, now under the Linux Foundation) lets agents of different makers hand work to
each other: each agent publishes an Agent Card (what it can do, how to reach it, how to sign in) and they exchange tasks over
HTTP. Use it when the app must work with another organisation's agent; inside one app, plain function calls or a queue are
simpler. The rules are those of an API between companies: signed-in calls, the least scopes, every answer from the other agent
treated as untrusted input, a budget and a time limit per task, and a log of what was asked and answered (not the content).

## Tools for the coding agent itself
MCP servers also help the agent that builds the app (Claude Code, OpenCode). Useful ones, read-only by default:
| Server | Gives the agent | Mind |
|---|---|---|
| GitHub | issues, pull requests, checks, beyond what `gh` and the board script already do | a token with the least scopes; the kit's scripts stay the way to change the board |
| Playwright | a real browser to look at the running app | the dev server only, never production with real accounts |
| Documentation (Context7, the vendor's own docs servers) | current library docs instead of what the model remembers | fewer wrong guesses about an API that changed |
| Error tracker (Sentry and others) | the real error and its stack for a bug card | errors may hold personal data: read only what the card needs |
| A database, read-only | the schema and query plans on a copy | never the production database, never write access |
The project's `.mcp.json` names them without secrets (keys come from the environment), each is a row in `docs/ACCESS.md`, and
the never-read rules of `CLAUDE.md` still hold: no `.env`, no data folders, no health data to any model provider.
