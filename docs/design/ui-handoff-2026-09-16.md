# ScopeCrete — UI handoff

**For OpenDesign. Prepared 16 September 2026.**
Every data figure was queried against the live production database on that date.

---

# 1. The product in one page

**ScopeCrete** replaces a receptionist for a concrete contractor in Baton Rouge, Louisiana.

Every call and text into the business lands in it, gets understood, and turns into priced work:

> a stranger calls → the system understands what they want → a job exists → a scope is built → an estimate goes out → follow-up happens without anyone remembering to do it

The user is **Coy Sacco**. He pours driveways, patios and slabs. He is not a knowledge worker. On mobile this is a phone held one-handed on a tailgate, in sunlight, with dust on the screen and sometimes gloves on. On desktop it is a second monitor in an office at the end of a working day.

**Mobile is one thing at a time. Desktop is triage.** If a desktop screen would be equally good on a phone, the desktop has been wasted.

---

# 2. THE RULE THAT GOVERNS EVERY SCREEN

**Nothing may display a number or a status that is not real.**

This is not a style preference. Fabricated values have shipped to this user's phone repeatedly and each one cost real time:

| what shipped | what was true |
|---|---|
| "Clay Jensen", profile screen | an invented person; the user is Coy Sacco |
| `$36.6k` pipeline, `50%` win rate | mock constants |
| `Off the top 11%` | a hardcoded `: 11` sitting beside six fields correctly showing "—" |
| `$0` cash position | an assertion the account is empty; the truth is nobody has recorded what is in it |

**A contractor prices real work off these numbers.**

### What this means for you

1. **Design the empty state first, the populated state second.** Most of this product is empty today and will stay partly empty forever. Empty is the default case, not the error case.
2. **An empty block holds its layout, looks deliberate, and says what it is waiting for.** "No cost settings recorded." Not a zero. Not a grey box that reads as a loading failure.
3. **Distinguish three states, not two:** has data · known to have none · not yet determined. The third is real and currently describes most of the database.
4. **Deliver both states for every region you design.**

*An empty state holds the layout; it doesn't invent a number.*

---

# 3. Design system — extracted from the existing build

These are the live token values. Use them as given.

## 3.1 Core palette

| token | hex | role |
|---|---|---|
| `slab` | `#E9EBEE` | app background |
| `card` | `#FFFFFF` | surfaces |
| `ink` | `#12161A` | primary text |
| `ink2` | `#616B77` | secondary text |
| `ink3` | `#8A95A1` | tertiary, eyebrows |
| `hair` | `#DCE0E5` | borders |
| `hairSoft` | `#F0F2F4` | subtle dividers |
| `hiviz` | `#F2610C` | **the brand orange.** Primary accent, used sparingly |
| `hivizDim` | `#FFF1E7` | orange wash |
| `chalk` | `#1B5FD9` | secondary/informational blue |
| `chalkDim` | `#EAF0FC` | |
| `green` | `#0F8A4F` | success, won |
| `greenDim` | `#E6F5ED` | |
| `violet` | `#6B4BD6` | |
| `violetDim` | `#F1EFFB` | |
| `red` | `#C0341D` | error, lost |
| `redDim` | `#FBECE9` | |
| `dark` | `#14181C` | dark bars, header |
| `darkHair` | `#262C33` | borders on dark |
| `pulse` | `#1FA971` | live indicator |

## 3.2 Money palette — deliberately softer

Kept separate from the UI tokens and quieter than them.

| token | hex | meaning |
|---|---|---|
| `inDark` / `inLight` | `#0E6F63` / `#2FA795` | cash already in |
| `comDark` / `comLight` | `#3A55C9` / `#6D86EE` | committed |
| `projDark` / `projLight` | `#C08A2E` / `#EDC66A` | projected |
| `outDark` / `outLight` | `#B14A34` / `#E08469` | money out |
| `line` | `#12B886` | trend line |
| `grid` / `axis` | `#EDEFF2` / `#C9CFD6` | chart furniture |

The original note on this palette, worth preserving: *clay is deliberately still a warning colour — a week that lost money should not look like a prize. Nothing here is brighter than the truth.*

## 3.3 Type

- **Display:** `Barlow Condensed` — headings, numbers, nav labels, eyebrows
- **Body:** `IBM Plex Sans` — prose, message bodies, form fields

Scale (px): `xxl 34 · xl 26 · lg 19 · md 15 · sm 13 · xs 11 · micro 9.5`

**Eyebrow style** — used constantly as section labels: display face, 9.5px, letter-spacing `.14em`, uppercase, colour `ink3`.

**All numerals are tabular.** Nothing may shift horizontally when a value changes.

## 3.4 Identity

A small diamond emblem with a dot at its centre, in `hiviz` with a green core. Wordmark: "SCOPE" in `ink`, "CRETE" in `hiviz`, display face, tight tracking.

## 3.5 The anti-brief

**Do not produce a generic SaaS dashboard.** No gradients, no glassmorphism, no card grid of sparklines, no "Good morning 👋", no purple-and-white startup aesthetic.

The reference points are a **job ticket**, a **batch plant readout**, a **well-made hand tool**. Dense, legible, unfussy, confident. It should look built for someone with dust on their hands.

Tap targets sized for work gloves — 44px minimum, larger where the action is destructive or done outdoors.

---

# 4. Navigation

## Mobile — four-tab bottom bar

`THREADS · SCOPE · CASH · MORE`

A centre emblem button sits between Scope and Cash for create actions. Header carries the wordmark and a hamburger opening the account drawer. A thin dark **stream bar** under the header shows one ambient line of system state.

Secondary screens (Customers, Docs, Schedule, Pipeline, Dusty) live under MORE.

## Desktop — not yet designed. This is your main net-new work.

The four-tab model does not survive the transition. Desktop should be organised around **triage** and **simultaneity** — several things visible at once, which is the entire reason for the larger surface.

---

# 5. Data reality — what every screen is actually working with

Verified live, 16 September 2026.

| | count | design implication |
|---|---|---|
| contacts | **173** | |
| **contacts with no name** | **152** | **The phone number is the row identity.** This is the normal case, not a missing field. It must look legitimate, not broken. |
| messages | **1,341** | 813 texts, 528 calls |
| **calls carrying any summary text** | **54 of 528** | Most call rows are a number and a timestamp. A sweep will improve this; the bare version must still work. |
| voicemails captured | 2 | |
| leads | 57 | **none priced** |
| **jobs** | **0** | no job has ever existed |
| estimates, invoices, payments, receipts | **0** | the entire money side |
| cost settings, overhead, balance | **0** | why every Cash figure is a dash |

## 5.1 The classification trap — read before designing any badge

`contact_type` **defaults to `'customer'`** in the database. So 166 of 173 contacts read as "customer" and **171 of 173 are flagged `classification_source='legacy'`**.

**Nothing has actually been classified.** A known subcontractor, a hardware store and a lead-generation service are all sitting there labelled customer because nobody has told the system otherwise.

**So: a design showing only CUSTOMER and VENDOR badges has no way to tell the truth about 171 contacts.** Unclassified needs its own treatment, and it is currently the majority state.

---

# 6. Screen inventory

Legend: **LIVE** = built and in production · **PARTIAL** = built, incomplete · **FUTURE** = designed but not built · **NEW** = does not exist in any form

## 6.1 Threads — the main screen · LIVE, needs rework

**Currently live:** a list ordered newest-first. Each row shows the contact name or phone number, a one-line preview, a message count and a relative timestamp. A drift banner appears at the top when an event arrived but never reached the app. Tapping opens the conversation.

**What it needs:**

- **Filter chips across the top with counts:** `Today · Needs you · Unsorted · Drafts`
- **Type differentiation at a glance** — customer, vendor, personal, spam, and unclassified
- **Voicemail rows labelled as voicemails**, not passed off as summaries
- Name where known, phone number where not, and **never an invented name**

## 6.2 Thread detail · LIVE, needs restructuring

**Currently:** a reverse-chronological message list. Texts as bubbles. Calls as cards with a summary, expanding to reveal transcript, next steps and recording.

**The change that matters: it must open on a JOB CARD, not on the newest message.**

The card shows what the system has understood from the whole conversation: site address, work requested, site conditions, quote state, who owes the next move — and, critically, **what is still unknown.**

A real thread, verbatim from the database:

> 9323 Kevel Drive, Baton Rouge 70810 · replace main driveway up to the carport plus a section of sidewalk · trees already cleared · quote promised, not sent · customer undecided
>
> **Still unknown:** dimensions, thickness, reinforcement, existing surface and demo depth, truck access, finish

**That "still unknown" list is the single most valuable element in the product.** It is the checklist he carries up the driveway. Design it as a feature with weight and hierarchy, not as an error state or a footnote.

Messages sit beneath the card as evidence.

## 6.3 Contact / customer detail · FUTURE

One customer may hold **several phone numbers** — a spouse, a business line, a forwarding number. The screen must treat the customer as the unit and the numbers as attributes.

Holds: all numbers and emails · every job for this customer · invoiced / paid / outstanding · a full activity timeline across every channel · inline editing of details.

Primary actions: **Call · Text · Scope · Ask.**

## 6.4 Scope builder · FUTURE — the heart of the product

A job has **sections**. A driveway, a patio and demo at one address is **one job with three sections**.

Each section carries length, width, depth, PSI and finish. Live derived readouts: square feet, square yards, linear feet, cubic yards, days, cost, markup, margin, bid price.

Four tabs on a scope: `SCOPE · COSTS · NOTES · FILES`.

Three constraints:

1. **Usable outdoors, standing up, with a tape measure in the other hand.**
2. **Everything is editable.** The machine fills in what it heard from the conversation; he corrects it on site. There is no read-only machine output.
3. **Machine-filled and measured values must be distinguishable** — he needs to see at a glance what was guessed from a phone call versus what he measured. But they live in the same fields on the same screen.

**Never display an inferred dimension.** No standard driveway, no assumed four inches. A missing dimension stays visibly missing all the way through to the estimate, where it reads as "cannot price without this". A fabricated number on a screen gets caught; a fabricated dimension flows into a bid, gets sent, and gets poured.

## 6.5 Scope list · FUTURE

Drafts in progress, each showing customer (or "No customer yet"), section count, area, bid total, status, last-touched. Prominent **New scope** action.

## 6.6 Cash · LIVE, entirely empty

Cash position, runway, monthly nut, off the top, pay yourself, collected, spent, close rate.

**Every one of these is a dash today, and that is correct.** Currently the best-behaved screen in the product — it states plainly what each field is waiting for. Preserve that behaviour exactly while improving the form.

Future, once data exists: a month ribbon and a week band plotting money in, committed, projected and out. **Do not design these against zeros** — a ribbon over no data is an empty axis with an invented shape.

## 6.7 Pipeline · LIVE, partial

Stage tabs `New · Contacted · Qualified · Won` with counts. 57 leads, all in New, **none with a value**. The header correctly shows a dash rather than `$0`.

Needs: lead rows that read well without names, and a visible distinction between an unreviewed machine suggestion and a confirmed lead. **A machine suggestion is visible but must never move a number.**

## 6.8 Triage · NEW — the reason desktop exists

The queue of what needs attention: unanswered questions, voicemails with extracted next steps, threads gone quiet, quotes promised and not sent.

The motivating failure: a permit voicemail sat five days because nothing surfaced it. Every call has extracted next steps and nobody reads them.

**On desktop this is the home screen.** On mobile it is the `Needs you` filter.

## 6.9 Dusty · FUTURE, deliberately last

Full-screen assistant. New chat by default; history slides from the left behind the hamburger so it never collides with right-hand drawers. Composer with attach and hold-to-talk.

**Its send path is disabled and must stay visibly so.** Design the shell; do not design a conversation that implies it is answering.

## 6.10 Also future

**Customers** (list, grouped, with money summary) · **Docs** (proposals, contracts, change orders, with sent/viewed/signed states) · **Schedule** (month, week, quarter, year; depends on jobs, currently zero) · **Settings** (overhead, comp, company, market/ZIP).

---

# 7. Desktop — the brief for net-new work

Nothing below exists in any form. This is the largest piece of work in this handoff.

**Design around simultaneity.** The test for every screen: would this be just as good on a phone? If yes, redesign it.

**Priority order:**

1. **Triage home.** The queue, filterable, scannable, with enough context per row to act without opening anything.
2. **Threads, three-pane.** Thread list · conversation (job card first, messages beneath) · contact context. This is the layout mobile fundamentally cannot offer and the strongest argument for the desktop existing.
3. **Scope builder.** Section editor and running totals visible together — on mobile these compete for the same space.
4. **Customer view.** One customer, several numbers, every job, money, full cross-channel timeline.
5. **Cash.** Empty today; design it empty and design it populated.

Same brand, same tokens, same emblem. This is the same product on a larger surface, not a different one. But the layout logic should be genuinely different, and typography has room for hierarchy that mobile cannot afford.

---

# 8. Existing components

The current build carries roughly sixty components. Names are given so your work maps onto the codebase rather than replacing it.

**Primitives:** `Toggle` `Segmented` `NumField` `TextField` `DimRow` `Drawer` `Sheet` `Avatar` `Badge` `Emblem` `NavIcon` `SectionHead` `Metric` `MetricGrid`

**Threads:** `ThreadsScreen` `ThreadRow` `StreamBar` `ActivityFeed` `ContactLines` `PeopleBlock`

**Scope & money:** `ScopeScreen` `ScopesScreen` `MoneySide` `MoneyCard` `MoneyRow` `Ribbon` `Band` `DayBars` `Spark` `Donut` `Funnel` `OverheadSheet`

**Customers & docs:** `CustomersScreen` `CustomerScreen` `CustomerPicker` `DocsScreen` `DocView` `DocPaper` `FileRow`

**Schedule:** `ScheduleScreen` `MonthGrid` `WeekView` `QuarterView` `YearLoad`

**Other:** `MoreScreen` `DustyScreen` `PipelinePanel` `PipelineDrop` `CreateDrop` `SettingsSheet` `UserSheet` `TabStub`

**Note:** the existing file also contains around sixty mock data constants — `JOBS`, `INVOICES`, `PAYMENTS`, `THREADS`, `PEOPLE`, `USER` and others, plus a hardcoded `TODAY = "2026-08-13"` that makes every relative timestamp in it fictional. **Nothing in that mock data reflects reality.** Treat the components as structure and the data inside them as noise.

---

# 9. What to deliver

For each screen, mobile and desktop:

- **the empty state** — designed first
- **the populated state**
- **the partially-known state** where it applies, which is most of them

And tell us what you decided and why — particularly anywhere you think the structure described here is wrong. The information architecture in this document is a working position, not a finished answer.
