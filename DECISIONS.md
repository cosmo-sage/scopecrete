# ScopeCrete — Decision Record

Ground truth for every agent working this repo. If code disagrees with this
document, the code is wrong or this document is stale — resolve it, don't
guess. Update this file in the same PR that changes the behavior it describes.

Last updated: 2026-09-27

---

## 1. What the product is

Mobile-first PWA for concrete contractors. Field use: one-handed, on a
tailgate, muddy hands. Dense UI, small tight fonts, no decorative whitespace.

**The moat is the concrete math, not the CRM.** Concrete is estimable because
it has a finite repeatable parameter set — sqft, depth, PSI, prep, access.
The Scope Builder is the spine. Everything else feeds it or carries its output.

**One database, two doors:** a customer-facing estimator that captures leads,
and the back-office assistant (Dusty). Same brain, same data.

---

## 2. Data model — jobs are the spine

**There is no money without a job.** "Lead" is just the word for someone
calling in. Threads (conversations) are continuous, build context, and exist
to develop into a job that can be won.

    org → contacts (keyed by phone) → jobs → job_sections → notes/photos

A driveway + patio + demo at one property is ONE job with several sections.

Invoices, payments, receipts, daily logs, and estimates all hang off the job,
so quoted-vs-actual is live rather than reconstructed by hand.

**KNOWN ISSUE — every inbound message creates a lead.** As of 2026-08-21
`quo-intake` calls `resolveLead()` on every `message.received`, `call.completed`
and `message.delivered`, so any contact with no open lead gets one. That was
invisible while the lead bug meant no lead was ever created; now that it is
fixed, 118 contacts carrying traffic can each spawn one.

Of the first four real leads, Luis (a sub who sends crews, 324 messages) and
Gary Davis (18 messages about shop cleanup) are not leads at all.

**CORRECTION 2026-08-23 — "Brad Chaney" is not a customer either.** This
document previously called that lead a genuine inbound enquiry. It is not.
Contact `5f02a4d7` / +19012956423 is **Dalton Digital**, a paid lead-generation
service. All eleven of its messages are the same template:

    "New Lead From Baton Rouge Concreters — <name> needs <service>.
     Call them at <phone> (<city>). — Dalton Digital"

Brad Chaney is a name inside the FIRST message body — a referred prospect whose
real number is 2253265685. Something wrote that name onto `contacts.name` for
the lead-gen service's number. That is the same failure mode as the "Hi Coy"
bug: a name lifted from message content and attached to the wrong party.

Two consequences. Under the direction-of-ask rule Dalton Digital is a **vendor**
(we pay them for leads), so the correct classification for that contact is
`vendor`, not `customer`. And the eleven genuine prospects named in those
message bodies have never been created as contacts at all — they are the only
real customers in that thread, and the system cannot see them.

**Do not use this contact as the positive customer case when testing the
classifier.** A correct classifier returns `vendor` for it.

The rule is NOT settled and no heuristic should be added yet — the deciding
input is what `enrich-contacts` proposes as `classification`
(customer/vendor/sub/not_work). See §"Interim signal" below for what the data
already rules out.

**The discriminator is the DIRECTION OF THE ASK, not topic or volume.**

Volume is the wrong signal — a big commercial customer generates hundreds of
messages too. Topic is also wrong: a sub and a customer both discuss the
address, crew size, equipment and start dates. What differs is who wants what
from whom.

    money OUT from us to them        -> sub or vendor
    money IN from them to us         -> customer
    they offer their availability    -> sub
    they ask what it costs THEM      -> customer
    they ask when WE need them       -> sub
    they ask when WE can start       -> customer

Luis (+1985…8307) is the worked example, classified sub on:

    "Can you send Luis the payment for Monday he needs it"
    "could you send the $1300"
    "if you have anything for Monday for us we are free"

Money flows out to him and he offers his availability to us. He is labour we
buy, not work we sell — however much he talks about driveways.

This is the primary classification rule in the `enrich-contacts` prompt
(`enrich-v3-direction-of-ask`), and `evidence_quote` must be the line that
SHOWS the direction. A quote about the address is not evidence of a
classification; if that is the best line available, the answer is `unknown`.

**RESOLVED 2026-08-27 — was: the 12,000-char window truncates away the
evidence.** Fixed in `enrich-v4-tail-window-2026-08-23`, deployed as
`enrich-contacts` version 2. Turn labels are now short ordinals (`#42 THEM
2026-07-10`, ~20 chars) instead of uuid headers (~69), the window keeps the
TAIL rather than the head, and `MAX_TURN_CHARS` caps any single turn at 4,000.
The model cites `evidence_turn`, an ordinal that `sanitize()` resolves back to
a real `messages` id, so it never sees a uuid and cannot invent one. The
diagnosis is kept below because it is the reason the design is what it is.

Measured 2026-08-23 against the live data, before the prompt had ever run:

`askModel()` sends `conversation.substring(0, 12000)`, and
`renderConversation()` prefixes every turn with a
`[message_id: <uuid>] THEM @ <date>` header costing ~69 characters. For Luis:

    256 non-empty turns
    32,837 chars rendered  =  14,661 chars of actual words
                            + 17,664 chars of message_id headers (54%)
    12,000-char window     =  37% of the conversation

All three lines this document cites as the worked example for `sub` sit past
the cut — at cumulative offsets 30,304 ("could you send the $1300"), 32,175
("if you have anything for Monday for us we are free") and 32,298 ("Can you
send Luis the payment for Monday he needs it"). **The model never sees any of
them.** Two other money-out lines do survive, at 10,800 and 11,548 ("Are you
able to send the payment for the guys today ?"), so Luis should still classify
`sub` — but on different evidence, and with only ~450 chars of headroom left.

Any contact with more traffic than Luis loses the direction entirely. Fix the
plumbing before running the prompt over all 135: drop the uuid headers to a
short per-turn index (recovering ~54% of the budget), and prefer the TAIL of a
long conversation over the head, since the direction of the ask is clearest in
recent traffic.

**The legacy enricher is gone from production AND, as of 2026-09-27, from the
repo.** `enrichContact()` wrote `name`, `first_name`, `address` and
`contact_type` straight onto `public.contacts` with no review step. It is the
most likely origin of the "Brad Chaney" mislabel above.

CORRECTION 2026-09-27: this section used to say production intake still
contained it. It did not — deployed `quo-intake` v56 was already the v8
"landing zone" version with `enrichContact()` and `syncCallToMessages()`
removed. The drift ran the OTHER way: `master` still carried both, so
**deploying intake from the repo would have reinstalled the unreviewed
enricher**. The repo now holds the deployed v56 source (its own commit, no
behaviour change), and v57 is built on it. **Always read the deployed source
back with `get_edge_function` before changing an edge function; never assume
the repo matches production.**

**The filter is then deterministic and free.** `customers.relation` is
`NOT NULL DEFAULT 'customer'` with `CHECK (relation IN ('customer','vendor','sub'))`,
plus `relation_confirmed_at timestamptz` (nullable) to separate confirmed from unseen:

- a confirmed proposal writes `customers.relation` and sets `relation_confirmed_at`
- `quo-intake` suppresses lead creation only when the contact's customer has
  `relation IN ('vendor','sub')` AND `relation_confirmed_at IS NOT NULL`
- an unconfirmed or unclassified contact defaults to `relation='customer'` with
  `relation_confirmed_at=null` and still creates a lead — **unknown is not the
  same as not-a-lead, and unexamined defaults to customer**
- an EXISTING open lead is always returned regardless of relation, so a later
  reclassification never orphans a lead a human already worked

The guard fails OPEN: any lookup error creates the lead. A missed lead costs
revenue; a junk lead costs annoyance.

**The guard suppresses nothing until relations are confirmed.** Measured
2026-08-23: all 135 rows in `customers` are `relation='customer'`,
`relation_source='default'`, `relation_confirmed_at IS NULL` — zero confirmed.
Because suppression requires `relation IN ('vendor','sub')` AND
`relation_confirmed_at IS NOT NULL`, deploying the guard is behaviour-neutral
on day one. It does not stop today's lead-per-message spam. The thing that
stops it is confirmed proposals, which need `enrich-contacts` run and reviewed
first. Deploy the guard so it is in place, but do not expect it to change
anything on its own. That the confirmation requirement is a deliberate rule
rather than an unfinished edge is set out in §2b.

**The existing Supabase project is modified additively. Never wiped.** The
accumulated comms history (quo_events, sms_threads, voip_calls, contacts) is
worth keeping.

---

## 2a. The raw log and the spine — migration 016

Applied 2026-08-27 as `016_raw_log_and_spine_projection`. This is the shape of
comms ingestion now, and it replaces the arrangement described above where
application code wrote `messages` directly.

**Two layers, and the boundary between them is the point.**

    provider webhook -> quo_events (RAW LOG)  -> [db trigger] -> messages (SPINE)
                                                              -> call_artifacts

`quo_events` is the **universal raw log**. Every event lands there with its
untouched payload in `raw_payload`, whatever it is and whether or not anything
downstream understands it. It gained `provider` (default `'quo'`),
`received_at`, `projected_at` and `projection_error`. It is append-only in
spirit: nothing edits history, and a payload we cannot parse today is still on
disk for when we can.

`messages` is the **spine** — the one table the application reads.

**Projection is the DATABASE's job, not the application's.** Trigger
`quo_events_project` fires `AFTER INSERT OR UPDATE` on `quo_events` and runs
`sc_quo_events_project()`, which calls `sc_project_raw_event(quo_events)`.
Application code must not write `messages`. Two writers on the same rows is
precisely the failure this removes — see §2b.

Dedupe is `messages_provider_idx`, a unique partial index on
`(provider, provider_message_id) WHERE provider_message_id IS NOT NULL`. As of
2026-08-27 no row has a null `provider_message_id`, so the index covers the
whole table and a duplicate is structurally impossible rather than merely
unlikely.

**`call_artifacts` holds what a call produced**, one row per message per kind
per source. Live counts on 2026-08-27:

| kind | rows | note |
|---|---|---|
| `recording` | 16 | audio, no text content |
| `summary` | 15 | avg 366 chars |
| `transcript` | 15 | avg 2,594, **max 10,579** — never load into a list |
| `next_steps` | 9 | avg 125 chars |

`messages.summary` and `messages.summary_source` are a **display cache**.
`call_artifacts` is authoritative. If the two disagree, the artifact wins.

Artifact events correctly produce no `messages` row. That is why `quo_events`
(1,184) exceeded `messages` (1,138) by 46 on 2026-08-27: exactly 16 recordings
+ 15 summaries + 15 transcripts. Not a defect — do not "fix" it.

**`sc_spine_drift` is the alarm that did not exist on 21 August.**

    select count(*) from sc_spine_drift   -- 0 means everything that arrived reached the app

`projection_defects` records what failed and why. On 2026-08-21 at 03:14 UTC
SMS projection in application code stopped and never ran again; 48 texts landed
in the database and never reached the app, and nothing was watching. A non-zero
drift count is that outage, visible this time. Surface it in the UI.

**Attachments — migration 027 (applied 2026-09-27).** Photos, videos, PDFs and
contact cards sent by text live in `message_media`, one row per file, written by
the projection (`sc_project_raw_event()`) and backfilled from
`quo_events.raw_payload.media` and `sms_threads.media_urls`. Before 027 the
projection kept only the first URL, and in `messages.recording_url` — a photo
filed as a call recording. That write is still there for compatibility and
should go once nothing reads it. Files are copied lazily into the private
`message-media` bucket the first time a thread is opened
(`/api/messages/[id]/media`) and served by short-lived signed URL. Storage paths
are `{org_id}/…` in both `message-media` and `call-audio`, and `storage.objects`
policies scope reads and writes to `get_user_org_ids()`. Before 027 there were
**no** storage policies, which is why the call-audio player never worked.

## 2d. Lines and providers — migration 035 (applied 2026-09-27)

Quo today; other providers or Coy's own AI voice stack later, on the same
schema. **A contact is the other person's number; the line is a property of
each message.** One person calling two of Coy's lines is one thread.

- `org_phone_numbers.provider` (quo | twilio | telnyx | retell | vapi |
  own_stack | other), `provider_number_id`, and `default_lead_source` — a
  tracking number printed only on the website makes its callers website leads.
  Provider was set only where the data proves it (Main and Cell: every message
  projected from Quo); Third is unknown until Coy sets it.
- `messages.phone_number_id` is filled by trigger `messages_set_line`
  (whichever address is one of the org's lines) and was backfilled: 1,466 of
  1,505 messages; 39 involve none of the three lines and stay null.
- `messages.provider` stays per message — where that event came from — and the
  dedupe index `(provider, provider_message_id)` still keys on it.
- More → Phone lines edits label, provider and default source
  (`/api/lines`). A thread shows the line on each message only when it spans
  more than one.
- Seen in the data: (225) 529-9098 is a relay that texts "New call from:
  Baton Rouge Concreters, Number: +1…" for every website call (~150). Each of
  those numbers is a website lead — the first real input for lead sources.

## 2c. One contact is one person — migration 028 (applied 2026-09-27)

A person with two numbers is ONE contact. `contact_phones` lists every number;
the merged-away contact keeps its row, points at the person with
`merged_into_contact_id`, and is excluded from every count.

- **Merges are human-confirmed, one pair at a time.** "Same person as…" on the
  conversation screen. The system never merges on its own; matching names are a
  suggestion at most.
- **Merges are reversible.** `sc_merge_contacts()` records every moved row id in
  `contact_merges.undo_payload`; `sc_unmerge_contacts()` moves back exactly those
  rows still on the winner. A merge that cannot be undone should not be offered.
- **The functions are SECURITY DEFINER with an explicit membership check**, not
  invoker. `voip_calls` has no user write policy and `sms_threads` is
  service-role only, so an invoker merge would move texts and silently leave
  calls behind. Execute is granted to `authenticated` only; a stranger gets
  "contact not found".
- **Everything that resolves a contact follows the pointer.** `quo-intake` v57
  `upsertContact()` hops `merged_into_contact_id`; `sc_quo_events_project()`
  redirects an event keyed to a merged-away contact before projecting it; the
  conversation API redirects to the person. Pointers are kept one level deep —
  merging B into C re-points anything already merged into B.

## 2b. Lead creation — the guard, and what it deliberately does not do

`quo-intake` does not create a NEW lead when the contact's customer is a
**confirmed** vendor or sub: `relation IN ('vendor','sub')` AND
`relation_confirmed_at IS NOT NULL`. It fails OPEN — any lookup error creates
the lead — and an existing open lead is always returned regardless of relation,
so a later reclassification never orphans a lead a human already worked.

**It ships as-is and deliberately does NOT suppress on an unconfirmed
classification.** This is a rule, not a gap waiting to be closed:

> A machine opinion changes what Coy is **asked**. It never changes what he is
> **shown**. Suppression requires a human confirmation.

**Classifying by hand (2026-09-27).** The Customers screen
(`/dashboard/customers/[id]`) lets Coy mark a contact customer, vendor or sub
directly — `PATCH /api/customers/[contactId]/relation`, which writes
`relation_source='manual'`, `relation_confirmed_at` and `relation_confirmed_by`,
and creates the `customers` row when the contact has none. That IS the human
confirmation, so a confirmed vendor or sub is suppressed by the guard; the
screen says so before the tap. The list shows a relation only when it is
confirmed — everything else is **Unclassified**, never the column default.

**The background enricher (2026-09-27, migrations 029–033).** Contacts are
read with the app closed. pg_cron calls the `enrich-contacts` edge function
every minute (v6; 4 readers, each claiming one contact at a time until the
queue is empty or 45 s have passed, so a backlog drains in minutes; source in
`supabase/functions/enrich-contacts/`:
`rules.ts` the rules, `pipeline.ts` one contact, `index.ts` the worker). There
is no button.

- **Who is read** — view `sc_enrich_due` (security_invoker): unnamed, not
  merged, name not human-confirmed, something THEY said (inbound text, or a
  call transcript/summary), quiet for 3 minutes (a burst of texts, or a
  transcript landing after its call, is read once), and never read or changed
  since the last read. A failed read retries after 30 minutes.
- **Claiming** — `sc_enrich_claim(n)` (service role only) inserts a `running`
  row in `contact_enrich_runs`; a partial unique index makes a double claim
  impossible; a run not finished in 10 minutes is reaped as `abandoned`. Every
  read ends as proposed / named / unchanged / no_words / model_error / failed.
- **Auth** — the call carries vault secret `enrich_worker_token`, checked by
  `sc_enrich_worker_authorized()`. Nobody types it or sees it. `verify_jwt` is
  off because the token is not a JWT (see `supabase/config.toml`).
- **Hermes first** — the worker checks `HERMES_API_KEY` is set and Hermes
  `/health` answers BEFORE claiming, so an outage never marks anyone read.
  Hermes URL defaults to §8's; key in Supabase → Edge Functions → Secrets.
- **Transcripts reach the model as US:/THEM:**, never phone numbers.
  "Their words" on a call are the THEM lines whichever side dialled — before
  this, a call Coy placed counted as nothing the caller said.
- **Visible** — `sc_worker_heartbeats` (no tenant data) says ok /
  not_configured / hermes_unreachable / error. The activity line under the
  header (§6) shows it, with every read and the org's waiting count
  (`/api/activity`, `sc_enrich_status()` under RLS).
- **Hermes is slow** — measured 2026-09-27, successful reads take 20–85 s
  (a small model direct is under 10) and a third timed out at 55 s. The
  model timeout is 90 s while the cause on the VPS is found; failed reads
  retry after 30 minutes on their own.
- **Pause** — `select cron.unschedule('enrich-contacts');`

The in-app `/api/enrich` route and its button/15-minute browser runner are
gone: one reader, one place.

**ONE exception to asking first — self-introductions (Coy, 2026-09-27).**
*"If AI is smart enough to create a summary of the transcript, then it should
be smart enough to label the phone number with the name of the person."* A
name is written without asking ONLY when all of these hold:

- the contact has no name, and its name is not human-confirmed (the database
  enforces the second: `sc_guard_contact_identity`);
- the model proposed the name, AND `findSelfIdentification()` independently
  finds the person saying it about themselves — "this is / my name is / it's /
  I'm <name>", or "<name> here" — in an inbound text or on a transcript line
  spoken from the contact's own number. Our side never counts; a call summary
  (no speaker) never counts; the whole name must be said; "this is Mike's
  wife" is not Mike;
- they did not introduce themselves under a second name on that number
  (shared line, relay, or "It's Jose, spelled j o s e" correcting a mishearing)
  — that is a question;
- Coy has not undone that name for that contact before.

It is written with `name_source='machine'`, a `contact_name_claims` row
(`claim_type='self_identification'`, the exact line as `evidence_quote`) and
`name_claim_id`. The row shows **Auto** and, expanded, the line with **Keep**
(→ `name_source='human'`) and **Undo** (name off, claim `rejected`, never
re-applied) — `PATCH /api/name-claims/[id]`. Dry run against the live data on
2026-09-27: 29 of the 176 unnamed contacts qualify.

Everything else is unchanged. A customer / sub / vendor call is NEVER applied
automatically — it can hide a real lead — and a name from anywhere other than
the person's own introduction is still a suggestion to confirm.

**Buckets — one classification (migration 032, 2026-09-27).** Threads
sorts PEOPLE into four buckets: **customer · vendor · personal · spam**
(synopsis §5.3: buckets are code, types are data — `org_contact_subtypes`;
people looking for work are vendor / `looking_for_work`, subs are vendor /
`subcontractor`). `contacts.contact_type` is the truth. `customers.relation`
used to be a second, overlapping system; it is now kept in step by
`sc_classify_contact()`, the one writer (vendor → `vendor`, or `sub` for
subcontractor / looking for work; customer → `customer`), so the quo-intake
lead guard keeps working unchanged. A bucket shows only when
`classification_confirmed_at` (Coy put them there) or `auto_classified_at`
(Dusty filed them — spam only) is set; everyone else is **Unsorted**. The
190 legacy `'customer'` defaults are not customers.

**Spam is the one bucket Dusty files itself** (Coy, 2026-09-27), shown as
"Spam · auto" with **Not spam** in the row. Only when the model says spam AND
`spamSignal()` finds evidence in their words (short-code sender, one-time
passcode, "reply STOP" opt-out, stock scam line) AND Coy has never written
or called back, onto a contact nobody has sorted. Not spam → back to Unsorted,
`auto_classify_blocked_at` set, never auto-filed again. Dry run 2026-09-27:
one contact qualifies (Handoff one-time passwords). Filed spam is not re-read.

An `enrich-contacts` proposal is an opinion. It can raise the question — "this
looks like a sub, confirm?" — and once a human answers, the answer is load
bearing. Until then the lead appears. The cost of that is a junk lead in the
list; the cost of the alternative is a real customer silently disappearing
because a model guessed wrong and nobody was asked. Those are not symmetric.

---

## 3. Costing engine

The engine was recalibrated against real approved work (Gulfline Paving,
quote 24-318-1). Earlier synthetic calibration was unreliable — it contained
two errors that happened to cancel.

**Labor is priced by SQUARE FOOT, not crew-hours.** Reference rates from that
job: $1.43/sqft form-up-and-finish, $2.00/sqft demolition. Production rate
scales with job size — bigger jobs are more efficient per sqft.

**Markup is per cost type, not one global multiplier.** Reference: materials
30.61%, labor 41.77%, equipment 30.12%.

**Discounts touch the PRICE column only.** This is not a preference, it is a
correctness rule. On the reference job a $4,000 discount was entered as a
negative line in BOTH cost and price, which dropped reported cost and inflated
margin from a true 27.7% to a reported 39.4%. The schema enforces
`discount_amount CHECK >= 0` so the old shape is structurally impossible.

Tax lands on the materials subtotal only (~8.08% in-market), not the full bid.

Equipment rental bills by the day.

**Where it lives (2026-09-27): `src/lib/engine/index.ts`.** Pure functions,
tested by `npm test` (`node --test tests/*.test.mjs`). It is the ONLY
place a scope is priced. It is deliberately NOT v34's `computeJob()`, which
prices labour by crew-hours, uses one global markup and adds overhead as a
percentage of labour — all three contradict this section and §4.

- **Nothing is assumed.** A missing length, width or depth is `missing`; a
  missing setting blocks the price and is named. `price()` returns
  `{ priced: false, blocked: [...] }`, never a number built on a guess.
- **Rates come only from `org_cost_settings`.** That table carries the Gulfline
  rates as COLUMN DEFAULTS (migration 004), so `PUT /api/settings/cost` writes
  every field explicitly — null when blank — and a partial save cannot pull in
  numbers nobody entered. The Gulfline figures appear in the settings form as a
  labelled reference, never inside an input.
- **Tax is a pass-through**: charged at cost on the materials subtotal, carried
  in both columns, not marked up. Markup applies to materials before tax.
- **`job_sections.cubic_yards` must not be displayed.** It is a generated
  column, `… * COALESCE(depth_in, 4)`, so a section with no depth reads 14.8
  yards for a 30×40 (verified 2026-09-27). The section API writes `depth_in`
  and `psi` explicitly as null so the schema defaults (4 in, 3000 psi) never
  stand in for a measurement. Fixing the column needs a migration and Coy's
  instruction.
- **Not yet priced:** reinforcement, base, vapor barrier (no rates exist), and
  day-rate equipment. The builder lists them as "not in this price".

---

## 4. Overhead and the bid floor

Overhead has two shapes and they behave differently.

**Off the top — scales with revenue.** 5% owner entity fee + 3% estimator-fee
subaccount + 3% taxes/savings = **11% off gross, 89% operating.** Implemented
as a divisor, not a subtraction.

**The monthly nut — fixed.** ~$3,500–3,600/mo: equipment notes, software,
amortized insurance, fuel and misc. Spread across jobs by **crew-days, not
job count** — the work mixes many sub-$10k jobs with occasional $20–40k ones,
and per-job spreading misprices both ends.

    floor = (hard_cost + job's share of the monthly nut) / 0.89

The floor is a live red line on the discount slider, and it is
**interrogable** — one tap opens the parameters that produced it, including
whether it is standing on estimated or measured crew-days.

**Production days are DISCOVERED, not entered.** A receipt filed to a job
flags that date as a production day for that job; a daily log does the same.
The floor starts from a ~10-day placeholder and is replaced by measured days
as evidence accumulates. Receipt-only counting undercounts (some workdays
have no spend) — that errs conservative, which is the safe direction. Add
one-tap "worked here, no spend" later.

**Pay-yourself is a mode per org.** `fixed_draw` is a monthly target the bid
floor MUST cover. `pct_profit` is taken after a job clears and does NOT raise
the floor. Draws land on a specific day, never smeared evenly.

**Floor implementation (2026-09-27).** `floor()` in `src/lib/engine`:
nut per crew-day = (active overhead as monthly + fixed draw) ÷
`assumed_billable_days` (crew-days per month the nut is spread across); the
job's share = that × `jobs.duration_days`, entered on the builder and labelled
**estimated** until measured days exist. No crew days, no overhead, or no
off-the-top → the floor is blocked and says which.

Overhead is NOT baked into the per-sqft rate — the rate varies too much by
job. The floor's allocation is the one place overhead enters. Do not
double-count it.

---

## 5. Cash-flow dashboard

**Not a bookkeeping tool.** Big-rocks planning — jobs, invoices, draws, the
nut. Precise on big money, deliberately loose on small stuff.

**Three layers on one timeline:** COLLECTED (cash landed), COMMITTED (earned
and owed — the receivables gap), PROJECTED (quoted × close rate). Money in
above the axis, money out below.

**Cash vs accrual is a toggle, not a choice.** The gap between them is "owed
to you."

**Chart structure — settled, do not redesign without cause:**

- ONE continuous ribbon of MONTH bars, wider than the screen, swiped left and
  right across months and years. Current month centered on open.
- The ribbon is always months. No pinch, no grain toggle.
- Tapping a month opens a BAND showing that month's WEEKS — two roads,
  revenue above the line, expense below, net printed per week.
- Tapping a week opens that week's DAYS.
- Depth lives in the band, not the ribbon.
- Weeks first, days on demand. The question a week answers is "was that week
  positive or negative."
- The band sits ABOVE the ribbon so both are on one screen.

**Runway** = cash ÷ monthly burn, shown big. Red under 1 month, orange under 2.

**The green line is cash position** — what's left in the account, running
forward from the last balance check. Bars are flow, the line is level. It
carries its own scale, not the bars'; say so in the UI.

**Starting cash is a manual balance checkpoint (v1).** Later, read-only bank
sync **reconciles the ANCHOR, not transactions** — compare actual against
model-expected, show the gap as drift (untracked burn) as one lump, quietly
correct the anchor. Never import a transaction ledger.

**Known gap:** projection currently spreads pipeline evenly. It needs an
expected start date per quoted job before it means anything. Add the field.

---

## 6. Interface rules

- ScopeCrete header is sticky on every page.
- **Threads is people, Jobs is work (2026-09-27).** Threads chips are the
  buckets: Customers · Vendors · Unsorted · All up front; Needs you, Today,
  Personal, Spam behind the filter. Spam shows only under its own chip. One
  tap in an expanded row files a person (Dusty's guess dashed, the confirmed
  bucket solid, then an optional type). Job stages — New lead, Consultation,
  Estimating, Follow up, W.I.P., Complete, Lost — are the Jobs board
  (Scope renamed Jobs), a Kanban, not Threads chips.
- **Jobs board (migration 034, 2026-09-27)** — `/dashboard/scope`, stages in
  `src/lib/jobs/stages.ts` mapped onto `jobs.status` (`consultation` added;
  W.I.P. holds won → scheduled → in_progress, shown as a tag). Phone: stage
  strip + columns that swipe one per screen; desktop: all seven side by side.
  Cards: customer, address, type (residential / commercial / government =
  `public`), source, sections; Move sheet or one-tap next stage; unreviewed
  machine jobs shown with Accept, never counted. **Customer vs source:**
  `contact_id` / `customer_id` is who pays; `lead_source` (website, referral,
  gc_invite, lead_gen, repeat, direct, other) and `referred_by_contact_id` are
  how it reached us — Jeremy's referral: homeowner is customer, Jeremy the
  referrer; LA Contracting's bid invite: LA Contracting is customer.
  `jobs.job_type` is NOT NULL DEFAULT 'residential', so a new job must pick its
  type rather than inherit the default silently; making it nullable is Coy's
  call. The header is 54px + the 38px activity line = `--sc-head` (92px);
  everything under or beside it measures from that variable.
- Cash flow is a footer TAB, not a slide-out drawer — a side drawer's
  horizontal swipe fights the ribbon's horizontal swipe.
- Settings opens from the header menu. Fixed costs live there AND open from
  the runway cell on the dashboard. One editor, two doors.
- Legend collapses to a chip.
- **Desktop (lg+, 2026-09-27)** takes its LAYOUT from the Claude Design desktop
  screens and its LOOK from v34 (Barlow Condensed / IBM Plex, hi-viz orange) —
  one design system, not two. The footer becomes a left rail; the header gains
  inline search, the primary line, and the unnamed and drift counters. Threads
  is list · conversation · contact rail. The desktop design calls the list
  "Triage"; that word is not used — it is **Threads**, where every channel for
  a contact merges into one conversation. A home dashboard is not designed yet.
- Dusty has two entry points: COLD from the footer emblem (no job context,
  opens a channels list) and HOT from a job (that job preloaded). The header
  must make obvious which one you're in.
- **Dusty v1 (2026-09-27)** is wired: `src/components/v34/dusty-panel.tsx`
  rises from the footer on a phone and slides in from the right on desktop.
  It is HOT on whatever screen is open — a thread, a scope, a customer, or
  cost settings — and COLD anywhere else; the header says which. The browser
  sends only `{kind, id}` from its route; `/api/dusty` fetches the facts itself
  under the session (`src/lib/dusty/context.ts`), so RLS decides what Dusty can
  see and nothing typed in the browser becomes "context". Scope answers use
  the engine's own output, so Dusty quotes exactly the builder's numbers or
  names what blocks them. **Read-only:** no tools, no writes, nothing sent —
  drafts come back as text to copy. **Not stored:** the conversation lives in
  the tab (channels that persist per job/customer, below, are still to come
  and need a table). **The model runs in the Hermes container on the VPS**
  (§8), reached over Tailscale Funnel at `HERMES_URL` with `HERMES_API_KEY`
  (OpenAI-compatible chat completions; Hermes routes via OpenRouter, model
  `HERMES_MODEL`, default `anthropic/claude-3.5-haiku` while testing). No
  model-provider key lives in Vercel. The Vercel route stays the only thing
  that touches customer data — Hermes sees only the context the route sends.
  Hermes must serve Dusty with its tools OFF: the context carries customer
  texts, and a text can carry instructions. The old `/api/chat/dusty` — an
  unauthenticated relay to a private-IP Ollama box — is deleted.
- **Dusty's activity line (2026-09-27)** sits under the header on every
  screen (`src/components/v34/activity-line.tsx`, `/api/activity`). v34's
  StreamBar, fed by hardcoded DREAM_LINES, was never ported; this replaces it
  with **real rows only** — each line is a `contact_enrich_runs` row (reading,
  named, suggested, couldn't read), the waiting count, or the heartbeat. One
  line, cycling every 4 s through the last day; tap to drop down the last
  ~20 with detail, each linking to its thread. A reader that isn't working
  (not configured, Hermes unreachable, error, silent >15 min) **pins** the line
  in amber and stops the cycling. The dot pulses only while a read is running
  or a Dusty reply is streaming. Idle says when something last happened; it
  never invents something happening now.
- Dusty channels persist and are resumable, organized per job/customer.
- **Receipts are camera-first, always.** Photograph, never type. Dusty reads
  vendor, amount, date and clarifies conversationally. Invoices and payments
  stay quick structured forms.
- **The composer never appears to send.** (2026-09-27) Text, email and notes
  have no send path yet — texting waits on 10DLC, and Coy has said sending is
  not needed now. The composer (thread screen, and compact in the row expand)
  writes, keeps a per-device draft, copies it for pasting into Quo, and offers
  Call. Send, attach and hold-to-talk are shown switched off, each with its
  reason. An earlier composer appended messages locally and faked a Dusty reply
  a second later; that must not come back. When sending lands, it replaces the
  disabled Send in `src/components/v34/composer.tsx` — one place.

---

## 7. Agent rules

**Git is the coordination layer.** Any agent can merge to `master` and
deploy — but only when explicitly instructed to, in that conversation, by
Coy. Never on an agent's own initiative, no matter how green the build looks.
Default mode is still branches and PRs; a merge is an exception each time,
not a standing grant carried over from a prior approval. Parallel work uses
separate git worktrees so two agents cannot touch the same files.

**Superadmin agent guardrails — non-negotiable:**

1. The agent gets **named RPC functions**, never raw SQL, and never the
   service-role key anywhere a browser can reach.
2. Every agent action writes to an **audit table**: who, what, when, which org.
3. **Writes require human confirmation** before executing. Read-only first.

Superadmin is cross-tenant. One bad tool call reads or destroys every
contractor's data at once.

**No API route may use the service-role key on a request path reachable by a
browser.** This is not limited to the superadmin agent — it applies to every
route under `src/app/api/`. Service role bypasses RLS entirely, so a
browser-reachable route holding it is a full cross-tenant data leak whether
or not it means to be. Use a session-scoped Supabase client (`@supabase/ssr`,
reading the request's auth cookies) so RLS applies, and derive `org_id` from
the authenticated session's `org_members` row — never from a query param,
request body, or any other caller-supplied value. This rule exists because
`api/dashboard/cashflow/route.ts` shipped in PR #1 with exactly this bug:
service-role client, `org_id` read straight off the query string, no auth
check — any unauthenticated caller could pull any org's full financials.

**Do not apply widening database changes on agent judgment.** Restrictive and
additive changes only, with confirmation.

---

## 8. Deployment

- Web app: Vercel. Preview per branch.
- VPS: agents, telephony, anything holding a socket or needing a persistent
  process.
- **Hermes (Dusty's model) on the VPS** is published with Tailscale Funnel on
  its own port: `https://srv1594563.tail0f2914.ts.net:8443`
  (`/v1/chat/completions`, `/health`), bearer-key auth. Only `/api/dusty` on
  Vercel calls it. **Funnel is per port, not per path** — turning it on for 443
  made OpenClaw and the Hermes dashboard public too. So 8443 carries Hermes
  alone and is public; 443 (`/` OpenClaw, `/hermes-dash`) is `tailscale serve`
  only, tailnet-reachable. Never put anything else on the Funnel port, and test
  public reachability from a device that is NOT on Tailscale.
- Do not run two production paths for the web app.
- `scopecrete.ai` points at the Vercel project; Cloudflare DNS-only for that
  record.

**Per-org Hermes containers are under review.** Clean isolation, but N
long-running processes per N contractors does not survive growth and is the
line item that eats a $79 subscription. Prefer one multi-tenant agent service
with org identity as a request parameter, isolation enforced by RLS and
scoped credentials. Keep containers only where a persistent process is
genuinely required.

---

## 9. Security posture

- Repo is private as of 2026-08-13. It was public before that — treat every
  credential that has ever touched it as compromised and rotate.
- API keys live in environment variables or the process manager's secret
  store. Never in the repo, never in a chat, never in a commit.
- One key per purpose (Claude Code, app server, each agent) so a leak is
  revoked in isolation.
- Anon-role read policies were removed in a prior migration; anon must not
  regain read access to contact, comms, or job data.
- `get_user_org_ids()` is the isolation helper, and the migration off the
  `app.current_org_id` GUC is **done**: measured 2026-09-27, 130 of 149 public
  policies use `get_user_org_ids()` and **0** reference the GUC (the rest are
  `service_role`-only). Any new policy uses the helper.
- **Fixed 2026-09-27: `enrich-contacts` v2 was callable with the public anon
  key.** It had `verify_jwt` on and no auth of its own; the anon key in the
  browser bundle IS a valid JWT, so anyone could invoke it and get contacts'
  phone numbers back (`dry_run` returned whole proposal rows). v3 checks a
  vault token and returns counts only. `verify_jwt` alone is not auth.
- **Known exposure, not yet fixed:** the views `sc_spine_drift` and
  `sc_open_name_questions` are not `security_invoker`, so they run as their
  owner and bypass RLS — a cross-tenant read the day a second org exists.
  Harmless at one org today; fix before onboarding another. Views must be
  created `with (security_invoker = true)`.

---

## 10. Parked

- State and public work — separate engine. Prevailing wage, certified payroll,
  bid bonds, prequal, DOT specs, unit-price bid schedules. Do not bolt onto
  the private-work estimator.
- Outbound texting needs 10DLC registration. Launch voice-first.
- All outbound contact is the contractor himself. No bot-initiated outreach.
