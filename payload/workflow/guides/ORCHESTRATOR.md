# Working in an orchestrator (Orca)

**Not yet tried in a real project.** The kit's own part (`--adopt`, `--release`, a session in any folder) is tested; what it
asks of Orca's command line is written from Orca's own guide for agents and tested against a stand-in, not against Orca.

An orchestrator is an app that runs several coding agents side by side, each in its own git worktree and terminal, with one
window (and a phone app) to see what each is doing. The kit's session folders were that, by hand, in an editor. With an
orchestrator the folders, the terminals and the agents in them are its work, and the kit keeps what none of them does.

The kit knows **Orca** (https://orca.dev, MIT, Windows, macOS and Linux; checked November 2026) because it runs the **Claude
CLI itself** in a real terminal: every flag, mode and experimental feature of the CLI works as when you type `claude` yourself.

## Who does what

| | Before | With Orca |
|---|---|---|
| The session's folder | `../<prefix>-<topic>`, made by `session.mjs` | Orca's own workspace folder, made by Orca when `session.mjs` asks, or by you in Orca |
| Seeing every session | `session.mjs --list`, editor windows | Orca's sidebar: each session with its card, port and state (in progress, in review); the phone app |
| A new chat for the build | you open one and type `/build <topic>` | `--start "/build <topic>"`: Orca opens the terminal in the session's folder with the Claude CLI |
| Trying a screen | a link to open in your browser | `--serve` opens it in the session's own browser tab in Orca (`--phone`: as a phone, `"serve": { "device": "<name>" }`) |
| Saying what is wrong on a screen | a numbered list you type | click the element in that tab (*Annotate*): its HTML, styles and a picture go to the session's chat; add a few words |
| Looking at the change | the editor's diff | Orca's diff view; notes on its lines go back to the agent as one batch, and count as a feedback round |
| The card | a number in `--list` | a link on the session in the sidebar, to the issue |
| The port, the packages, the `.env`, the spec | `session.mjs` | `session.mjs --adopt` (Orca's setup script runs it: `orca.yaml`) |
| The card on the board | `session.mjs` | the same, and Orca's sidebar follows it |
| The gate, the stop points, one commit on "done", `--push` | the kit | the kit, unchanged: `--finish <topic>` works wherever the folder is |
| Taking a finished session away | `--finish`, `--clean` | the same (Orca forgets a worktree git no longer has); a delete in Orca runs `--release` first |

## Setting it up, once per project

1. Install Orca and, from its settings, its command line (`orca status` in a terminal answers).
2. In the main folder: `node workflow/scripts/session.mjs --connect orca`. It writes `"orchestrator": "orca"` under `session`
   in `workflow/config.json`, adds the project to Orca, shows the sessions that exist there (worktrees Orca did not make are
   hidden until then) and tells Orca each one's card and port.
3. Commit `orca.yaml` and the config (`node workflow/scripts/session.mjs --commit-notes "Workflow: sessions in Orca"`). Orca reads
   the setup script from the new worktree's own `orca.yaml`, so it has to be on main. The first time, Orca asks whether it may
   run the project's scripts: yes.
4. In Orca, open a terminal in the main folder and type `claude`. That is the chat for `/next`, `/idea`, `/work <n>`, `/tidy`.

`"agent"` under `session` is the command a started terminal runs, `claude` by default. Put the flags every build chat should
start with there (`"agent": "claude --model opus"`); it is typed as written.

## A day with it

- **From the board** (as before): `/work <n>` in the main folder's chat plans and stops for your yes. Then the build's new chat
  is opened for you: `session.mjs <topic> --card <n> --start "/build <topic>"` makes the session in Orca and starts the Claude
  CLI in it with `/build <topic>`. You switch to it in the sidebar; when it says "try it", the session shows as *in review*.
- **From Orca**: make a worktree there (from a GitHub issue, if you like), start `claude` in it and type `/work <n>`. The setup
  script made it a session already; the chat runs `--adopt --card <n>` so the card moves. Its topic is the branch's name.
- **Feedback**: a typed list still works. A clicked element or a batch of diff notes is a round too: the agent numbers the
  items back and answers each (`.claude/skills/build/try-it.md`). Say what should change with each click; an element alone
  is asked about, not guessed at.
- **Several at once**: one session per card, each started with `--start`; `npm run board -- --room` still says when it is too
  many. What may run side by side is unchanged (`.claude/skills/work/together.md`).
- **Done**: you say done in the session's chat, `/ship` runs, `--finish <topic>` puts one commit on the local main and takes
  the folder away. `--push` sends it, when you say so.

Orca that is closed, or its command line missing, is one warning line: the session's folder is then made next to the main
folder as before, and Orca shows it the next time it runs.

## What the kit does not hand over

- **The stop points.** Orca can commit, push and open pull requests from its own buttons. Those go around "you say done":
  leave them alone, or the feature is not one checked commit. The agent's own commands still go through the kit's hooks.
- **Orca's own orchestration** (a coordinator agent that starts workers) is experimental in Orca and has no stop for a plan's
  yes. The kit starts one chat per approved spec instead.
- **Ports.** Orca gives a worktree no port; the kit's `.env` does.

## A project that has open sessions

Nothing has to be finished first. After step 2 above the open session folders are in Orca's sidebar where they are, with
their cards; their uncommitted work is untouched, and `--finish`, `--serve` and `--catch-up` work on them as before. New
sessions go to Orca's own folder. Leftover `<prefix>-*` folders git does not know are named by `--clean`, as before.

## Another orchestrator

Any tool that makes git worktrees and can run a command in a new one works with the kit's part alone: `node
workflow/scripts/session.mjs --adopt` as its setup command, `--release` before it deletes a folder. What to look for: it must
run the agent's own command line in a terminal, on your system. Checked November 2026: T3 Code runs Claude through the Agent
SDK in its own chat window, not the CLI, so it is left out; Conductor and Paradev (once Superset) have no Windows version.
