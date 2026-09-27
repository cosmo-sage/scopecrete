# Scope builder and costing engine — report, 2026-09-27

PR A of the plan "v34 on desktop and mobile". Coy's first priority: a Scope
builder he can use to start testing the calculation engine.

## What was built

| piece | where |
|---|---|
| Costing engine: quantities, price, floor | `src/lib/engine/index.ts` |
| 18 engine tests | `tests/engine.test.mjs`, run with `npm test` |
| Section API | `/api/jobs/[id]/sections`, `/api/jobs/[id]/sections/[sectionId]` |
| Cost settings API | `GET/PUT /api/settings/cost` |
| Monthly overhead API | `POST /api/settings/overhead`, `PATCH/DELETE /api/settings/overhead/[id]` |
| Crew days on a job | `PATCH /api/jobs/[id]` now takes `duration_days` |
| Builder screen | `/dashboard/scope/[jobId]`, same page on phone and desktop |
| New scope | "+ New scope" on the Scope list: pick a thread, or "nobody yet" |
| Cost settings editor | bottom of Cash, laid out like the desktop design's Money screen (1g) |

Every route uses the signed-in session with the org taken from it. No
service-role key is used. No migrations were applied.

## The engine follows DECISIONS §3/§4, not v34

v34's `computeJob` does three things DECISIONS rules out:

- it prices labor by crew-hours
- it uses one markup for everything
- it adds overhead as a percentage of labor

The new engine instead:

- prices labor by the square foot
- marks up each cost type separately
- adds sales tax on materials only
- applies a discount to the price only
- computes the floor as (hard cost + the job's share of the nut) ÷ (1 − off-the-top)

**Each test can fail, and I checked.** I broke the engine three times on
purpose, and each time the matching test failed:

- dividing the floor turned into multiplying
- labor was marked up at the materials rate
- a missing depth was treated as 4 inches

**Nothing is assumed.** A missing dimension stays missing. A missing setting
blocks the price, and the screen names it under "No price on this scope".

## Things I found in the database

1. **`job_sections.cubic_yards` makes up a depth.** It is a generated column,
   `… * COALESCE(depth_in, 4)`. I tested a 30×40 section with no depth in a
   transaction and rolled it back; it came back as 14.815 cu yd. The app never
   reads that column; the engine computes yards instead. Fixing the column
   needs a migration, and that is your call.
2. **`org_cost_settings` has the Gulfline rates as column defaults.** If a
   save sent only the fields you typed, the database would fill in the rest
   with those rates. So a save writes every field, with blank fields as null.
   I tested this the same way (rolled back): the concrete price stayed null
   when left blank.
3. **`job_sections` defaults to 4 in depth and 3000 psi.** Creating a section
   writes both as null unless you gave them.

## Checks

| check | result |
|---|---|
| `tsc --noEmit -p tsconfig.json` | clean |
| `next build` | passes |
| eslint on the touched files | clean |
| `npm test` | 18/18 |
| Your session: section insert, settings upsert | pass (rolled back) |
| A stranger inserts a section into your job | refused, 42501 |
| A stranger reads your jobs, settings or overhead | sees 0 rows |

I also took screenshots at 390 px and 1440 px. I served the screens from a
temporary route with sample data and deleted the route before committing.

With the Gulfline reference rates, $3,500/month overhead and 3 crew days, two
sections (a 30×40 slab and a 10×12 apron, both 4 in) come out as:

- **Area:** 1,320 sq ft
- **Concrete to order:** 16.85 cu yd (including 3.4% waste)
- **Cost:** $6,938
- **Price:** $9,170, a 24.3% margin
- **Floor:** $8,975, which is (6,938 + 1,050) ÷ 0.89

I also worked each of these out by hand to check them.

## What you check in the browser

1. **Cash → Cost settings.**
   - Enter the rates: off the top, crew-days per month, tax and "applies to",
     and pay-yourself mode. Save.
   - Add at least one overhead item.
   - **Pass:** "N of 15 recorded" goes up, and the right-hand panel shows the
     price and floor as Ready.
2. **Scope → + New scope.** Pick a thread, add two sections and give them
   dimensions.
   - **Pass:** area and yards match your own arithmetic. A section with no
     thickness shows "not set — never assumed", and there is no price until
     it's set.
3. **Set crew days on the builder.**
   - **Pass:** the Bid floor shows a figure. Tapping it shows how it was
     worked out. The red line sits on the discount slider.

## Not in this PR

- The desktop shell (top bar and left rail), and Threads as three panes.
  That is PR B.
- Customers. That is PR C.
- Reinforcement, base and vapor barrier. There are no rates for them in the
  schema, so the builder lists them under "not in this price".
- Day-rate equipment.
- `/api/estimate`, which the public calculator uses, still has made-up rates
  in its code. Swapping it to this engine is next, once settings exist.
