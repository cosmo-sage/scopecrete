# Working state — contact classification & lead guard

Snapshot as of **2026-08-26**. Branch `claude/flag-lead-creation-rule`,
5 commits ahead of `master`, pushed.

This file is a **status snapshot, not ground truth**. `/DECISIONS.md` is ground
truth; where the two disagree, DECISIONS.md wins and this file is stale. Delete
this file once the branch merges and the open items below are closed.

---

## 1. What is LIVE right now

| Thing | State |
|---|---|
| `enrich-contacts` | **Deployed, version 2, ACTIVE.** Prompt `enrich-v4-tail-window-2026-08-23`. `verify_jwt = true`. |
| `quo-intake` | **Still version 55.** The lead guard is written and committed but NOT deployed. |
| Lead suppression | **Not in effect.** See §4 — it would suppress nothing today even if deployed. |
| `customers.relation` | 135 rows, all `relation='customer'`, `relation_source='default'`, **0 confirmed**. |

Production and `master` have diverged in one place: deployed quo-intake v55
carries the `[key] source=…` credential logging from branch
`claude/edge-key-source-log`, which was never merged. Deploying the repo file
as-is would silently revert it. A merged file that keeps both is prepared at
`/tmp/merged_index.ts` (ephemeral — regenerate if the container is gone).

---

## 2. What changed on this branch

**The classification rule — direction of the ask.** Topic and volume are both
the wrong signal; a sub and a customer discuss the same things, and a big
commercial customer texts as much as a busy sub. What separates them is who
wants what from whom: money out + offered availability = sub/vendor, money in +
asking our price and start date = customer. `evidence_quote` must be the line
that *shows* the direction — a quote about the address is not evidence, and if
that is the best line available the answer is `unknown`. New `direction_of_ask`
field makes the reasoning auditable at review time.

**The window fix (v4).** The rule was correct and the plumbing defeated it.
Measured against Luis (contact `63d7e1eb`, 256 non-empty turns):

```
32,837 chars rendered = 14,661 chars of words
                      + 17,664 chars of [message_id: <uuid>] headers  (54%)
12,000-char window    = 37% of the conversation, head-first
```

All three lines DECISIONS.md cites as the worked example for `sub` sat at
offsets 30,304 / 32,175 / 32,298 — the model never saw any of them. Fixed by:

- `#42 THEM 2026-07-10` labels (~20 chars) instead of uuid headers (~69)
- keeping the **tail** when it will not all fit — the direction of the ask is
  clearest in recent traffic
- the model cites `evidence_turn` (an ordinal); `sanitize()` resolves it to a
  real `messages` id, so it never sees a uuid and cannot invent one
- `askModel` no longer re-truncates to 12,000, which would have cut the tail
  straight back off
- `MAX_TURN_CHARS = 4000` caps one turn — **found by testing, not reading**:
  the tail-drop refuses to discard the last remaining turn, so a single
  50,000-char transcript previously went to the model in full
- `turns_shown` is returned per contact, so a truncated read can never again be
  invisible

Simulated against Luis's measured shape: window now holds turns 107–256 at
12,052 chars and contains all three cited lines.

**The lead guard.** `leadAllowedForContact()` in `quo-intake` suppresses lead
creation only when `relation IN ('vendor','sub')` **AND**
`relation_confirmed_at IS NOT NULL`. It fails **open** — any lookup error
creates the lead, because a missed lead costs revenue and a junk one costs
annoyance. An existing open lead is always returned regardless of relation, so
a later reclassification never orphans a lead a human already worked.

**Vocabulary.** `client` → `customer` throughout. `customers.relation` and
`contact_proposals.classification` now use the same three words, so a confirmed
proposal writes straight through with no mapping step. `classification` also
has `not_work` and `unknown`, which never become a relation.

Verified against the live schema:
```
CHECK (relation        = ANY (ARRAY['customer','vendor','sub']))
CHECK (relation_source = ANY (ARRAY['default','proposal','manual']))
```

---

## 3. Findings — these change what to do next

**"Brad Chaney" is not a customer.** Contact `5f02a4d7` / +19012956423 is
**Dalton Digital**, a paid lead-generation service. All eleven of its messages
are one template: `"New Lead From Baton Rouge Concreters — <name> needs
<service>. Call them at <phone>. — Dalton Digital"`. Brad Chaney is a name
*inside the first message body* — a referred prospect whose real number is
2253265685. Something wrote that name onto `contacts.name` for the lead
service's number: the same failure mode as the "Hi Coy" bug.

Consequences: under the direction-of-ask rule that contact is a **vendor** (we
pay them), so `customer` is the failing answer there, not the passing one. And
the eleven genuine prospects named in those message bodies exist as **no
contact at all** — they are the only real customers in that thread.

*(Contact `18e79db5`, which I first offered as Brad Chaney, is a different
party again — a supplier tracking a material order, with Brad named in the
third person. I found it by grepping message bodies for "brad", which is
precisely the trap the prompt warns about. Do not use it as a test case.)*

**`enrichContact()` is still live inside quo-intake.** Called on
`message.received`, `message.delivered` and the transcript follow-up, in both
the repo and deployed v55. It still calls the decommissioned
`llama-3.3-70b-versatile`, and on success writes `name`, `first_name`,
`address` and `contact_type` **straight onto `public.contacts`** with no review
step. It is inert today only because that model 404s — fixing the model id
without deleting the function would resume unreviewed writes. It is the most
likely origin of the Brad Chaney mislabel.

**The guard is behaviour-neutral on day one.** Zero confirmed relations means
suppression can never fire. Deploying it does **not** stop today's
lead-per-message spam. What stops that is running the classifier and confirming
proposals.

---

## 4. Open items, in order

1. **Run the dry run.** `enrich-contacts` v2 is live and carries the fix.
   PowerShell — one line, `curl.exe`, no backslash continuations:

   ```powershell
   curl.exe -X POST "https://cxiusuewtrvcpqequueh.supabase.co/functions/v1/enrich-contacts" -H "Content-Type: application/json" -H "Authorization: Bearer <anon key>" -d "{\"dry_run\":true,\"contact_ids\":[\"63d7e1eb-d164-468f-a495-d5ac22610d59\",\"5f02a4d7-86fa-47a8-939a-cc916cdbb06a\"]}"
   ```

   Pass conditions:
   - Luis (`63d7e1eb`) → `sub`, on a money-out or offered-availability quote
   - Dalton Digital (`5f02a4d7`) → `vendor`, **not** `customer`
   - Dalton's `proposed_name` → `null`, not "Brad Chaney"
   - `turns_shown` ≈ 150 of 256 for Luis, not the whole thread

2. **Deploy quo-intake.** One command, run where the file is on disk:

   ```
   supabase functions deploy quo-intake --project-ref cxiusuewtrvcpqequueh
   ```

   The v52-class `import_map_path` failure is understood: the platform joins
   whatever path it holds onto the *new* source dir, and v55 stores an absolute
   one. Passing a **relative** `deno.json` fixes it — confirmed working on the
   `enrich-contacts` v2 deploy, which resolved to `_2/source/deno.json`.
   Decide first whether to keep the `[key] source=…` block from §1.

3. **Delete `enrichContact()`** from quo-intake, same PR as the guard.

4. **Review and confirm proposals**, which is what actually turns the guard on.

5. **Create the eleven missing prospects** from the Dalton Digital message
   bodies, and fix `contacts.name` on `5f02a4d7`.

6. **Merge `claude/edge-key-source-log`** so production and `master` stop
   disagreeing.

---

## 5. Notes for whoever picks this up

The Supabase MCP in the web session has **no invoke tool** — deploy, get, list,
`execute_sql`, advisors, branches only. Egress policy also blocks
`cxiusuewtrvcpqequueh.supabase.co`, `api.supabase.com` and `api.groq.com` at
the proxy (403 on CONNECT), and there is no `supabase` CLI installed. So the
dry run cannot be executed from a web session at all, and deploying through the
MCP means pasting the whole file inline — 52 KB for quo-intake, with no
pre-flight syntax check available. Do quo-intake from a machine with the CLI.

Both bugs found in this area so far — the old enricher's name-from-greeting and
this window truncation — were in the prompt plumbing, silent, and survived
because nobody read the thing end to end. Read the prompt.
