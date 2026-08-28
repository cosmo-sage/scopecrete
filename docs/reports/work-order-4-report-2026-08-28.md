# Work order 4 report — 2026-08-28

`quo-diagnose` is written and deployed at **version 1**. **It has not been run**,
so there is no diagnostic output in this report and no diagnosis. Per the
instruction to stop after Task 1 and report, Tasks 2 and 3 are not started.

---

## 1. Raw diagnostic output

**Nothing to paste. The diagnostic did not run.**

Invoking an edge function means an HTTPS POST to
`cxiusuewtrvcpqequueh.supabase.co/functions/v1/quo-diagnose`. The egress proxy
in this sandbox returns **403 on CONNECT** for that host, there is no `supabase`
CLI installed here, and the Supabase MCP exposes deploy / get / list /
`execute_sql` / advisors / branches — **no invoke tool**. The same wall that
stopped work order 3's Task 2.

I am not going to characterise what the responses would look like. The whole
point of this work order is that the interpretation layer hid the truth for a
week, and a predicted result in the section reserved for raw output would be the
same failure wearing a different hat.

**Run it from your machine.** One line, PowerShell, `curl.exe`, no
continuations. The `<anon key>` is the publishable key you already have:

```powershell
curl.exe -X POST "https://cxiusuewtrvcpqequueh.supabase.co/functions/v1/quo-diagnose" -H "Content-Type: application/json" -H "Authorization: Bearer <anon key>" -d "{}"
```

Empty body uses the two call ids from the work order. To probe others:

```powershell
-d "{\"call_ids\":[\"AC20c551da2ad442b5b21d4399e966c51b\"]}"
```

Output is JSON. Paste it back whole. The useful parts:

- `key` — presence, length, first four chars, and which env var supplied it.
- `status_matrix` — one row per request, raw status vs bearer status, and which
  scheme returned 2xx. This is the at-a-glance shape of the failure.
- `results[].attempts[].body_raw` — the first 800 characters of every body,
  including error bodies. This is the authoritative part.

---

## 2. Diagnosis

**No diagnosis. The evidence to make one does not exist yet**, and picking the
likeliest story is what the work order explicitly forbids.

What I can report is grounded in reading the code rather than guessing at the
API, and it changes how the existing evidence should be read.

**The `404` you have been seeing may not be the API's 404.** In
`supabase/functions/backfill-call-media/index.ts`:

```
L88  if (res.status === 404) { await res.body?.cancel(); return { ok: false, absent: true, error: 'not found' } }
L96  if (res.status !== 401 && res.status !== 403) break
```

Two consequences, both of which shape the "three dry runs, every attempt 404"
result:

1. **L88 cancels the body before reading it.** Quo's error envelope carries
   `message`, `code`, `title` and `docs`. Every one of those has been discarded
   unread on every 404 so far. The work order is right that this is the field
   that matters, and it means the existing evidence contains no information
   about *why* — only that the status was 404.

2. **L88 returns before L96 can fall through to `Bearer`.** The raw-then-Bearer
   retry only ever fires on 401/403. On a 404 the function returns from inside
   the first loop iteration, so **the Bearer scheme has never been attempted
   against any of these endpoints.** The work order's leading hypothesis is key
   scope, and that may well be right — but "the raw scheme 404s and Bearer
   would have worked" is a state the current code structurally cannot
   distinguish from it, and nobody has ruled it out.

That is why `quo-diagnose` probes both schemes against every endpoint
independently rather than short-circuiting.

I want to be clear about the limit of this: it is a reason the existing evidence
is weaker than it looks, **not** a claim that the auth scheme is the bug. The
work order states `/call-recordings/{id}` returns 200 with the raw key, which
means the raw scheme is accepted on at least one endpoint. If the raw scheme
works there, it probably works everywhere, and scope remains the better
hypothesis. The diagnostic settles it either way.

---

## 3. What I changed

**`supabase/functions/quo-diagnose/index.ts`** — new, 6,677 bytes. Probes six
endpoints (`/phone-numbers`, `/calls?maxResults=5`, and per call id
`/calls/{id}`, `/call-recordings/{id}`, `/call-transcripts/{id}`,
`/call-summaries/{id}`, `/call-voicemails/{id}`) against both Authorization
schemes, and returns raw status, statusText, content-type, byte length and the
first 800 chars of each body. `probe()` at L66 reads `res.text()` on every path
including errors — nothing maps a status onto a boolean. Key fingerprint at
L122–129 is presence / length / first four / source env var only.

**`supabase/functions/quo-diagnose/deno.json`** — new, empty import map. Present
so the deploy has a valid relative `import_map_path` to point at; the reason is
documented in `supabase/config.toml`.

**`supabase/config.toml`** — added a `[functions.quo-diagnose]` block with
`verify_jwt = true`, and a comment marking the function as throwaway with the
condition for deleting it.

Committed to `master` as `d25ebf1` and pushed. Nothing else was touched. In
particular **`backfill-call-media` is unchanged** — Task 2 is gated on Task 1
reporting, and its `messages` write at L238/L250 is still there.

---

## 4. What I verified, and how

**It parses.** `node_modules/.bin/tsc --noEmit --skipLibCheck --target es2022
--module esnext --moduleResolution bundler` on
`supabase/functions/quo-diagnose/index.ts`:

```
4 × TS2304   (Cannot find name 'Deno')
1 × TS2307   (the https:// std import)
0 × TS1xxx   (syntax)
```

Same Deno-environment profile as the other edge functions.

**It writes nothing.** `grep -n "supabase\|createClient\|\.from(\|insert\|update\|storage"`
against the file returns only two hits, both inside comments (L3, the file path;
L29, the sentence saying it writes nothing). There is no Supabase client in the
file and no import of one.

**The key is never logged whole.** `grep -n QUO_API_KEY` returns L34
(declaration), L66 (the Authorization header value), and L123–131 (presence,
`.length`, `.substring(0, 4)`, and which env var). No `console.log` of the value
exists — there is no `console` call in the file at all.

**It deployed.** Response: `slug: quo-diagnose, version: 1, status: ACTIVE,
verify_jwt: true`, `import_map_path: …_310292be…_1/source/deno.json` — relative,
no embedded `file:///`, so the absolute-import-map bug did not recur.

**The two `backfill-call-media` findings in §2** come from reading
`supabase/functions/backfill-call-media/index.ts` L76–103, the whole of
`apiGet`. L88 and L96 are quoted verbatim above.

**What I did not verify:** that the deployed `quo-diagnose` source matches what
I sent. I read back `quo-intake` after deploying it yesterday; I did not do the
same here. The function is 6.6 KB and Supabase bundles at deploy time, so a
syntax error would have failed the deploy rather than shipped — but a semantic
transcription slip would not have. Its first run will expose one immediately.

---

## 5. What is UNVERIFIED

**The entire diagnostic result — needs your machine.** Command in §1.

Pass condition for the run itself: HTTP 200 with a JSON body containing
`status_matrix`. If it returns `{"verdict":"NO_KEY"}`, then neither
`QUO_API_KEY` nor `OPENPHONE_API_KEY` is set on `quo-diagnose` — the function
secrets are per-project, so it should inherit them, but that is worth knowing
immediately rather than mistaking for an API failure.

What each row then tells you, per the work order's own table:

- **`/phone-numbers` without `+12253782458` in the body** → the key cannot see
  the line. That is the answer, and the fix is a new key, not code.
- **`/calls/{id}` 404 while `/phone-numbers` shows the line** → the key sees the
  workspace but not that call. Scope, narrower than the whole line.
- **`/call-recordings/{id}` 200 with an empty or `data: null` body** → the
  "200 with nothing" you already observed, now with the body visible.
- **any endpoint where `worked: "bearer"`** → the scheme short-circuit in §2 is
  the bug and it is a code fix.
- **all `neither` with 401/403 bodies** → the key is not accepted at all, which
  would contradict the recordings-200 observation and needs re-checking.

**That the deployed source matches what I sent.** Pass: the first run returns a
`status_matrix` with 12 rows for two call ids (2 account-level + 5 per call).

---

## 6. What I found but did not touch

**`backfill-call-media` still writes `public.messages` at L238/L250.** The work
order says to strip it in whichever PR touches this function. This PR does not
touch it — it adds a separate function — so the write stands. Since the v56
`quo-intake` deploy it is the only remaining second writer.

**`apiGet`'s 404 handling and scheme short-circuit** (§2) are Task 2 items by
the work order's own numbering. Not fixed.

**`transcriptFrom()` / `summaryFrom()` handle only the flat shape.** `unwrap()`
at L106–112 resolves `{data: X}` and takes `[0]` of a list, but nothing walks
`data.object.callTranscript.dialogue`. The v3 payload would return `null` from
`transcriptFrom`, which presents as empty rather than 404 — consistent with the
work order's note that this does not explain the current symptom. Task 2 item 3.

---

## 7. What broke or surprised me

**Nothing failed.** The function deployed first attempt.

**The Bearer scheme has never been tried on these endpoints**, and I did not
expect that. The code reads as though it tries both — the comment at L70–72 says
so explicitly, and I would have believed the comment if I had not traced the
control flow. That is the fifth standing rule in a new form: not "don't trust
the function name" but "don't trust the docstring". It does not make the auth
scheme the likely culprit, for the reason in §2, but it does mean one of the two
things the code claims to have ruled out was never actually tested.

**The 404 evidence is thinner than the work order treats it as.** "Every attempt
404" is currently three dry runs' worth of a boolean produced by a line that
throws the body away. It is entirely consistent with the scope hypothesis, and
also with two or three other stories, and the existing data cannot separate them.
That is not a criticism of the hypothesis — it is why the diagnostic reports raw
bodies.

---

## 8. Open questions for Coy

**1. Does `quo-diagnose` have the API key?** Function secrets are per-project on
Supabase, so it should inherit `QUO_API_KEY` the same way `backfill-call-media`
does. The run reports this in its first field. If it comes back `NO_KEY`, set
the secret and re-run before reading anything else into it.

**2. Which Quo account issued the key, and does that account own
`+12253782458`?** If the answer is "a personal key from a user who was invited
to the workspace", the scope hypothesis is confirmed before the diagnostic even
runs, and the fix is a workspace-scoped key. Worth checking in the Quo UI while
the run is happening — it costs nothing and may short-circuit the whole thing.

**3. Should I strip the `messages` write from `backfill-call-media` now, or
wait for Task 2?** It is the last second writer, it is two lines, and Task 2 will
touch that file anyway. Doing it now means the backfill is safe to run the
moment the API question is answered.

**4. The architecture note you asked about — Caura, OMA, Agent Squad — is
parked.** I have no grounded knowledge of Caura or "Open Multi-Agent" and would
be inventing if I wrote them up. Send links, repos or docs and I will write it
properly. That request is unrelated to this work order and is recorded here only
so it is not lost.
