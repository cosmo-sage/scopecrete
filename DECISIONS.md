# ScopeCrete — Decision Record

Ground truth for every agent working this repo. If code disagrees with this
document, the code is wrong or this document is stale — resolve it, don't
guess. Update this file in the same PR that changes the behavior it describes.

Last updated: 2026-08-13

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

Confirmed on the first four real leads: Brad Chaney is a genuine inbound
enquiry, but Luis (a sub who sends crews, 324 messages) and Gary Davis (18
messages about shop cleanup) are not leads at all.

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

**The existing Supabase project is modified additively. Never wiped.** The
accumulated comms history (quo_events, sms_threads, voip_calls, contacts) is
worth keeping.

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
- Cash flow is a footer TAB, not a slide-out drawer — a side drawer's
  horizontal swipe fights the ribbon's horizontal swipe.
- Settings opens from the header menu. Fixed costs live there AND open from
  the runway cell on the dashboard. One editor, two doors.
- Legend collapses to a chip.
- Dusty has two entry points: COLD from the footer emblem (no job context,
  opens a channels list) and HOT from a job (that job preloaded). The header
  must make obvious which one you're in.
- Dusty channels persist and are resumable, organized per job/customer.
- **Receipts are camera-first, always.** Photograph, never type. Dusty reads
  vendor, amount, date and clarifies conversationally. Invoices and payments
  stay quick structured forms.

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
- `get_user_org_ids()` is the isolation helper. Core isolation still needs
  migrating off the `app.current_org_id` GUC to `auth.uid()` + `org_members`.

---

## 10. Parked

- State and public work — separate engine. Prevailing wage, certified payroll,
  bid bonds, prequal, DOT specs, unit-price bid schedules. Do not bolt onto
  the private-work estimator.
- Outbound texting needs 10DLC registration. Launch voice-first.
- All outbound contact is the contractor himself. No bot-initiated outreach.
