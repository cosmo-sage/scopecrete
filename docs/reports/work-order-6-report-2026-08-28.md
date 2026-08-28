# Work order 6 report — 2026-08-28

Tasks 1 and 3 are built and pushed to `master` (`f380707`, `2a78e4b`).
`backfill-call-media` is **deployed at version 3**.

**No voicemail has been fetched yet.** I cannot invoke an edge function from
this sandbox, so checks 2–4 of Task 2 need your machine, and §3's "after"
column is empty. The before numbers are real and recorded so the comparison is
possible the moment you run it.

---

## 1. What I actually changed

**`supabase/functions/backfill-call-media/index.ts`** — 409 → 571 lines.

- `voicemailFrom()` **L174**. Its own extractor because the payload's
  `transcript` is a flat string, not `dialogue[]`.
- Per-batch lookups **L300–350**: `message_id` per call, which messages already
  have a summary, and which already have a voicemail artifact. Two queries for
  the whole batch rather than two per call.
- Voicemail step **L439–512**, after the audio step.
- `call_artifacts` upsert **L471–481**, `onConflict: 'message_id,kind,source'`.
- `messages.summary` update **L496–500**, with `.is('summary', null)`.
- `'voicemail_only'` outcome **L524–528**.
- `voicemails_fetched` in the response **L552**.
- Header **L18–32**: added the voicemails endpoint and replaced the stale
  "transcript + summary mirrored onto the matching public.messages row" line
  with what the function now does. **This edit is later than the deploy** — see
  §8; deployed v3 still carries the old comment and nothing else differs.

**`src/app/api/messages/[messageId]/artifacts/route.ts`** — added
`voicemail: byKind("voicemail")` at **L70** (reason at **L64–69**).

**`src/app/dashboard/messages/[id]/page.tsx`**

- `ArtifactBundle` gains `voicemail` (**L51**).
- Glance-line `Voicemail` label when `summary_source === 'quo_voicemail'`
  (**L133–137**, reason at **L129–132**).
- Voicemail block above `next_steps` in the expansion, with playback from `url`
  (**L168–189**).
- Empty state now accounts for voicemail (**L235–238**).

Not touched: `api/threads/route.ts` and `api/threads/[contactId]/route.ts`
needed no change — see §5.

---

## 2. Deploy result

**Deployed. Version 3, ACTIVE.**

```
slug: backfill-call-media | version: 3 | status: ACTIVE | verify_jwt: true
entrypoint_path:  …_14f86820-96e8-454a-9084-31641de04dba_3/source/index.ts
import_map_path:  …_14f86820-96e8-454a-9084-31641de04dba_3/source/deno.json
ezbr_sha256: dceb552af3bd55f009fdbdcc30ffdd304830f0fe3306e9272c91098021b5e5c8
updated_at: 1787958988153
```

**Check 1 — version 3+. PASS.** Was 2, now 3. `import_map_path` ends
`…_3/source/deno.json` with no nested `file:///`, so the absolute-import-map bug
did not recur. This deploy also finally removes `mirrorToMessages()` from
production, which stripping it in source last time did not.

**Check 2 — `{"limit": 1, "dry_run": true}` against
`AC20c551da2ad442b5b21d4399e966c51b`. NOT RUN.** Requires invoking the function
over HTTPS; the egress proxy returns 403 on CONNECT for the project host and the
Supabase MCP has no invoke tool. Command and pass condition in §6.

**Check 3 — `{"limit": 5}` live, then the two counts. NOT RUN.** Same reason.

**Check 4 — no `[anomaly] no messages twin` lines. NOT RUN.** I cannot read
function logs. Worth noting the line that emitted them is deleted, so its
absence after this deploy is guaranteed by construction rather than by
behaviour — which makes it a weak check now. The check that replaced it is
`voicemail_status: 'no_messages_row'` in the per-row output, which fires if the
`provider_message_id` link ever fails to resolve.

---

## 3. Voicemail counts — before and after

**Before**, measured 2026-08-28 immediately prior to the deploy:

```sql
select kind, count(*) from call_artifacts group by kind;
```
```
transcript   16
summary      16
recording    59
next_steps    9
voicemail     0
```

```sql
select count(*) from messages where channel='call' and summary is not null;
```
```
16          (of 462 calls)
```

**After: nothing to report. The function has not been run.** The counts above
are unchanged as of this writing. I am not going to project what they will be —
the point of the before/after is to measure, and 403 calls without a recording
is a candidate count, not a result.

What the shape of a successful run looks like, so the after is interpretable:
`voicemail` climbs from 0, and `calls with a summary` climbs by the same number
*minus* any call that already had one (a voicemail never overwrites an existing
summary, so a call with both keeps Quo's).

---

## 4. What a voicemail looks like in Threads

Quoting the real one from your `quo-diagnose` output:

> Coy, this is Don Simpson… I'm trying to correct the drawing to be sure it's
> right… I can stamp it, and then I guess maybe you would take it to the permit
> office in Clinton… give me a call, (225) 235-9638

**In the thread list.** Today that row's preview reads `Incoming call · 49s ·
23 Aug`, italic and muted, because `preview_source` is `synthesised`. Once
Task 1 populates `messages.summary`, the same row reads *"Coy, this is Don
Simpson… I'm trying to correct the drawing…"* in normal-weight secondary text,
because the precedence in `api/threads/route.ts` L160–169 is body → summary →
synthesised and the summary branch now matches. No second code path; I verified
this rather than adding one.

**In the expanded call.** Three things, in this order:

1. A **Voicemail** block, accent-labelled, with the full text and — where the
   artifact carries a `url` — the same audio control a recording gets.
2. `next_steps`, if present.
3. The transcript, if present (a missed call has none).

**Collapsed, in the detail view**, the glance line carries a small `Voicemail`
label when `summary_source = 'quo_voicemail'`. That label is the point: a
voicemail is the caller's own words, a Quo summary is a paraphrase of a
two-party conversation. Rendering both unlabelled as "summary" would quietly
attribute to someone a sentence they did not say — the same class of error as
putting a name from a message body onto the wrong contact.

**Reflow.** The list preview keeps `minHeight: 1.1rem` and a fixed
`lineHeight` (`messages/page.tsx` L195), and the detail glance line the same
(`[id]/page.tsx` L141). Rows are already the height they will be when the text
arrives, so several hundred rows gaining a summary changes no geometry. I
confirmed both are still in place; I have not seen it happen, because the data
has not landed.

---

## 5. What I verified, and how

**Migration 021 is applied.** `pg_get_constraintdef`:

```
CHECK ((kind = ANY (ARRAY['transcript','summary','recording','next_steps','voicemail'])))
```

**The conflict target exists**, checked before writing an upsert against it:

```
call_artifacts_msg_kind_source_uniq
  UNIQUE btree (message_id, kind, source)
```

**The join key — this one changed what I wrote.** I measured both candidates
rather than assuming the existing one:

```sql
select
 (select count(*) from voip_calls v join messages m
    on m.provider='quo' and m.provider_message_id = v.quo_call_id) as via_provider_id,
 (select count(*) from voip_calls v join messages m
    on m.import_source='voip_calls' and m.legacy_id = v.id)        as via_legacy_id;
```
```
via_provider_id  462
via_legacy_id    458
```

462 of 462 versus 458. The legacy pair — the one `mirrorToMessages()` used —
misses exactly four, the post-016 rows the projection trigger wrote with
`import_source='quo_events'`. Using it here would have silently skipped the
newest calls, which are the ones most likely to still have fetchable media. The
code uses `provider_message_id`.

**RLS, per standing rule 6.** Not applicable to Task 1 — the edge function uses
the service-role key and bypasses RLS. It *is* applicable to Task 3, and
`call_artifacts` gates on `get_user_org_ids()` (confirmed in work order 5), so
the session-scoped artifact route reads voicemails the same way it reads
transcripts. No new RLS surface.

**The three Task 3 "no change needed" claims.** Two held, one did not:

- `api/threads/[contactId]/route.ts` L86–89 selects `message_id, kind` with **no
  kind filter**, so `voicemail` appears in `artifact_kinds` unchanged. **Held.**
- `api/messages/[messageId]/artifacts/route.ts` returned voicemail inside the
  `artifacts` array but **did not extract it as a named field**, and the UI reads
  named fields. Voicemail content would have arrived over the wire and never
  rendered. **Did not hold** — fixed at L70.
- The preview precedence at `api/threads/route.ts` L160–169 is
  body → summary → synthesised. **Held.**

**Typecheck.** `tsc --noEmit -p tsconfig.json` → **0 errors** across `src/`.

**The edge function's error profile is unchanged from baseline** under
`--strict`: 5 × TS2304 (Deno globals), 2 × TS2307 (the two `https://` imports),
0 syntax errors — identical before and after my change, confirmed by stashing.

---

## 6. What is UNVERIFIED

**The dry run — needs your machine.**

```powershell
curl.exe -X POST "https://cxiusuewtrvcpqequueh.supabase.co/functions/v1/backfill-call-media" -H "Content-Type: application/json" -H "Authorization: Bearer <anon key>" -d "{\"dry_run\":true,\"call_ids\":[\"AC20c551da2ad442b5b21d4399e966c51b\"]}"
```

Pass: the result row carries `voicemail_status: "would_write"`, a
`voicemail_preview` containing the Don Simpson text, `message_id` non-null, and
`would_set_summary: true`. If `voicemail_status` is `no_messages_row`, the
`provider_message_id` link failed and nothing else in this work order is
trustworthy.

**The live run of five — needs your machine.** Same URL, `-d "{\"limit\":5}"`.
Then:

```sql
select kind, count(*) from call_artifacts group by kind;
select count(*) from messages where channel='call' and summary is not null;
```

Pass: `voicemail` > 0, and `calls with a summary` risen from 16 by the number of
voicemails that landed on rows which had none. **Stop there** — the work order
says do not sweep until you have read the first five, and I agree: this writes
to `messages.summary`, which is what the Threads list renders.

**The `voicemail_only` outcome path.** A missed call whose only new data is a
voicemail produces an empty `voip_calls` patch. I reasoned it through and wrote
the branch, but no call has exercised it.

**Nothing was rendered in a browser.** No dev server, no screenshots. The
reflow claim in §4 is "the CSS that prevents it is present", not "I watched 400
rows gain text without moving".

---

## 7. What I found but did not touch

**The candidate query is not voicemail-aware — medium, and it will bite on the
full sweep.** `index.ts` L289 selects rows on
`recording_storage_path.is.null,transcript.is.null,provider_summary.is.null`.
A missed call never gets a `voip_calls.transcript` — correctly, since it had no
conversation — so those 403 rows match that filter permanently. After every
voicemail is fetched, each subsequent run still selects them, and each one costs
three API calls (transcript 404, summary 404, recording empty) plus ~1s of
`PAUSE_MS` before the voicemail guard skips the fourth. That is roughly 20
minutes of wasted API traffic per full re-run. The guard makes the job
*correct* on repeat; it does not make it *cheap*. Fixing it means adding a
voicemail-aware clause to the selection, which is a change to the row filter and
outside this work order.

**`apiGet`'s 404 still discards the provider's error envelope** (`index.ts` L95,
`res.body?.cancel()` before reading), and the Bearer scheme is still unreachable
on a 404 (L103). Both are work-order-4 Task 2 items, still unaddressed. Now that
`quo-diagnose` has proved the 404s were truthful, the practical cost is lower
than it looked — but "not found" is still all the code can ever say.

**`messages.summary` has no writer that can correct itself.** Once a voicemail
transcript is written there, nothing re-reads `call_artifacts` to refresh it. The
artifact stays authoritative and the cache silently ages. Raised in work order 3
open question 4 and still unanswered.

---

## 8. What broke or surprised me

**I have been reporting TypeScript errors that do not exist.** My work-order-4
and work-order-5 reports both stated that `backfill-call-media` carries "9
pre-existing TS2339 errors" from `apiGet`'s discriminated union. That is wrong.
They are an artifact of my own ad-hoc `tsc` invocation omitting `--strict`:
without it, `ok: true` widens to `boolean`, the union stops discriminating, and
every `res.absent` access errors. With `--strict` — which the project's
`tsconfig.json` sets, and which Deno uses by default — **all of them vanish**.
The file has 5 TS2304 and 2 TS2307, both genuine Deno-environment artifacts, and
nothing else.

The sequence is worth recording because it nearly produced a bad change. I saw
my new code take the count 9 → 12, assumed I was adding to real debt, rewrote
the voicemail block with explicit `!res.ok &&` narrowing, and found the count
*unchanged at 12*. That was the tell: if narrowing does not help, narrowing is
not the problem. Checking `--strict` showed the errors were never real, and I
reverted the rewrite so the block matches its three siblings. Had the count
happened to drop, I would have shipped a stylistic inconsistency and a comment
asserting a false rationale, and gone on citing a phantom in reports.

`supabase/` is excluded from the project `tsconfig` (`"exclude": ["node_modules",
"supabase"]`), which is why `tsc -p tsconfig.json` never contradicted me.

**A claim in this report's own §1 was false when I first wrote it.** The draft
said the function header had been updated to list `/v1/call-voicemails/` and to
drop the "transcript + summary mirrored onto the matching public.messages row"
line. Checking every line reference before pushing — the habit that came out of
getting them wrong in the work-order-2 and -3 reports — showed the header
untouched: it still listed three endpoints and still described `mirrorToMessages()`
behaviour that has been deleted from source and, since v3, from production. I
had described an edit I intended rather than one I made. I have now actually
made it (L18–32) and re-derived every line number in §1 from the file afterwards,
which is why they all shifted by seven.

Two consequences worth stating rather than smoothing over. The header edit
happened **after** the deploy, so deployed v3 and `master` now differ — by that
comment block alone, no executable difference. I did not redeploy, because
bumping to v4 for a comment would invalidate the version number in every check
in §2 for no behavioural gain; the next real change to this function carries it.
And this is the same failure mode as standing rule 5 in reverse — rule 5 says
never trust a docstring about code, and I had left a docstring lying about its
own function. It described mirroring that no longer exists.

**Six of the fifteen line references in the first draft of §1 were wrong**,
independent of the header. Four in `[id]/page.tsx` (L44→L51, L131–135→L133–137,
L169–186→L168–189, L232→L235–238) and one in the artifacts route (L64→L70, which
was the comment's first line, not the code's), plus the two in §7. Every number
in this report was re-checked against the committed file with `sed -n`, not
recalled.

**Nothing else failed.** The deploy was first-attempt, the readback matched, and
the two Task 3 paths the work order predicted would need no change — one did
need one, which is why it said to confirm rather than assume.

---

## 9. Open questions for Coy

**1. Should the thread list label voicemail previews?** In the list, a
voicemail-sourced preview currently renders as plain text with no attribution;
only the detail view labels it. Adding it means returning `summary_source` from
`api/threads/route.ts`. The work order explicitly wanted the existing precedence
path verified rather than extended, so I did not — but the list is where you
will actually read these.

**2. The candidate query (§7) — fix the selection now or after the sweep?** It
costs ~20 minutes of pointless API traffic per re-run. Cheap to fix, but it is a
change to which rows the job considers, which deserves its own eyes.

**3. After the five, what batch size?** 403 candidates at ~4 API calls and
~1.4s of pauses each is roughly 25–30 minutes of wall time for a full sweep.
Edge functions have an execution ceiling, so this probably wants several runs
of 50–100 rather than one `{}`. I have not measured the ceiling.

**4. Voicemails are the strongest name evidence in the system.** "Coy, this is
Don Simpson" is a textbook `self_identification` for `contact_name_claims` —
exactly what the comprehension spec wants, and far better evidence than anything
in an SMS thread. Once these land, that spec's §2 has real material to work
with. Worth sequencing the comprehension pass right after this rather than
before.
