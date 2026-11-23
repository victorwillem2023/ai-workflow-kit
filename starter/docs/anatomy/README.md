# Flow pages

One page per flow, named after it (`docs/anatomy/<flow>.md`), listed in `docs/ARCHITECTURE.md`, *Flows and their jobs*. A page
says how the flow is built: the jobs it does in order and where each one lives, so a card can name the job it changes and a
second home for a job shows. The shape:

    # <The flow, in the user's words>

    - Starts at: <the route, command or screen>.
    - Looked at: <YYYY-MM-DD>.
    - End state: <one sentence: how it should be built>.

    | Job, in order | Its home | Its home in the end state | Marks |
    |---|---|---|---|
    | <1. the job, in a few words> | <file, function> | <the same, or where it moves> | <none, or: two homes, a flag in a shared step, no clear home, the name says another job> |

    Cards: <the move plan's cards in order, #n each, or "none">

A home is a file and a function, never a list of files. A job several flows do once lives in one home, named on each page.
