# Working state — comms spine, classifier, lead guard

Snapshot as of **2026-08-27**, after migration 016 and work order 2.

This file is a **status snapshot, not ground truth**. `/DECISIONS.md` is ground
truth; where the two disagree, DECISIONS.md wins and this file is stale. Delete
it once the open items below close.

---

## 1. What is LIVE right now

| Thing | State |
|---|---|
| Migration `016_raw_log_and_spine_projection` | **Live.** Trigger `quo_events_project` is projecting real traffic. |
| `messages` | 1,143 rows and climbing — it moved by one while this file was being written. Last 50 written by the trigger (`import_source='quo_events'`), 2026-08-27 13:01 → 15:14. |
| `sc_spine_drift` | **0.** `projection_defects` 0, `projection_error` null on every `quo_events` row. |
| `call_artifacts` | 55 rows — 16 recording, 15 summary, 15 transcript, 9 next_steps. |
| `enrich-contacts` | **Version 2**, prompt `enrich-v4-tail-window-2026-08-23`. Matches master. |
| `quo-intake` | **Version 55 — STALE.** Still writes `messages`, still contains `enrichContact()`. |
| Lead guard | **Not deployed** (it is in v8 source only), and suppresses nothing yet — 0 confirmed relations. |
| Threads UI | Still mock data. Not started — gated on the quo-intake deploy. |

---

## 2. The one thing that matters

**`quo-intake` v55 is still a second writer to `messages`.** It looks for its
row by `import_source='voip_calls'` + `legacy_id`, which no longer matches
anything, because the trigger writes those rows with
`import_source='quo_events'`. Its insert then hits the unique index
`messages_provider_idx` and fails.

Observed on 2026-08-27, and worth being precise about because it changes how
urgent this is:

- The last successful edge-function write to `messages` was
  `imported_at 2026-08-26 21:27:37`. Every write since — 50 rows — is
  trigger-sourced.
- **No duplicate or corrupted rows exist.** Zero rows have a null
  `provider_message_id`, so the unique index covers the whole table and caught
  every collision.

So the second writer is failing *safely* but *silently*: it logs a PostgREST
error and returns `message: 'failed'` in its 200 response, and nobody sees it.
The fix is still the deploy below — it is a correctness and noise problem, not
(so far) a data-loss one.

---

## 3. Branches

| Branch | Contains | State |
|---|---|---|
| `master` | 016 documented, `flag-lead-creation-rule` merged in | current |
| `claude/pr1-landing-zone` | quo-intake v8: no `messages` writes, no `enrichContact()`, lead guard, `[key] source=` block | pushed, **awaiting deploy** |
| `claude/flag-lead-creation-rule` | merged into master | can be deleted |
| `claude/edge-key-source-log` | merged into `pr1-landing-zone` | can be deleted after that deploys |

`pr1-landing-zone` was branched from master *before* the `flag-lead-creation-rule`
merge. Both now contain the lead guard from the same patch, so the eventual
merge should reconcile, but it has not been tested.

---

## 4. Open items, in order

1. **Deploy `claude/pr1-landing-zone`** (`a1db44a`). Runs from Coy's machine.
   Relative `deno.json` — the absolute `import_map_path` is what broke every
   previous redeploy. Confirmed working on the `enrich-contacts` v2 deploy.

   ```
   supabase functions deploy quo-intake --project-ref cxiusuewtrvcpqequueh
   ```

2. **Run the single-writer check** immediately after, on a real text:

   ```sql
   select import_source, count(*) from messages
   where occurred_at > now() - interval '1 hour' group by 1;
   ```

   Every row must be `quo_events`. Anything else means a writer survived.

3. **Wire Threads to real data.** Gated on 1 and 2. Read `messages` only.

4. **Run `enrich-contacts` over the book and review the proposals.** This is
   what makes the lead guard do anything.

5. **`backfill-call-media` still writes `messages`** (`index.ts:250`). Same
   two-writer class, in an admin-invoked function. Unowned.

---

## 5. Notes for whoever picks this up

The Supabase MCP has **no invoke tool** — deploy, get, list, `execute_sql`,
advisors, branches only. Egress policy blocks
`cxiusuewtrvcpqequueh.supabase.co`, `api.supabase.com` and `api.groq.com` at
the proxy (403 on CONNECT), and there is no `supabase` CLI in the web sandbox.
Deploys and any HTTP call to a function must run from Coy's machine.

`node_modules/.bin/tsc` **is** available and does work as a syntax check on the
edge functions: `--noEmit --skipLibCheck` reports Deno-environment noise
(`Cannot find name 'Deno'`, the two `https://` imports) but zero TS1xxx means
the file parses.

Two bugs in this area were both in prompt or projection plumbing, silent, and
survived because nobody read the thing end to end. Read the body, not the name
— `storeOutboundMessage()` writes `sms_threads`, not `messages`.
