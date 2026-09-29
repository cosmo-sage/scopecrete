# Cost cards, the job budget, and proposals — plan

Status: **draft for Coy's review**, 2026-09-29. Nothing here is built yet.
Ground truth is still `DECISIONS.md` (§3 engine, §4 floor, §6 interface); this
plan changes it only where it says so, and DECISIONS is updated in the same PR
as each piece ships.

## What Coy asked for

- **Cost cards** — reusable costs (materials, labor, equipment, subs), each
  tied to the **vendor** it comes from, loadable onto a job while building the
  scope (v34 `ScopeScreen` → Costs tab: cards per group, open to see lines).
  On a phone the cards are the view, because they are easier to read.
- **A spreadsheet-style budget under the Scope Builder on desktop**, the way
  JobTread budgets work: cost groups and their sub-items, each line
  **qty × unit cost = extended cost**, then **markup** → price, **margin**
  shown, **tax** switchable on/off.
- **Proposals** — a customer document built from the job, shown a few ways
  (rarely line by line, but that must be possible), **previewed**, downloaded
  as **PDF**, and sent by **text and/or email**. Coy will upload examples of a
  good proposal; the document layout waits for those.

## What already exists (measured 2026-09-29)

| | state |
|---|---|
| `cost_groups` (name, cost_type, default_markup_pct, sort) | table exists, **0 rows**, no UI |
| `estimates` (version, doc_kind estimate/quote, disclosure_level, discount, hard_cost, floor_amount, accepted_at…) | exists, **0 rows**, no UI |
| `estimate_line_items` (group, section, qty, unit, unit_cost, total_cost, markup_pct, unit_price, total_price, taxable, price_as_of, price_source) | exists, **0 rows** — already the JobTread line shape |
| `documents` (token, expires/revoked, status, sent/viewed/decided, version) + `document_events` (viewed, seconds on page) | exist, **0 rows** — built for a public proposal link with view tracking |
| `invoices`, `payments` | exist, 0 rows |
| `org_cost_settings`, `overhead_items`, `org_reinforcement_types` | exist, **0 rows** — Coy has not entered rates yet |
| Engine `price()` (`src/lib/engine`) | prices sections into `CostLine[]` (materials / labor / equipment) from settings; blocks by name on anything missing |
| v34 `DocView` / `DocPaper` | the mobile proposal builder: estimate vs quote, detail Total / Groups / Line, payment presets, versions, "your side" margin panel, preview, PDF + Send buttons (mock) |
| Sending | **no send path**: texting waits on 10DLC; email is not connected (`org_mailboxes` empty) |
| PDF | no library in the app |

So the database was designed for this and never wired. The work is mostly
UI + API + one missing piece: a **catalog** of cost cards that knows its vendor.

## 1. Cost cards = a catalog (new table)

`cost_items` — one row per thing Coy buys or charges for:

    id, org_id, cost_group_id → cost_groups, name, cost_type
      (materials | labor | equipment | subcontract | other),
    unit (cy, sqft, lf, sheet, stick, bag, day, hr, job, each…),
    unit_cost, taxable, markup_pct (null = the group's / the type's default),
    vendor_contact_id → contacts (the vendor page already exists),
    vendor_sku, price_as_of, price_source (quote, receipt, invoice, typed),
    qty_rule (how it attaches to a scope — below), rule_params jsonb,
    active, sort_order

- **Vendor link.** A vendor's page (Vendor page, Jobs tab today) gets a
  **Price list** tab: the cards that vendor supplies, when each price was last
  confirmed. A card with no vendor is fine (Coy's own labor).
- **qty_rule** says how a card turns a scope into a quantity:
  `per_cy` (concrete, fiber), `per_sqft` (finish, demo, base), `per_lf_perimeter`
  (forming), `per_sheet` / `per_stick` (reinforcement — the 042 rules move here),
  `per_day` (equipment rental, bills by the day per §3), `per_job` (mobilization),
  `manual` (Coy types the qty). Pure functions in `src/lib/engine`, tested like
  `reinforcementQty()`.
- **Nothing assumed** still holds: a card with no unit cost, or a rule that
  needs a depth the section doesn't have, blocks the price and is named.
- **Migration of today's settings.** The per-sqft labor rate, concrete $/cy,
  mobilization, demo and the reinforcement types become cards — but only rows
  Coy actually entered (0 today), never the Gulfline column defaults.
  `org_cost_settings` keeps the non-card things: markups per type, tax rate,
  overage, short-load, off-the-top, crew-days.
- **Assemblies (later, optional).** A named bundle — "Residential driveway":
  concrete + form/finish + mesh + mobilization — loads several cards at once.
  The reinforcement defaults grid (job type × work type) is the first case of
  this and would fold into it.

## 2. The job budget (estimate_line_items)

The budget is the **working estimate** on a job: `estimates` row (version 1,
draft) + its `estimate_line_items`.

- **Loading.** From the Scope Builder, "Add cost card" (search the catalog) or
  "Load assembly". Each card becomes a line in its group, **linked to a
  section** (or the whole job) and its qty computed by its rule from that
  section's takeoff. Coy can override qty or unit cost on the line; an
  overridden number is marked (like "you set it" today) and no longer follows
  the section.
- **The math, per line** (JobTread's):
  `ext cost = qty × unit cost` → `unit price = unit cost × (1 + markup%)` →
  `ext price = qty × unit price` → `margin = (price − cost) ÷ price`.
  Group rows subtotal cost, price and margin. Markup defaults: line → card →
  group → type (§3: materials 30.61 / labor 41.77 / equipment 30.12 are Coy's
  *reference*, entered only if he enters them).
- **Tax** — one switch on the budget: on = sales tax on taxable lines (at
  cost, a pass-through, not marked up — §3); off = no tax line (e.g. an exempt
  customer). Shown as its own row, never folded into a line.
- **Discount** — price column only (§3, the Gulfline rule), a row under the
  subtotal; the bid-floor red line (§4) sits beside the total.
- **Desktop** — a spreadsheet grid under the sections:

      Group / Item | Section | Vendor | Qty | Unit | Unit cost | Ext cost | Markup | Unit price | Ext price | Margin | Tax
      ▾ Concrete                                              $4,120        $5,380   23.4%
          Ready mix 4000 psi | Drive | Gulf Coast RM | 14.8 | cy | $236.13 | $3,495 | 30.6% | …
      ▸ Labor …
      Subtotal · Tax (on) · Discount · Total · Margin · Floor

  Inline-editable cells (qty, unit cost, markup, tax), keyboard friendly,
  collapsible groups. **Phone** — the same lines as v34 cost cards: one card per
  group, total on the card, tap to open the lines, tap a line to edit it in a
  sheet.
- **Engine** — `price()` grows a "from lines" path: it prices the budget's
  lines rather than generating its own. The takeoff and the quantity rules
  stay in the engine; `CostLine[]` becomes `BudgetLine[]` with cost and price.
  Existing tests keep passing; new ones cover the four-step math, tax on/off,
  discount, overrides, and blocked cards.

## 3. The proposal

A proposal is a **frozen version** of the budget: `estimates` gets a new row
per version (v1, v2… as v34 showed, with "▲ $X vs V1"), and the lines are
copied, so what was sent never changes when the budget does.

**Choices on a version** (v34 `DocView`, kept):
- Estimate (non-binding) vs Quote (firm for N days).
- **Layout — what the customer sees:** Total + scope · By section · By cost
  group · Line by line (with v34's warnings: line by line exposes unit costs).
- Payment schedule (10/50/40, 50/50, net on completion, custom).
- Your side (never on the document): cost, profit, margin, floor.

**The document** — sections, in order: company header · prepared for / by ·
scope of work (per section: name, size, depth, psi, and the included items as
plain sentences) · price in the chosen layout · exclusions (the engine's
"not in this price" + Coy's own) · schedule (quote only: working days, cure
before use) · payment schedule · terms & warranty · acceptance (name, date,
signature). Needs a small `org_profile` (company name, logo, license no.,
phone, email, address, default terms/warranty/exclusions text). **The exact
look waits for Coy's example proposals.**

**One renderer.** The proposal is one React component, used for the preview
in the builder, the customer's link, and the PDF — so the preview is exactly
what they receive.

## 4. Preview, PDF, send

- **Preview** — beside the budget on desktop (split), below it on a phone.
- **Customer link** — `documents` row with a random `token`: a public page
  `/p/<token>` that shows that one frozen version, logs `document_events`
  (viewed, time on page), and lets the customer **Accept** (typed name → sets
  `decided_at`, estimate `accepted_at`, job → Won) or decline with a reason.
  No login; the token is the key; Coy can revoke it. The page reads through a
  narrow server route that returns only that document — never the service
  role on a general path (§7).
- **PDF** — recommended: render the same page to PDF on the server with
  headless Chromium (`puppeteer-core` + `@sparticuz/chromium` on Vercel), so
  the PDF is pixel-identical to the preview. Fallback while that's set up:
  the browser's Print → Save as PDF with a print stylesheet.
- **Send by text** — there is no send path yet (10DLC). Today: **Text** opens
  the phone's messages app pre-filled (`sms:` link) with a short note and the
  proposal link; on desktop it copies the note for Quo. Real sending replaces
  that button when texting lands (§6: one place).
- **Send by email** — today: `mailto:` pre-filled with the link. Next: send
  from the app with the PDF attached through an email service (Resend or
  Postmark; one API key in Vercel, a verified sending domain on
  scopecrete.ai), logged on the job and the person's timeline.
- Every send writes `documents.sent_at` and a timeline row on the customer.

## Build order (each a PR, each shippable)

1. **Catalog + vendor price list** — `cost_items` migration, `/api/cost-items`,
   Cost settings → Cost cards (grouped list, add/edit), Vendor page → Price
   list tab. Reinforcement types fold in.
2. **Budget** — lines on the job (`estimates` v-draft + `estimate_line_items`),
   engine from-lines path + tests, desktop grid under the Scope Builder, phone
   cost cards, tax switch, discount, floor.
3. **Proposal builder + preview** — versions, estimate/quote, layouts,
   payment schedule, `org_profile`, the one renderer. Layout from Coy's
   examples.
4. **Customer link + accept** — `/p/<token>`, events, accept/decline, revoke.
5. **PDF** — server render; download button on the proposal and the job.
6. **Email sending** — provider, domain, attach PDF, timeline. (Text sending
   waits on 10DLC.)

## Decisions for Coy

1. **Proposal examples** — upload them (to `docs/design/proposals/`); step 3's
   look is built from them.
2. **Email** — OK to add Resend (or Postmark) and verify a sending address on
   scopecrete.ai? Until then email is `mailto:` with the link.
3. **PDF** — server-rendered Chromium (exact match, heavier) vs browser print
   (free, but depends on the device)? Recommended: Chromium.
4. **Cards replace the rate fields** — the per-sqft labor, concrete $/cy,
   demo, mobilization fields move into cards, and Cost settings keeps only
   markups, tax, overage, off-the-top and crew days. OK?
5. **Customer acceptance** — typed name + date on the link is enough for now,
   or do you need a drawn signature / e-sign service?
