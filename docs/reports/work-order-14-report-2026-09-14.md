# Work order 14 report — 2026-09-14

## 1. The answer to §1: written, not deployed

**The WO11 change was made in the repo and never deployed.** It is a deployment
gap. But there is a reporting failure sitting next to it that is mine, and it is
the reason you had to ask.

**The code exists, and has since 29 August.** `git log -S` names the commit:

```
$ git log --oneline -1 -S "voicemail_checked_at" -- supabase/functions/backfill-call-media/index.ts
8785f3e WO11: remove fabricated values, kill the dead audio player, newest-first
```

```
288:    .select('… created_at, voicemail_checked_at, voicemail_status')
307:      'voicemail_checked_at.is.null',
567:        update.voicemail_checked_at = now
```

**It was never deployed.** Before I touched anything today:

```
slug: backfill-call-media   version: 3   updated_at: 1787958988153
                                         = 2026-08-28T23:16:28Z
```

That is the **work order 6** deploy. WO11 was the 29th. So production sat a full
version behind the repo for sixteen days, and your reading of v3's source is
correct — neither string was in it.

### The part that is a rule 2 failure

The code was real, so this is not a fabricated claim. But **the WO11 report
never once mentions deployment** — `grep -i deploy` over it returns nothing —
and §4 is written in the present tense:

> "The selection **now adds** `voicemail_checked_at.is.null`, and **every
> answered probe stamps** `voicemail_checked_at` and `voicemail_status`."

That describes the repo as though it were production. I did flag the stamp in
§8 UNVERIFIED —

> "**The `voicemail_checked_at` stamp has never been written.** Pass: after
> `{"limit": 5}` … is 5, **including the 404s**."

— which is true, but it reads as *not yet exercised* when the fact was *not yet
shipped*. Those are different, and only one of them is fixable by running the
function.

**The remedy is a habit, not a patch: an edge-function change is not done until
`list_edge_functions` shows a new version number, and the report says which.**
WO6, WO8 and WO9 all deployed and all said so. WO11 edited an edge function as a
side errand to a UI work order and I never switched into that mode.

### One thing I could not explain, and did not guess at

Two rows already carry `voicemail_checked_at` — which should have been
impossible, since v3 had no stamping code.

```
AC133fa42a…  written  2026-08-29 06:23:11.660527+00   artifact written 23:32:45.371
AC7650d776…  written  2026-08-29 06:23:11.660527+00   artifact written 23:32:42.812
```

**Both stamped at the identical microsecond**, while their artifacts were
written 2.5 seconds apart. A function run stamps each row with its own
`new Date()`, so identical timestamps to six decimal places mean **one SQL
`UPDATE` statement**, not a function run. Someone — you or another agent — ran a
manual backfill on 29 August at 06:23. That is the only explanation consistent
with the timestamps, and I am not going to invent a second one.

Those two rows carry the **raw** value `'written'`, not the canonical `'found'`
this version writes. Harmless, but it means `voicemail_status` will briefly hold
two vocabularies. §7 has the one-line normalisation; I have not run it.

---

## 2. What I changed

**`supabase/functions/backfill-call-media/index.ts` L558–590.**

The candidate query at **L303–308** already had `voicemail_checked_at.is.null`
OR'd with the other three predicates, exactly as §3 asks. That part needed no
change — it needed deploying.

The stamp block did need changing, and not only for the status vocabulary.
**The WO11 version was a blocklist:**

```ts
if (!dryRun && r.voicemail_status !== undefined
    && !String(r.voicemail_status).startsWith('error:')) {
```

Anything not beginning `error:` was stamped. That silently included
**`artifact write failed: …`** — a call whose voicemail we successfully fetched
and then failed to store would be marked checked and never retried. The
voicemail would be lost and the row would look answered. That is a defect I
wrote, and it is worse than the one this work order is about, because it loses
data rather than wasting calls.

It is now an explicit allowlist:

```ts
const VOICEMAIL_ANSWER: Record<string, string> = {
  written:        'found',   // fetched and stored this run
  already_present:'found',   // a voicemail artifact already exists
  not_available:  'none',    // 404 — the provider says there is none
  empty:          'empty',   // 200, but no transcript and no url
}
const answer = VOICEMAIL_ANSWER[String(r.voicemail_status ?? '')]
if (!dryRun && answer) {
  update.voicemail_checked_at = now
  update.voicemail_status = answer
}
```

**Deliberately left unstamped**, so the row is picked up again:

| status | why unstamped |
|---|---|
| `error: …` | transport. **Includes 429** — `apiGet` L96–99 returns it as `error:`, so rate limiting is already excluded without a special case |
| `artifact write failed: …` | we have the voicemail and did not store it |
| `no_messages_row` | never probed — see below |

**`no_messages_row` is a judgement call I want on the record.** §3 says stamp
every *answered probe*; this branch never probes, because the spine row is
missing. Stamping it would mean a projection defect terminates quietly behind a
green tick. It was 0 rows when measured (462/462 calls had a `messages` twin),
so it cannot cause the non-termination it superficially resembles. **If you would
rather it terminate than stay loud, say so and it is one line.**

## 3. Deployed — and verified against the deployed function

```
version: 4   status: ACTIVE   verify_jwt: true
import_map_path: …_14f86820-96e8-454a-9084-31641de04dba_4/source/deno.json
ezbr_sha256: 4f8276b3a4f078f1884eaf9b75ea24a789b644acf549e4448ad4a8c0331878bb
```

`import_map_path` is relative with no nested `file:///`, so the v52-class deploy
bug did not recur.

**Check 5, done the way §6 demands.** I fetched the function back from the
Supabase API with `get_edge_function` and read the returned source — not the
working tree. Present in the **deployed v4**:

- `voicemail_checked_at, voicemail_status` in the `select(...)`
- `'voicemail_checked_at.is.null'` inside the candidate `.or([...])`
- the `VOICEMAIL_ANSWER` allowlist
- `update.voicemail_checked_at = now`

The round trip was also the safety net for a real risk: the MCP deploy tool
takes file content inline, so a 651-line function has to be reproduced by hand.
Reading it back and confirming the markers is what turns that from a hope into a
check. (`api.supabase.com` is blocked by the egress proxy, so the Management API
was not an option.)

## 4. Pass conditions

| # | Check | Status |
|---|---|---|
| 5 | Deployed source contains `voicemail_checked_at` | **PASS** — read from the Supabase API, §3 |
| 1 | `count(*) where voicemail_checked_at is not null` after a batch of 30 equals calls probed, **including 404s** | **NOT RUN** |
| 2 | `voicemail_status` group-by shows `none` far outnumbering `found` | **NOT RUN** |
| 3 | Same batch twice considers different calls | **NOT RUN** |
| 4 | A transport error leaves the call unstamped | **NOT RUN** |

Checks 1–4 need the function invoked, and I cannot invoke it: the egress proxy
answers **403 on CONNECT** for the project host. Re-tested today, unchanged.

**Current baseline, so the after is readable:**

```
voip_calls where voicemail_checked_at is not null .... 2   (both the manual UPDATE)
distinct voicemail_status ............................ 'written'   (legacy value)
```

**After `{"limit": 30}`, what each result means:**

- **Passes:** `voicemail_checked_at is not null` ≈ 32, and
  `voicemail_status` shows `none` ≫ `found`.
- **Fails:** it sits at ~2 plus only the found ones. That means 404s are not
  being stamped and the job still never terminates — the exact symptom this
  work order exists to remove.
- **Also fails:** any row with `voicemail_status = 'found'` but no
  `call_artifacts` row of `kind='voicemail'`. That would mean the allowlist is
  stamping a write that did not happen.

Check 4 is the awkward one: forcing a transport error means breaking the
provider key or the network mid-run. The cheap proxy is to grep the response's
`error_tally` after a real batch — any `voicemail:` entry that is not `404` or
`empty` should correspond to a row that is **still unstamped**.

## 5. Sequencing — where this leaves you

§5 says the backlog sweep runs first on the current version, and the fix must
land before the cadence moves from 5-minute backlog to daily.

**The fix has landed.** Deployed v4 is live now, which is ahead of that
schedule rather than behind it — the backlog sweep will run on the fixed
version and will stamp as it goes. That is strictly better: the backlog run
stops being wasted work and doubles as the thing that answers checks 1–3.

## 6. What I did not touch

All five §4 items verified present in the deployed source by grep, not by
recollection: the dual raw/Bearer auth loop, `voicemailFrom()`'s own extractor,
the summary write guarded on `.is('summary', null)`, the presigned-expiry probe
and its verdict field, and the absence of any `messages` write beyond the
glance-line summary.

## 7. What I found but did not do

**The two legacy `'written'` rows.** They will not be re-stamped, because
`voicemail_checked_at is not null` already excludes them from the candidate
query. Normalising is one statement, and it is a data change so I have not run
it:

```sql
update public.voip_calls set voicemail_status = 'found'
 where voicemail_status = 'written';
```

**`nothing_to_write` is now nearly unreachable.** With a stamp in `update` on
every answered probe, `Object.keys(update).length === 0` only holds when the
probe produced no answer at all. Not a defect — the outcome label just means
something narrower than it used to.

## 8. Open questions

1. **`no_messages_row`: stay loud, or terminate?** §2. One line either way.
2. **Normalise the two `'written'` rows?** §7.
3. **After the backlog completes, what daily cadence?** The presigned-expiry
   verdict in the response answers whether daily is even viable — if
   `newest_dead_hours < 24`, audio has to be captured at webhook time instead
   and a daily sweep is not a safety net.
