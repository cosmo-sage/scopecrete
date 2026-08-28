# Work order 5 report — 2026-08-28

All four tasks are built and committed to `master` as `e430c4f`. Nothing was
deployed — these are Next.js routes and pages, which ship with the Vercel
deploy, plus one edge-function source change that is **not** deployed and is
called out in §6.

The headline finding is in §5 and it changes what you should expect to see:
**`contacts` is not readable through a session-scoped client**, so the thread
list is built without it. It still renders correctly, because the fallback is
the phone number and that is already the right rendering for 124 of 144
contacts. But the 20 real names will not appear until an RLS policy is fixed,
and that fix is a database change I did not make.

---

## 1. What I actually changed

**`src/lib/api-auth.ts`** — new. `getApiSession()` at L35: session-scoped
`createServerClient`, `auth.getUser()`, then `org_id` from the caller's
`org_members` row. Lifted out of `api/dashboard/cashflow/route.ts` so four new
routes could not each re-implement the cookie plumbing slightly differently.

**`src/app/api/threads/route.ts`** — new. Thread list. `formatPhone()` L65,
`synthesise()` L74, handler L88. Reads `org_phone_numbers` then `messages`;
folds newest-first rows into one per contact at L121–127.

**`src/app/api/threads/[contactId]/route.ts`** — new. One thread's messages,
oldest first. Derives `counterparty_phone` at L72–79. Fetches artifact *kinds*
only (L84–96) — never content.

**`src/app/api/messages/[messageId]/artifacts/route.ts`** — new. Per-message
artifacts, called on expand.

**`src/app/api/dashboard/drift/route.ts`** — new. `sc_spine_drift` count. Returns
`count: null` plus an `error` on failure rather than 0 — see §8.

**`src/app/dashboard/messages/page.tsx`** — rewritten. `avatarGlyph()` L35
replaces `getInitials(name || "UN")`. Loading / error / empty / populated states.

**`src/app/dashboard/messages/[id]/page.tsx`** — rewritten. `CallRow` L74 with
expand-to-load transcript, `SmsRow` L215. The composer is gone (§7).

**`src/app/dashboard/page.tsx`** — `DriftIndicator` added at L64, rendered at
L203 under the stat cards.

**`supabase/functions/backfill-call-media/index.ts`** — `mirrorToMessages()` and
its call site removed; 434 → 409 lines. Replaced by a comment block at L213
recording why. **Source only — not deployed.**

---

## 2. The queries I wired

Not the work order's SQL — these are the PostgREST calls actually in the code.

**Thread list** (`api/threads/route.ts`). Two reads, folded in TypeScript:

```ts
// L96
supabase.from("org_phone_numbers").select("phone_e164").eq("org_id", orgId)

// L106
supabase.from("messages")
  .select("id, contact_id, channel, direction, occurred_at, body_text, summary, duration_seconds, from_address, to_address")
  .eq("org_id", orgId)
  .not("contact_id", "is", null)
  .order("occurred_at", { ascending: false })
  .limit(4000)

// L135 — opportunistic, may legitimately return nothing
supabase.from("contacts")
  .select("id, name, phone, contact_type, contact_subtype")
  .in("id", contactIds.slice(0, 1000))
```

The work order's `distinct on (m.contact_id)` has no PostgREST equivalent, so
the fold happens client-side: rows arrive newest-first, and the first row seen
for a contact is its latest (L121–127). `msg_count` comes from the same pass
rather than a correlated subquery per contact.

**Thread detail** (`api/threads/[contactId]/route.ts`):

```ts
supabase.from("messages")
  .select("id, channel, direction, occurred_at, body_text, summary, summary_source, duration_seconds, recording_url, status, from_address, to_address")
  .eq("org_id", orgId).eq("contact_id", contactId)
  .order("occurred_at", { ascending: true }).limit(2000)

supabase.from("call_artifacts").select("message_id, kind")   // kinds only
  .eq("org_id", orgId).in("message_id", ids.slice(0, 1000))
```

`from_address`/`to_address` are stripped before the response (L80); they exist
only to derive the counterparty.

**Artifacts, on expand** (`api/messages/[messageId]/artifacts/route.ts`):

```ts
supabase.from("call_artifacts")
  .select("kind, source, content, url, fetched_at")
  .eq("org_id", orgId).eq("message_id", messageId)
  .order("kind", { ascending: true })
```

**Drift** (`api/dashboard/drift/route.ts`):

```ts
supabase.from("sc_spine_drift").select("*", { count: "exact", head: true })
```

`head: true` — the count without the rows.

---

## 3. What renders in the hard cases

I ran the equivalent SQL against production to see real output rather than
describe intent. Twelve most-recent threads:

```
display          name_is_phone  channel  preview_source  preview
+14053089143     true           sms      body            Found some plates but a couple days late😆
Luis             false          sms      body            I forgot to give you the blade don't think I forgot…
+18565054298     true           call     synthesised     Inbound call
+12255299098     true           sms      body            New call from: Baton Rouge Concreters…
+12252359638     true           call     summary         This call had no actionable details to summarize.
+19854462212     true           call     summary         Coy Sacco called LA Contracting to inquire if Dylan…
+13377545207     true           call     summary         Jennifer from Ace Hardware called Coy Sacco…
+15019440327     true           sms      body            Thx
```

Three of those are the exact strings the work order gave as eyeball targets,
including `This call had no actionable details to summarize.` — which renders
verbatim. It is not special-cased away.

**A contact with no name.** Display is the formatted phone, `(405) 308-9143`,
in a tabular-numeric font so it reads as an identifier rather than as somebody
named "(405)…". The avatar is the last two digits of the number on a muted grey
ground, not the accent colour — so named and unnamed rows are distinguishable
at a glance without either looking broken. `avatarGlyph()` never falls back to a
literal string. **Nothing writes or infers a name.**

**A call with no summary** — 446 of 462 calls. The list shows the synthesised
line, `Incoming call · 49s · 23 Aug`, in italic muted text so it reads as
metadata rather than as something a person said. In the thread detail the glance
line reads `No summary · 49s`. The preview line has `minHeight: 1.1rem` and a
fixed `lineHeight`, so when the backfill lands and summaries appear, rows do not
change height and the list does not reflow.

**A call with no recording** — 403 of 462. No audio element renders at all. No
disabled play button, no placeholder: an absent recording is silent rather than
shown as a broken control.

**Luis, 348 messages.** He is one of the 20 named contacts, so he displays as
`Luis`. The detail route caps at 2,000 messages, so all 348 load in one request,
oldest first — roughly 40 KB of text, which is fine. What is *not* loaded is any
transcript: the thread query fetches artifact **kinds** only, so a call in that
thread carries `["transcript"]` as a label and the ~10,600-character body is
fetched only if you expand that specific row. The 348 rows render as bubbles
with no virtualisation; that is acceptable at this size and would need windowing
somewhere north of a few thousand.

**`next_steps`** (9 calls) renders above the summary inside an expanded call, in
its own tinted block with an accent label — the most prominent thing in the
expansion, since it is the closest the system gets to what the caller wanted.

---

## 4. Speaker label resolution

Not built, as instructed. What it would take:

Transcripts are one utterance per line, `+E164: text`:

```
+12253782458: Hey.
+19853188307: Hello?
```

1. **Parse at display time.** Split on newline, match `^(\+\d+):\s?(.*)$`. Lines
   that do not match are continuations of the previous utterance and must be
   appended, not dropped — a sentence containing a colon would otherwise be
   silently truncated.
2. **Identify our side** by membership in `org_phone_numbers.phone_e164` (3 rows:
   Main `+12253782458`, Third `+12255083258`, Cell `+19858608287`). Not
   `orgs.business_phone` — it holds one number, and a call on the cell would
   render Coy as a stranger.
3. **Resolve the other side** against `contacts.phone`. Both are E.164 so no
   normalisation is needed today. This inherits the RLS problem in §5: until
   `contacts` is readable, the far side stays a number.
4. **Do not assume two parties.** Both transcripts I inspected have exactly two,
   but a transfer or conference produces a third label, which must render as
   itself rather than break the parse or get mislabelled as one of the two.
5. **Never take a name from transcript content.** One transcript opens
   `+12253782458: Hey, Carlos.` / `+17134542977: Hey, Corey.` — two names in two
   lines, neither a self-identification. That is the trap that put "Brad Chaney"
   on a lead-gen service.

Cost: a parser plus one join, all at display time, no schema change. The payoff
beyond cosmetics is per-speaker turns, which is what makes a transcript
skimmable rather than a wall.

---

## 5. What I verified, and how

**The whole project typechecks.** `node_modules/.bin/tsc --noEmit -p
tsconfig.json` → **0 errors**. It caught two real ones I had introduced
(implicit `any` on the `org_phone_numbers` map callbacks) which I fixed before
committing.

**RLS, before writing anything.** `pg_policies` for the five tables involved:

```
messages          messages_org           ALL     (org_id = ANY (get_user_org_ids()))
call_artifacts    call_artifacts_select  SELECT  (org_id = ANY (get_user_org_ids()))
org_phone_numbers org_phone_numbers_rw   ALL     (org_id = ANY (get_user_org_ids()))
org_members       org_members_read       SELECT  (auth.uid() IS NOT NULL AND org_id = ANY (get_user_org_ids()))
contacts          contacts_org_select    SELECT  (org_id = (current_setting('app.current_org_id', true))::uuid)
```

**`contacts` is the odd one out**, and it is the GUC that DECISIONS.md §9 records
as not yet migrated to `auth.uid()` + `org_members`. `grep -rn
"current_org_id\|set_config" src/` returns **nothing** — the app never sets that
GUC. So through a session client the setting is null, the predicate is null, and
`contacts` returns **zero rows**. The work order's query is correct and returns
real rows when run as service role, which is how it was verified; it returns
nothing through the route that DECISIONS.md §7 requires me to write.

That is why the list derives the counterparty from `messages` instead. The
response carries `contacts_readable` so an empty name column is diagnosable
from the payload rather than looking like a UI bug.

**The org has three lines**, confirmed: Main `+12253782458`, Third
`+12255083258`, Cell `+19858608287`.

**Coy has an `org_members` row** — `coysacco@gmail.com`, role `owner`, org
`61e26b09…` (Sacco Builders) — so `get_user_org_ids()` resolves and
`messages`/`call_artifacts` are readable.

**`sc_spine_drift` is readable.** It is a **view** (`relkind = 'v'`) with no RLS
of its own, owned by `postgres`, and `has_table_privilege('authenticated', …,
'SELECT')` is true. Being a view over RLS-protected tables, it filters to the
caller's org through the session client. I checked this specifically because an
alarm that cannot read its source and reports 0 is worse than no alarm.

**The rendering logic against real rows** — the table in §3, produced by running
the equivalent SQL against production.

**`backfill-call-media` after the edit:** `grep -n "from('messages')\|
mirrorToMessages"` returns one hit, the explanatory comment at L213. No code
reference remains, `messages_mirror` has no dangling references, and both
`voip_calls` writes survive. Its TS error profile is **unchanged**: 5 × TS2304,
2 × TS2307, 9 × TS2339 before and after — I confirmed by stashing my edit and
re-running. The 9 × TS2339 are pre-existing (discriminated-union narrowing on
`apiGet`'s return, work-order-4 territory), not mine.

---

## 6. What is UNVERIFIED

**Nothing was rendered in a browser.** I typechecked, and I verified the data
the routes will return by running equivalent SQL, but I did not start the dev
server or look at a page. Pass condition: `/dashboard/messages` shows a list
headed by `(405) 308-9143 — Found some plates but a couple days late😆` and
`Luis — I forgot to give you the blade…`, with a `348` count on Luis's row.

**No route was called with a real session.** All four are session-scoped, so
they 401 without a Supabase auth cookie. Pass condition: logged in as
`coysacco@gmail.com`, `GET /api/threads` returns HTTP 200 with a non-empty
`threads` array and `"contacts_readable": false`. If it returns 401, the
dashboard is not carrying a Supabase session — see §9 question 2.

**`backfill-call-media` is not deployed.** Production still runs **version 2**,
which still contains `mirrorToMessages`. Stripping it in source does not remove
the second writer from production. I did not deploy because the work order said
to strip it *in this PR*, and deploying an edge function was not asked for here.
Pass condition after you deploy: `list_edge_functions` shows version 3+, and a
subsequent run logs no `[anomaly] no messages twin` lines.

**The drift indicator's non-zero and failure states have not been seen.** Drift
reads 1 today (the known self-text), so the warning state should be what
renders. The failure state — count unknown — I could not trigger without
breaking the view.

---

## 7. What I found but did not touch

**`contacts` RLS uses the unmigrated GUC — high, and it is what blocks names.**
`contacts_org_select` gates on `current_setting('app.current_org_id')`. The fix
is to match the other tables:

```sql
alter policy contacts_org_select on public.contacts
  using (org_id = any (get_user_org_ids()));
```

I did not apply it. DECISIONS.md §7 forbids widening database changes on agent
judgment, and this *is* widening: it grants authenticated users read access they
currently do not have. It needs your confirmation. Everything else in the thread
list works without it.

**`/api/dashboard/pipeline` takes `org_id` from a query param.**
`src/app/dashboard/page.tsx` L147 calls
`` fetch(`/api/dashboard/pipeline?org_id=${orgId}`) ``. That is the exact
pattern DECISIONS.md §7 was written about after PR #1. I did not touch it — it
is outside this work order — but it sits three lines from code I edited.

**`/api/session/org` has no authentication.** It returns
`process.env.DEV_ORG_ID` or a hardcoded org uuid to any caller. A dev shortcut,
but it is a live route.

**`backfill-call-media`'s `apiGet` discriminated union** produces 9 × TS2339.
Pre-existing and squarely work-order-4 territory.

**`enrich-contacts` still reads `sms_threads.media_urls`** — the only reason
that table is still alive. Any future migration dropping it has to deal with
this first.

---

## 8. What broke or surprised me

**The `contacts` RLS policy.** I expected the work order's verified query to
work through a session client and it does not. It was verified as service role,
which sees everything. This is the difference between "the query returns rows"
and "the query returns rows *to the caller we are required to use*", and it
would have shipped as an empty inbox if I had written the obvious join and
trusted the verification. Catching it needed a `pg_policies` read before writing
any code, not after.

**I wrote a real bug and caught it on re-read.** In the first draft of the detail
page I left `const phone = messages.find(…)?.body_text ? null : null` — a
ternary with the same value on both branches, so the header would have shown
"Unknown" on every thread forever. It typechecks perfectly. I fixed it by
returning `counterparty_phone` from the API instead, but it is worth recording
that `tsc` clean is not the same as correct, and the thing that caught it was
reading my own output rather than any tool.

**I removed the composer**, which is more than "wire it to real data". It
appended a local message then faked a Dusty reply on a 1s timer. Against mock
data that is a harmless prototype; against real customer history it writes
invented messages into a view of what people actually said, and DECISIONS.md §10
is explicit that all outbound contact is Coy himself and there is no
bot-initiated outreach — quite apart from 10DLC not being registered. Leaving it
pointed at real threads seemed clearly worse than removing it, but it is a
judgement I made rather than one the work order asked for.

**The `distinct on` does not survive the trip to PostgREST**, so the fold is in
TypeScript over up to 4,000 rows. At 1,153 messages that is one request and
irrelevant; at 50,000 it needs an RPC or a view. Noted, not built.

---

## 9. Open questions for Coy

**1. May I fix the `contacts` RLS policy?** One `alter policy`, in §7. It is the
only thing standing between the current list and showing the 20 real names. It
is a widening change so §7 says I need your say-so.

**2. Does the dashboard actually carry a Supabase auth session?**
`/api/session/org` returns a hardcoded org with no auth, and the pipeline fetch
passes `org_id` as a param — both suggest the app may not be relying on Supabase
auth cookies yet. Every route I wrote requires one and 401s without it. If the
dashboard is not authenticating, Threads will show "Couldn't load messages —
Not authenticated" and the fix is session wiring, not these routes.

**3. Do you want `backfill-call-media` deployed?** Source is stripped; production
still has the write. It is admin-invoked so there is no webhook risk, and it is
the last second writer.

**4. Was removing the composer right?** If you want a send path back, it should
post a real outbound message through Quo rather than simulate one — which is
10DLC-gated work, not a UI change.

**5. Virtualisation threshold.** Luis at 348 messages renders fine unvirtualised.
If any thread is expected to reach several thousand, the detail view needs
windowing before that happens rather than after.
