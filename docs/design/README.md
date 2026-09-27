# ScopeCrete — design references

**For whoever is designing screens for this product, human or agent.**
Prepared 27 September 2026 from the live database and the deployed code.

Everything a designer needs that is not already in `/DECISIONS.md` lives here.
`/DECISIONS.md` is still ground truth for the product, the costing engine and the
agent rules; it is not repeated here.

---

## 1. What is in this folder

| file | what it is |
|---|---|
| `scopecrete-v34.jsx` | **The mobile reference build.** 5,732 lines, ~55 components. Every screen that has been designed for mobile is in here as working React. It is also full of mock data — see §5. |
| `desktop-screens.html` | **The desktop design, readable.** Eight screens as plain markup, extracted from the bundle below. Open it, or read it as text — this is the one to diff against. |
| `desktop-standalone.html` | The same desktop design as a self-extracting bundle. Open in a browser to click through it. 420KB, mostly inlined React and fonts; not readable as source. |
| `ui-handoff-2026-09-16.md` | The brief the desktop design was made from. Contains the anti-brief (§3.5) and the screen inventory (§6). Still current except for the counts. |
| `synopsis-2026-09-16.md` | Full product and architecture synopsis. Still current except for the counts. |

**The counts in those last two documents are eleven days stale.** §3 below has
today's.

## 2. Read these three rules before drawing anything

**Nothing may display a number or a status that is not real.** If the code can
produce a number with the database empty, it is a placeholder and must render as
one. An empty state holds the layout and says what it is waiting for. This is the
rule that keeps being broken and it is the reason the desktop design carries no
dollar figures at all.

**Unclassified is its own state, and it is the majority state.** `contacts.contact_type`
defaults to `'customer'`, so **190 of 197 contacts** are sitting there labelled
customer because nobody has told the system otherwise. A design that offers only
CUSTOMER and VENDOR badges has no way to tell the truth about almost every row.

**Never display an inferred dimension.** No standard driveway, no assumed four
inches. A missing dimension stays visibly missing all the way to the estimate,
where it reads as "cannot price without this". A fabricated number on a screen
gets caught; a fabricated dimension flows into a bid, gets sent, and gets poured.

## 3. The data, measured today

| | 27 Sep 2026 |
|---|---|
| contacts | **197**, of which **176 have no name** |
| contacts labelled `contact_type='customer'` | **190** — see §2, almost all of it is the default, not a classification |
| messages | 1,504 |
| calls | 580 |
| call summaries / transcripts | **79 each** — the other ~500 calls are a number and a timestamp |
| leads | 84 |
| spine drift | **1** — one event reached the phone number and never reached the app |
| **jobs** | **0** |
| job_sections, estimates, invoices, payments, receipts | **0** |
| org_cost_settings, overhead_items, balance_checkpoints | **0** |

64 tables; most are empty. **Design every screen empty-first.** For jobs, scopes,
money and documents the empty state is not an edge case, it is the only state that
exists today and will be for a while.

## 4. What is actually built — the honest gap

Re-measured 2026-09-27, after PRs #10–#15: the app's dashboard screens, shell,
tokens and primitives are **3,104 lines**, up from 1,095 when this README was
first written. The mobile reference build is **5,732**. The shell and Threads
are now v34; most other screens are not yet built.

The app is *correct and thin*: it prints a dash with a reason rather than a
fake number, carries a live drift alarm, and names what each dead entry is
waiting for.

| screen | in `scopecrete-v34.jsx` | in the app | |
|---|---|---|---|
| App shell | glass header + five-slot footer (Dusty centre) | `src/app/dashboard/layout.tsx` + `src/styles/v34-shell.css` | **built** — no StreamBar (it ran on invented sentences) |
| Threads list | `ThreadsScreen` `ThreadRow` `ActivityFeed` | `src/components/v34/thread-list.tsx` | **built** — ten filter chips on real counts (no Drafts: no outbox table), row expand, proposal review inline |
| Thread detail | inside `ThreadsScreen` | `dashboard/messages/[id]/page.tsx` | **built** — oldest to newest with day breaks, calls with next steps, texts with photos, composer (drafts; no send path), "Same person as…" merge, contact rail on desktop |
| Desktop shell + panes | — (v34 is mobile-only) | `dashboard/layout.tsx` (top bar, left rail) + `dashboard/messages/layout.tsx` | **built** — from the desktop design, in v34's look |
| Scope list | `ScopesScreen` `CustomerPicker` | `dashboard/scope/page.tsx` | **built** — + New scope picks a thread (or nobody) and opens the builder |
| Scope builder | `ScopeScreen` (~400 lines) | `dashboard/scope/[jobId]/page.tsx` + `src/lib/engine` | **built** — sections, takeoff, price, discount + floor; desktop layout from 1h. Engine follows DECISIONS §3/§4, not v34's `computeJob` |
| Cash | `CashFlow` `Ribbon` `Band` `MoneySide` `MoneyCard` (~700 lines) | `dashboard/cash/page.tsx` + `components/v34/cost-settings.tsx` | **partial** — cost settings and the monthly nut are editable (layout from 1g). No ribbon, no band. |
| Pipeline | `PipelinePanel` `Funnel` `Donut` `Spark` `DayBars` | `dashboard/more/pipeline/page.tsx` + header drop | **partial** |
| Customers | `CustomersScreen` `CustomerScreen` `PeopleBlock` `ContactLines` (~550) | `dashboard/customers/` | **built** — Unclassified / Customers / Vendors & subs tabs on confirmed relations only; person page with classify, numbers, jobs, New scope. No lifetime value (no invoices) |
| Documents / proposals | `DocsScreen` `DocView` `DocPaper` `FileRow` (~460) | — | **not built** |
| Schedule | `ScheduleScreen` `MonthGrid` `WeekView` `QuarterView` `YearLoad` (~470) | — | **not built** |
| Settings | `SettingsSheet` `OverheadSheet` (~340) | — | **not built** |
| Dusty | `DustyScreen` (~490) | a sheet from the footer emblem saying it is not wired | **shell only** — no conversation that implies it answers |
| **Threads, desktop** | — (the desktop design calls it "Triage"; Coy's name for it is **Threads** — that word is not used in the app) | `dashboard/layout.tsx` (top bar, left rail) + `messages/layout.tsx` + `messages/[id]/page.tsx` (contact rail at xl) | **built** — list · conversation · contact rail. Row-level snooze/handled and the Dusty read are not built |

What did survive the port cleanly, and is the place to build on:

- `src/lib/v34/tokens.ts` — colour, money palette, type scale, `eyebrow`, tabular
  numerals, status chips, `relTime()`, `formatPhone()`. **This is the live design
  system.** Changing the look means editing this file.
- `src/components/v34/primitives.tsx` — `Emblem` `NavIcon` `Avatar` `Badge`
  `Toggle` `Segmented` `NumField` `TextField` `DimRow` `Drawer` `Sheet`
  `EmptyState`.
- `src/components/v34/shell.tsx` — the header drops (`PipelineDrop`,
  `CreateDrop`).

## 5. Two things in `scopecrete-v34.jsx` that will mislead you

**About sixty mock data constants.** `JOBS` `INVOICES` `PAYMENTS` `RECEIPTS`
`THREADS` `PEOPLE` `FILES` `SCHED` `BILLS` `ACTIVITY` and more. None of it
reflects reality — there are no jobs, no invoices and no payments in the database.
Treat the components as structure and the data inside them as noise.

**`const TODAY = "2026-08-13"`.** Every relative timestamp in the mockup is
computed from that anchor, which makes each one a fiction that looks completely
ordinary. The port replaced it with `relTime()`, which takes a real ISO string and
returns **null** when there isn't one, so a row with no timestamp renders nothing
rather than something plausible.

## 6. An unresolved fork: there are two design systems here

The mobile build and the desktop design do not share a typeface.

| | mobile (`scopecrete-v34.jsx`, and the live app) | desktop (`desktop-screens.html`) |
|---|---|---|
| display face | **Barlow Condensed** | **Archivo** |
| body face | **IBM Plex Sans** | Archivo |
| token source | `src/lib/v34/tokens.ts` | a "Modernist" stylesheet inside the bundle |

Loaded in the app via `next/font/google` in `src/app/page.tsx` and
`src/lib/v34/tokens.ts:42-43`. Desktop and mobile cannot run different typefaces
and both be ScopeCrete. **This needs deciding before desktop work continues**, and
it is a decision for Coy, not for whoever draws next.

Also worth knowing: the desktop design's markup is **1,244 inline `style=`
attributes against 194 `class=`**, and carries no component source. It is a
picture of eight screens, not code — anything from it is rebuilt as React against
real endpoints, not imported.

## 7. Where the real implementation is

```
src/lib/v34/tokens.ts              the live design tokens
src/components/v34/primitives.tsx  shared components
src/app/dashboard/layout.tsx       the shell — sticky header, four-tab footer
src/app/dashboard/*/page.tsx       the screens
src/app/api/                       every endpoint a screen can read
DECISIONS.md                       product ground truth
docs/reports/                      one report per work order, what was built and what was not
```

## 8. What is NOT in this folder

The **FEAT-009** specs — `WO-17-Threads-and-Shell-to-v34.md`,
`WO-15-Scope-Builder-and-Proposal-Structures.md`,
`FEAT-009b-Voice-to-Scope-Agent-Contract.md`, `026_*.sql`, `027_*.sql` and
`scope-proposals.jsx`. They live in Coy's Obsidian vault and have not been copied
in. When they arrive they belong at `docs/design/feat-009/`.
