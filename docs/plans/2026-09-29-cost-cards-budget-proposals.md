# Cost cards, the job budget, and proposals — plan

Status: **draft for Coy's review**, 2026-09-29 (revised after Coy's answers and
three example quotes). Nothing here is built yet.
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

## 3. The proposal — what Coy's quotes show

Three of Coy's residential quotes (JobTread, 24-302 Costco curb, 24-315 Hawkins
driveway, 24-372 Watkins driveway repairs; not committed — they carry customer
details) share one shape:

1. **Header** — Sacco Built logo · Quote 24-372-**1** (job number – version) ·
   issue date · status stamp (APPROVED).
2. **Prepared by / Prepared for** — Coy, company, phone, email, office
   address | customer name (and contact person for a business: Costco / Ashley),
   phone, email, address.
3. **Quote details** — job address, one plain paragraph ("This is a turn-key
   price to remove and replace 14' × 18.5' of driveway… 3000 psi at 4" thick…
   wire mesh and rebar dowels as shown in the drawings"), then **Scope of
   work** as dashes (Mobilization, Demolition and removal, Forming, Grading,
   Steel doweling, Pouring and finishing, Wreck forms and cleanup).
4. **The description table — a tree, not a price list.** A top group
   ("Driveway Repairs — 668 Square Feet × $10.78 = $7,200", "2 areas below")
   → areas ("Area 1 – Apron Entrance, 528 sq ft", with a note and **photos**)
   → cost groups (Forming Lumber, Steel, **Ready Mix – Angelle Materials** —
   the vendor is in the group name, Fill, Labor, Equipment) → items with a
   short description ("6" × 6" 10 ga Wire Mesh — 5' × 150' roll", "Mini-Skid
   Steer — Vermeer ST925tx"), sometimes a **product photo**, sometimes a qty
   ("7 Cubic Yards", "1 Each").
   **Prices appear only where Coy chose**: 24-372 shows qty / unit price /
   total on the top group only; 24-315 shows one total on the area; 24-302
   shows only the grand total. Columns (Description · Qty · Unit price ·
   Total) are chosen per quote; each group or item can hide its price, qty or
   itself.
5. **Total**, then **Payment schedule** — named rows with % and amount
   (Deposit 10% · Payment 2 50% · Payment 3 40%; or 100% on completion), each
   with its condition in the terms ("50% once concrete demolition is done and
   we are ready to pour").
6. **Terms** — "Delays due to weather are possible", the warranty (two
   versions in use: a 5-year general warranty, and the newer 1-year limited
   concrete warranty with covered / not-covered table, remedies, Louisiana
   limitations, notice), a collections clause, payment terms.
7. **Acceptance** — "The above specifications, costs, and terms are hereby
   accepted": **typed name or drawn signature**, name printed under it, date
   and time stamped (24-372 is drawn; 24-302/315 typed).

(JobTread's "Payments starting from $X/month — Learn more" is a financing ad;
not carried over.)

**So the budget is a tree, and every node carries its document settings.**
`estimate_line_items` gains `parent_id` (group → area → cost group → item),
`description`, and three switches — `show_on_doc`, `show_qty`,
`show_price` — plus photos (files, §5). The Scope Builder's sections are the
areas; the cost cards' groups sit under them. What JobTread calls "document
columns" is a per-version setting: which of Qty / Unit price / Total print.

**Versions** — a proposal is a frozen copy of the tree: `estimates` row per
version (24-372-**1**, -2…), lines copied, "▲ $X vs V1", so what was sent never
changes when the budget does. Estimate (non-binding) vs Quote (firm N days).
Your side (never printed): cost, profit, margin, floor.

**Templates** — `org_profile` (logo, company, license, phone, email, office
address) and `doc_templates`: named blocks of text Coy reuses — scope-of-work
dash lists per work type, the warranty (both versions), weather, collections,
payment-terms wording — and payment schedule presets with their conditions.
A residential template first, built from these quotes; **commercial and
government templates later** (bid forms, unit-price schedules, bonds,
insurance, alternates — DECISIONS §10 keeps public-work *pricing* a separate
engine, but the proposal can still be templated).

**One renderer.** One React component draws the proposal for the preview in
the builder, the customer's link and the PDF — the preview is exactly what
they receive.

## 4. Preview, PDF, sign, send

- **Preview** — beside the budget on desktop, below it on a phone.
- **Customer link** — `documents` row with a random `token` → public page
  `/p/<token>` showing that one frozen version; `document_events` logs views
  and time on page. **Accept** like JobTread: type your name *or* draw a
  signature (finger or mouse), stamped with date, time and time zone; stored
  as the typed name + a PNG of the drawing, with IP hash and user agent.
  Accepting sets `documents.decided_at`, `estimates.accepted_at`, and moves
  the job to Won. Decline with a reason. Coy can revoke a link. A narrow
  server route returns only that document — never the service role on a
  general path (§7).
- **PDF** — server-rendered with headless Chromium (`puppeteer-core` +
  `@sparticuz/chromium` on Vercel) from the same page, so it matches the
  preview; the signed copy carries the signature. Stored in Supabase Storage
  (`proposals/{org_id}/…`) for now, **S3 later** (Coy) — behind one small
  storage module so the move is one file.
- **Send by text** — no send path yet (10DLC): **Text** opens the phone's
  messages app pre-filled (`sms:`) with a note and the link; on desktop it
  copies the note for Quo.
- **Send by email** — `mailto:` with the link for now. **AgentMail**
  (agentmail.to) later, when Coy wants it: sends from the app with the PDF
  attached, and replies land in Threads.
- Every send writes `documents.sent_at` and a row on the customer's timeline.

## 5. Files — upload, keep, let Dusty read them

Coy: *"I need to be able to upload documents and photos for Dusty to parse."*
Today only texted photos exist (`message_media`, migration 027); nothing can
be uploaded.

- **`files` table** — org, and what it belongs to: `job_id`, `section_id`
  (an area), `contact_id`, `estimate_line_id` (a product photo on a proposal
  line); `kind` (photo, plan, spec, bid invite, quote from a vendor, receipt,
  contract, other), name, mime, size, pages, `storage_path`, uploaded_by,
  `source` (upload · text · email), tags, `show_on_proposal`. RLS by
  `get_user_org_ids()`; private bucket `job-files/{org_id}/…`, short-lived
  signed URLs, same as `message-media`. Texted photos appear here too (a view
  over `message_media`), so a job's photos are one list.
- **Upload** — on a job, a section, a person, and in Dusty's chat: camera or
  file picker on a phone (many at once), drag and drop on desktop. Big plan
  sets upload straight to storage from the browser (resumable), never through
  a Vercel function.
- **Dusty reads them** — a background reader like `enrich-contacts`, with the
  same shape (claim, run row, heartbeat, retries):
  - photos → Hermes with the image (Haiku 4.5 reads images): what it shows,
    anything measurable written on it;
  - PDFs with text → text pulled out (no model), then Hermes summarises;
    scanned PDFs → page images → Hermes;
  - output: `files.summary`, extracted text for search, and **proposals** —
    "Bid due Oct 14", "Spec calls for 4000 psi, #4 at 12" o.c.", "Receipt:
    Home Depot $312.44" — shown for Coy to apply, never applied on their own
    (§2b: a machine opinion changes what Coy is asked, not what he is shown).
    A receipt proposal files a cost on the job (camera-first receipts, §6).
  - Dusty's chat context includes a job's file summaries, and he can be
    asked about one file ("what does page 3 of the plans say about joints?").
- **Proposal photos** — any job photo can be ticked onto an area or a line of
  the proposal, as the Watkins quote does.

## Build order (each a PR, each shippable)

1. **Files** — table, bucket, upload on job / section / person, gallery,
   texted photos merged in. (Needed by the proposal and by Dusty.)
2. **Cost cards + vendor price list** — `cost_items`, Cost settings → Cost
   cards, Vendor page → Price list; reinforcement types and the rate fields
   fold into cards (Coy: agreed).
3. **Budget tree** — sections as areas, cards under them, JobTread math, tax
   switch, discount, floor; desktop grid under the Scope Builder, phone cost
   cards; per-node show-on-document switches.
4. **Proposal builder + preview** — versions, estimate/quote, columns,
   `org_profile`, `doc_templates` (scope dashes, both warranties, payment
   schedules with conditions), the one renderer, the residential template
   from Coy's quotes.
5. **Customer link, sign, accept** — `/p/<token>`, typed or drawn signature,
   events, revoke, job → Won.
6. **PDF** — server render, stored, download on the proposal and the job.
7. **Dusty reads files** — the file reader, summaries, proposals from
   documents and photos, receipts.
8. **Later** — AgentMail email with the PDF attached; S3 storage;
   commercial and government templates; texting when 10DLC lands.

## Answered (Coy, 2026-09-29)

- Examples — three residential quotes (above). Commercial and government
  designs to be refined later.
- Email — AgentMail (agentmail.to), not set up yet; `mailto:` until then.
- PDF — rendered on the server; S3 later.
- Rates move onto cost cards — agreed.
- Acceptance — typed and drawn, like JobTread.

## Still open

1. **Warranty** — which one goes on new quotes by default: the 5-year general
   or the 1-year limited concrete warranty (24-372)? Both become templates.
2. **Quote numbers** — keep JobTread's `24-372-1` (year? – job – version) and
   continue from the last number, or start fresh?
3. **Order** — files first (it unblocks Dusty and proposal photos), then cost
   cards? Or cost cards first?
