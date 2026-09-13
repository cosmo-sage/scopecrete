# Architecture note — Quo → Delight.ai, Supabase → Firebase

Status: **assessment, no code changed.** 2026-09-13.

Asked: move comms from Quo to Delight.ai, and move the database from Supabase
to Firebase, for a simpler architecture.

**My recommendation is no to both, and the reasons are different.** Delight.ai
is not a replacement for Quo — it is a different product category at roughly
20× the cost, and its core behaviour is the thing DECISIONS.md §10 forbids.
Firebase is a real product that would work, but the relational model is the
substrate the moat runs on, and "simpler" is not what the migration buys.

There is a real problem underneath both asks. It is at the end, in §5.

---

## 0. Where the project actually is

This sandbox started on a branch 54 commits behind. Everything through work
order 12 is on `origin/master` at `1f780c3`; nothing was lost.

Live database, measured today:

| | |
|---|---|
| tables / views | **63 / 5** |
| RLS policies | **148** |
| triggers / functions | **24 / 72** |
| messages | **1,341** — all `provider='quo'` |
| contacts | 173 |
| voip_calls | 528 |
| quo_events | 1,490 |
| call_artifacts | 230 (50 transcripts, 2 voicemails) |
| leads | 57 |
| span | 2026-06-22 → **2026-09-13 (today)** |

Two things follow from that table and they frame everything below.

**This is a live, ingesting system**, not a greenfield choice. Every count has
grown since 31 August (messages 1,153 → 1,341; leads 21 → 57; calls 462 → 528).
A migration is a cutover on a system taking real traffic.

**100% of the comms spine is Quo-shaped.** All 1,341 messages carry
`provider='quo'`, and the dedupe index, the migration-016 projection trigger,
and the `call_artifacts` join all key on `provider_message_id`.

Also worth knowing before any of this: **the voicemail sweep still has not
run.** `call_artifacts` holds 2 voicemails, 0 with `storage_path`, and only 2
calls have `voicemail_checked_at`. The work-order-11 code is deployed in source
and unexercised. That is still the cheapest unclaimed value in the system, and
both migrations below would strand it.

---

## 1. Delight.ai is not a Quo replacement

I could not reach `delight.ai` directly — the egress proxy blocks it — so this
is from Sendbird's launch material, their G2 listing, and third-party pricing
data. Treat the capability claims as vendor-stated, not verified by me.

**It is a different category.** Quo is telephony: it owns the phone number, the
PSTN leg, SMS, recordings, transcripts and voicemail. Delight.ai is an AI
concierge — an agent layer that operates *over* channels (chat, voice, SMS,
email, WhatsApp). Nothing I found says it issues you a business phone number and
becomes your carrier. So this is not a swap. In the most likely shape it is an
**addition** on top of Quo, and you would be paying for both.

**The cost is the decisive fact.** Third-party procurement data puts Delight.ai
enterprise deployments at **$40,000–$150,000 per year**, with base subscriptions
around **$1,199–$1,799/month**, quote-only, aimed at mid-market and enterprise.

Set that against ScopeCrete's own pricing, which is in the repo's landing page:
Solo **$79**, Growth **$199**, Pro **$499** per month. At the *base* rate you
need roughly **15 to 23 Solo subscribers just to cover the AI vendor**, before
hosting, before telephony, before Coy is paid. DECISIONS.md §8 already names
this failure mode — per-org containers were rejected as "the line item that eats
a $79 subscription." This is that line item, an order of magnitude larger.

**It contradicts DECISIONS.md §10 head-on.** The document says: *"All outbound
contact is the contractor himself. No bot-initiated outreach."* Delight.ai's
headline features are autonomous end-to-end resolution and proactive outbound
calling. Adopting it means either reversing §10 — a real product decision, and
yours to make — or paying enterprise money for a fraction of what it does.

**And it changes nothing about 10DLC.** §10 parks outbound texting behind 10DLC
registration. That is a carrier regulation, not a vendor feature. Switching
vendors does not move it.

**What would the migration cost?** Four edge functions (`quo-intake`,
`backfill-call-media`, `enrich-contacts`, `quo-diagnose`), the projection
trigger, the dedupe index, and a re-keying of 1,341 messages and 1,490 raw
events. Set against: nothing currently broken that I found. The receptionist gap
turned out to be an unqueried endpoint (`/v1/call-voicemails/`), not a vendor
limitation, and `quo-diagnose` proved the 404s were truthful.

### Where the ask is right

If the goal behind "move to Delight.ai" is **an AI that answers when Coy
cannot**, that is a genuine gap and Quo does not fill it. 403 of 528 calls have
no recording — the signature of a missed call. That is the receptionist problem
and it is worth solving.

But the proportionate tool is a **usage-priced voice-AI layer over the number
you already own** — Vapi, Retell, Bland, or Twilio's ConversationRelay — at
cents per minute, not an enterprise CX platform at $1,199/month. Same outcome,
two orders of magnitude cheaper, and it does not require replacing the comms
spine that three months of history lives in.

**Before deciding: get an actual quote.** My number is third-party. If Sendbird
offers a small-business tier that fits a $79 product, that changes this analysis
and I would want to see it.

---

## 2. Firebase would work, and would cost more than it saves

Firebase is a good product. This is not a quality argument. It is an argument
about fit.

**The product is relational, and the relational part is the moat.**
DECISIONS.md §1 says the moat is the concrete math. That math is:

- §2 — `org → contacts → jobs → job_sections`, with invoices, payments,
  receipts, logs and estimates all hanging off the job so quoted-vs-actual is
  live rather than reconstructed.
- §4 — the bid floor allocates the monthly nut **by crew-days**, discovered from
  receipts and daily logs across jobs.
- §5 — the cash-flow dashboard aggregates COLLECTED / COMMITTED / PROJECTED
  across jobs, invoices, payments, receipts, overhead and cost settings, bucketed
  by month, then week, then day.

§5 is a multi-table aggregate over a date range. **Firestore has no joins and no
GROUP BY.** You would either denormalize aggressively — and own every
consistency bug that creates — or fan out reads client-side and aggregate in the
browser. The cash-flow screen is the single worst-shaped query in the app for a
document store, and it is the screen DECISIONS.md spends the most words on.

**A correctness rule would stop being enforceable.** §3: discounts touch the
price column only, enforced by `discount_amount CHECK >= 0`. That constraint
exists because on the reference job a $4,000 discount was entered against *both*
cost and price, inflating reported margin from a true 27.7% to 39.4%. The
document says the schema makes the old shape "structurally impossible."
**Firestore has no CHECK constraints.** That guardrail becomes application
code — which is exactly where it failed the first time.

**148 RLS policies become hand-written security rules.** This is the closest fit
of anything here, since `org_id` is already denormalized onto every row. But
`org_id = ANY(get_user_org_ids())` is a subquery; in Firestore it becomes custom
claims baked into the token, re-minted whenever membership changes. Workable,
and a rewrite rather than a port. Note §9 says core isolation is *already*
mid-migration off the `app.current_org_id` GUC — this would abandon that work
partway and restart it in a different language.

**Two things have no equivalent.** The migration-016 trigger that projects
`quo_events → messages` becomes a Cloud Function and loses atomicity with the
insert. And `sc_spine_drift` — the SQL view that is the alarm for messages that
arrived but never reached the app — becomes a scheduled job you have to
remember to write. That view is currently reading **1**, and it earned its keep
by catching a real gap.

**And §2 says the data does not move.** *"The existing Supabase project is
modified additively. Never wiped."* Three months of irreplaceable comms history,
on a project that has already been accidentally deleted once.

### Test the word "simpler"

Firebase is genuinely simpler for auth, mobile SDKs, real-time subscriptions,
file storage, and not running migrations. Supabase already provides auth,
storage, realtime and edge functions. The delta is: **no migrations, and a
document model instead of a relational one.**

So it is worth asking what has actually hurt over twelve work orders:

| What went wrong | Would Firebase have prevented it? |
|---|---|
| Vercel pointed at a deleted Supabase project | **No** — config drift |
| `SUPABASE_SERVICE_ROLE_KEY` deleted, build broke | **No** — same class |
| Service-role key on browser-reachable routes | **No** — same mistake is possible |
| RLS on a dead `app.current_org_id` GUC | **Partly** — no GUCs to get stale |
| Fabricated `?? 11` fallbacks shown as live data | **No** — application code |
| A hardcoded password in the repo | **No** |
| Two unrelated auth systems | **No** |

**Six of seven are configuration and application discipline, not the database.**
They would recur unchanged. The one Firebase genuinely helps with is the GUC —
and finishing the §9 migration fixes that in an afternoon.

---

## 3. What the real problem probably is

Both asks point the same direction: *there are too many moving parts and too
many places for configuration to rot.* That is a fair reading, and it is true.

The moving parts are **not** the database. They are:

1. **Four edge functions**, one of which (`quo-diagnose`) is a throwaway that
   should be deleted, and one of which (`backfill-call-media`) is a one-time job
   still holding permanent residence.
2. **Two deploy targets** — Vercel and Supabase Functions — with independent
   env-var sets that have already drifted apart twice.
3. **An unfinished isolation migration** (§9) leaving policies in two dialects.
4. **A public customer door** (`/api/estimate`, `/api/parse`, `/api/chat/dusty`)
   with a hardcoded Tailscale IP and a domain that is not pointed at the project —
   both flagged in work order 10 and both still broken.

Every one of those is cheaper to fix than either migration, and none requires a
vendor change.

---

## 4. Recommendation

**Quo → Delight.ai: no**, as a replacement. It is a different category at
enterprise pricing, and its defining behaviour is the one §10 rules out. If the
AI receptionist is the actual goal, price a usage-billed voice layer over the
existing number and keep the spine. Get a real Delight.ai quote before treating
my cost figure as final.

**Supabase → Firebase: no.** The relational model carries the costing engine,
the bid floor and the cash-flow dashboard, and one correctness rule (§3's
discount constraint) stops being enforceable in a document store. The pain that
prompted the question is configuration drift, and it follows you.

**Instead, in order:**

1. Run the voicemail sweep. It is built, deployed and unexercised, and 403
   missed calls are sitting behind it.
2. Delete `quo-diagnose`; retire `backfill-call-media` once the sweep is done.
3. Finish the §9 isolation migration so there is one policy dialect.
4. Decide the public door's fate — it has two broken hardcoded endpoints.
5. If consolidation is still the goal after that, the candidate worth costing is
   **hosting**, not the database: Supabase and Vercel both run functions, and
   collapsing to one removes an entire env-var surface.

---

## 5. What would change my answer

I would revisit Firebase if the product moved away from multi-table financial
aggregation — but §5 is the product, so that is unlikely.

I would revisit Delight.ai on any of: a published small-business tier under
~$200/month; confirmation that it replaces telephony rather than layering on it;
or a decision to reverse §10 and let a bot talk to customers unsupervised. The
third is a product call and it is yours, not mine — but it should be made
deliberately, not arrived at by picking a vendor whose product assumes it.

**Sources for the Delight.ai figures** (their own site was egress-blocked from
this sandbox, so none of this is first-hand):
Sendbird's launch release, the G2 marketplace listing, and third-party pricing
aggregators. Capability claims are vendor-stated.
