# Work order 10 report — 2026-08-29

**Phase 0 only. Nothing has been deleted, nothing has been ported.** The working
tree is unchanged apart from this file.

Three things in the brief did not survive checking — the Tailwind claim, the
mock-constant count, and the file's own version. §7 has them. None of them
changes the plan; one changes how Phase 1 is sequenced.

---

## 1. Phase 0 inventory

### Pages — 15

| page | verdict | depends on / notes |
|---|---|---|
| `app/page.tsx` | **KEEP** | sign-in card, `describeAuthError()` |
| `app/auth/reset-password/page.tsx` | **KEEP** | recovery flow |
| `app/dashboard/messages/page.tsx` | **REPLACE** | v34 `ThreadsScreen`. The reference implementation — port its behaviour before deleting it |
| `app/dashboard/messages/[id]/page.tsx` | **REPLACE** | v34 thread detail. Same: it is the only correct renderer of voicemail/next_steps/expand-to-load |
| `app/dashboard/page.tsx` | **REPLACE** | v34 Home. Imports `DustyDrawer`; fetches `drift` + `pipeline` |
| `app/dashboard/leads/page.tsx` | **REPLACE** | v34 Pipeline. Fetches `pipeline` |
| `app/dashboard/leads/[id]/page.tsx` | **REPLACE** | fetches `/api/leads/${id}` — **which does not exist** (see §7) |
| `app/dashboard/cash/page.tsx` | **REPLACE** | v34 Cash. Fetches `cashflow`, already renders honest empty states |
| `app/dashboard/profile/page.tsx` | **REPLACE** | v34 More/Account. Shows an invented person today |
| `app/dashboard/layout.tsx` | **REPLACE** | four-tab shell → v34 `HOME_TABS` |
| `app/login/page.tsx` + `LoginForm.tsx` | **DELETE** | Google-only second sign-in page, unreachable from `/`. Nothing links to it |
| `app/dashboard-login` | *(already deleted, WO8)* | — |
| `app/maintenance/page.tsx` | **UNSURE** | not linked from the app. May be pointed at by DNS/Vercel config I cannot see |
| `app/mock1/page.tsx` | **DELETE** | mock landing page. Sole consumer of `ChatWidgetPreview`, `DustyBubble` |
| `app/calculator/page.tsx` | **UNSURE** | public estimator. Fetches `estimate` + `leads`. DECISIONS.md §1 calls the customer-facing estimator one of the two doors — do not delete without deciding that |
| `app/dusty/page.tsx` | **UNSURE** | fetches `estimate`, `leads`, `parse`. Relationship to v34's Dusty is yours to call |
| `app/scope-builder/[leadId]/page.tsx` | **UNSURE** | uses `ScopeTab`; v34 has its own Scope screen |

### API routes — 20

| route | verdict | auth posture | called by |
|---|---|---|---|
| `api/threads` | **KEEP** | session-scoped | messages page |
| `api/threads/[contactId]` | **KEEP** | session-scoped | message detail |
| `api/messages/[messageId]/artifacts` | **KEEP** | session-scoped | message detail |
| `api/dashboard/drift` | **KEEP** | session-scoped | dashboard home |
| `api/dashboard/pipeline` | **KEEP** | session-scoped | home + leads |
| `api/dashboard/cashflow` | **KEEP** | `getUser()` + `org_members`, inline | cash page |
| `auth/callback` | **KEEP** | n/a | recovery + OAuth |
| `api/admin/chat/sessions` | **DELETE** | service role, no auth | `AIChatDrawer` only — **which nothing imports** |
| `api/admin/chat/sessions/[id]/messages` | **DELETE** | service role, no auth | same |
| `api/admin/chat` | **DELETE** | service role, no auth | no caller found |
| `api/admin/orphaned-leads` | **DELETE** | service role, no auth | no caller. See §2 — this is the worst one |
| `api/admin/login` | **DELETE** | env-gated, fails closed | **no `/admin` pages exist at all** |
| `api/capture` | **DELETE** | service role, no auth | no caller. Cannot ever have worked — see §2 |
| `api/test` | **DELETE** | none | echoes the request body. 6 lines |
| `api/chat/sessions` | **UNSURE** | service role, no auth | no caller found; `admin_chat_sessions` holds **22 real rows** |
| `api/chat/sessions/[id]/messages` | **UNSURE** | service role, no auth | same |
| `api/chat/doctor` | **UNSURE** | Telegram | no caller. Needs `TELEGRAM_BOT_TOKEN`, `DOCTOR_CHAT_ID` — I cannot see whether they are set |
| `api/chat/dusty` | **UNSURE** | none | hardcoded `http://100.113.194.47:8000` (Tailscale) |
| `api/estimate` | **UNSURE** | none | calculator, dusty. Hardcodes `https://scopecrete.ai/bid-engine/calculate` |
| `api/parse` | **UNSURE** | none | dusty. Needs `OPENAI_API_KEY` — cannot see whether it is set |
| `api/leads` | **UNSURE** | service role, no auth | calculator, dusty. **Falls back to the anon key** (WO9 §3) |

### Components — 12

Seven are **orphans that nothing imports**: `AIChatDrawer`, `AIPanel`,
`DustyFAB`, `KanbanBoard`, `KanbanCard`, `MobilePipeline`,
`TabletHeroAnimation`. All **DELETE**.

`MobilePipeline` is worth naming: it fetches
`/api/dashboard/pipeline?org_id=61e26b09-…` with the **org id hardcoded in the
source**. Dead today, and exactly the pattern WO9 removed.

In use: `DustyDrawer` (5 pages), `ToolboxDrawer` (2), `ChatWidgetPreview` +
`DustyBubble` (`mock1` only), `ScopeTab` (`scope-builder` only) — all
**REPLACE** or fall with their page.

### Libraries

`api-auth.ts`, `supabase.ts`, `supabase-admin.ts`, `design-tokens.ts` — **KEEP**.
`auth.ts` **UNSURE**: its `signInWithGoogle` is used only by the `/login` page
proposed for deletion; `signOut` will be needed by v34's account screen.
`contractor-data.ts`, `theme.ts`, `utils.ts` — **UNSURE**, not yet traced.

---

## 2. What I propose to delete — awaiting approval

**Tier 1 — dead and provably harmless (11 items).** Nothing imports or fetches
any of these.

`app/mock1/`, `app/login/`, `api/test`, `api/admin/chat`,
`api/admin/chat/sessions`, `api/admin/chat/sessions/[id]/messages`,
`api/admin/orphaned-leads`, `api/admin/login`, `api/capture`, and the seven
orphan components.

Two need their evidence stated, because both look risky and are not:

**`api/capture` cannot ever have worked, independently of the env var.** It
POSTs to `contractor_leads` and, on failure, tries to create that table through
an `exec_sql` RPC. I checked the live database:

```
contractor_leads_exists  0
exec_sql_exists          0
```

Neither the table nor the RPC exists. So even if something external is posting
to it — which I cannot rule out from here — **it has never once succeeded**, and
deleting it removes a 500, not a data path. It is also a service-role route that
would create tables on demand if that RPC were ever added.

**`api/admin/orphaned-leads` is the most dangerous route in the repo.** Service
role, no auth, and it takes both `lead_id` and `org_id` from the request body:

```ts
await supabaseAdmin.from("leads").update({ org_id }).eq("id", lead_id)
```

An unauthenticated caller can move any lead into any org. That is not a read
leak like the pipeline route was — it is an unauthenticated cross-tenant
**write**. It has no caller. I would delete it whether or not v34 happens.

**`api/admin/login` has no UI.** There is no `src/app/admin` directory at all, so
`/admin/login` — the path `proxy.ts` redirects to — is a 404. The gate in
`proxy.ts` L16–21 protects routes that do not exist. Deleting the route means
`proxy.ts`'s admin block and the last `sc_session` readers can go too, closing
out WO8 §4.

**Tier 2 — needs your answer first (not proposed for deletion).**

- `api/chat/sessions` + `[id]/messages` — no in-app caller, but
  `admin_chat_sessions` has **22 real rows**. Deleting the routes does not delete
  the data, but it removes the only way to reach it.
- `api/parse`, `api/chat/doctor`, `api/chat/dusty`, `api/estimate`, `api/leads` —
  all tied to the calculator/dusty public path, which DECISIONS.md §1 describes
  as one of the two doors. Whether v34 replaces that door is your call, not mine.
- `app/maintenance` — I cannot see Vercel's routing config from here.

---

## 3. What I have NOT touched

Every item on the do-not-delete list, verified present on disk this run:

```
OK  src/lib/api-auth.ts          OK  src/app/api/threads/route.ts
OK  src/proxy.ts                 OK  src/app/api/threads/[contactId]/route.ts
OK  src/app/page.tsx             OK  src/app/api/messages/[messageId]/artifacts/route.ts
OK  src/app/auth/callback/route.ts   OK  src/app/api/dashboard/drift/route.ts
OK  src/app/auth/reset-password/page.tsx  OK  src/app/api/dashboard/pipeline/route.ts
OK  src/lib/supabase-admin.ts
```

`supabase/` — 10 files, **0 changes** in `git status`. Untouched.

No environment variable reads were added or changed.

---

## 4. Phase 1 progress

**None, deliberately.** The work order gates Phase 1 on your approval of the
delete list, so I stopped. No components ported, no mock constants stripped, no
files created beyond this report.

---

## 5. What I verified, and how

- **Route consumers**: grepped every `fetch(` in `src/`, in all forms including
  template literals, and mapped each to its caller.
- **Component orphans**: for each of the 12 components, grepped the whole tree
  excluding its own definition file.
- **Auth posture per route**: classified all 20 by whether they call
  `getApiSession`, hold a service credential, or touch no database.
- **Live database**, for the empty-state claims in the work order:

| table | rows |
|---|---|
| `leads` | 21 |
| `contacts` | 144 |
| `jobs` | **0** |
| `estimates` | **0** |
| `admin_chat_sessions` | 22 |

  `jobs` and `estimates` at zero confirms Scope and Schedule are genuinely empty.
  **`estimates` is 0** — the work order asked me to check before building
  against it, and the answer is that there is nothing there yet.

- **RLS, per standing rule 6** — and this closes my WO9 §4 warning:

```
leads      leads_org_select      org_id = ANY (get_user_org_ids())
estimates  estimates_org_select  org_id = ANY (get_user_org_ids())
jobs       jobs_member_select    org_id = ANY (get_user_org_ids())
```

  Migration 024 did land. My previous report said the pipeline would return zero
  rows because of the dead GUC; **that is now fixed** and the 21 leads are
  readable through a session client.

- **`contractor_leads` and `exec_sql` do not exist** — the basis for the
  `api/capture` verdict.
- **No `src/app/admin` directory** — the basis for the `api/admin/login` verdict.

---

## 6. What is UNVERIFIED

- **Nothing rendered in a browser.** Egress to the Supabase host is still refused
  at CONNECT by the org policy, so no sign-in completes here. Every Phase 2 pass
  condition needs your machine.
- **Whether anything external POSTs to `api/capture`.** I can prove it has never
  succeeded; I cannot prove nothing calls it. If it is wired into a form
  somewhere off-repo, deleting it changes a 500 into a 404.
- **Whether `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `DOCTOR_CHAT_ID` are set in
  Vercel.** I can only see the three Supabase names from the code side.
- **`app/maintenance` routing.** Cannot see Vercel config.
- **`contractor-data.ts`, `theme.ts`, `utils.ts`** — listed UNSURE because I have
  not traced them, not because they are suspicious.

---

## 7. What broke or surprised me

**v34 does depend on Tailwind.** The work order says it "uses inline style tokens
(`T.*`, `M.*`) — no Tailwind dependency, so it ports cleanly." The file has
**502 `className` attributes**, and they are Tailwind utilities: `flex`,
`shrink-0`, `gap-2.5`, `grid-cols-7`, `min-w-0`, `inset-0`. The colour and type
tokens are inline; **layout is Tailwind.**

This is not a problem — the project already runs Tailwind v4
(`globals.css` opens with `@import "tailwindcss"`). But the conclusion the brief
draws from it is worth correcting, because "no dependency" would have meant I
could lift components into any styling context. I cannot: they need the Tailwind
pipeline, and anything I extract has to keep `className` intact rather than being
"helpfully" converted to inline styles.

**I count 67 top-level constants, not 31.** Roughly half are design tokens and
config that *should* survive the port (`T`, `M`, `F`, `MON`, `DOW`, `HOME_TABS`,
`MORE_TABS`, `VIEWS`, `FILTERS`, `STATUS`, `AVATAR_COLORS`, `DONUT_COLORS`,
`KIND_TONE`, `ZIP_TAX`, `DEFAULTS`, `PAY_PRESETS`, …). The other half are data
mocks that must not — including all 17 the work order names, plus `STUBS`,
`CHANNELS`, `INBOUND`, `MAILBOXES`, `SEEN_BEFORE`, `OVERHEAD_SEED`,
`SCHED_STATE`, `SCHED_TODAY`, `DRIFT`, `CREATE_ROWS`, `DREAM_LINES`, `FRONT`,
`RIBBON`, `CAL_TARGET`, `COMPANY`, and the `TODAY` / `ANCHOR` / `NOW_IDX` date
anchors that make every relative timestamp in the file a fiction.

`DRIFT` is the one I would flag hardest: there is a real drift indicator wired to
`api/dashboard/drift`, and a mock constant of the same name. Under rule 8 that is
the easiest way to ship a fake number that looks plausible.

**The file identifies itself as v32**, at line 4, with the header
`ScopeCrete v32 — customer page, and activity split from alerts` and
`ALL NUMBERS ARE MOCK`. The upload is named v34. I have treated the uploaded file
as the target regardless, but if there is a later revision, say so before Phase 1
— porting 5,732 lines from the wrong revision is exactly the day this work order
is trying not to lose.

**`/api/leads/[id]` does not exist.** `app/dashboard/leads/[id]/page.tsx` fetches
`/api/leads/${leadId}`, and `src/app/api/leads/` contains only `route.ts`. That
detail page has been 404ing on its own data call. It is on the REPLACE list
anyway, but v34's equivalent needs a route built, not just a component ported.

---

## 8. Open questions for Coy

1. **Approve Tier 1?** Eleven items, all provably unreferenced. I would like
   `api/admin/orphaned-leads` gone today regardless of the rest — unauthenticated
   cross-tenant write.
2. **`api/chat/sessions` and the 22 `admin_chat_sessions` rows** — is that history
   worth keeping a route for, or is it superseded by v34's Dusty channels?
3. **Is the calculator/dusty public path still live?** It decides `api/estimate`,
   `api/parse`, `api/leads`, `api/chat/dusty` in one answer. DECISIONS.md §1 says
   the customer-facing estimator is one of the two doors, so I have not assumed.
4. **Is the uploaded file the latest revision?** It self-identifies as v32. See §7.
5. **`api/leads` anon-key fallback** (WO9 §3) is still live and still answering
   with RLS-filtered results instead of failing. If the public path stays, that
   wants fixing before Phase 3.
6. **Confirm `OPENAI_API_KEY` is set** if `/api/parse` is staying.
