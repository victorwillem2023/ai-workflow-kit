# Stages: how a product grows, and what each stage needs

A product grows in stages; each needs different things, and doing the next stage's work too early costs as much as doing it too
late. This is the map; the project's own plan, with dates and the signs that it is time, is `docs/ROADMAP.md`, which
`/advise roadmap` keeps current. Read by the section.

| Stage | The question | Product | Tech | People and money | Signs it is time for the next |
|---|---|---|---|---|---|
| **0. Idea** | is the problem real? | `/shape`, a `/spike` for the riskiest part | none, or a throwaway prototype | your evenings | ten people say "I want that" and mean it |
| **1. First users (10)** | do they come back? | the smallest useful version, by hand where you can | one server or your computer, the gate, backups | €0 to €20 a month | most of the ten use it every week |
| **2. Early (100)** | will strangers use it? | onboarding, the feedback form, the top requests | `/launch`: staging and production, monitoring, the restore drill | a few hundred a year; free or a first price | people you never met sign up and stay |
| **3. Paying (1,000)** | will they pay, and keep paying? | pricing, the upgrade path, the conversion work (`docs/GROWTH.md`) | managed database, two servers if downtime costs, the load test | a company form, terms, VAT, support hours (`docs/LIFECYCLE.md`, *A small company*) | income covers the costs and some of your time |
| **4. Growing (10,000)** | can it grow without you doing everything? | a team's roadmap, the board's milestones | the platform repository, services where they pay off (`docs/SCALING.md`), on-call | a first hire or freelancer, access reviews, a second reviewer | the work no longer fits one person |
| **5. A company** | can it run and grow without any one person? | product areas with owners | per-team services, SLOs, the architecture board for every hard decision | teams, a budget per area, audits customers ask for | — |

## Rules for moving between stages
- **One stage ahead, not three**: build what this stage needs and leave room for the next (`docs/SCALING.md`, *Leave room on
  day one*); never the infrastructure of stage 5 at stage 1.
- **The signs decide, not the calendar**: each stage in `docs/ROADMAP.md` names its sign, and the monthly `/retro` and
  `/market review` look at it.
- **Each step has a cost**: `/estimate` gives the work, the money a month and what else changes before a stage starts.
- **Personal projects** (`project.audience: me`) can stay at stage 1 forever: that is a success, not a failure.
