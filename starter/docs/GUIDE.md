# {{PROJECT}} guide

Everything the app does, for the people who use it, in one file per part. The [README](../README.md) has the short version.
`/setup` writes the first parts; a feature that changes what a user can do updates its part in the same commit.

## The parts

| Part | What is in it |
|---|---|
| [Getting started](guide/getting-started.md) | installing or opening it, the first thing to try, the settings |

To change the guide, edit the part that covers the feature (search `docs/guide/` with grep); keep this index to one line per
part. A part that grows past about 15 KB is split by topic, each new file a row here, so a session opens only the one it needs.
