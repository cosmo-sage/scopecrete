# Handoff: Job › Proposal (desktop + mobile)

Target repo: `cosmo-sage/scopecrete` · suggested branch: `claude/job-proposal` (off `claude/feedback`)
Companion package: `../design_handoff_plan_room_takeoff/` (Plan Room v2 — takeoff → budget). Together they cover Plan room → Budget → Proposal.

## Overview
A panel inside the Jobs page that renders the customer-facing proposal, priced live from the job budget plus the organisation's overhead % and default margin (Cash settings). The contractor sees cost + OH + profit on the left, the document in the middle, Dusty (AI) on the right. Every section, pricing group, line and individual price can be toggled on/off (SumoQuote-style), warranty/contract templates load by project type and are editable in place or via Dusty, the draw schedule is editable with a hard reconciliation check, and the result exports to PDF. A phone layout is included.

## About the design files
`Proposal.dc.html` is a **design reference built in HTML** — a prototype, not production code. Recreate in the existing Next.js/React app using v34 patterns (`src/components/v34/*`, `src/lib/v34/tokens.ts`, `src/styles/v34-shell.css`). Open the file in a browser (needs `support.js` and `image-slot.js` beside it) to click every state. `reference/` holds three won JobTread quotes the user supplied — the residential layout, copy and warranty text derive from them.

## Fidelity
**High-fidelity.** Shell, colors, type, spacing and copy are final. The cover image is a user-fillable slot (drag/drop); PDF export is a stub (`exported` flag).

## Layout (desktop, 1440×900 reference)
Rail 84 | **Job summary aside 300** | **Document column (flex, ground `#E9E4DA`)** | **Dusty 360**. Shell, header (activity light + line), rail and Dusty panel are the existing v34 components — reuse.

### Header activity light (new behavior)
8px dot + 3px halo, keyed to Dusty's state. `@keyframes dustyPulse` scales 1→1.35, opacity 1→.55.
- idle `#B3AA9A`, no halo, no animation
- reading `#3F74C9`, halo `rgba(63,116,201,.18)`, pulse 2.4s
- working `#C98A12`, halo `rgba(201,138,18,.2)`, pulse 1.2s
- done `#2F8A5B`, halo `rgba(47,138,91,.18)`, pulse 3.5s
- needs-you `#B5412C`, halo `rgba(181,65,44,.22)`, pulse 0.7s
Derived: failed check → needs-you; export complete → done; Dusty editing text → working.

### Job summary aside (white, right border `#E6DCC8`)
1. Job block: kicker "JOB 24-372" + status tag (`#F7EBC9`/`#6B4E12` "Proposal draft"), title Lexend 700 18px, customer line 12.5px `#5E5A52`.
2. **Project type** segmented control (Residential / Commercial / Government, 26px, active `#2A2A2A` on `#FBF6EC`) + "+" to add a type. Two help lines: what the type changes; defaults live in **Cash › Project types** (OH %, margin, tax, pricing columns, draw schedule, which templates load). Types are user-extensible.
3. Job tabs: Summary · Budget · **Proposal** (active, `#B85A3C` underline) · Files.
4. **Cost → price** (kicker link "From budget"): Materials `#1E5AA8`, Labor `#D97757`, Equipment `#6A55B0`, Misc `#8C8578` each with amount; stacked proportion bar 8px; Direct cost; Overhead 15% (from Cash); Profit with **editable margin** — inline number input + range slider 5–45%; Price (Lexend 700 18px); note "Calculated $X → rounded to $Y (+Δ). Rounds up to nearest $50."
   - Formula: `oh = direct × ohPct`; `calc = (direct + oh) / (1 − margin)`; `price = ceil(calc / 50) × 50`; `profit = price − direct − oh`.
5. **Profit split with sub**: No sub / 20 / 80 / 30 / 70. When set, two tiles: "Sacco keeps $" and "Sub · name $". Internal only — never changes the customer price or appears in the document.
6. **Templates pulled in**: Warranty · Contract agreement · Cover style, each a chip row (active chip `#2A2A2A`). Options vary by type (see Templates). Footer card explains they live in **Documents › Templates**, filed by type; page edits stay on the proposal unless "Save as template".

### Document column
Toolbar 44px white: title "Proposal 24-372-1" with "N pages · n/8 sections" under it; quick toggles **Item prices · Qty · unit · Tax line** (chips, on = `#F6E2D8`/`#B85A3C`); link icon (send signing link); **Export PDF** primary `#B85A3C` → green "PDF exported ✓". Export is **disabled** (`#B3AA9A`, label "Fix draws to export") while the draw schedule ≠ total.

Scroller: pages are fluid `width:100%; max-width:720px`, white, shadow `0 2px 10px rgba(42,32,20,.1)`. Each section carries a **pill at its top-right** (`rgba(251,246,236,.94)`, border `#E6DCC8`): label + 26×16 switch (on `#2F8A5B`, off `#D9CDB6`). A hidden section collapses to a 44px dashed bar (`#C9BDA6`) "SECTION · hidden from the proposal · tap to include".

Sections, in order (all toggleable):
1. **Cover** — `<image-slot>` drop zone 420px tall (hint text differs by type) over a `#2A2A2A` band: logo, kicker (Proposal / Bid proposal / Bid submission), title Lexend 700 26px, "Prepared for", address, date. Off by default for Government.
2. **Header** — logo, doc title (Quote / Proposal / Bid) + number, "Issued … valid 30 days"; Prepared by / Prepared for two-column 11.5px. Government adds a 3-cell strip: Solicitation, LA contractor lic., Bid bond.
3. **Scope** — kicker `#9A4527`, intro paragraph (homeowner vs. spec voice by type), numbered 8-step list in two columns (number Lexend 600 11px `#B85A3C`), 3 spec tiles (Concrete / Thickness / Reinforcing). Italic note: pulled from Plan room takeoff + budget.
4. **Pricing** — header row with the three quick toggles repeated; columns `1fr 110px`, or `1fr 70px 90px 100px` when Qty·unit is on; 1.5px `#2A2A2A` rules above header and above totals.
   - **Group row**: 22×13 switch (show/hide group) · name 13px/600 + optional "OPTIONAL ADD-ON" outline tag `#1E5AA8` · desc 11px · qty · unit price · total Lexend 600 13px. **Price-eye** (16px circle, right gutter): slashed red `#B5412C` = price hidden → total renders "—".
   - **Line rows** (indent 30px, dotted `#EDE6D8` rule): ●/○ show-hide dot (`#2F8A5B` / `#B3AA9A`) · name + grey note · price ("included" when item prices off) · own price-eye.
   - Totals right-aligned 260px: Subtotal + "Sales tax · materials · 9.95%" when tax on; Total Lexend 700 17px; "Optional add-ons not included: $".
   - Sell-side maths: `markup = price / Σ(non-optional item costs)`; each visible item sells at `cost × markup`; group total = Σ visible items; hidden lines drop out of the total; optional groups excluded from Total.
5. **Payments** — kicker + live check (green "✓ draws total $" / red "⚠ …"). Each draw: `%` input (28px) · description input (flex) · `$` input (72px) · × remove in the right gutter. Typing % clears $, typing $ clears % (`row.amt` wins when set). "+ Draw" adds the remaining % · "Reset to {type} default". **Reconciliation banner** (`#F7DCD6`/`#E7B4A8`/`#8E2B1C`) when Σ ≠ total: "Draws don't add up. $Δ over/short · N% of the proposal. Export is blocked…" + button "Put the difference on the last draw". Residential also shows "Financing available from ~$/month".
   Defaults: Residential 10/50/40 (deposit · materials on site & demo done · completion); Commercial 90 progress (AIA G702/G703, net 30) / 10 retainage; Government 95 monthly estimates / 5 retainage (LA R.S. 38:2248).
6. **Warranty** — title and body `contentEditable`; "Template · name" tag; **Edit with Dusty** chip (Dusty sprite 12px, border `#D97757`) opens Dusty with rewrite prompts (2-year term · plain English · save as template). Hover on editable = 1px dashed `#C9BDA6` outline; focus = 2px `#D97757`.
7. **Terms** — same pattern; each clause heading+body editable, × remove in gutter, "+ Clause". Dusty chip offers e.g. "Add 811 clause" (appends a clause).
8. **Sign** — acceptance line; two signature rules: customer (Kalam placeholder "sign on phone or in the link", label by type: Owner / Authorized representative / Awarding authority) and Coy Sacco. Mobile shows a finger-sign box. (E-sign is a later phase.)

"+ Add a section: photos & plan pages · options comparison · references · custom text" under the last page.

### Dusty panel (existing component; content is contextual)
Messages: pricing math with facts list (Materials/Labor/Equipment/Misc/OH/Profit) and "drag the margin to reprice"; type-specific advice citing won quotes; split explanation; export state; **draw-mismatch warning pinned first** with "Fix the last draw" / "Reset draws"; when Edit-with-Dusty is active, an editing prompt with quick options. Composer placeholder: 'Ask Dusty… "rewrite the scope for a homeowner"'.

## Mobile (390×844)
- Top bar 48px: **Job** button (hamburger; becomes dark "Close" with × when open) · title + "type · total · n/8 sections" · export icon button.
- Proposal scroller full width: quick-toggle chip row (flex:none), then sections stacked; each section has a header strip with label + 30×18 switch; cover is a 150px image slot; pricing collapses to group rows (switch · name · total, desc under, "qty @ unit" when on); warranty clamps to 4 lines with "Read all"; terms shows clause count + "Read all".
- **Dusty bar** fixed at bottom (sprite + one-line latest note); tapping opens Dusty as a **bottom sheet** (70% height, radius 20px top, grab handle) with messages + composer.
- **Job panel**: full screen below the top bar (top: 102px), white, tabs **Summary · Budget · Files** (no Schedule — it has its own page). Summary = job block, type switch, cost→price with margin **slider** (28px tall), split, templates, cover-photo hint. Budget = four cost sections as cards (kicker row `#FBF6EC`, line items: name · qty · $) + direct cost. Files = 3-col photo grid (one tagged "Cover") + file list (exported PDF, sketch, takeoff CSV, reference signed quote).
- Same state drives both views.

## Templates (by project type)
- Warranty — res: *1-yr limited concrete*, *5-yr general (legacy)*; com: *1-yr limited concrete*, *Owner spec warranty*; gov: *Per contract documents*, *1-yr limited concrete*. Full text for each is in the logic class (`WARR`), taken from the user's won quotes.
- Contract — res: *Residential home-improvement (LA)*, *Simple T&C*; com: *Commercial subcontract*, *Owner-direct commercial*; gov: *Public works · LA R.S. 38*, *Federal · FAR 52 clauses*. Clause text in `TERMS`.
- Cover — Photo / Spec sheet / Bid form / None.
Templates are stored per org under Documents › Templates, tagged by project type; project types (and their defaults) are org settings under Cash › Project types and must be user-extensible.

## Data model (suggested)
```
ProjectType { id, orgId, name, ohPct, defaultMargin, taxOnByDefault, showQtyUnit, showItemPrices, drawDefaults: Draw[], warrantyTemplateId, termsTemplateId, coverStyle }
Template { id, orgId, kind: 'warranty'|'terms'|'cover', name, projectTypeIds[], title, body | clauses[] }
Proposal { id, jobId, number, projectTypeId, margin, split: 'none'|'2080'|'3070', sectionsOff{}, groupsOff{}, itemsOff{}, priceOff{}, showItemPrices, showQty, showTax, draws: Draw[], warranty: {templateId, titleOverride?, bodyOverride?}, terms: {templateId, clausesOverride?}, coverImageId, exportedPdfId, status }
Draw { pct?: number, amt?: number, when: string }           // exactly one of pct/amt set
PricingGroup { id, name, desc, qty, unit, optional, items: PricingItem[] }   // mirrors budget sections
PricingItem { id, name, note, cost }                          // sell = cost × markup
```
Derived, never stored: direct, oh, calc, price, profit, markup, group/line sell prices, subtotal, tax, total, draw reconciliation.

**Validation rule (hard):** `Σ draws === total` (tolerance $1) before export/send. Surface in three places: payment section banner, Dusty pinned message, header light = needs-you; export button disabled.

## Tokens
Same as the Plan Room package: ground `#FBF6EC`, panel `#FFFFFF`, doc ground `#E9E4DA`, lines `#E6DCC8` / `#F1E9DA` / `#D9CDB6` / `#C9BDA6`; ink `#2A2A2A`, secondary `#5E5A52`, muted `#8C8578`, disabled `#B3AA9A`; primary `#B85A3C`, accent `#D97757`, tint `#F6E2D8`, accent text `#9A4527`; success `#2F8A5B`/`#DDEEE3`/`#1F5C3A`; warn `#C98A12`/`#F7EBC9`/`#6B4E12`; danger `#B5412C`/`#F7DCD6`/`#8E2B1C`; info `#1E5AA8`/`#3F74C9`. Type: Lexend 600/700 numbers & titles, Inter 300 section heads 20px, Barlow Condensed 500–600 uppercase labels/buttons, IBM Plex Sans body 13px, Kalam for Dusty's name and signature placeholders. Radius 3 controls / 4 cards / 999 pills; document pages square.

## Assets
- `assets/dusty/idle.png` (render pixelated), `assets/org/sacco-light.png`, `assets/org/sacco-dark.png` (cover band)
- `image-slot.js` — prototype-only drop-zone web component; replace with the app's uploader.
- Icons: inline 16px stroke paths; use Lucide in code (eye / eye-off, link, download, x, menu).

## Files
- `Proposal.dc.html` — the design (open with `support.js` + `image-slot.js` alongside)
- `support.js`, `image-slot.js` — prototype runtime only
- `reference/Quote 24-315-1.pdf`, `Quote 24-372-1.pdf`, `Quote 24-302-1.pdf` — won JobTread quotes the layout and copy were modelled on

---
_Repo note (2026-09-30):_ the three reference quotes (`reference/Quote 24-302-1.pdf`, `24-315-1`, `24-372-1`) are Coy's won jobs with customer names and addresses, so they are **not committed** — ask Coy for them if needed.
