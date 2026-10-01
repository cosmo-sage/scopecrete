# Handoff: Plan Room v2 — Takeoff → Budget

Target repo: `cosmo-sage/scopecrete` · suggested branch: `claude/plan-room-takeoff` (off `claude/feedback`)

## Overview
The Plan Room is where a concrete contractor brings in a job's plan set, has Dusty (the AI assistant) auto-scale every sheet, choose which scopes to read for, then build **parameter-grouped takeoffs** (Area / Linear / Count) that total by group, stay broken out by section, and push straight into the job **budget** as linked lines.

Dusty's chat panel is permanently docked on the right (380px), as on every other v34 page, and its messages are contextual to the active tab/selection.

## About the design files
`Plan Room v2.dc.html` is a **design reference built in HTML** — a prototype showing intended look and behavior, not production code. Recreate it in the existing Next.js/React app using the established v34 patterns (`src/components/v34/*`, `src/lib/v34/tokens.ts`, `src/styles/v34-shell.css`). Open the file directly in a browser (it needs `support.js` beside it) to click through every state.

`reference/` holds the two JobTread screenshots the user supplied as the model for the parameter tree and sheet grid. Use them for behavior only — do not copy their visual styling.

## Fidelity
**High-fidelity.** Colors, type, spacing and copy are final for this iteration. Match the v34 shell exactly (it's the same header, rail and Dusty panel already in the repo). The plan drawing itself is a placeholder SVG — production renders the real PDF page.

## Shell (unchanged from v34 — reuse existing components)
- App frame 1440×900 reference; header 54px (drafting-grid bg `#FAF8F3` + 10px grid lines `rgba(89,128,166,.08)`), Sacco logo + "powered by scopecrete.ai", activity line (8px status dot + Inter 300 13.5px).
- Left rail 84px, `#F3ECDD`, items 58px tall, Barlow Condensed 11px/500/.1em uppercase. **Active page = white bg + 3px `#D97757` left edge.** In this design both "Plan room" and "Dusty" are highlighted because Dusty is open. The rail is the page indicator — there is **no page title** in the sub-header (removed per user).
- Dusty panel (right, 380px, `#FBF6EC`, left border `#E6DCC8`, shadow `-10px 0 30px rgba(42,32,20,.08)`): header with sprite 32px, "Dusty" Kalam 700 17px, context line Barlow Condensed 10px/600/.14em uppercase `#9A4527` ("Looking at this plan set · {context}"). Composer at bottom: 38px input + terracotta "Ask" button.

## Sub-header
White, bottom border `#E6DCC8`, padding `12px 20px 0`.
- Row 1: **Job** picker and **Set** picker (32px, 1px `#D9CDB6`, radius 3, label Barlow Condensed 11px/600/.14em `#8C8578`), spacer, scale badge (`#DDEEE3` bg, `#1F5C3A` text, "✓ 43 of 48 sheets auto-scaled"), **↑ Add plans** primary (`#B85A3C`, white, Barlow Condensed 13px/600/.08em uppercase).
- Row 2: step tabs, 38px, Barlow Condensed 14px/600/.1em uppercase. Numbered circle 17px. Active: `#2A2A2A` text + 2px `#B85A3C` underline; inactive `#8C8578`. Count pill Lexend 10.5px on `#F3ECDD`.
  1 Files · 2 Sheets · 3 Takeoff · 4 Budget (`sent/total` groups).

## Screens

### 1. Files
Purpose: pull plans already on the job (from Dusty's email intake and Documents) and add new ones.
- Drop zone 120px, 2px dashed `#D9CDB6`, radius 6. Copy: "Drop plan sets, sketches or photos" / "PDF, JPG, PNG, HEIC · or forward the bid email to plans@{org}.scopecrete.ai".
- **"Already on this job"** table, grid `44px 1.6fr 1fr 1.1fr 130px 120px`: thumb · File (name + kind) · Came from (tag `Email`/`Documents` + detail) · Sheets · scale · Read status (dot + text) · **In plan room** toggle (38×22 switch, on `#2F8A5B`, off `#D9CDB6`). Off rows at 60% opacity.
- Three explainer cards: Auto-scale · Scopes you pick · Straight to budget (last one tinted `#FBEDE6`).
- **Dusty flow (key requirement):**
  1. Dusty reports which job files he found and pulled in, and which he skipped and why (unscaled sketch, non-drawing report).
  2. Dusty asks **"What should I pull out of these plans?"** with toggle chips (Slab on grade/paving, Curb & gutter, Footings & grade beams, Drilled piers, Trench drains, Floor drains, Rebar tonnage, Sawcut joints) + free-text "Anything else?". Chip on = `#B85A3C` fill, white, "✓ "; off = white, `#D9CDB6` border, "+ ". Button "Read for N scopes".
  3. After confirm: user's picks echo as a user bubble; Dusty reports the **auto-scale** result (title-block scale verified against three printed dimensions, within 0.5% tolerance → calibrated; detail/NTS sheets skipped) with a facts list (Calibrated automatically 43/48 · Detail sheets 5 · Needed your help 0), then "Done reading. N parameter groups and M takeoffs…" + **Open takeoff ›**.
  Dusty only creates parameter groups for the selected scopes.

### 2. Sheets
- Left 190px discipline filter (Concrete scope, All, General, Civil, Architectural, Structural, Mechanical, Electrical, Plumbing) with color square + count. Active `#F6E2D8`.
- Grid `repeat(auto-fill,minmax(180px,1fr))`, gap 10. Card: 104px thumbnail, "Concrete" tag top-left if in scope, **scale badge bottom-right** (green `#DDEEE3`/`#1F5C3A` "✓ 1/8" = 1'-0"" when verified; grey `#F3ECDD` for NTS/detail). Footer: sheet number Lexend 600 13px, "p.N", title. Click → Takeoff on that sheet.

### 3. Takeoff (core)
Layout: parameter panel 340px | canvas (flex).
**Parameter panel** (modelled on the JobTread tree):
- Header "Parameters" (Inter 300 20px) + "5 groups · 9 takeoffs" + collapse ‹ button (collapses to a 44px vertical strip).
- **Group row**: type icon (Area polygon / Linear polyline / Count dots, group color) · chevron (rotates 90° when open) · name 13.5px/600 · sub-line "AREA · 03-300 FLATWORK" (Barlow Condensed 10.5px, `#9A4527` when unmapped: "NO BUDGET LINE") · **group total** Lexend 700 14px + unit.
- **Section rows** (when expanded): 4px color bar · name 13px · "sheet · method" 11px · qty + unit. Selected row `#FBF6EC` + 3px left edge in group color. "+ MEASUREMENT" link under each open group.
- Footer: **+ Parameter** (dark) and **Send to budget** (terracotta → "On budget ✓").
- Group total = sum of its sections, live.

**Canvas**
- Toolbar 42px: Area, Rect, Linear, Count, Cutout, Auto (Dusty auto-detect), Scale (re-calibrate). Active tool `#F6E2D8` bg, `#B85A3C` border, `#9A4527` text. Right: "{sheet} · 1/8" = 1'-0" auto" + **full-screen icon button** (30×28, 18px Lucide maximize/minimize, tooltip only — no text label; dark fill `#2A2A2A` while in full screen).
- Drawing: real PDF page. Overlays per measurement in group color; selected section opacity 1, same-group 0.7, others 0.14. Floating dark label near the selection: "4,824 SF · Drive-through lane" / "Slab on grade 6" → 7,384 SF total". Title-block stamp top-right, sheet tabs bottom-left, zoom control bottom-right.
- **Full screen**: parameters + canvas expand to cover the whole app frame (header, rail, sub-header); Dusty collapses to a 44px vertical strip on the right ("Dusty · N notes · exit full screen"), click to exit. Combine with the parameter collapse to give the drawing the full width.

**Dusty in Takeoff**: comments on the group vs. schedule (e.g. drive lane 4% under C-5 schedule because inlets are cut out), explains the selected section (group total / this section / share %), and asks to map any group with no budget line (buttons "03-350 Curb" / "New line 03-360").

### 4. Budget
- Four summary cards: Concrete budget $, Flatwork SF, Linear LF, Count EA.
- Table grid `1.7fr 1.3fr 110px 80px 100px 120px`: **Budget line ← parameter** · Sheet · method · Qty · Unit · Rate · Total.
  - Group row (bg `#FBF6EC`, 600 weight): name + cost code, "Area · 3 sections", total qty, rate, group $.
  - Section rows indented 22px, 4px color bar, sheet · method, qty, section $ (qty × group rate).
  - Unmapped group: "no rate", "—", in `#9A4527`.
- Footer: "Section rows stay linked. Re-measure on the plan and the budget line moves with it." + Concrete total + **Open in Jobs › Budget**.

## Data model (suggested)
```
PlanSet { id, jobId, revision, files: PlanFile[] }
PlanFile { id, source: 'email'|'documents'|'upload', inPlanRoom: bool, status }
Sheet { id, fileId, page, number, title, discipline, scale: { text, verified: bool, tolerancePct, method: 'title_block'|'manual' } | null }
ScopeRequest { planSetId, scopes: string[], freeText? }          // answer to Dusty's question
Parameter { id, planSetId, name, type: 'area'|'linear'|'count', unit, color, budgetLineId|null, depth? }
Measurement { id, parameterId, sheetId, name, geometry, cutouts[], method, qty }   // qty derived from geometry × sheet scale
BudgetLine { id, jobId, costCode, name, rate, sourceParameterId }  // qty = Σ measurements; sections exposed as child rows
```
Totals are derived, never stored: `parameter.total = Σ measurement.qty`; `line.total = parameter.total × rate`.

## State (prototype)
`tab`, `disc`, `scopes{}`, `started`, `inRoom{}`, `open{}` (expanded groups), `sel` (measurement), `group`, `tool`, `sheet`, `sent`, `trenchCode`, `fs` (full screen), `params` (panel shown). See the logic class at the bottom of the HTML file.

## Tokens used
- Ground `#FBF6EC`, panel `#FFFFFF`, rail `#F3ECDD`, lines `#E6DCC8` / `#F1E9DA` / `#D9CDB6`
- Ink `#2A2A2A`, secondary `#5E5A52`, muted `#8C8578`
- Primary `#B85A3C`, accent `#D97757`, accent tint `#F6E2D8`, Dusty tint `#FBEDE6`, accent text `#9A4527`
- Success `#2F8A5B` / `#DDEEE3` / `#1F5C3A`; warn `#C98A12`
- Group colors: slab `#D97757`, curb `#2F8A5B`, grade beam `#C98A12`, piers `#6A55B0`, trench `#0F7C86`
- Type: Lexend 600/700 (numbers, sheet ids), Inter 300 (section titles 20px), Barlow Condensed 500–600 (labels, buttons, uppercase), IBM Plex Sans (body 13px), Kalam (Dusty name)
- Radius 3px controls, 4px cards, 6px frame; pills 999px

## Assets
- `assets/dusty/idle.png` — Dusty sprite (render with `image-rendering: pixelated`)
- `assets/org/sacco-light.png` — org logo
- Icons are inline 16px stroke paths (1.4–1.5 stroke); swap for Lucide in code.

## Files
- `Plan Room v2.dc.html` — the design (open in browser with `support.js`)
- `support.js` — runtime for the prototype only; not for production
- `reference/` — JobTread screenshots supplied by the user
