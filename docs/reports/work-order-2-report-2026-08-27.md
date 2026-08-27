# Work order 2 report — 2026-08-27

`master` at `32314c1`. `claude/pr1-landing-zone` at `7bba8ba`, still unmerged
and still undeployed.

---

## 1. What I actually changed

**`DECISIONS.md`** (on master, per the ruling that `AGENTS.md` takes precedence
for documentation):

- New **§2a** (L182–238) — the raw-log/spine split: `quo_events` as universal
  raw log with `provider`/`received_at`/`projected_at`/`projection_error`; the
  trigger chain `quo_events_project` → `sc_quo_events_project()` →
  `sc_project_raw_event(quo_events)`; `messages_provider_idx` as the dedupe key;
  a `call_artifacts` table with live per-kind counts including `next_steps`;
  `messages.summary` as display cache with `call_artifacts` authoritative;
  `projection_defects` and `sc_spine_drift`; and why the `quo_events`/`messages`
  gap is artifact events rather than a defect.
- New **§2b** (L240–261) — the lead guard ships as-is and deliberately does not
  suppress on an unconfirmed classification, with the rule stated as: a machine
  opinion changes what Coy is asked, never what he is shown.
- L102–109 — marked the 12,000-char truncation blocker **RESOLVED**, keeping the
  original diagnosis below it as the rationale for the v4 design.
- L136–147 — rewrote the `enrichContact()` entry from "still live inside
  quo-intake" to "removed in source on `claude/pr1-landing-zone`, still live in
  production v55", with the warning not to repair the Groq model id first.
- L173–174 — cross-referenced §2b from the existing guard note.
- L7 — `Last updated` 2026-08-23 → 2026-08-27.

**`STATUS.md`** — rewritten for post-016: what is live, the second-writer
situation with the evidence in §2 below, a branch map, ordered open items, and
the sandbox constraints.

**Merge** — `claude/flag-lead-creation-rule` into `master` (4 files, no
conflicts), so master matches deployed `enrich-contacts` v2.

**`docs/reports/work-order-2-report-2026-08-27.md`** — this file.

No source file changed. `quo-intake` was not touched in this work order; its
changes are already on `claude/pr1-landing-zone` from PR 1.

---

## 2. Deploy result

**The deploy did not happen.** Task 1 states it runs from Coy's machine, and
nothing in my sandbox can reach it — see §5. `quo-intake` is still **version
55**, confirmed via `list_edge_functions`:

```
slug: quo-intake | version: 55 | status: ACTIVE | verify_jwt: false
entrypoint: …_488eee0a-84b6-43c2-9cbb-1bbe00143e94_55/source/index.ts
import_map_path: …_55/source/deno.json
updated_at: 1787357332757  (2026-08-20)
```

None of the seven verification steps in Task 1 were run, because all seven are
post-deploy checks and six of them require a real inbound text. Steps and pass
conditions are restated in §5.

One Task 1 item I could check without deploying: **the `[key] source=…` block
is present in the branch source that will be deployed.** `grep -n` against
`supabase/functions/quo-intake/index.ts` on `claude/pr1-landing-zone` returns
it at L68 (`const NEW_SECRET_KEY`), L70 and L82 (the `console.log`). It is in
the branch, not merely in `claude/edge-key-source-log`. Whether it survives
into the *deployed* source is unverified until the deploy runs.

---

## 3. The single-writer check

**This check has not been run in the form Task 1 specifies, and cannot be until
the deploy happens.** What follows is the pre-deploy state, which is a
different question and must not be read as a pass or a fail of step 4.

The Task 1 step 4 query over a 24-hour window rather than one hour, so that it
returns something at all before new traffic arrives:

```sql
select import_source, count(*) as n, max(occurred_at) as latest
from public.messages
where occurred_at > now() - interval '24 hours'
group by import_source order by n desc;
```

```
import_source | n | latest
--------------+---+------------------------------
quo_events    | 8 | 2026-08-27 15:14:58.882213+00
voip_calls    | 2 | 2026-08-26 21:26:58.097+00
```

Two rows are not `quo_events`. **This is not the failure step 4 is looking
for.** Those two rows have `occurred_at` on 26 August and were written before
the trigger existed. Grouping by write time rather than event time separates
them cleanly:

```sql
select import_source, min(coalesce(imported_at, created_at)) as first_write,
       max(coalesce(imported_at, created_at)) as last_write, count(*) as n
from public.messages group by import_source order by last_write desc;
```

```
import_source | first_write                   | last_write                    | n
--------------+-------------------------------+-------------------------------+----
quo_events    | 2026-08-27 13:01:08.509365+00 | 2026-08-27 15:14:58.882213+00 |  50
voip_calls    | 2026-08-21 04:11:19.675090+00 | 2026-08-26 21:27:37.916000+00 | 458
sms_threads   | 2026-08-21 04:11:12.912574+00 | 2026-08-21 04:11:12.912574+00 | 634
```

The last edge-function write to `messages` was **2026-08-26 21:27:37**. The
trigger's first was **2026-08-27 13:01:08**. Every one of the 50 writes since
is trigger-sourced. The two writers have not yet produced an overlapping
successful write.

**No duplicate or corrupted rows exist.** Every row has a
`provider_message_id` (`select count(*) … where provider_message_id is null` →
`0`), so `messages_provider_idx` covers the whole table, and a grouped check
for repeated `provider_message_id` values returned no rows.

This changes the severity of the situation described in the work order, so I
want to be exact about it. `quo-intake` v55 is still executing its write path
on every call. Its lookup keys on `import_source='voip_calls'` + `legacy_id`,
which no longer matches, so it falls to the INSERT branch and collides with the
unique index on the same `(provider, provider_message_id)` the trigger already
wrote. The index rejects it. The function logs a PostgREST error through
`dbFailed()` and returns `message: 'failed'` inside a 200 response.

So the second writer is failing **safely but silently** — the index is holding
the line, not the application. It still has to go: it is writing errors into
the logs on every call and the protection is incidental. But on the evidence
above it is not corrupting `messages`, and the deploy is a correctness and
noise fix rather than a rescue.

Per the instruction in the report template I have **not** continued to Task 3.
The reason is the gate in Task 3 itself ("do not start until Task 1 is deployed
and verified"), not a failed check.

---

## 4. What I verified, and how

**Migration 016 is live and the trigger is real.** `pg_get_triggerdef`:

```
CREATE TRIGGER quo_events_project AFTER INSERT OR UPDATE ON public.quo_events
FOR EACH ROW WHEN ((pg_trigger_depth() < 2)) EXECUTE FUNCTION sc_quo_events_project()
```

Both functions exist in `pg_proc`: `sc_quo_events_project()` (no args) and
`sc_project_raw_event(e quo_events)`.

**The dedupe index.** `pg_indexes`:

```
CREATE UNIQUE INDEX messages_provider_idx ON public.messages
USING btree (provider, provider_message_id) WHERE (provider_message_id IS NOT NULL)
```

**Live counts**, one query, actual output:

```
messages 1143 | call_artifacts 55 | spine_drift 0 | projection_defects 0
quo_events 1189 | proj_errors 0 | contacts 144 | contacts_no_name 123
calls 460 | calls_with_summary 15
```

**Artifact kinds**, which I needed before documenting them:

```
kind        | n  | distinct_messages | avg_len | max_len
------------+----+-------------------+---------+--------
recording   | 16 | 16                | null    | null
summary     | 15 | 15                | 366     | 796
transcript  | 15 | 15                | 2594    | 10579
next_steps  |  9 | 9                 | 125     | 289
```

This confirms three things the work order states: nine calls have `next_steps`,
transcripts reach ~10,000 characters (10,579), and 16+15+15 = 46, the
`quo_events`/`messages` gap.

**`quo-intake` is version 55.** `list_edge_functions` output in §2.

**The `[key] source=` block is in the branch.** `git grep` on
`claude/pr1-landing-zone`: L68, L70, L82 of
`supabase/functions/quo-intake/index.ts`.

**The merge was clean.** `git merge origin/claude/flag-lead-creation-rule`
reported 4 files changed, 544 insertions, 47 deletions, no conflict markers,
and created `STATUS.md`.

**The Threads UI is mock.** Read `src/app/dashboard/messages/page.tsx` in full
(187 lines): `MOCK_THREADS` is a four-element literal at L19–52, and `threads`
is initialised from it at L72 with no fetch anywhere in the file.

**Transcript speaker format.** Queried the two longest transcripts; both are
newline-delimited `+E164: utterance`, e.g. `+12253782458: Hey.` /
`+19853188307: Hello?`.

---

## 5. What is UNVERIFIED

**The deploy — needs Coy's machine.**

```
supabase functions deploy quo-intake --project-ref cxiusuewtrvcpqequueh
```

Pass condition: `list_edge_functions` reports `quo-intake` at **version 56 or
higher**, `verify_jwt: false`, and an `import_map_path` ending
`…_<version>/source/deno.json` — a *relative* resolution. If the response
instead contains a path with `file:///` embedded inside another path, the
absolute-import-map bug has recurred and the deploy did not take.

The relative `deno.json` approach is confirmed working, but on a different
function: `enrich-contacts` v2 was deployed through the Supabase MCP passing
`import_map_path: "deno.json"` and resolved correctly. Whether the **CLI**
reproduces that from `supabase/functions/quo-intake/deno.json` I have not
verified.

**All seven Task 1 verification steps — need Coy's machine.** None were run.

1. Send one real text. Pass: it is delivered.
2. New `quo_events` row. Pass: `select count(*) from quo_events` increases by 1.
3. Matching `messages` row within seconds. Pass: a row whose
   `provider_message_id` equals the Quo message id.
4. **The single-writer check.** Pass: `select import_source, count(*) from
   messages where occurred_at > now() - interval '1 hour' group by 1` returns
   **only** `quo_events`. Any `sms_threads` or `voip_calls` row means a writer
   survived the removal.
5. Pass: `select count(*) from sc_spine_drift` → `0`.
6. Pass: `select projection_error from quo_events order by received_at desc
   limit 5` → all null.
7. Pass: `sms_threads` also gained a row — that write is deliberately retained.

**The `[key] source=` block surviving into deployed source.** Pass: the
function logs `[key] source=SUPABASE_SECRET_KEY shape=sb_secret (rotated)` on
first cold start after deploy. If it logs `LEGACY JWT — rotation incomplete`,
the key rotation is not what it appears to be; if it logs nothing, the block
was lost.

**Whether v55 is currently throwing on every call.** I inferred the collision
from the schema and the code path; I did not read the edge function logs, which
I cannot reach. Pass: the logs show `[db] messages insert (call=…)` errors
dated after 2026-08-27 13:01. This would confirm the mechanism in §3 rather
than change what needs doing.

---

## 6. What I found but did not touch

**`backfill-call-media` still writes `public.messages` — medium.**
`supabase/functions/backfill-call-media/index.ts` L238 (`.select('id')`) and
**L250 (`.update(clean).eq('id', data.id)`)**. Deployed at version 2. Removing
`quo-intake` as a second writer leaves this one. Admin-invoked, so it will not
race continuously, but a backfill run concurrent with the trigger writes the
same rows from two directions. Carried over unfixed from the PR 1 report.

**`master` and `claude/pr1-landing-zone` have both gained the lead guard by
different routes — low, but it will bite at merge time.** `pr1-landing-zone`
was cut from master *before* today's `flag-lead-creation-rule` merge and
applied the guard as a patch; master now has the same guard from the branch
itself. The text is identical, so the merge will probably reconcile, but I have
not tested it and did not rebase the branch, because Task 1 names `a1db44a` as
the commit to deploy and rebasing would change it.

**123 of 144 contacts have no name — the mock UI would render them as "UN".**
`src/app/dashboard/messages/page.tsx` L154 calls
`getInitials(thread.contact_name || "UN")`. The list falls back correctly for
the display name at L159 (`contact_name || contact_phone || "Unknown"`), but
the avatar does not — it would show a literal "UN" badge on roughly 85% of
threads. Not fixed; Task 3 is not started.

**Names spoken inside call content are not identity.** The second-longest
transcript opens `+12253782458: Hey, Carlos.` and `+17134542977: Hey, Corey.`
— two different names, neither being the speaker's own. This is the same trap
that put "Brad Chaney" on a lead-gen service's contact record. Anything that
later tries to name a speaker from transcript text will reproduce it.

---

## 7. What broke or surprised me

**The 24-hour `import_source` query returns non-`quo_events` rows, and that is
not a failure.** Task 1 step 4 filters on `occurred_at`, which is when the call
or text *happened*, not when the row was *written*. Two rows from 26 August sit
inside a 24-hour `occurred_at` window while having been written before the
trigger existed. Over the one-hour window the step actually specifies this will
not arise, but the query is measuring the wrong clock for the question it is
asking, and a late-arriving webhook for an older call could reproduce it after
the deploy. Grouping by `coalesce(imported_at, created_at)` is the version that
answers "who wrote this".

**The two writers have not actually overlapped yet.** The work order says two
writers are live on the same rows right now. Both code paths are live, but on
the evidence in §3 the edge function has not written a `messages` row since
2026-08-26 21:27, twelve hours before the trigger's first write, and there are
no duplicates. The unique index appears to be absorbing the collisions. I
report this because it lowers the blast radius, not the priority — but "nothing
else matters until that stops" is truer of the log noise and the
`enrichContact` risk than of `messages` integrity, which is currently intact.

**`messages` moved from 1,142 to 1,143 between two of my own queries**, minutes
apart. Live traffic. Any count in these documents is a reading, not a constant;
I noted that in `STATUS.md` rather than freezing a number that was already
stale when written.

**Nothing failed.** The merge was clean, no conflicts, and every query returned
what I expected apart from the two items above.

---

## 8. Threads: what the UI now reads

**The UI reads nothing. Task 3 was not started, and no queries were wired.**
The gate in the work order is that Task 1 be deployed and verified; it is
neither. `src/app/dashboard/messages/page.tsx` is unchanged and still renders
`MOCK_THREADS`, four hardcoded contacts (Marcus Thibodaux, Fatima Osei,
Victoria Patel, Brandon Pierce) with invented phone numbers and timestamps
generated relative to `Date.now()`.

There is also `src/app/dashboard/messages/[id]/page.tsx`, a detail route the
list links to at L139. I did not read it, since I was not building against it.

The rest of this section is the analysis the work order asks for in place of
built work.

**What a contact with no name has to do.** 123 of 144 contacts qualify, so this
is the normal case, not the edge. The existing display-name fallback at L159 is
already right (`contact_name || contact_phone || "Unknown"`), but it should
render a *formatted* phone rather than raw E.164, and the avatar at L154 is
wrong: `getInitials(thread.contact_name || "UN")` puts a literal "UN" on ~85%
of rows. A phone-derived glyph, or a neutral icon, is the honest rendering. The
one thing it must not do is invent a name — the Dalton Digital record is what
that produces.

**What a call with no summary has to do.** 15 of 460 calls have one, so an
empty glance line is the overwhelming default. The row should degrade to
something factual it always has — direction, duration, date — rather than
blank space or a spinner suggesting something is still loading. Reserve the
summary line's height either way so the list does not reflow when the 3% that
have one render.

**Resolving phone-number speaker labels — what it would take.** Transcripts are
a single text blob, one utterance per line, `+E164: text`:

```
+12253782458: Hey.
+19853188307: Hello?
+19853188307: Hey.
+12253782458: Is that better?
```

To render names instead of numbers:

1. **Parse at display time.** Split on newline, match `^(\+\d+):\s?(.*)$`. Lines
   that do not match are content, not speakers, and must be appended to the
   previous utterance rather than dropped.
2. **Identify our own side.** `+12253782458` is the business line. It is
   `QUO_PHONE`, an environment variable inside the edge function and therefore
   not visible to the UI. `orgs.business_phone` holds the same value and is
   reachable, so the UI should read it from there rather than hardcoding.
3. **Resolve the other side** by joining the label to `contacts.phone`. Both
   are E.164 already, so no normalisation is needed for the data as it stands.
   With 123 of 144 contacts unnamed, most resolutions will fail and must fall
   back to a formatted phone number.
4. **Do not assume two parties.** Both transcripts I looked at have exactly two,
   but nothing in the schema guarantees it, and a conference or a transfer would
   produce a third label that must render rather than break the parse.

The cost is a parser plus one join, all at display time — no schema change. The
alternative, storing structured utterances, is a migration and is not worth it
for 15 transcripts. What makes it worth doing at all is that the parse also
gives you per-speaker turns, which is what makes a transcript skimmable.

**Drift indicator.** Not built. `select count(*) from sc_spine_drift` currently
returns 0.

---

## 9. Open questions for Coy

**1. Does the pr1 branch get rebased before deploy?** Task 1 names `a1db44a`.
Master has since moved to `32314c1` and now contains the same lead guard by a
different route. Deploying `a1db44a` as instructed is safe — the branch is
self-contained — but the eventual merge to master is untested. Do you want the
branch left exactly as specified, or brought up to date first and the deploy
run from the new head?

**2. `backfill-call-media`'s write to `messages` — its own PR?** It is the last
remaining second writer after the pr1 deploy, and it is two lines.

**3. Does Task 3 start on a green single-writer check, or do you want to see
the report first?** If step 4 comes back clean I can begin immediately; if you
would rather review the deploy output before the UI changes, say so and I will
hold.

**4. `messages.summary` is a display cache with `call_artifacts` authoritative.
What refreshes it?** Nothing in the code I have read writes `summary` outside
the projection trigger. If an artifact is ever corrected or re-fetched, the
cache will silently disagree with the source of truth, which is the same class
of problem as the two writers. Not urgent at 15 rows.

**5. The eleven prospects inside the Dalton Digital message bodies still do not
exist as contacts.** Recorded in DECISIONS.md §2 since 23 August, unowned since.
They are real inbound leads that the system cannot see. Do you want them
extracted?
