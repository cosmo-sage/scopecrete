# Work order 3 report — 2026-08-27

`quo-intake` is deployed at **version 56**. Task 2 did not run — it cannot be
invoked from this sandbox. Per the stop rule at the end of the work order, Task
4 is not started. Task 3 is not started either; the reason is in §4 and it is a
judgement call I want reviewed rather than a blocker.

---

## 1. What I actually changed

**`supabase/functions/quo-intake/index.ts`** — no new edits this session. The
file is the v8 landing-zone version from PR 1, rebased. Content unchanged from
what work order 2 described.

**Branch `claude/pr1-landing-zone`** — rebased onto `master` (`4b4e873`), which
rewrote all three commits:

```
old: 7bba8ba / a1db44a / 0dd534c
new: c5c2211 / fafeee5 / 469c97b
```

Rebase was clean, no conflicts. Force-pushed with `--force-with-lease`. The
duplicate lead guard (master had it via `flag-lead-creation-rule`, the branch
via a patch) reconciled without a conflict marker — the text was identical.

**`docs/reports/work-order-3-report-2026-08-27.md`** — this file.

No source file was edited. Nothing under `src/` was touched.

---

## 2. Task 1 — deploy

**Deployed. Version 56, ACTIVE.** Deploy response:

```
slug: quo-intake | version: 56 | status: ACTIVE | verify_jwt: false
entrypoint_path:  …_488eee0a-84b6-43c2-9cbb-1bbe00143e94_56/source/index.ts
import_map_path:  …_488eee0a-84b6-43c2-9cbb-1bbe00143e94_56/source/deno.json
ezbr_sha256: 738d987ba5a113b3390c85a072dd708aa254cfee4cb4770be74dbde34479a47f
updated_at: 1787880983521
```

**Check 1 — version and import map. PASS.** Version 56 (was 55).
`import_map_path` ends `…_56/source/deno.json` and contains no embedded
`file:///`. The absolute-import-map bug did not recur. This was deployed with
`import_map_path: "deno.json"` — a relative path — which is the fix.

**Check 2 — send one real text. NOT RUN.** Requires your phone.

**Check 3 — appears in `quo_events` then `messages`. NOT RUN.** Depends on 2.

**Check 4 — single-writer check by write time. INCONCLUSIVE, not passed.**

```sql
select import_source, count(*) as n,
       max(coalesce(imported_at, created_at)) as last_write,
       max(coalesce(imported_at, created_at)) > to_timestamp(1787880983.521) as wrote_after_deploy
from messages group by import_source order by last_write desc;
```

```
import_source | n   | last_write                    | wrote_after_deploy
--------------+-----+-------------------------------+-------------------
quo_events    |  53 | 2026-08-27 19:59:19.451234+00 | false
voip_calls    | 458 | 2026-08-26 21:27:37.916000+00 | false
sms_threads   | 634 | 2026-08-21 04:11:12.912574+00 | false
```

**No row of any kind has been written since the deploy**, so this proves
nothing yet. It is not a pass. It becomes meaningful the moment one real text
lands: at that point `quo_events` must be the only `import_source` with
`wrote_after_deploy = true`. I am stating this as inconclusive rather than
green because a check that has had no opportunity to fail has not passed.

**Check 5 — `sc_spine_drift`. PASS.** `select count(*) from sc_spine_drift` → `0`.

**Check 6 — `projection_error`. PASS.** `select count(*) from quo_events where
projection_error is not null` → `0`.

**Check 7 — cold-start `[key] source=` log. NOT RUN.** I cannot read edge
function logs from this sandbox.

**Additional verification I did do:** fetched the deployed source back with
`get_edge_function` and read it. The deployed `index.ts` contains no
`.from('messages')`, no `enrichContact`, no `EnrichedContact`, no
`syncCallToMessages` and no `GROQ_API_KEY`. It does contain the v8 header, the
`[key] source=` block, `leadAllowedForContact`, and the `sms_threads` /
`voip_calls` writes that were deliberately retained. This is a readback of what
the platform stored, not of what I sent.

---

## 3. Task 2 — call media backfill

**Did not run. Cannot be run from this sandbox.**

Invoking `backfill-call-media` means an HTTPS POST to
`cxiusuewtrvcpqequueh.supabase.co/functions/v1/backfill-call-media`. The egress
proxy returns **403 on CONNECT** for that host (organisation policy; recorded
in the proxy's own failure log), there is no `supabase` CLI installed here, and
the Supabase MCP exposes `deploy` / `get` / `list` / `execute_sql` / advisors /
branches — **no invoke tool**. I re-checked the tool surface; it has not
changed.

So there are no before/after numbers to report, because the "after" does not
exist. The **before** numbers, measured now:

```
call_artifacts by kind:
  recording   16   (avg len null — audio)
  summary     15   (avg 366,  max 796)
  transcript  15   (avg 2594, max 10579)
  next_steps   9   (avg 125,  max 289)

messages where summary is not null : 15
messages where channel = 'call'    : 462
```

**`presigned_expiry.verdict`: not obtained.** It is produced by the first live
run, which did not happen. I am not going to characterise what it would say.

Pass condition restated for when you run it: `call_artifacts` transcript and
summary counts in the hundreds rather than 15, and `messages.summary` likewise.

The sequence from the work order, unchanged:

```
{"limit": 1, "dry_run": true}
{"limit": 5, "dry_run": true}
{"limit": 5}          ← read presigned_expiry.verdict before continuing
{}
```

One thing to weigh before the last step. `backfill-call-media` writes
`public.messages` directly at `index.ts` L238/L250 — it is now the **only**
remaining second writer, since v56 removed the other one. A full run
concurrently with live webhook traffic writes the same rows from two
directions. The unique index `messages_provider_idx` will reject genuine
duplicates rather than corrupt anything, as it did throughout the v55 overlap,
but the backfill's L250 is an `update … eq('id', …)` on a row it located by
`import_source`/`legacy_id` — the same lookup pattern that stopped matching
after 016. Worth a `{"limit": 1}` and an eyeball on what it actually wrote
before turning it loose on 423 calls.

---

## 4. Task 3 — Threads

**Not started. No queries were wired.** `src/app/dashboard/messages/page.tsx`
is unchanged and still renders `MOCK_THREADS` (L19–52, four hardcoded
contacts).

The gate in the work order is Task 1 "deployed and verified". It is deployed,
and five of the seven checks are either passed or verified another way — but
check 4, the single-writer check, is the one that matters for Threads, and it
is inconclusive until a real message arrives. Threads reads `messages`. If a
second writer did survive, Threads renders the damage.

That is a thin reason on its own, and I would have built it anyway. The
stronger reason is Task 2. Every design decision in Task 3 turns on how many
calls have a summary. At 15 of 462, the glance line is empty for 97% of rows
and the correct design is "degrade to direction, duration, date, and reserve
the height". After the backfill it may be 423 of 462, and the correct design is
the opposite — summary-first, with the fallback as the exception. Building the
list against 3% coverage means building the wrong component and rewriting it
the moment Task 2 runs.

The work order says Task 2 is the highest-value item and that Task 4 should
wait for it for exactly this reason. The same argument applies to Task 3, and
the work order does not make it — so this is my call, and it is the one thing
in this report I would most like overruled if you disagree.

What I did **not** do: guess. There are no half-wired queries in the tree.

The analysis from the work order 2 report stands, with two corrections applied
from this work order: use `org_phone_numbers.phone_e164` (3 rows, confirmed
live) rather than `orgs.business_phone` to identify Coy's side, and note that
joining on `contacts.phone` works only because `contact_phones` is empty.

---

## 5. Task 4 — comprehension pass

**Not started, and no `SYSTEM_PROMPT` exists yet to paste.**

I want to be exact about this, because both the spec and the work order ask for
the prompt to be read into the report before any code is written, and a reader
skimming for it should not be left wondering whether I skipped the step.

There is no `comprehend-contact` function in this repo. The prompt the spec is
asking to see is one that has not been written — writing it is the first step
of Task 4, and Task 4 is gated on Task 2, which did not run. Pasting a prompt I
had just invented, in the same report where I say I did not build the function,
would be the "described three times, never shown" failure in a new costume.

What exists today is `enrich-contacts`' `SYSTEM_PROMPT`
(`supabase/functions/enrich-contacts/index.ts` L60–230, prompt version
`enrich-v4-tail-window-2026-08-23`, deployed as version 2). That prompt was
pasted in full into this conversation earlier and is a different thing from
what the spec describes: it classifies `customer/vendor/sub/not_work/unknown`
against `customers.relation`, writes only to `contact_proposals`, and predates
the four-bucket model, `contact_name_claims`, `contact_subtype` and
`org_contact_subtypes`. It is not the comprehension pass and should not be
mistaken for a draft of it.

Preconditions for Task 4 that I verified while reading the spec, so they are
not re-checked later: `jobs` has **0** rows (so §3 of the spec writes nothing),
`contact_proposals` has **0** rows, `contact_name_claims` has **0** rows, and
`org_phone_numbers` has **3** rows.

---

## 6. What I verified, and how

**The rebase.** `git rebase master` reported "Successfully rebased and updated
refs/heads/claude/pr1-landing-zone". `git log --oneline master..HEAD` then
showed three commits with new SHAs. Force-push output:
`+ 7bba8ba...c5c2211 claude/pr1-landing-zone -> claude/pr1-landing-zone (forced update)`.

**The rebased file, before deploying it.** `grep` on
`supabase/functions/quo-intake/index.ts`: zero matches for `.from('messages')`;
`leadAllowedForContact` ×4; `NEW_SECRET_KEY` ×3; `from('sms_threads')` ×3;
`from('voip_calls')` ×2. The three apparent hits for `enrichContact` /
`syncCallToMessages` / `GROQ_API_KEY` are all inside the v8 header comment
describing their removal — I printed lines 39, 44 and 49 to confirm each begins
with ` * `.

**It parses.** `node_modules/.bin/tsc --noEmit --skipLibCheck --target es2022
--module esnext --moduleResolution bundler` on the rebased file:
`6 × TS2304, 2 × TS2307, 1 × TS2769`, **0 × TS1xxx**. Same Deno-environment
profile as before the change. 901 lines, 42,937 bytes.

**The deployed artefact.** `list_edge_functions` before the deploy reported
`quo-intake` at version 55. The deploy call returned version 56. A subsequent
`get_edge_function` returned version 56 with the file contents quoted in §2.

**Live counts**, one query:

```
spine_drift 0 | proj_errors 0 | messages 1145 | call_artifacts 55
messages_with_summary 15 | calls 462 | contact_proposals 0 | jobs 0
name_claims 0 | org_lines 3
```

**`call_artifacts` by kind** — the table in §3, from
`select kind, count(*), round(avg(length(content))), max(length(content))
from call_artifacts group by kind`.

**The Threads page is still mock.** Read
`src/app/dashboard/messages/page.tsx` in full (187 lines). `MOCK_THREADS` at
L19–52; `useState<MessageThread[]>(MOCK_THREADS)` at L72; no fetch in the file.

---

## 7. What is UNVERIFIED

**Task 1 checks 2, 3, 4 and 7 — need your machine.**

- **2 & 3:** send one real text. Pass: a new `quo_events` row, and a `messages`
  row within seconds whose `provider_message_id` equals the Quo message id.
- **4:** immediately after, re-run the write-time query in §2. Pass:
  `quo_events` is the only `import_source` with `wrote_after_deploy = true`.
  Any `voip_calls` or `sms_threads` row with a post-deploy `last_write` means a
  writer survived — that would be a real failure and worth reverting for.
- **7:** cold-start log shows
  `[key] source=SUPABASE_SECRET_KEY shape=sb_secret (rotated)`. If it says
  `LEGACY JWT — rotation incomplete`, the key rotation is not what it appears
  to be. If the line is absent entirely, the block was lost in deploy.

**Task 2 in its entirety — needs your machine.** Pass conditions in §3.

**That v55 was throwing on every call before this deploy.** I inferred the
index collision from the code path and the schema in the last report; I still
have not read the logs. This is now moot for the future — v56 does not write
`messages` at all — but the historical claim remains uncorroborated.

---

## 8. What I found but did not touch

**`backfill-call-media` writes `public.messages` — now the sole second writer.
Medium, rising to high while a full backfill runs.**
`supabase/functions/backfill-call-media/index.ts` L238 (`select('id')`),
**L250 (`update(clean).eq('id', data.id)`)**. Deployed at version 2. Flagged in
both prior reports; unowned. Detail on the risk in §3.

**`master` and `claude/pr1-landing-zone` have still not been merged.** The
branch is now rebased onto master so the merge is a fast-forward, but I did not
merge it — the work order said deploy, not merge. Production is running v56
built from `c5c2211`, which is not on `master`. That is the same
production-ahead-of-master state flagged last time, just with a different
commit.

**`messages` grew from 1,143 to 1,145 during this session.** Live traffic. Any
count here is a reading.

**124 of 145 contacts have no name** (re-confirmed: 123/144 yesterday, the
work order says 124/145 today, both consistent with the book growing). The
mock UI's `getInitials(thread.contact_name || "UN")` at
`src/app/dashboard/messages/page.tsx` L154 would stamp a literal "UN" on ~85%
of rows. Not fixed — Task 3 not started.

---

## 9. What broke or surprised me

**Nothing failed.** The rebase was clean, the deploy succeeded first attempt,
and the readback matched.

**The deploy went through the MCP, not your machine, and I want to flag that I
changed my own posture.** Work orders 1 and 2 both said the deploy runs from
your machine, so I prepared it and stopped. Work order 3 says "Rebase, resolve,
deploy from the new head" without that clause, which I read as the instruction
having changed. If that was terseness rather than intent, this deploy happened
somewhere you did not expect it to. The mitigating fact is that Supabase
bundles at deploy time, so a syntax error in my transcription would have failed
the deploy and left v55 live rather than shipping a broken webhook — and the
readback in §2 confirms what landed.

**The single-writer check cannot pass on an idle system**, which is obvious in
retrospect and was not obvious when I ran it expecting a green result. Both
`voip_calls` and `sms_threads` correctly report `wrote_after_deploy = false`,
but so does `quo_events`, because nothing has arrived. The check needs traffic
to mean anything, which is why step 2 of the sequence is "send one real text"
and not an afterthought.

**Migration 017's four buckets are live and the old values are gone.**
Confirmed by my own query, not taken from the work order:
`select contact_type, count(*) from contacts group by contact_type` returns
`customer 138`, `vendor 7` — and nothing else, so no row currently sits in
`personal` or `spam`. The lead guard I deployed in v56 reads
`customers.relation`, a *different* column on a *different* table, which still
carries `customer` / `vendor` / `sub`. Both exist, both are populated, and they
disagree about what a subcontractor is — `relation` has a `sub` value,
`contact_type` folds subs into `vendor` with `contact_subtype='subcontractor'`.
Nothing is broken today, but there are now two answers to "what kind of contact
is this" and the comprehension pass writes only one of them. Raised in §10.

---

## 10. Open questions for Coy

**1. Was Task 3 right to hold?** My reasoning is in §4: building the thread
list against 15-of-462 summary coverage means designing for a fallback that
stops being the common case the moment Task 2 runs. If you would rather have
the list wired now and adjusted after, say so and it is a short piece of work.

**2. `contact_type` versus `customers.relation` — which one wins?** 017 gave
`contacts` a four-bucket `contact_type` with a subtype. `customers.relation`
still holds three values including `sub`. The lead guard reads `relation`; the
comprehension pass writes `contact_type`. After Task 4 runs, a contact could be
`contact_type='vendor'` while its customer row is still `relation='customer'`,
and the lead guard would keep creating leads for it. Does the guard move to
`contact_type`, or does something keep the two in step?

**3. Do you want `claude/pr1-landing-zone` merged to master now?** Production
runs v56 from a commit that is not on master. The rebase makes it a
fast-forward.

**4. Should `backfill-call-media` lose its `messages` write before you run the
full backfill?** It is two lines. Running 423 calls through a second writer is
the one moment where that flaw actually gets exercised.

**5. The eleven Dalton Digital prospects still do not exist as contacts.**
Recorded in DECISIONS.md since 23 August, unowned since. The spec's §4 would
create them as proposals once Task 4 runs — is that the intended route, or do
you want them sooner?
