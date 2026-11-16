# Request pages

One file per kind of request, named after the kind (the name in backticks in the index, `docs/REQUESTS.md`). The shape:

    # <The kind>

    - Triggered by: <the words or the input that make it this kind>.
    - Fills in when vague: <what the app assumes>.

    | Someone asks | The app does | Status | Proof |
    |---|---|---|---|
    | <a case> | <what happens> | open | #<card> |

After changing a page: `node docs/flow/build-requests.mjs`.

The pages live somewhere else in this project? Say where in `workflow/config.json`: `"map": { "requests": { "index": "<the index
page>", "folder": "<the folder of pages>/" } }`, and put the folder in `docs.include` (`"<folder>/*.md"`) so the doc checks
read it. The map takes its words from the index page: the group's name is its title up to the first comma, the kinds' section
is its `## The kinds ...` heading, and an `On the map: ...` line under a heading is that section's intro on the map.
