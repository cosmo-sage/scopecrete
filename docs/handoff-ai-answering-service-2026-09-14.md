# Handoff — AI answering service, schema applied

**For the next agent working this repo. Read DECISIONS.md first; this is a
delta on top of it, not a replacement.**

Date: 2026-09-14 · Project `cxiusuewtrvcpqequueh` · Branch
`claude/ai-answering-migration` (`06eca9f`), **not merged to master**.

---

## 1. What happened

Coy brought a schema draft for a multi-tenant AI phone answering service
(Retell AI + Twilio). It was reviewed against the live database, rewritten, and
**applied on his explicit instruction** — DECISIONS.md §7 requires that for any
database change, and he gave it in the conversation.

The draft as written would have caused three real problems. They are recorded
here because the same mistakes are easy to repeat.

**It would have created a second org.** The draft did
`INSERT INTO orgs (slug, ...) VALUES ('sacco-builders', ...) ON CONFLICT (slug)
DO NOTHING`. The live org's slug is **`sbuild`**, so the conflict never fires
and a new empty org is inserted. The phone number and voice agent would attach
to *that*, and none of the 173 contacts / 1,341 messages / 57 leads belong to
it. Every screen would render empty and the obvious suspect would be the app.

**Its `contact_timeline` view had no `security_invoker`.** On PostgreSQL 17 a
view runs as its **owner** by default and therefore **bypasses RLS**. That view
carries message bodies. Without the flag it would serve every org's
conversations to any authenticated caller — in a migration whose entire purpose
is going multi-tenant.

**Step 3 targeted `call_recordings`, which does not exist.** Call media lives in
`voip_calls` + `call_artifacts`.

Six smaller corrections are listed in the header of
`migrations/025_ai_answering_service.sql`.

---

## 2. What is in the database now

### Extended: `org_phone_numbers`

The draft created a new `phone_numbers` table. **`org_phone_numbers` already
existed**, already held all three of Coy's numbers, and is already read by
`src/app/api/threads/route.ts` to decide which side of a conversation is "us".
A second table would mean the threads list and the call router disagreeing
about which numbers belong to the org. It was extended instead.

New columns: `twilio_sid`, `ai_enabled`, `routing_mode`, `forward_to_phone`,
`business_hours` (jsonb), `after_hours_action`, `updated_at`. Check constraints
on `routing_mode` and `after_hours_action`; `phone_e164` is now UNIQUE.

Existing column names were kept — **`phone_e164` not `phone_number`, `active`
not `is_active`.** Code that assumes the draft's names will not compile.

| phone_e164 | label | note |
|---|---|---|
| +12253782458 | Main | `is_primary = true` |
| +12255083258 | Third | **the Google Voice number** |
| +19858608287 | Cell | |

### New: `voice_agents`

Prompt, voice, transfer rules, per org. `provider` / `provider_agent_id` are
deliberately generic so Retell can be swapped without a schema change. RLS is
`voice_agents_rw`, `FOR ALL`, scoped to `get_user_org_ids()` — **FOR ALL, not
FOR SELECT**, because the contractor edits his own prompt from the dashboard and
a read-only policy makes that screen fail silently on save. A partial UNIQUE
index enforces one default agent per org.

### New columns for per-number reporting

`phone_number_id` on `messages`, `voip_calls`, `quo_events`, `sms_threads`;
`source_phone_number_id` and `retell_call_id` on `leads`. All nullable, all
indexed partially. **Nothing was backfilled** — the 1,341 existing rows have
NULL and predate the service.

The draft omitted `messages`. That is the spine every screen reads, so it is the
one table per-client reporting has to group by.

### New: `contact_timeline`

```sql
create view public.contact_timeline with (security_invoker = true) as
select ... from public.messages m where m.contact_id is not null;
```

**One SELECT over `messages`, not a three-way UNION over raw tables.** The draft
unioned `quo_events` + `voip_calls` + `inbound_emails`, which rebuilds from raw
parts what migration 016 already built. Per DECISIONS.md §2a, `quo_events` is
the raw log and **`messages` is the spine — "the one table the application
reads."** `messages` already carries sms and call, deduped by
`messages_provider_idx`, and email joins it free once email projects there
(`inbound_emails` has 0 rows today).

It deliberately does **not** select `m.transcript`. Transcripts reach ~10,600
characters; it exposes `has_transcript` instead. Fetch the body per message on
expand, as the app already does. There is also no `ORDER BY` in the view — order
in the query.

---

## 3. Verification — done, with the failing result named

Every check was run after applying. The point of each is the failure case.

| check | result | failure would mean |
|---|---|---|
| `select count(*) from orgs` | **1** | >1 → the draft's INSERT ran, data is stranded |
| `to_regclass('public.phone_numbers')` | **NULL** | non-null → duplicate table exists |
| `contact_timeline` security_invoker | **true** | NOT SET → cross-tenant leak |
| timeline as a **non-member** | **0 rows** | >0 → RLS is not applying |
| timeline as **Coy** | **1,340 rows** | 0 → reading the wrong table |
| `org_phone_numbers where ai_enabled` | **0** | >0 → an AI is live on a real line |
| new columns | **7 of 7** | — |
| security advisor | **0 new findings** | — |

The two role-switched queries are the ones that matter: the flag being set is
not the same as the filter working. 0 for a stranger and 1,340 for Coy is the
proof.

**1,340, not 1,341** — one `messages` row has a null `contact_id` and is
filtered out. Of those 1,340, only **845 carry any preview text**. The other
**495 are calls with no summary** — missed calls where nothing was captured.
That number is the business case for this whole feature.

---

## 4. State of play — what is and is not true

**`ai_enabled` is `false` on all three numbers.** Applying this migration put no
AI on any live line. That was deliberate: answering a customer's call is a
decision, not a side effect of DDL. Nothing happens until someone sets it.

**No Twilio account, no Retell agent, no webhook, no application code exists.**
This migration is schema only. The next agent should not assume any of it is
wired.

**The Google Voice number is a problem that is not solved.** +12255083258 is a
Google Voice line. GV offers no SIP and no webhooks — only call forwarding — and
the documented blocker is that adding a Twilio number as a GV forwarding
destination fails because Google's verification code does not reach it the way
GV expects. SMS does not forward at all. Porting out works but is frequently
rejected. **Recommendation on file: buy a Twilio number, build and test against
that, and treat porting the GV number as a separate later decision.** Do not let
it block the build.

---

## 5. Two things left alone, on purpose

**`sc_spine_drift` and `sc_open_name_questions` are SECURITY DEFINER views** —
no `security_invoker`, so they run as owner and ignore RLS. The Supabase
security advisor flags both at ERROR level, independently of this review. They
are invisible with one org and become **real cross-tenant leaks the day a second
contractor is onboarded**, which is precisely what this migration is building
toward. The fix is two lines and is in a comment at the bottom of the migration
file. Left out because it is unrelated to the AI service and deserves its own
reviewable change.

```sql
alter view public.sc_spine_drift set (security_invoker = true);
alter view public.sc_open_name_questions set (security_invoker = true);
```

**§2b — every inbound message already creates a lead.** An AI that answers every
missed call will create a lead per call. That interaction should be decided
before the service goes live, not discovered afterwards.

---

## 6. Things that are still open, from earlier work

Carried forward so they are not lost:

- **The voicemail sweep has never run.** `call_artifacts` holds 2 voicemails, 0
  with `storage_path`, and only 2 calls have `voicemail_checked_at`. The
  work-order-11 code is deployed and unexercised. Invoking it needs Coy's
  machine — this sandbox's egress policy blocks the Supabase host.
- **Nothing creates a `jobs` row.** `jobs` = 0 is an empty table with no writer
  anywhere in the app, API or edge functions. Scope will stay empty until that
  is built. Explicit-vs-implicit job creation is an open product question.
- **`coysacco@gmail.com` cannot sign in** — Google-only account, no password,
  and no Google button on the sign-in page. `admin@saccobuilt.com` works.
- **Two hardcoded endpoints on the public customer door** are broken from
  Vercel: `api/chat/dusty` points at a Tailscale IP `http://100.113.194.47:8000`,
  and `api/estimate` at `https://scopecrete.ai/bid-engine/calculate`, a domain
  not pointed at this project.

---

## 7. Rules that governed this work, and should govern the next

- **DECISIONS.md §7** — a database change or a merge to `master` happens only
  when Coy says so in that conversation. It is not a standing grant. This
  migration was applied under an explicit instruction; the branch is **not
  merged**.
- **Check RLS before writing a query.** A query verified as service role can
  return zero rows through a session client. That has bitten this project.
- **A hardcoded fallback is not a live value.** If the code can produce a number
  with the database empty, it is a placeholder and must render as one. Four
  fabricated figures shipped to Coy's phone before this rule was adopted.
- **Read the file before changing it.** Three separate work orders asked for
  fixes to things that were already correct; the real defect was always one
  layer below the visible control.
- **Write pass conditions that can fail.** A check like "shows a real
  percentage" cannot be falsified and will confirm its own bug. Every check in
  §3 names the failing result.
