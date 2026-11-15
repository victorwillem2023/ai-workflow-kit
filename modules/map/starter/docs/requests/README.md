# Request pages

One file per kind of request, named after the kind (the name in backticks in the index, `docs/REQUESTS.md`). The shape:

    # <The kind>

    - Triggered by: <the words or the input that make it this kind>.
    - Fills in when vague: <what the app assumes>.

    | Someone asks | The app does | Status | Proof |
    |---|---|---|---|
    | <a case> | <what happens> | open | #<card> |

After changing a page: `node docs/flow/build-requests.mjs`.
