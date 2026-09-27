# Work order 17 report — 2026-09-27

**Preview:** https://scopecrete-git-claude-wo17-threads-shell-coy2.vercel.app
**Branch:** `claude/wo17-threads-shell` (`f2c6c2b`), off `master`.

The shell is v34's. Threads has filter chips and expandable rows. Desktop shows
the list and a conversation side by side.

**Built without `scope-proposals.jsx`, which has not arrived.** §6 says exactly
what that cost and where rework is likely.

---

## 1. The shell

Ported from `docs/design/scopecrete-v34.jsx`: header L5321–5392, footer
L5640–5692, CSS L5155–5320 → `src/styles/v34-shell.css`. Animation names are
kept byte-identical (`scEmTurn`, `scTabPop`, …) so a later diff against the
mockup is a real diff rather than a rename hunt.

**The footer is five slots, not five tabs.** `Threads · Scope · Dusty · Cash ·
More`, Dusty as the centre emblem with no word under it.

This corrects something I told you on 17 September. I said your WO-17 bullet's
five-item footer had diverged from v34's four. It had not — I read the
`HOME_TABS` constant at L3411, which has four entries, and missed the footer
render at L5640, which is five slots and puts Dusty in the middle. v34's own
comment at L3410 is *"the four footer destinations — Dusty is a conversation,
not a landing"*, which is also DECISIONS.md §6. Your bullet described v34
exactly. That mistake was the main reason I said to wait for
`scope-proposals.jsx`.

**A defect in the earlier port, fixed here.** `<Emblem>` in
`src/components/v34/primitives.tsx` was ported without the `sc-em-diamond`,
`sc-em-square` and `sc-em-core` class names on its three shapes. Every emblem
animation targets those classes, so all of them were inert — the mark has never
moved in the deployed app. Restored, with a comment saying not to drop them
again.

## 2. What is deliberately missing from the shell

**`StreamBar`.** v34 hangs it under the header and feeds it `DREAM_LINES`
(L3147) — ten hardcoded sentences including:

> "3 quotes out · 41,180 waiting on somebody else"
> "Gulfline deposit cleared Tuesday · 8,530"
> "ready mix is up 4 percent since May · 155 to 161"

v34's own comment above them reads *"Dreaming lines are drawn FROM THE DATA,
never generic"* — in the mockup they are not. Ambient copy stating dollar
figures is the most deniable kind of fabrication, because it reads as
atmosphere rather than as a claim. Not ported.

**The emblem's "asking" state.** v34 quickens the mark when Dusty has questions,
counted off mock data. `sc-em-breathe` and `sc-em-asking` are left out of the
stylesheet **entirely** rather than defined and unused, so nothing can reach for
them by accident.

`thinking` is honest: the mark only works while a request the shell issued is
actually in flight, and deliberately does **not** spin on navigation — a spin on
every tab change would make the animation mean "you tapped something" rather
than "real work is happening".

**Every row in the `+` menu is dead, and says why.** `/api/jobs` on `master` is
**GET only** — the POST writer is work order 13, unmerged in PR #10. I had
wired "New job" to a create flow and then caught that it would 404 until #10
lands. It now reads "Needs the jobs writer — PR #10, not merged", and the drop
carries a line saying nothing is creatable yet. One `href` turns it live.

**The Dusty emblem opens a sheet that says Dusty is not wired**, with no input
box. Handoff §6.9: design the shell, do not design a conversation that implies
it is answering. See §7 for the open question about the existing `/dusty` route.

## 3. The chips — ten of eleven, every count from a query that ran

You asked whether the tables behind the dead chips needed creating. **Six of the
seven did not.** Measured against the live schema:

| chip | what was actually blocking it | new table? |
|---|---|---|
| Unscoped, Quoted, Pouring, Won, Lost | `jobs` is 0 rows. The table exists and `jobs_status_check` already allows all ten statuses. | **no** |
| Vendors | `customers.relation` and `relation_confirmed_at` both exist. 135 rows, **0 confirmed**. | **no** |
| Drafts | nothing resembling an outbox in any of the 64 tables | **yes** — not built, see below |

**And that reframes the question you were answering.** A `0` is only dishonest
when the system has no opinion to report. `Quoted 0` is *true* — the query ran,
there are no quoted jobs. `Vendors 0` is *true*, and DECISIONS.md §2b is
explicit that unconfirmed is not the same as vendor. Only `Drafts 0` would be
invented, because there is nothing for the query to run against.

So the chip row is v34's, minus one:

| chip | source | today |
|---|---|---|
| Today | **client-side** — see below | live |
| Needs you | latest message is `direction='inbound'` | **130** |
| Unsorted | `contacts.name` null or blank | **176** |
| Unscoped | job with no `job_sections` rows | 0 |
| Quoted / Pouring / Won / Lost | `jobs.status` | 0 |
| Vendors | `relation IN ('vendor','sub') AND relation_confirmed_at IS NOT NULL` | 0 |
| All | contacts carrying messages | **197** |

**`Today` is the one count computed in the browser.** "Today" depends on the
viewer's timezone and `orgs` carries no timezone column, so a server-side
answer would be UTC — the wrong day for five hours of every Baton Rouge
evening. The browser knows; the browser derives it.

**The chip row renders only keys the API returns.** `drafts` is absent from the
response shape, so the chip cannot reappear without the data behind it — this
is structural, not a rule someone has to remember. The "all filters" panel says
so in words rather than leaving an unexplained gap where v34 has a chip.

New route `src/app/api/threads/counts/route.ts` serves both the chip row and
the footer badge; the shell has no business pulling 4,000 message rows for one
number. `/api/threads` gains `job_status`, `job_unscoped` and `relation` so the
status chips **filter** and not merely count.

**The Drafts table is not built, on purpose.** An outbox is ahead of the
product — DECISIONS.md §10 parks outbound texting behind 10DLC registration —
it is plausibly specified in WO-15 / FEAT-009b, which have not arrived, and a
migration is yours to authorise under rule 4. Flagged, not invented.

## 4. A stale comment in `/api/threads`, corrected

The route's header said `contacts` SELECT policy was still
`org_id = current_setting('app.current_org_id')`, that nothing sets that GUC,
and that contacts therefore returns **zero** rows through a session client.

That has not been true since migration 024. `contacts_org_select` is now
`org_id = ANY (get_user_org_ids())`. Verified as the `authenticated` role inside
a rolled-back transaction: **197 rows readable, 176 with no name.**

The derive-the-phone-from-messages path is kept anyway — an embed returns null
for a row the caller cannot see, which renders as "no contact" rather than
"permission denied" — but the comment no longer claims something false.

## 5. Checks

Each states what failure looks like. **Only 8–10 could be run here**; the egress
proxy answers 403 on CONNECT for the Supabase host, re-tested today, so no route
was exercised and no browser opened.

| # | Check | Passes | Fails | Status |
|---|---|---|---|---|
| 1 | Chip counts are real | `Unsorted` 176, `Needs you` 130, `All` 197 | any other value, or a constant in the client | **NOT RUN** — SQL proven, §5a |
| 2 | No Drafts chip | no chip labelled Drafts anywhere | one renders at all | **NOT RUN** |
| 3 | Zero chips are honest zeros | `Quoted 0`, `Won 0`, `Vendors 0` | the client hardcodes 0 for a key the API omits | **PARTIAL** — response shape verified, render not |
| 4 | Vendors counts confirmed only | 0 | **135** — that would mean `relation_confirmed_at` is being ignored | **NOT RUN** — SQL proven, §5a |
| 5 | Glass header renders | dark blurred bar, four controls | `backdrop-filter` missing and the `@supports not` fallback absent, making white text unreadable | **NOT RUN** — needs a browser |
| 6 | Emblem shows no invented state | the mark breathes at rest, counter-rotates only during a real fetch | the "asking" animation appears at all | **PASS** — see below |
| 7 | Desktop two-pane | ≥1024px both panes; below, one at a time | a deep link renders no list on desktop, or both on a phone | **NOT RUN** — needs a browser |
| 8 | Typecheck | `tsc --noEmit -p tsconfig.json` exits 0 | any error | **PASS** — 0 errors |
| 9 | Build | `next build` exits 0, `/api/threads/counts` in the route table | any error, or the route absent | **PASS** — 21 pages, route present |
| 10 | Lint | eslint clean on every file touched | any error | **PASS** — no output |

`/dashboard/messages` is still `○` static in the route table, so the Suspense
boundaries around `useSearchParams()` did their job rather than silently opting
the page into dynamic rendering.

**Check 6, stated precisely.** My first version of this check was
`grep -c "sc-em-asking\|sc-em-breathe" src/styles/v34-shell.css` **is 0**. It
returns **1** — it matches the comment in that file explaining why the state is
not ported. A check a comment can fail is not a check. The two that hold:

```
$ grep -nE '^\s*\.sc-em-(asking|breathe)' src/styles/v34-shell.css | wc -l
0                        # no CSS rule defines either class

$ grep -rn 'sc-em-asking|sc-em-breathe' src --include=*.tsx
layout.tsx:24, :25       # both inside a doc comment; neither is in a className
```

No rule defines them and nothing applies them, so the animation cannot fire.

### 5a. The counts, proven against real RLS

Not run through the app, but run as the **`authenticated` role** with Coy's
claims inside a transaction that rolls back — the same technique as work order
13. This is the data layer of checks 1 and 4:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"452203ec-…","role":"authenticated"}';
…
rollback;
```

| | |
|---|---|
| contacts readable as a session (route comment said 0) | **197** |
| unsorted | **176** |
| needs — latest message inbound | **130** |
| all | **197** |
| vendors, confirmed | **0** |
| vendors, ignoring confirmation | **0** — nothing is classified at all |
| jobs quoted / won / unscoped | **0 / 0 / 0** |

If the chips on the preview disagree with this table, the UI is wrong, not the
database.

### 5b. For you to run

1. Open `/dashboard/messages` on a phone. **Passes** if the header is a dark
   blurred bar with search, pipeline, `+` and menu, and the footer has five
   slots with the emblem in the middle. **Fails** if the header is white — that
   means the CSS import did not land.
2. Watch the emblem on load. **Passes** if it counter-rotates briefly, then
   settles to a slow pulse. **Fails** if it never moves (classes dropped again)
   or never settles (a fetch is hanging).
3. Tap **Unsorted**. **Passes** on 176 and a list of phone numbers. **Fails** on
   any other number.
4. Tap the funnel, then **Vendors**. **Passes** on 0 and an empty state
   explaining that 190 of 197 carry the `customer` default. **Fails** on 135.
5. Tap a row. **Passes** if it expands in place with the full preview, channel,
   count and timestamp, and **Open thread** navigates. **Fails** if tapping
   navigates immediately — that is the old behaviour.
6. Open the same URL on a desktop browser ≥1024px and click a thread.
   **Passes** if the list stays put on the left and the conversation opens on
   the right. **Fails** if the list disappears.
7. Tap `+`. **Passes** if all four rows are dimmed and say what they need.
   **Fails** if any is tappable — nothing is creatable until PR #10 merges.

## 6. What building without `scope-proposals.jsx` cost

I checked v34 against your WO-17 bullet item by item before starting. Seven of
the eight items are in v34 today: glass header, live emblem, search · pipeline ·
`+` · menu, the five-slot footer, `FILTERS` with counts, `ThreadRow` with
expand, and the conversation view. Only the desktop two-pane is net-new.

**Where rework is likely if the newer file differs:**

- **The expanded row.** v34's version offers "Tell Dusty what this is", an
  About-them channel and scope actions. None have a writer, so mine shows only
  what exists: full preview, channel, message count, exact timestamp, a note
  when nobody has named the number, and **Open thread**. If
  `scope-proposals.jsx` has a different expand, this is the part that changes.
- **The chip set.** Mine is v34's `FILTERS` minus `drafts`. A newer file may
  have reordered or renamed them.
- **The desktop pane split.** I chose a fixed 380/420px rail at `lg`/`xl` with
  the conversation taking the rest. Nothing specified it.

Everything else is close enough to v34 that a newer reference would be
confirming rather than correcting.

## 7. Open questions

1. **The Dusty emblem.** It opens a sheet saying Dusty is not wired. There *is*
   an existing `/dusty` route — 461 lines, its own dark "Cleo" palette, an
   estimator rather than the channels list DECISIONS.md §6 describes. Pointing
   the emblem at it would drop you into what looks like a different app. Leave
   the sheet, or wire it to `/dusty` anyway?
2. **The Drafts table.** §3. One table, and it is yours to authorise. Is a draft
   an unsent SMS (blocked on 10DLC) or something wider — a note to self, a
   prepared answer Dusty wrote?
3. **`src/app/globals.css` still carries the pre-v34 dark brand**
   (`--color-background: #0a0a0a`, safety orange `#e85d04`). Nothing in this
   work order reads it, so I left it under rule 1, but it is now the only place
   in the repo asserting a design system the product abandoned. Separate
   cleanup?
4. **Search.** The header box filters names, numbers and each thread's latest
   message, and the UI says exactly that. The desktop design promises full text
   over every message, which it calls the desktop's real advantage over the
   phone. That is a different thing — a query against `messages.body_text` and
   `call_artifacts` — and it is not in this work order. Worth its own?
