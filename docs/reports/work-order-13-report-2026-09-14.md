# Work order 13 report — 2026-09-14

**`jobs` has a writer.** Three routes, the accept flow, and the Scope screen.
Committed on `claude/wo13-jobs-writer` (`7d5b4b5`). Build green, `tsc` 0 errors.

**`job_number` is NULL and stays NULL — you have not confirmed the scheme.**
Details in §4. **The pipeline predicate is quoted verbatim in §3.**

---

## 1. Schema — verified before building on it

The work order says the schema half is applied. It is, exactly as described. I
checked rather than assumed, because building an insert against a column list
from a document is how the last schema draft would have created a second org.

| column | state |
|---|---|
| `origin` | text, **DEFAULT `'manual'`**, CHECK `('machine','manual')` |
| `created_from_message_id` | uuid |
| `confirmed_at` / `confirmed_by` | timestamptz / uuid |
| `status` | text, **DEFAULT `'lead'`**, CHECK over 10 values |
| policies | `jobs_member_select/insert/update/delete`, all `get_user_org_ids()` |
| `idx_jobs_unconfirmed` | present, `(org_id) WHERE origin='machine' AND confirmed_at IS NULL` |
| rows | **0** |

**One correction to §Context: `org_id` is not the only NOT NULL column.** There
are eight — but the other seven all carry defaults:

```
id            gen_random_uuid()      status          'lead'
org_id        (none) ← the real one  created_at      now()
job_type      'residential'          updated_at      now()
schedule_state 'none'                origin          'manual'
```

So the *effect* of the claim holds — an insert with only `org_id` succeeds —
but `job_type` is NOT NULL and would have bitten a client that tried to set it
to null explicitly. Worth knowing, since `job_type` is CHECK-constrained to
`residential / commercial / public` and DECISIONS.md §10 parks public work as a
separate engine.

## 2. What I built

### `POST /api/jobs`

Session-scoped via `getApiSession`. `org_id` comes from the caller's
`org_members` row.

Accepts `contact_id, title, address, city, state, zip, job_number`.
Writes `origin='manual'`, `status='lead'`, `confirmed_at=now()`,
`confirmed_by=<caller>`.

**Forbidden fields are rejected with 400, not ignored:**

```ts
const FORBIDDEN = ["origin", "confirmed_at", "confirmed_by", "org_id", "created_from_message_id"];
```

The work order allows "ignored or 400". I chose 400 deliberately — silently
ignoring `origin:'machine'` would hand the caller back a job it believes is a
machine proposal when it is actually a confirmed manual one. A caller acting on
that difference is worse off than one that got an error. I also added
`created_from_message_id` to the list: it is provenance, and a client that can
forge provenance can make a guess look like it came from a real message.

**Contact ownership is checked before the insert**, and this is not belt-and-
braces — **RLS would not catch it.** `jobs_member_insert` checks the *job's*
`org_id`, which is correct because it comes from the session. A `contact_id`
belonging to another org would insert successfully. So the route looks the
contact up under the caller's own RLS and returns **403 `contact_not_in_org`**
when it is absent.

### `GET /api/jobs`

Caller's org, newest first, `?status=` filter. Contacts are joined in a **second
query, not a PostgREST embed** — `contacts` and `jobs` carry separate policies,
and an embed returns null for rows the caller cannot see, which reads as "job
with no contact" rather than "permission denied".

Never invents a contact name: `contact_name` is null when there is none, and
the phone number is the display identity.

### `PATCH /api/jobs/[id]`

Field edits, status transitions (validated against the ten values in
`jobs_status_check` so a bad one gets a readable 400 instead of a constraint
error), and **accept**.

Accept is `{"accept": true}`. The timestamps are never taken from the body —
`confirmed_at` and `confirmed_by` are in the same FORBIDDEN list. There is no
bulk accept. Accepting fifty jobs with one tap is not a human confirmation, it
is a human dismissing a prompt, and DECISIONS.md §2b is explicit that
suppression requires a human confirmation.

The update is scoped `.eq('id').eq('org_id')` as well as by RLS, so a
cross-org id returns a clean **404** rather than a zero-row update that looks
like success.

## 3. Pipeline value — the predicate, quoted

`src/app/api/jobs/route.ts` **L112**:

```ts
counts_toward_value: j.origin === "manual" || j.confirmed_at !== null,
```

It is computed **once, in the API**, and returned per row rather than filtered
server-side. That is the point: an unreviewed machine job must still be
**visible** — it just must not move any number. Filtering it out of the response
would hide it; returning it with the flag gives every consumer the row *and* the
rule, so they cannot disagree.

Same principle as the off-the-top 11%: a machine opinion changes what you are
asked, never what you are shown.

`idx_jobs_unconfirmed` supports the inverse query when something needs to list
only the unreviewed ones.

## 4. `job_number` — NOT confirmed, so NULL

**You have not confirmed the scheme.** I have gone back through this
conversation and there is no answer to it.

What is known is one example, `24-318-1`, and that is not enough to build from.
It is consistent with year-day-sequence, with year-jobcount-section, and with
several other readings; each implies a different reset rule and a different
collision behaviour. A generated number that looks official and encodes nothing
is worse than an empty field — it would be read as meaningful by everyone who
saw it, including you in six months.

So: `job_number` is written **only when the caller supplies one**, and is
otherwise NULL. The Scope screen renders it only when present. Nothing generates
one anywhere.

**Pass condition 7 passes, and this is the flag it asks for.**

## 5. Scope screen

The old copy is gone. It said:

> "A job is created when a scope is built and won."

That contradicts the schema — `status` DEFAULTS to `'lead'`, and
`won_at`/`lost_at`/`declined_at` arrive later — so it was teaching a workflow
the database does not implement. Replaced with:

> "A job is the container for a piece of work, from first contact onward — it
> starts as a lead and is won or lost later. Create one from a thread when
> someone asks for work."

The list shows title, status badge, contact (name, else phone), address, and
`job_number` only if present. An unreviewed machine job renders with
**"Suggested — not counted"** in the accent colour and an **Accept** button; the
header count excludes it and says `N awaiting your review`.

## 6. Verified, and how

Routes cannot be exercised end-to-end here — the egress proxy blocks the
Supabase host, so a dev server cannot authenticate. Instead I proved the
**database half against real RLS**, inside a transaction that rolls back:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"68fdac60-…","role":"authenticated"}';
-- insert what POST writes, and what a machine job looks like
…
rollback;
```

| result | |
|---|---|
| manual job `counts_toward_value` | **true** |
| its defaults | `job_number=NULL job_type=residential status=lead` |
| machine job `counts_toward_value` | **false** (`confirmed_at=NULL`) |
| both readable to Coy | **2 rows** — visible, one uncounted |
| `jobs` after rollback | **0** |

That is pass condition 5 demonstrated at the data layer: the unreviewed machine
job is **visible and excluded**, not hidden. And the insert succeeding as the
`authenticated` role proves `jobs_member_insert` admits it.

Build green under only the three production env vars; `/api/jobs`,
`/api/jobs/[id]` and `/dashboard/scope` all in the route table. `tsc` 0 errors.

**Note on this container:** it came up without `node_modules` or `.env.local`,
so I ran `npm install` first. The build used inline env vars, which is the same
shape as the production-only build I have used since work order 9.

## 7. Pass conditions

| # | Check | Status |
|---|---|---|
| 5 | Unconfirmed machine job excluded from value, still visible | **PASS** — §6, at the data layer |
| 7 | `job_number` null and flagged | **PASS** — §4 |
| 1 | POST with a valid contact → `origin='manual'`, `confirmed_at` set, `status='lead'` | **NOT RUN** — needs the app |
| 2 | POST with `origin:'machine'` → ignored or 400 | **NOT RUN** — code returns 400 `forbidden_field` |
| 3 | POST with another org's `contact_id` → 403 | **NOT RUN** — code returns 403 `contact_not_in_org` |
| 4 | Scope screen with one job renders it | **NOT RUN** — needs a browser |
| 6 | PATCH accept sets `confirmed_at` and `confirmed_by` | **NOT RUN** — needs the app |

**For you to run,** once deployed, with the failing result named:

```bash
# 1 — passes if origin='manual' and confirmed_at is set. Fails if either is wrong.
curl -X POST .../api/jobs -H 'Content-Type: application/json' \
  -d '{"title":"Duplessis driveway","contact_id":"<a real contact>"}'

# 2 — passes if 400 forbidden_field. Fails if a job is created at all.
curl -X POST .../api/jobs -H 'Content-Type: application/json' \
  -d '{"title":"x","origin":"machine"}'

# 3 — passes if 403 contact_not_in_org. Fails on a row, or an opaque 500.
curl -X POST .../api/jobs -H 'Content-Type: application/json' \
  -d '{"title":"x","contact_id":"00000000-0000-0000-0000-000000000000"}'

# 6 — passes if confirmed_at and confirmed_by are both set. Fails if either stays null.
curl -X PATCH .../api/jobs/<id> -H 'Content-Type: application/json' -d '{"accept":true}'
```

Then Scope should show the job, and the header count should include it.

## 8. What I did not build, and why

**The machine path.** §Coy's ruling makes creation implicit — thread content
carrying a request for work creates a job with `origin='machine'` and
`created_from_message_id`. The work order says not to build it here, and it is
right: it depends on fact-sheet extraction, which depends on the voicemail sweep
having text to read. **The sweep still has not run** — `call_artifacts` holds 2
voicemails and 0 with `storage_path`.

When it lands it writes through this same `POST` path with `origin='machine'`
and no `confirmed_at`, and §3's predicate already excludes it. Nothing more is
needed on this side.

**The §1 rule is recorded and not yet exercised.** A machine-built scope writes
to `job_sections` — the same rows the scope builder reads and edits. No draft
table, no staging area. Nothing in this work order touches `job_sections`, so
there was no opportunity to violate it, but it is the rule the next work order
has to hold to.

## 9. Open questions

1. **The `job_number` scheme.** Still the blocker on §4. What do the three
   segments of `24-318-1` mean, and when does the last one reset?
2. **`job_type` defaults to `'residential'`.** Every job created by this route
   will be residential unless something sets it. Should the POST accept it?
   DECISIONS.md §10 parks `public` as a separate engine, so the CHECK allowing
   it is slightly ahead of the product.
3. **Where does "New job" live in the UI?** §Coy's ruling says creation is
   implicit from thread content, and I have built no manual create button —
   only the route. If you want one before the machine path exists, the natural
   home is the thread detail screen, which already has the contact in hand.
