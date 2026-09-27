# FEAT-009 Step 1 report — 2026-09-27

Get the jobs writer onto master.

**Preview:** https://scopecrete-git-claude-wo13-jobs-writer-coy2.vercel.app
(branch alias — always the tip of `claude/wo13-jobs-writer`. The immutable build I
verified is `dpl_5SEj8Ur77NWiQZLjZwEabHD6Aand`, state READY, commit `bc9c1ef`.)

**PR:** https://github.com/cosmo-sage/scopecrete/pull/10 — open, **not merged**.

**Steps 2, 3 and 4 are blocked.** `docs/design/feat-009/` does not exist in this
repo, on any branch. See §4.

---

## 1. The rebase was not needed

The handoff says to rebase on `master`. It was already current:

```
$ git log --oneline origin/claude/wo13-jobs-writer..origin/master
(empty)
```

`origin/master` is an ancestor of the branch, so this is a fast-forward with
nothing to reconcile. Confirmed with `git merge-base --is-ancestor origin/master
HEAD`, which exits 0. I did not rewrite the history — rebasing a branch that is
already on top of its base only changes the commit hashes and throws away the
preview Vercel had already built.

Three commits ahead of master:

```
bc9c1ef  Add work order 13 and 14 reports
7d5b4b5  WO13: the jobs writer — POST/PATCH, accept flow, Scope renders jobs
3e3fca2  backfill-call-media v4: stamp the voicemail answer (allowlist)
```

## 2. What it changes

| file | |
|---|---|
| `src/app/api/jobs/route.ts` | +178/−62 |
| `src/app/api/jobs/[id]/route.ts` | new, 133 lines |
| `src/app/dashboard/scope/page.tsx` | +173/−54 |
| `supabase/functions/backfill-call-media/index.ts` | +29/−8 — **already live as v4** |
| `docs/reports/work-order-{13,14}-report-2026-09-14.md` | 492 lines |

The full description is in PR #10 and in the two WO reports, so it is not repeated
here. Two points that matter for what comes after:

**`src/app/api/jobs/route.ts:112` is the pipeline predicate.**

```ts
counts_toward_value: j.origin === "manual" || j.confirmed_at !== null,
```

Computed once in the API and returned per row rather than filtered server-side, so
an unreviewed machine job is visible and uncounted, never hidden. WO-15's scope
builder and the voice agent both write through the same `origin`/`confirmed_at`
pair, so this predicate is the thing that keeps a machine-drafted scope out of the
numbers until Coy accepts it.

**The third commit is an edge function that is already deployed.** `3e3fca2` is the
WO14 allowlist fix, live as `backfill-call-media` v4 since 14 Sep. Merging this PR
brings the repo into line with production; it does not change production.

## 3. Checks

| # | Check | Pass | Fail | Result |
|---|---|---|---|---|
| 1 | Branch is current with master | `master..branch` empty | any commit listed | **PASS** — §1 |
| 2 | Typecheck | `tsc --noEmit -p tsconfig.json` exits 0 | any error | **PASS** — 0 errors |
| 3 | Production build | `next build` exits 0 | any error | **PASS** — 21 pages |
| 4 | Routes registered | `/api/jobs`, `/api/jobs/[id]`, `/dashboard/scope` in the route table | any absent | **PASS** — all three, `ƒ ƒ ○` |
| 5 | No service-role key under `src/app/api/jobs/` | grep finds nothing | any match | **PASS** — no match |
| 6 | Preview built from the branch tip | deployment sha = `bc9c1ef`, state READY | any other sha, or ERROR | **PASS** |

`tsc` was run through `-p tsconfig.json`, not bare — the project config is what
turns `strict` on, and running it bare is how the phantom TS2339 errors in the
WO4/WO5 reports happened.

The build used the four env var names the source actually reads
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`) with placeholder values. That
proves the build does not crash on a missing name; it proves nothing about whether
the values in Vercel are right.

## 4. Unverified — and what is blocked

**Nothing was exercised against the database.** The sandbox egress proxy still
answers **403 on CONNECT** for `cxiusuewtrvcpqequueh.supabase.co`, so no route ran
end to end and no browser opened the preview. Every runtime check below is yours.
Each is written so the bug cannot confirm the check:

1. `POST /api/jobs` with a real `contact_id` — **passes** if the row comes back
   `origin='manual'`, `status='lead'` and `confirmed_at` set; **fails** if
   `confirmed_at` is null, which would make the job invisible to the pipeline.
2. `POST` with `"origin":"machine"` in the body — **passes** on
   **400 `forbidden_field`**; **fails** if a job is created at all, whatever the
   status code.
3. `POST` with a `contact_id` from another org — **passes** on
   **403 `contact_not_in_org`**; **fails** on a created row, and also fails on an
   opaque 500, because that means RLS caught it by accident rather than the route
   catching it on purpose.
4. `PATCH /api/jobs/<id>` with `{"accept": true}` — **passes** if `confirmed_at`
   *and* `confirmed_by` are both set; **fails** if either stays null.
5. `/dashboard/scope` — **passes** if the job renders and the header count
   includes it; **fails** if a machine job with `confirmed_at` null is counted, or
   is missing from the list entirely. Visible-and-uncounted is the correct state.

**Steps 2, 3 and 4 cannot start.** The handoff's first instruction — copy the
FEAT-009 folder into the repo — has not happened:

```
$ ls docs/design/feat-009/
ls: cannot access 'docs/design/feat-009/': No such file or directory

$ git log --all --diff-filter=A --name-only | grep -i 'feat-009\|WO-17\|WO-15\|scope-proposals\|02[67]_'
(empty)
```

Absent from the working tree and from every ref, local and remote. Without
`WO-17-Threads-and-Shell-to-v34.md` and `scope-proposals.jsx` I would be inventing
the Threads spec; without the two `.sql` files I would be reviewing migrations I
had written myself, which is not a review.

## 5. Step 3 groundwork — the live side of the drift check

The migration files are missing, but the *live schema* is readable, and the handoff
describes in prose what 026 and 027 change. So I measured the live side now. When
the SQL arrives, half the comparison is already done.

**Every claim in the handoff about the current schema is accurate.**

| handoff says | live, measured today |
|---|---|
| `jobs.job_type` allows `residential \| commercial \| public` | `CHECK (job_type = ANY (ARRAY['residential','commercial','public']))` — **confirmed** |
| 0 rows in `jobs` | **0** |
| `cubic_yards` generated with `COALESCE(depth_in, 4)` | `(((COALESCE(sqft_override, (length_ft * width_ft)) * COALESCE(depth_in, (4)::numeric)) / 12.0) / 27.0)` — **confirmed** |
| `sqft` ignores counted items | `COALESCE(sqft_override, (length_ft * width_ft))` — **confirmed**, no quantity term exists |
| section fields for proposals are new | `measure, quantity, role, finish, line_code, customer_note` — **all absent** |
| `job_files` photo fields are new | `section_id, caption, on_proposal, sort_order` — **all absent** |
| a private `job-files` bucket is new | only bucket is `call-audio`, `public=false` — **confirmed absent** |
| proposal structure on `estimates` is new | `blocks, template_id, template_version` — **all absent** |
| `documents.snapshot` is new | **absent** |
| `proposal_templates`, `proposal_template_versions` are new | **both absent** |
| `scope_captures`, `scope_facts`, `job_notes` are new | **all three absent** |
| `job_files.kind` gains `audio` | today `CHECK (kind = ANY (ARRAY['pdf','image','doc','sheet','other']))` — **confirmed, no `audio`** |

**Every table either migration touches is empty.** `jobs` 0, `job_sections` 0,
`job_files` 0, `documents` 0, `estimates` 0, `estimate_line_items` 0. Redefining a
generated column and rewriting a CHECK are both free at 0 rows — there is no
backfill and no constraint violation to discover. This is the cheapest moment these
two migrations will ever have.

**One thing I found that the handoff does not mention, and it matters.**

`job_sections.depth_in` carries a **column DEFAULT of 4**, separately from the
`COALESCE(depth_in, 4)` inside the generated expression:

```
col          generated  default   type
depth_in     (none)     4         numeric(6,2)
cubic_yards  stored     (((COALESCE(sqft_override, …) * COALESCE(depth_in, 4::numeric)) / 12.0) / 27.0)
```

026's stated goal is "blank depth → blank CY". Redefining `cubic_yards` alone will
not achieve that. An insert that omits `depth_in` gets 4 from the column default,
so `depth_in` is never null, so the new expression never sees a blank and still
computes a cubic yardage off an invented 4″ slab. **026 has to drop the column
default as well as change the expression**, or the fix is cosmetic.

I cannot check whether it does — the file is not here. Flagging it so it is the
first thing checked when it arrives.

`psi` has the same shape (`DEFAULT 3000`) and is worth the same glance, though the
handoff does not claim to change it.

## 6. What I did not do

- **Did not merge.** PR #10 is open against `master` and stays open. §7 of
  DECISIONS.md: a merge is an exception granted in the conversation, each time.
- **Did not apply any migration.** Nothing was written to the database in this
  step. Every query above is read-only `select`.
- **Did not push to `master`.** Local `master` is one commit ahead of
  `origin/master` (`3e3fca2`, the edge-function fix). That commit is already on
  the PR branch and will reach master when #10 merges. I left it alone rather than
  pushing it separately.
- **Did not rewrite history on the branch** — see §1.

## 7. Open questions

1. **The FEAT-009 folder.** Copy it in and Steps 2–4 can proceed. It is the only
   blocker.
2. **`job_number`.** Still unanswered from WO13. What do the three segments of
   `24-318-1` mean, and when does the last one reset? Until then the field is NULL
   and nothing generates one.
3. **`job_type` and migration 026.** WO13 left `job_type` out of the POST body
   because it defaults to `'residential'` and DECISIONS.md §10 parks public work.
   026 replaces the CHECK with `residential | light_commercial | industrial |
   federal`, which drops `public` and splits commercial three ways — so the answer
   to "should POST accept `job_type`" probably belongs to 026, not to WO13. Worth
   deciding once, there.
4. **`depth_in DEFAULT 4`** — §5. Does 026 drop it?
