# Photos in threads, one person across two numbers — report, 2026-09-27

Three PRs from one approved plan.

| PR | what | database | state |
|---|---|---|---|
| #13 | proposal review loop + human name provenance | 026 **applied** | **merged** |
| #14 | photos in threads | 027 **applied** | open |
| #15 | "Same person as…" merge + Undo, intake v57 | 028 **applied**, intake **v57 deployed** | open, contains #14 |

The database side of all three is live now. The app side of #14 and #15 goes
live when they merge.

---

## 1. PR #13 — finished and merged

**Gap closed:** confirming a name now writes `name_source='human'`,
`name_confirmed_at` and `name_confirmed_by`. `CHECK contacts_name_confirmed_is_human`
requires those three on every confirmed name, and without them a name Coy
confirmed would have looked exactly like the unreviewed ones.

**026 applied.** Verified as the `authenticated` role:
- `customer, vendor, sub, not_work, unknown` all insert.
- `customers.relation='unknown'` is still rejected (23514), as intended.

**Two things wrong in my own 026 file, still wrong in the repo.** A permission
check blocked edits to an applied migration file, so they're recorded here and
on PR #13 instead:
- The header still says NOT APPLIED.
- Its sample checks are wrong:
  - The first puts five pending proposals on one contact, which
    `contact_proposals_one_pending` (a unique index I hadn't found) forbids.
  - The second uses `update … where false`, which touches no rows and so could
    never fail.

The correct versions are in the PR #13 comment.

## 2. Photos (PR #14, migration 027)

**Why they showed as "(no text)":**
- The projection kept only the first media URL, and filed it in
  `messages.recording_url`.
- `message_media` had 0 rows.
- `storage.objects` had **zero policies**, so nothing could be signed from a
  session. That is also why the call-audio player never worked.

**Correction to what I told you earlier:** I said 143 photos. 81 of those were
call-recording events (audio). The real figure is **62 files on 48 messages**:
59 photos, 1 video, 1 PDF, 1 contact card. Amber has 2.

**What 027 does:**
- Adds a unique `(message_id, url)` index.
- Creates a private `message-media` bucket.
- Adds org-scoped storage policies on that bucket, plus read on `call-audio`.
- Makes the projection write every media item.
- Backfills from both sources.

**Serving:** `/api/messages/[id]/media` copies each file into private storage
the first time anyone opens the thread, then serves a signed link. No
background job and no invoke key.

**Verified:**
| check | result |
|---|---|
| live `message_media` | 62 / 48 |
| Amber's texting number | 2 |
| re-projecting her real event | no duplicate |
| synthetic photo + PDF event | both land, no error |
| your session reading your org's storage path | allowed |
| your session reading another org's path | refused |
| drift / open defects | 1 / 1, unchanged |

**Unknown, and yours to see:** whether `share.quo.com`'s `?sig=` opens a file
without Quo's API key. This sandbox can't reach the host. If Amber's thread
says *"Quo refused the link (403) — it may need QUO_API_KEY"*, add
`QUO_API_KEY` to Vercel as a server-only variable. Never make it
`NEXT_PUBLIC_`.

## 3. One person, two numbers (PR #15, migration 028, intake v57)

**Deviation from the plan, and why.** The plan said the merge function would run
as the caller, so row security would decide what it could touch. Before writing
it I checked every table it has to touch:
- `voip_calls` has **no** write policy for a signed-in user.
- `sms_threads` allows writes only by the service role.

Running as the caller, it would have moved Amber's texts and silently left her
calls behind — a half-merge that reports success. So it runs with elevated
rights and checks membership itself:
- The caller must be signed in.
- Both contacts must be in one of the caller's orgs.
- Only signed-in users can call it; anon and public cannot.
- A stranger gets "contact not found", the same as a missing contact, so a
  probe learns nothing.

**Verified on Amber (rolled back):**
| | messages kept / merged-away | merged-away texts |
|---|---|---|
| before | 5 / 7 | 7 |
| after merge | **12 / 0** | **0** |
| after undo | **5 / 7** | **7** |

- A new text keyed to her old number landed on the merged contact.
- Undo removed both phone rows, cleared the pointer and stamped `undone_at`.
- As your session, the header reads one merge and both numbers.
- Unsorted went **176 → 175**.
- Anon caller refused (42501); stranger refused (P0002).
- Production has no merges — nothing was merged for real.

**Intake — the repo was behind production.** Deployed v56 already had the
unreviewed enricher removed. `master` still had it, so deploying intake from
the repo would have put it back. I committed the deployed v56 source first (no
behaviour change), then made one change for v57: `upsertContact()` follows the
merge pointer. v57 is deployed with signature-checked webhooks unchanged
(`verify_jwt` off, as before).

**Not yet seen working live:** no webhook has arrived since the v57 deploy
(06:24 UTC, overnight in Baton Rouge), and functions boot on their first
request. The first inbound call or text after this is the check.
- **Pass:** a new row in `quo_events` and a new message.
- **Fail:** `sc_spine_drift` rises, or the function logs show a boot error.

## 4. What you check in the browser (after merging #14 and #15)

1. **Photos.** Open `(225) 281-4640`.
   - **Pass:** two photo thumbnails where the blank bubbles were.
   - **Fail:** a blank bubble or a broken image.
2. **Merge.** On `(225) 926-8939`, tap **Same person as…**, search `281`, pick
   it, confirm.
   - **Pass:** one thread with 12 messages (5 calls, 7 texts), both numbers in
     the header, and an Undo strip.
   - **Fail:** any call or text missing.
3. **Undo.**
   - **Pass:** two threads again.
4. **Name.** After merging, confirm "Amber" in the row review.
   - **Pass:** the header reads Amber.

## 5. Still blocked or open

- **Network access** in this environment (Supabase, `scopecrete.ai`, Vercel
  previews, `share.quo.com`): yours to change, and it applies to a new session.
- **Sending texts:** waits on whether Quo's number is 10DLC-registered.
- **Email and AI-agent calls:** those tables are empty, and nothing feeds them yet.
- **`SUPABASE_SECRET_KEY` is not set as a function secret.** The intake log
  shows it running on the auto-injected fallback. Not urgent, but that is the
  state the key-rotation work meant to end.
- **`messages.recording_url` on texts** still holds the misfiled first photo.
  Remove once nothing reads it.
