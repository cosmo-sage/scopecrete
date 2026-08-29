# Work order 11 report — 2026-08-29

Pushed to `master` as `8785f3e`. Build green under only the three production
environment variables.

**You found one fabricated number. The audit it forced found three more, all
of which I had marked LIVE.** §1 is the corrected table, re-tested against an
empty database rather than against the code.

---

## 1. Corrected §1 table

Re-tested by the rule you set: **if the code can produce the value with the
database empty, it is a placeholder.** Each row below names what the route does
when its table has no rows.

| Screen | Block | Was | **Now** | Behaviour on empty DB |
|---|---|---|---|---|
| Threads | list, names, previews, counts | LIVE | **LIVE** | renders nothing; no row, no output |
| | voicemail label | LIVE | **LIVE** | label only where `summary_source='quo_voicemail'` |
| | drift banner | LIVE | **LIVE** | now null-safe — see below |
| Detail | messages, next_steps, transcript | LIVE | **LIVE** | absent artifact renders nothing |
| | **voicemail playback** | LIVE | **PLACEHOLDER** | no player at all — §2 |
| Scope | job list | PLACEHOLDER | **PLACEHOLDER** | correct |
| Cash | **off the top** | LIVE | **PLACEHOLDER** | **was 11 from `: 11`** — P0 |
| | **cash position** | LIVE | **PLACEHOLDER** | **was "$0" from an anchor default** |
| | **pay yourself** | LIVE | **PLACEHOLDER** | **was the "fixed draw" label from a defaulted mode** |
| | runway, nut, collected, spent, close rate | PLACEHOLDER | **PLACEHOLDER** | correct |
| More | pipeline count | LIVE | **LIVE** | counts real rows |
| Pipeline | **open value** | LIVE | **PLACEHOLDER** | **was "$0" across 21 valueless leads** |
| | stage tabs, lead rows | LIVE | **LIVE** | real rows |
| | win rate | suppressed | **suppressed** | correct |
| Account | name, email, org, role | LIVE | **LIVE** | null renders as absent, not as a name |

### The three I missed, beyond the one you caught

**Cash position printed "$0".** With `balance_checkpoints` at 0 rows the route
returned `{ balance: 0 }` and the screen showed **$0** as the headline figure.
That is an assertion that the account is empty. The truth is that nobody has
recorded what is in it, and DECISIONS.md §5 is explicit that starting cash is a
manual checkpoint. `anchor` is now `null`, and the screen says so.

**Pay yourself was half-honest, which is worse than uniformly wrong.**
`comp_mode` defaulted to `"fixed_draw"`. The *value* correctly showed "—"
because the draw was 0 — which is exactly why it passed my own review — but the
sentence underneath still read *"Fixed draw — the bid floor must cover this."*
The number was honest and the sentence beside it was not. `comp` is now null.

**Pipeline printed "$0" open value.** 21 real leads, and `leads_with_value = 0`
— not one carries an estimate range. Summing them gives 0, and "$0" against 21
rows claims the pipeline is worthless rather than unpriced. Now "—" with
"no estimate values recorded".

**And one adjacent fix:** `/api/dashboard/drift` ended `count ?? 0`. A null
count would have rendered the all-clear green state from an absent answer —
the precise failure the drift alarm exists to catch. Now null propagates as
unknown.

### What survived the audit

Four numeric fallbacks remain and are **accumulator seeds, not display
defaults**: `estimateByLead[...] ?? 0` inside a `Math.max`, `rangeMin/rangeMax
|| 0` (gated by `anyValued` before display), `invoicesByJob ?? 0` and
`latestEstimateByJob ?? 0` (unreachable at 0 jobs), and `messages_scanned ?? 0`
(a diagnostic, never rendered). I have left them and am naming them so the list
is complete rather than convenient.

## 2. Voicemail playback — downgraded, and fixed underneath

You are right about the mechanism. `call_artifacts.url` is
`share.quo.com/v1/resource/…`, which needs the API key and is cross-origin, so
`<audio src>` loads nothing. 59 recordings have `url`, **0 have
`storage_path`**, and `call_artifacts.storage_path` has existed in the schema
the whole time.

- **UI:** `StoredAudio` renders a player **only** from `storage_path`, via a new
  session-scoped signed-URL route (`/api/messages/[id]/audio`, private bucket,
  10-minute signature, artifact resolved through the caller's org before
  anything is signed). With no stored copy it renders one line — "Audio not
  downloaded yet" — **and no control**.
- **The message-level recording player had the identical defect** and I had not
  flagged it. Its comment even claimed "the recording links do not expire —
  verified alive at 118.8 hours", which was true and irrelevant: a live URL the
  browser cannot authenticate to is still not playable. Removed.
- **Backfill:** fetches the voicemail audio with the Quo credential, uploads to
  the `call-audio` bucket, sets `storage_path`.

Marked PLACEHOLDER in §1 until a sweep populates it.

## 3. Thread detail — newest first

`/api/threads/[contactId]` now orders `occurred_at` descending. The accepted
cost is recorded in the code comment: inside a rapid exchange a reply reads
above the message it answers. The list was already newest-first and is
unchanged.

## 4. WO7 Task 2 — candidate query is voicemail-aware

Migration 023's columns are live, and my §8.6 was stale. The selection now adds
`voicemail_checked_at.is.null`, and **every answered probe stamps
`voicemail_checked_at` and `voicemail_status`** — including a 404.

That is the part that matters: a 404 is an answer ("this call has no
voicemail"), and without recording it the ~60% of calls with no message stay
candidates permanently. Only a transport error is left unstamped, because that
is the one case where we genuinely do not know and a retry is correct.

The sweep itself is still yours to invoke — the egress denial is unchanged.

## 5. Creation paths — scoped, not built

`jobs` = 0 is not an empty screen, it is **an empty table with no writer**. I
grepped: nothing in the app, the API routes, or the edge functions inserts a
`jobs` row. I have added that sentence to `/api/jobs` and to the Scope empty
state so nobody re-diagnoses it as wiring.

**What a job needs at creation** — proposed, for you to correct:

| field | source | why |
|---|---|---|
| `org_id` | session | never from the client |
| `contact_id` | the thread it came from | DECISIONS.md §2: jobs hang off contacts |
| `title` | typed | "Duplessis driveway" |
| `job_number` | generated | `24-318-1` shape, per the reference job |
| `status` | `'lead'` | before any scope exists |
| `address` | contact, editable | the property, not the billing address |

**Which comes first: the job.** A scope is `job_sections` under it, and
DECISIONS.md §2 is explicit that a driveway + patio + demo at one property is
ONE job with several sections. Building the scope first would mean inventing a
parent to attach it to, which is the same shape as every bug in this report.

**The open question I cannot answer for you:** whether a job is created
*explicitly* ("New job" from a thread) or *implicitly* (the first scope you
build on a thread creates one). Implicit is fewer taps on a tailgate; explicit
means a job never appears because somebody was experimenting with numbers. My
inclination is explicit, from the thread, because "there is no money without a
job" makes a job a commitment rather than a side effect — but this is a product
decision and it is yours.

## 6. Pass conditions — each with its failure

Written so someone who does not believe the code is right can falsify them.

| # | Check | **Passes if** | **Fails if** |
|---|---|---|---|
| 1 | Cash → Off the top | shows **"—"** and "No cost settings recorded" | shows **11%**, or any percentage |
| 2 | Cash → Cash position | shows **"—"** and "this is not zero, it is unknown" | shows **$0** or any figure |
| 3 | Cash → Pay yourself | value "—", sub "no pay-yourself mode has been chosen" | any mention of "fixed draw" or "the bid floor must cover this" |
| 4 | Pipeline header | shows **"—"** and "no estimate values recorded", with **21 leads** counted below | shows **$0**, or a lead count other than 21 |
| 5 | Detail → expand a voicemail | transcript renders; **no audio control**; one line "Audio not downloaded yet" | a player appears reading 0:00 / 0:00 |
| 6 | Detail → message order | **newest at the top**; the most recent message is the first row | oldest first |
| 7 | Threads | Luis renders as `Luis`; Don Simpson voicemail is the glance line with a **Voicemail** label; drift shows **1** | Luis shows as a phone number; drift shows 0 or is absent |
| 8 | Scope | "No jobs yet" + "there is no writer for this table anywhere" | any job row, or any number |

Checks 1–4 are the ones that would previously have passed while broken. Each is
now written so the old behaviour is an explicit failure.

## 7. What I verified, and how

- **Counts, from the live database**: `org_cost_settings` 0,
  `balance_checkpoints` 0, `overhead_items` 0, `payments` 0, `receipts` 0,
  `leads` **21**, `leads_with_value` **0**, `call_artifacts` voicemail 2 (both
  with `url`, neither with `storage_path`), `sc_spine_drift` **1**.
- **`call_artifacts.storage_path` exists** — confirmed against
  `information_schema.columns` before building the signed-URL route on it.
- **RLS before querying** (rule 6): `jobs.jobs_member_select` is on
  `get_user_org_ids()`, so `/api/jobs` reads through a session client.
- **Fallback re-audit**: grepped `?? <n>`, `|| <n>`, `DEFAULT_` across every
  route the UI touches, and classified every remaining hit (§1, "what survived").
- **Build** under only the three production names, `.env.local` moved aside,
  `SUPABASE_SERVICE_ROLE_KEY` and `DEV_ORG_ID` explicitly unset: compiled, 21/21
  pages, exit 0. `/api/jobs` and `/api/messages/[messageId]/audio` in the route
  table. `tsc` 0 errors.

## 8. What is UNVERIFIED

- **Nothing rendered in a browser.** Egress denial unchanged. §6 is yours.
- **The signed-URL route has never returned a URL**, because no artifact has a
  `storage_path` yet. Its 404 branch is what runs today, and that is the branch
  §6 check 5 exercises.
- **The voicemail audio download has never run.** Pass: after a sweep,
  `select count(*) from call_artifacts where kind='voicemail' and storage_path
  is not null` is > 0, and a player appears. Fail: still 0, or `voicemail_audio`
  in the response reports an upload error.
- **The `voicemail_checked_at` stamp has never been written.** Pass: after
  `{"limit": 5}`, `select count(*) from voip_calls where voicemail_checked_at is
  not null` is 5, **including the 404s**. Fail: only the successes are stamped —
  that would mean the job still never terminates.

## 9. What broke or surprised me

**The pass condition that could not fail is the real finding here.** §6.4 of my
last report asked you to check that "Cash shows a real off-the-top percentage".
You would have seen 11%, matched it to the report, and passed it. I wrote a
verification step that the bug satisfied. That is worse than the bug: the bug
was one bad fallback, the check was a mechanism for laundering it into a
confirmed fact. Every check in §6 above is now written with its failure mode
next to it, and where I could not state a failure I went back and rewrote the
check.

**I marked things LIVE by reading the code path, not by asking what happens
when the table is empty.** All four fabrications were visible in the routes I
had just written or just read. `: 11` and `|| "fixed_draw"` are eleven
characters apart in the same object literal, and I quoted that literal in a
report while describing the field as sourced from the database.

**Your tell was better than mine.** Two fields, one source, two behaviours —
`off_the_top` showing a number while `pay_yourself` showed a dash — was
diagnosable from my own table without reading any code. I had the evidence in
front of me and did not cross-check the rows against each other.

**One thing I fixed that you did not ask about**, and I want it explicit rather
than buried: the message-level recording player had the same dead-control
defect as the voicemail one. You reported the voicemail players; this was the
same bug one component away, and its comment asserted the URLs were verified
alive — true, and beside the point.

## 10. Open questions for Coy

1. **Job creation: explicit or implicit?** §5. I lean explicit, from a thread.
2. **`call-audio` bucket** — the backfill uploads voicemail audio to it and the
   signed-URL route reads from it. It already holds recordings, so it exists,
   but I could not verify its privacy setting from here. If it is public, the
   signed URL is redundant and the audio is world-readable.
3. **`OPENAI_API_KEY`** — still outstanding.
4. **Tailscale / `scopecrete.ai` hardcodes** — still open, still not fixed.
5. **The sweep** is yours to invoke whenever you want the voicemails and their
   audio. The §8 pass conditions are the ones to check afterwards.
