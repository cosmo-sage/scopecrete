# Work order 9 report — 2026-08-29

**The build is green under exactly the three variables the Vercel project now
has.** Pushed to `master` as `b322344`.

I have not signed in — the egress policy here still blocks the tunnel to the
Supabase host, so the second half of the pass condition is yours. §5 has the
steps.

**One thing in §4 will bite before you finish testing: the pipeline route is now
correct and will still return zero leads,** because `leads` and `estimates` RLS
gate on a GUC nothing sets. That is a migration, and it is yours to apply.

---

## 1. Task 1 — `/api/dashboard/pipeline`

Rewritten on `getApiSession`. `src/app/api/dashboard/pipeline/route.ts`:

- Session from the request at **L80**; the client is built **inside the
  handler**, per request.
- `leads` query at **L88**, filtered `org_id = orgId` at **L93** where `orgId`
  comes from the caller's `org_members` row.
- `estimates` at **L108**, only when there are leads to match.
- Errors are returned as 500s naming the table, instead of the previous
  `catch → "Internal server error"`.
- Rows are typed (`LeadRow`, `StageLead`, `Stage`) rather than `Record<string, any>`.

**Why it broke the build, precisely.** The old line 7 was

```ts
const supabase = createClient(supabaseUrl, supabaseServiceKey);
```

at **module scope**. Next evaluates module scope while collecting page data at
build time, so a deleted `SUPABASE_SERVICE_ROLE_KEY` resolved to `""` and the
constructor threw during the build rather than during a request. That is the
general lesson worth keeping: **a credential read at module scope converts a
missing variable into a failed deployment.** Every client in the codebase is now
built inside a handler, except the two deliberate module-scope singletons
covered in §3.

It was also the §7 violation from work orders 5 and 7 — service role on a
browser-reachable path, `org_id` off the query string, no auth check. Both
faults died with the same rewrite.

## 2. Task 2 — `/api/session/org`

**Deleted**, not gated. Once the pipeline derives the org from the session, an
endpoint whose whole job is telling a caller their org id has no purpose — and
it was handing `DEV_ORG_ID` or a hardcoded org uuid to anyone who asked.

It had **two** callers, not one:

- `src/app/dashboard/page.tsx` **L140**
- `src/app/dashboard/leads/page.tsx` **L95**

Both now call `fetch("/api/dashboard/pipeline")` with no parameter, and neither
page holds an `orgId` state any more. The browser never sees or sends an org id.

`DEV_ORG_ID` has no remaining reader.

## 3. Task 3 — the env var audit

Every `process.env` read in `src/`, all 25, against the three variables that
survive (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SECRET_KEY`).

**`POSTGRES_*`: zero occurrences anywhere in the repository** — not in `src/`,
not in config, not in `supabase/`. Confirmed with a repo-wide grep excluding
`node_modules`, `.next` and `.git`.

### Reads a deleted name — still broken

| file | line | name | effect |
|---|---|---|---|
| `src/app/api/capture/route.ts` | 12 | `SUPABASE_SERVICE_ROLE_KEY` | returns 500 "Server config error" on every call. Request scope, so it does not break the build — it is just permanently dead. |
| `src/app/api/leads/route.ts` | 48 | `SUPABASE_URL` | falls back to `NEXT_PUBLIC_SUPABASE_URL`, so harmless. |
| `src/app/api/leads/route.ts` | 49 | `SUPABASE_SERVICE_ROLE_KEY` | **falls back to the anon key.** Not harmless — see below. |

**`leads/route.ts` L49 is the one to look at.** The fallback chain ends
`|| process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`, so with the service key deleted
the route keeps working with anon privileges: every query silently RLS-filtered,
most returning nothing, and no error anywhere. That is the exact failure shape
`src/lib/supabase-admin.ts` refuses to allow, in the comment at its head — a
credential that is absent is a configuration error, not a degraded mode. I have
left it per standing rule 1, but it is a silent-wrong-answer bug, not a dormant
one.

### Safe

- `src/lib/supabase-admin.ts` **L27–28**: `SUPABASE_SECRET_KEY ||
  SUPABASE_SERVICE_ROLE_KEY`. The surviving name is tried **first**, so the six
  routes importing `supabaseAdmin` build and run. This is why only the pipeline
  route failed the build and not all seven.
- `NEXT_PUBLIC_SUPABASE_URL` (10 reads) and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (6 reads) — both survive.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — added yesterday, fail closed when unset.

### Non-Supabase, unverified by me

`OPENAI_API_KEY` (`api/parse/route.ts` L3), `TELEGRAM_BOT_TOKEN` and
`DOCTOR_CHAT_ID` (`api/chat/doctor/route.ts` L6, L25). All request-scope, so
none can break a build. Whether they are still set in Vercel is not something I
can see from here.

## 4. The pipeline will still return zero rows

Standing rule 6 made me check RLS before writing the query, and it is a good
thing:

| table | select policy |
|---|---|
| `contacts` | `org_id = ANY (get_user_org_ids())` ✅ migration 022 |
| `messages`, `call_artifacts`, `org_phone_numbers` | `get_user_org_ids()` ✅ |
| **`leads`** | `org_id = current_setting('app.current_org_id')::uuid` ❌ |
| **`estimates`** | `org_id = current_setting('app.current_org_id')::uuid` ❌ |

Nothing in this codebase sets that GUC — I grepped `src/` and `supabase/`, and
the only hit is a comment. Under a session-scoped client the predicate is null,
so RLS filters everything and the route returns an empty pipeline with no error.

Migration 022 fixed `contacts`. `leads` and `estimates` were not included.

**This is a database change and I have not applied it** — DECISIONS.md §7, no
widening changes on agent judgement. The shape matches what 022 already did:

```sql
alter policy leads_org_select on public.leads
  using (org_id = any (get_user_org_ids()));
alter policy estimates_org_select on public.estimates
  using (org_id = any (get_user_org_ids()));
```

Both `_update` policies carry the same dead GUC, so editing a lead would fail
silently too — the same both-read-and-write pattern you found on `contacts`.

I want to be blunt about the trade: putting the service-role key back would make
the dashboard show leads tonight. It would also restore an endpoint that leaks
every contractor's pipeline to an unauthenticated caller. The migration is the
right fix.

## 5. What is UNVERIFIED — pass conditions

**Build: verified, and by the right method.** My sandbox's `.env.local` contains
`SUPABASE_SERVICE_ROLE_KEY`, so an ordinary local build would have proven
nothing. I moved it aside and built with `env -u SUPABASE_SERVICE_ROLE_KEY -u
DEV_ORG_ID` and only the three production names set:

```
✓ Compiled successfully in 5.6s
✓ Generating static pages (29/29)
BUILD EXIT: 0
```

`/api/session/org` is absent from the route table; `/api/dashboard/pipeline` is
present as a dynamic route. `tsc --noEmit -p tsconfig.json` → 0 errors.

**Sign-in: not verified, and not attemptable here.** Egress from this sandbox to
`cxiusuewtrvcpqequueh.supabase.co` is refused at CONNECT with 403, an
organisation egress-policy denial. For you:

1. Redeploy. The build should pass.
2. `scopecrete.vercel.app` → `admin@saccobuilt.com` → expect `/dashboard/messages`.
3. Messages should populate — `messages` and `call_artifacts` are on
   `get_user_org_ids()`, so that page is unaffected by §4.
4. `/dashboard` and `/dashboard/leads` will show an **empty pipeline** until the
   §4 migration is applied. That is expected, not a regression.

## 6. What I found but did not touch

- **`leads/route.ts` L49 anon-key fallback** (§3). Silent degradation.
- **`capture/route.ts` L12** permanently 500s.
- **`api/admin/chat/sessions/route.ts`** — still service-role on a
  browser-reachable route, still takes `user_id` from a query parameter, and its
  `sc_session` cookie check can never return non-null because that cookie is a
  fixed string, not a JWT. Carried from the work order 8 report, still open.
- **Both dashboard pages swallow fetch failures** (`r.ok ? r.json() : null`), so
  a 401 or 500 renders as an empty dashboard. Given how much of this week has
  been spent on states that look empty when they are actually broken, this is
  worth its own pass — but it is UI work, not the build fix.

## 7. What broke or surprised me

**My work-order-8 diagnosis was wrong and this supersedes it.** I wrote that the
lost hour was a Supabase 429 rate limit being reported as a bad password. It
was not. `ERR_NAME_NOT_RESOLVED` means the browser could not resolve the host at
all — the app was pointed at the deleted project `ryukbcmewvbeqhczhxag` and has
never once reached the real database. The generic error string was still a real
defect and the fix still stands; my explanation of what it was hiding was
incorrect, and I stated it with more confidence than the evidence carried. I had
`auth.users` showing a successful sign-in at 05:30 and treated that as proof the
production path worked, when it only ever proved that *some* client reached
Supabase.

The corrected chain: dead project → DNS failure → generic catch-all → "Email or
password is incorrect."

**The thing I nearly missed.** My first build passed, and I almost reported that
as the fix verified. It passed because `.env.local` still had
`SUPABASE_SERVICE_ROLE_KEY` — the very variable that no longer exists in
production. A green build in an environment richer than production proves
nothing about production. Rebuilding with the variable explicitly unset is the
only check that meant anything, and it is the difference between this report and
a second failed deploy.

**`/api/session/org` had two callers.** I found the second only by grepping
after deleting the file. Deleting first and grepping second is the wrong order;
it worked here because the grep was still part of the same change.

## 8. Open questions for Coy

1. **Apply the §4 migration?** Without it `/dashboard` and `/dashboard/leads` are
   empty for everyone. Say the word and I will write it as `023_*.sql` for you to
   apply — I will not apply it myself.
2. **`leads/route.ts` anon fallback** — remove the fallback so it fails loudly,
   or move the route to `supabaseAdmin`? It is currently answering with
   RLS-filtered results and calling that success.
3. **Is `OPENAI_API_KEY` still set in Vercel?** `/api/parse` needs it and I
   cannot see the project's variables from here.
4. **WO7 Tasks 2 and 3 (candidate query, voicemail sweep) remain untouched** and
   still blocked on the same egress denial. Task 2 also needs a
   `voicemail_checked_at` column, which is a migration.
