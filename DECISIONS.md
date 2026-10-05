# ScopeCrete — Decision Record

Ground truth for every agent working this repo. If code disagrees with this
document, the code is wrong or this document is stale — resolve it, don't
guess. Update this file in the same PR that changes the behavior it describes.

Last updated: 2026-10-05 (loading faster — get_user_org_ids() STABLE, migration 083, one auth round trip per API call; proposal photos as thumbnails with a Proposal switch on each section; a section's budget folds; the dashboard header slides away on the job page on a phone; an empty message box; Dusty files a forwarded email and its files by its id, the intake reads BlueMail forwards and files on a whole name — email-intake v11; swipe left for Spam · Archive, Select an icon beside Sort; proposals sent from Threads, the Preview and Dusty, his words learned from Coy's; Threads update on their own as texts land — migration 082; Dusty puts people on customers and fixes names, and says nothing of his own setup — Hermes's tools must be off on the VPS; fonts self-hosted, so a build downloads nothing; the landing page's phone demo is the real app — Design 10; texts send through Quo — the thread's Send and Dusty's text step, Coy's tap either way; a Summary view on every job, the job name and switch centred on the phone; Dusty full screen on the phone, chat text size, his thought line can be hidden; onsite estimators — jobs and pages by person, vendor first, tags notify — migration 081; a name we greet a caller by becomes a suggestion — enrich-contacts v28; contact, customer and vendor pages on one layout; the customer page's Threads tab sums up each person; the Files page laid out like OneDrive, with storage left; the Plan Room's Files and Sheets one tab; thread search a drop-down over the chat; the Threads list header sticky with its own search; the header lockup on one line; one top row on the job's three views; the proposal's dark band off the cover; Good / Better / Best removed — one price per job; search across the header; six dots for the activity line; job switch on the name's row; budget line notes; quo-intake stores every Quo event, own lines included — v10; one Unit type picker; a section's Camera; Dusty writes in Figtree; Dusty is the Scopecrete Lander; an All thread; proposal cover band and Prepared by; sign-in at app.scopecrete.ai/login, each org at <slug>.app.scopecrete.ai; Dusty's chat keeps its files and files them on a customer or job — migration 079; vendor Delete; Dusty on a vendor's page and looking at attached photos; sales tax by address via TaxLocus — migration 078; archive reasons; Lines, providers and logs — migration 077; internal notes with @-tags; Jobs board sort and filter; jobs by hand — migration 076; done and lost customers in Threads; proposals sent by link, every opening tracked; every option side by side for the customer — migration 075; Documents is Files, everywhere — migration 074; Threads v2 — threads you make, channels per number, the customer page reshaped — migration 073; an address given is kept and asked about — migration 072; Dusty sets addresses; customer address from their own words — migration 071; units and counting on a line; Dusty sets parish sales tax; tick takeoffs to send; section Notes replace Prep and Access; a colour per takeoff — migration 070; sections follow the Plan Room — migration 069; Dusty edits the Price book and assemblies; area maps on the proposal; archive & delete; call notes → Dusty's quote; aerial sheets; customer name leads the job name)

---

## 1. What the product is

Mobile-first PWA for concrete contractors. Field use: one-handed, on a
tailgate, muddy hands. Dense UI, small tight fonts, no decorative whitespace.

**The moat is the concrete math, not the CRM.** Concrete is estimable because
it has a finite repeatable parameter set — sqft, depth, PSI, prep, access.
The Scope Builder is the spine. Everything else feeds it or carries its output.

**One database, two doors:** a customer-facing estimator that captures leads,
and the back-office assistant (Dusty). Same brain, same data.

---

## 2. Data model — jobs are the spine

**There is no money without a job.** "Lead" is just the word for someone
calling in. Threads (conversations) are continuous, build context, and exist
to develop into a job that can be won.

    org → contacts (keyed by phone) → jobs → job_sections → notes/photos

A driveway + patio + demo at one property is ONE job with several sections.

Invoices, payments, receipts, daily logs, and estimates all hang off the job,
so quoted-vs-actual is live rather than reconstructed by hand.

**KNOWN ISSUE — every inbound message creates a lead.** As of 2026-08-21
`quo-intake` calls `resolveLead()` on every `message.received`, `call.completed`
and `message.delivered`, so any contact with no open lead gets one. That was
invisible while the lead bug meant no lead was ever created; now that it is
fixed, 118 contacts carrying traffic can each spawn one.

Of the first four real leads, Luis (a sub who sends crews, 324 messages) and
Gary Davis (18 messages about shop cleanup) are not leads at all.

**CORRECTION 2026-08-23 — "Brad Chaney" is not a customer either.** This
document previously called that lead a genuine inbound enquiry. It is not.
Contact `5f02a4d7` / +19012956423 is **Dalton Digital**, a paid lead-generation
service. All eleven of its messages are the same template:

    "New Lead From Baton Rouge Concreters — <name> needs <service>.
     Call them at <phone> (<city>). — Dalton Digital"

Brad Chaney is a name inside the FIRST message body — a referred prospect whose
real number is 2253265685. Something wrote that name onto `contacts.name` for
the lead-gen service's number. That is the same failure mode as the "Hi Coy"
bug: a name lifted from message content and attached to the wrong party.

Two consequences. Under the direction-of-ask rule Dalton Digital is a **vendor**
(we pay them for leads), so the correct classification for that contact is
`vendor`, not `customer`. And the eleven genuine prospects named in those
message bodies have never been created as contacts at all — they are the only
real customers in that thread, and the system cannot see them.

**Do not use this contact as the positive customer case when testing the
classifier.** A correct classifier returns `vendor` for it.

The rule is NOT settled and no heuristic should be added yet — the deciding
input is what `enrich-contacts` proposes as `classification`
(customer/vendor/sub/not_work). See §"Interim signal" below for what the data
already rules out.

**The discriminator is the DIRECTION OF THE ASK, not topic or volume.**

Volume is the wrong signal — a big commercial customer generates hundreds of
messages too. Topic is also wrong: a sub and a customer both discuss the
address, crew size, equipment and start dates. What differs is who wants what
from whom.

    money OUT from us to them        -> sub or vendor
    money IN from them to us         -> customer
    they offer their availability    -> sub
    they ask what it costs THEM      -> customer
    they ask when WE need them       -> sub
    they ask when WE can start       -> customer

Luis (+1985…8307) is the worked example, classified sub on:

    "Can you send Luis the payment for Monday he needs it"
    "could you send the $1300"
    "if you have anything for Monday for us we are free"

Money flows out to him and he offers his availability to us. He is labour we
buy, not work we sell — however much he talks about driveways.

This is the primary classification rule in the `enrich-contacts` prompt
(`enrich-v3-direction-of-ask`), and `evidence_quote` must be the line that
SHOWS the direction. A quote about the address is not evidence of a
classification; if that is the best line available, the answer is `unknown`.

**RESOLVED 2026-08-27 — was: the 12,000-char window truncates away the
evidence.** Fixed in `enrich-v4-tail-window-2026-08-23`, deployed as
`enrich-contacts` version 2. Turn labels are now short ordinals (`#42 THEM
2026-07-10`, ~20 chars) instead of uuid headers (~69), the window keeps the
TAIL rather than the head, and `MAX_TURN_CHARS` caps any single turn at 4,000.
The model cites `evidence_turn`, an ordinal that `sanitize()` resolves back to
a real `messages` id, so it never sees a uuid and cannot invent one. The
diagnosis is kept below because it is the reason the design is what it is.

Measured 2026-08-23 against the live data, before the prompt had ever run:

`askModel()` sends `conversation.substring(0, 12000)`, and
`renderConversation()` prefixes every turn with a
`[message_id: <uuid>] THEM @ <date>` header costing ~69 characters. For Luis:

    256 non-empty turns
    32,837 chars rendered  =  14,661 chars of actual words
                            + 17,664 chars of message_id headers (54%)
    12,000-char window     =  37% of the conversation

All three lines this document cites as the worked example for `sub` sit past
the cut — at cumulative offsets 30,304 ("could you send the $1300"), 32,175
("if you have anything for Monday for us we are free") and 32,298 ("Can you
send Luis the payment for Monday he needs it"). **The model never sees any of
them.** Two other money-out lines do survive, at 10,800 and 11,548 ("Are you
able to send the payment for the guys today ?"), so Luis should still classify
`sub` — but on different evidence, and with only ~450 chars of headroom left.

Any contact with more traffic than Luis loses the direction entirely. Fix the
plumbing before running the prompt over all 135: drop the uuid headers to a
short per-turn index (recovering ~54% of the budget), and prefer the TAIL of a
long conversation over the head, since the direction of the ask is clearest in
recent traffic.

**The legacy enricher is gone from production AND, as of 2026-09-27, from the
repo.** `enrichContact()` wrote `name`, `first_name`, `address` and
`contact_type` straight onto `public.contacts` with no review step. It is the
most likely origin of the "Brad Chaney" mislabel above.

CORRECTION 2026-09-27: this section used to say production intake still
contained it. It did not — deployed `quo-intake` v56 was already the v8
"landing zone" version with `enrichContact()` and `syncCallToMessages()`
removed. The drift ran the OTHER way: `master` still carried both, so
**deploying intake from the repo would have reinstalled the unreviewed
enricher**. The repo now holds the deployed v56 source (its own commit, no
behaviour change), and v57 is built on it. **Always read the deployed source
back with `get_edge_function` before changing an edge function; never assume
the repo matches production.**

**The filter is then deterministic and free.** `customers.relation` is
`NOT NULL DEFAULT 'customer'` with `CHECK (relation IN ('customer','vendor','sub'))`,
plus `relation_confirmed_at timestamptz` (nullable) to separate confirmed from unseen:

- a confirmed proposal writes `customers.relation` and sets `relation_confirmed_at`
- `quo-intake` suppresses lead creation only when the contact's customer has
  `relation IN ('vendor','sub')` AND `relation_confirmed_at IS NOT NULL`
- an unconfirmed or unclassified contact defaults to `relation='customer'` with
  `relation_confirmed_at=null` and still creates a lead — **unknown is not the
  same as not-a-lead, and unexamined defaults to customer**
- an EXISTING open lead is always returned regardless of relation, so a later
  reclassification never orphans a lead a human already worked

The guard fails OPEN: any lookup error creates the lead. A missed lead costs
revenue; a junk lead costs annoyance.

**The guard suppresses nothing until relations are confirmed.** Measured
2026-08-23: all 135 rows in `customers` are `relation='customer'`,
`relation_source='default'`, `relation_confirmed_at IS NULL` — zero confirmed.
Because suppression requires `relation IN ('vendor','sub')` AND
`relation_confirmed_at IS NOT NULL`, deploying the guard is behaviour-neutral
on day one. It does not stop today's lead-per-message spam. The thing that
stops it is confirmed proposals, which need `enrich-contacts` run and reviewed
first. Deploy the guard so it is in place, but do not expect it to change
anything on its own. That the confirmation requirement is a deliberate rule
rather than an unfinished edge is set out in §2b.

**The existing Supabase project is modified additively. Never wiped.** The
accumulated comms history (quo_events, sms_threads, voip_calls, contacts) is
worth keeping.

---

## 2f. A customer is not a contact — migration 055 (applied 2026-09-30)

Coy: *"Amber is the contact for this commercial customer. The customer is a
business: Art Apartments. Every customer should have a separate contact
list."* (Claude Design handoff, `design/customer-and-themes/`.)

- **The customer owns the address and the jobs**; its **contacts** are the
  people who speak for it. `customers` (one row per contact until now, made by
  `sc_classify_contact`, carrying `relation` for the lead guard) gained
  `customer_type` (residential / commercial / public — else read from its
  jobs), `subtype`, `lead_source`, `status`, `since` (first won job),
  `primary_contact_id`, and the address (`address_line1`, `city`, `state`,
  `zip`, `address_formatted`, `lat`/`lng`, `geocoded_at`, `address_source`
  contact | coy | geocode). `contacts.customer_id` / `role` / `is_primary`
  already existed; `contact_phones.can_text` and `contact_notes.message_id`
  (a note on one call) are new. Backfill: each customer's one contact is its
  primary; the 9 contacts with an address gave it to their customer
  (`address_source='contact'`, the page says "check it"); jobs got the
  customer of their contact (20 linked).
- **The address from their own words (migration 071, applied 2026-10-03 on
  Coy's yes).** Coy: *"why didn't the system catch the address for Johnette
  … it was clearly in the text message"* — the reader had put it on her JOB
  (`site_hint`) and nothing ever put it on the customer. Now a customer with
  **no address at all** gets the one their person gave, and never over any
  other: **texted** (house number and street word in an inbound text from
  them — *"I often ask people to text me their address"*) → written by the
  database as typed (`sc_customer_address_from_words`, trigger
  `contact_proposals_address`; `address_source='contact'`, "check it");
  **said on a call** (only in a transcript, where *"it's easier to misspell
  addresses"*) → checked against **Mapbox Geocoding v6** first
  (`src/lib/address-server.ts`, `MAPBOX_TOKEN` in Vercel): only an exact or
  high match of the same house number AND the street is written, in
  Mapbox's spelling with its point (`address_source='geocode'`, "heard on a
  call and matched by Mapbox — check it"); anything less shows on the
  customer page as "Heard on a call … Mapbox finds … **Use it** / Type it"
  (`sureMatch()`, tested in `tests/address-check.test.mjs`). The check runs
  when the customer is opened (`GET /api/customers/[id]`,
  `sc_customer_heard_address()` — invoker, members only; rehearsed rolled
  back: a stranger sees none, anon can't run it). Applied: Johnette
  and one other texted address filled; 6 heard on calls wait for the check.
  **The Edit form's Street finishes the address as you type** (Mapbox,
  `/api/address/suggest`, `address-input.tsx`): a pick fills street, city,
  state and zip. Coy's typed address is placed by Google if its key is set,
  else Mapbox.
- **Anyone who gives an address is kept and asked about (migration 072,
  applied 2026-10-03).** Coy: *"If an address is being given by a new
  contact it should be recorded even if there isn't enough context yet to
  determine if that person is a customer or vendor. Either way … it should at
  least be marked as an important contact for dusty to ask me about."* When
  the reader hears an address the person texted or said
  (`sc_contact_heard_address()`, 071's rule), it is written on the
  **contact** if they have none (`contacts.address` / city / state / zip,
  `address_source` text | call | coy, `address_heard_at`; never over one
  there) — the person page and Dusty say "texted" or "heard on a call —
  check it". Unless Coy filed them himself (or they are spam), Dusty adds a
  next step, due that day: "Gave an address — … Who are they? File them."
  (`contact_tasks`, source dusty) — on the activity line's reminders, their
  page and Dusty's context; once per address, so a dismissed ask is never
  re-added. When a person is later given a customer (trigger
  `contacts_customer_address`), 071 runs for it, so a texted address
  follows them. Applied: 10 people's addresses kept, none overwritten; 8
  asks. Rehearsed (rolled back, run twice: no second ask).
- **Dusty sets addresses (Coy, 2026-10-03: "I want dusty to be able to
  update an address record").** A plan step `set_address` {kind customer |
  contact | job, the full id from his context, line1 — a house number and
  street, never made up — city, state, zip, source}. On Coy's Apply it is
  checked against Mapbox (`/api/address/check`): on a sure match the map's
  spelling is saved, otherwise his words with "the map wasn't sure — check
  it"; through `PATCH /api/customers/[id]`, `PATCH /api/contacts/[id]/address`
  (Coy's, `address_source='coy'`) or `PATCH /api/jobs/[id]`. The card lists
  the real name it touches. Tested in `tests/dusty-plan.test.mjs`.
  Not built: Mapbox's check of an address heard on a call for a person who
  has no customer yet (the customer page does it once they have one).
- **Moving people is Coy's tap and undoable.** `sc_attach_contact(contact,
  customer)` / `sc_detach_contact(contact)` / `sc_undo_contact_move(move)` —
  SECURITY DEFINER with an explicit membership check, execute for
  `authenticated` only. The contact's own jobs move with it; every moved id is
  recorded in `customer_contact_moves`, and undo puts back only what is still
  where the move left it. `contacts_one_primary` holds: a mover arrives as
  primary only when the customer has none.
- **One person's filing never flips a company.** `sc_classify_contact()`
  first gives a contact that SHARES its customer a customer of its own when
  it is filed vendor / personal / spam — the lead guard reads
  `customers.relation`.
- Rehearsed before applying: attach + jobs follow + one primary; filing a
  shared contact vendor left the company a customer; undo; a stranger gets
  "contact not found"; anon has no execute.

## 2g. The org — its name and logo (migration 056, applied 2026-09-30)

Coy: *"We need a way to change the Organization name … that will reflect
across the database … I also want to be able to upload a logo for my org."*
(Claude Design handoff, `design/org-branding/`.)

- **The name lives once, in `orgs.name`.** The header, `/api/session/me`,
  Settings and Dusty all read it by `org_id`; no table keeps its own copy.
  Renaming is `sc_rename_org(org, name)` — SECURITY DEFINER, owners only
  (`get_user_owner_org_ids()`), 1–120 characters, execute for
  `authenticated` only — through `PATCH /api/org`. It is deliberately **not**
  an UPDATE policy on `orgs`, which would also let a caller rewrite
  `plan_tier`, `api_key_hash` and `webhook_url`. When quotes and invoices can
  be sent, each will keep a copy of the name it was sent under; nothing is
  sent yet. The reader's `OUR_NAMES` (`enrich-contacts/rules.ts`) is still a
  hard-coded list; "Sacco" in it covers "Sacco Enterprises" by substring, so
  the rename needed no deploy — it becomes per-org before a second org.
- **Logos:** `orgs.logo_light_path` (dark lettering — Site Office, Blueprint,
  Kraft Yard) and `logo_dark_path` (light lettering — Night Shift), storage
  paths in the **private** bucket `org-branding`
  (`{org_id}/logo-{variant}-{stamp}.{ext}`; PNG, WebP or SVG, 5 MB). Members
  read; only that org's owners write. The browser shrinks a PNG/WebP to 1200px
  and sends it straight to storage (`POST /api/org/logo` → signed link →
  `…/done`); `done` cleans an SVG (`src/lib/svg-clean.ts`, tested: scripts,
  handlers, outside references, entities) and calls `sc_set_org_logo()`,
  which accepts only a path in the org's own folder. `GET
  /api/org/logo/[variant]` redirects to a signed link, so `<img>` works and
  the bucket stays private. `DELETE /api/org/logo?variant=` removes one.
- **The header lockup** (`org-lockup.tsx`): the theme's logo (else the other),
  28px (24 on a phone), a pencil rule, the ScopeCrete emblem (the landing
  page's orbits and green block, `Emblem` in `site/marks.tsx`, 2026-10-05)
  beside "powered by" over the wordmark (on a desktop one line since
  2026-10-05 — "powered by", the emblem, scopecrete.ai — and the header's
  dividing rules darker, `--sc-pencil-rule`; Coy), its orbits turning as on the
  landing page (still under reduced motion) — the
  block exactly the logo's height (Coy: "the same size as the Sacco
  Enterprises logo"; dropped under 340px). No logo, or one that fails to load → the
  emblem and the scopecrete.ai wordmark.
- **`org_audit`** records `org_renamed` and `logo_set` / `logo_removed`, old →
  new, who and when; members read it, only the functions write it.
- **People:** `sc_org_people(org)` (SECURITY DEFINER, members only) returns
  each member's name, email and role — the one way a teammate's email is read.
  Your own name is saved on your auth account (`PATCH /api/me`, `full_name`).
- **Invites (migration 062, applied 2026-10-01 on Coy's "apply 062" —
  except `sc_remove_member`, below).** Coy: *"add other users to my Org …
  and send invites to the dashboard."* Settings → Organisation → People →
  **+ Invite**: an email and a role (owner · member · field crew) →
  `sc_create_invite()` (owners only) → a link `/invite/<token>` shown ONCE to
  copy, email or text from Coy's own account — ScopeCrete sends nothing
  (§10). Only the token's SHA-256 is stored; one use, 14 days, a new invite
  for the same email replaces the old; **Withdraw** (`sc_revoke_invite`).
  The invitee signs in on the invite page (Google, or Supabase's emailed
  sign-in link) with THAT email and taps Join → `sc_accept_invite()` writes
  the `org_members` row; another email is refused by name. An owner can
  remove a member (`sc_remove_member`: never themselves, never the last
  owner). All SECURITY DEFINER, execute for `authenticated` only, no INSERT
  policy on `org_invites`; audited (`member_invited`, `invite_revoked`,
  `member_joined`, `member_removed`). `getUserSession()` (signed in, no org
  needed) serves only `/api/invites/[token]`. Rehearsed (rolled back): an
  existing member and a direct insert refused; a stranger sees no invites and
  can't invite; the wrong email refused; the invitee joins and sees the org;
  a member can't invite; a used link can't be reused; withdraw works; anon
  refused. **`sc_remove_member` is NOT applied:** its `delete` statement is
  held at the Supabase connector's approval gate (timed out twice); until it
  is approved and applied, the × on a person says "Removing people isn't
  switched on yet". Owners and members read everything under
  `get_user_org_ids()`; only owners manage the org. **Onsite estimators**
  (role `field`) see only the jobs and pages they are given — §2j.
- Rehearsed before applying: owner renames and it is audited; blank refused;
  a path in another org's folder or with `..` refused; a direct UPDATE on
  `orgs` changes nothing; a stranger can't rename, set a logo, or see people
  or the audit; anon has no execute.

## 2j. Onsite estimators — jobs and pages by person (migration 081, applied 2026-10-05 on Coy's "apply 081")

Coy: *"I need be able to use onsite estimators and give them access to the
app to upload photos and plans and take measurements … when I create a user
I need to be able to set permissions. I want to be able to enable access to
specific jobs and pages. Also they need to be setup as a vendor before I can
enable internal access. Internal users can be mentioned with @(username) in
the customer notes and get a notification."*

- **The role `field` (062's unused "field crew") is the onsite estimator.**
  `get_user_org_ids()` leaves `field` memberships out, so an estimator reads
  nothing of the org by default — contacts, texts, calls, customers, cash,
  the inbox, Dusty's chats. What they may reach is granted back table by
  table for their jobs only (`sc_field_job_ids(page)`, `sc_field_org_ids(page)`):
  the job and its areas always (jobs read-only; sections read and write);
  **Photos & files** (`files` on their jobs, read, upload, file on an area);
  **Plan room** (sheets, takeoff groups and shapes; the in-room PDFs to read);
  **Budget** (the job's estimate and lines; the Price book, assemblies,
  money defaults, parish rates and project types to read). Storage follows
  the `files` rows. Jobs: `org_members.all_jobs` or `job_ids`. The proposal,
  Threads, Customers, Cash, Vendors, Logs, Dashboard, search and Dusty are
  not theirs; the app hides them and sends them to the Jobs board
  (`redirectFor()`, `src/lib/access.ts`, tested), and RLS is the lock either
  way. On the job page they see who it's for — name and phone only
  (`sc_field_job_contact()`), so they can meet the customer.
- **Vendor first.** `org_members.contact_id` / `org_invites.contact_id`: an
  estimator must be a contact filed **vendor** (`sc_check_access()`), checked
  on invite (`sc_invite_member()`) and on change (`sc_set_member_access()`,
  owners only, never your own role, never the last owner, audited
  `member_access`). Their name in @-lists falls back to the vendor's.
- **Where Coy does it.** Settings → Organisation → People: **+ Invite** →
  Owner · Member · **Onsite estimator** → the vendor (picked from Vendors; their
  email fills in), pages, every job or the ones ticked → the link, as before.
  ✎ on a person changes their role, vendor, pages and jobs. A vendor's page
  has **App access**, which opens that invite with them picked.
- **Tags notify (`member_notifications`).** A note that tags a member writes
  one row per tagged member (trigger `contact_notes_mentions`, the last week
  backfilled), with the job they may open; the activity line's "Tagged you on …"
  reads it (`tagItems()` in `/api/activity`), for an estimator linking to the
  job, since they can't open the thread. In-app only — nothing is texted or
  emailed (§10). The call notes on the customer page take @ too
  (`mention-field.tsx`), like Internal notes.
- **Also in 081:** `sc_my_orgs()` / `sc_my_access()` give the header, sign-in
  routing and `getApiSession()` the org's name, slug and logos without the
  `orgs` row (webhook_url, api_key_hash); `sc_spine_drift` becomes
  `security_invoker`; `leads_view`, `vendors_view`, `job_close_rates` and
  `sc_open_name_questions` (unread by the app) lose authenticated's select
  (§9). The app ships ahead of 081: each new function falls back to the old
  read when it is missing, and the estimator role is off until it exists. **Applied 2026-10-05** (`apply_migration`); checked after: the four columns on members and invites, 24 policies, RLS on `member_notifications`, the tag trigger, `sc_spine_drift` invoker, authenticated has no select on `leads_view`, anon can't run `sc_my_orgs`, nobody but the functions runs `sc_check_access`; Coy still sees 206 contacts, 42 jobs, drift 3, and is owner.
- Rehearsed (rolled back) on the live data: a test estimator on one job with
  Photos & files + Plan room saw 0 contacts, messages, customers and notes,
  only that job, its 11 files and their storage objects, 2 sheets and its
  takeoffs, no estimate or Price book; added an area to it, was refused one
  on another job, could not update the job or make themselves owner; Coy's
  counts unchanged (206 contacts, 42 jobs, drift 3 through the invoker view);
  inviting an estimator with no vendor, or a customer, refused; Coy's tag
  reached them linked to the job; switched to Budget on another job, they saw
  only that job, its estimate and the 430 Price book items.

## 2a. The raw log and the spine — migration 016

Applied 2026-08-27 as `016_raw_log_and_spine_projection`. This is the shape of
comms ingestion now, and it replaces the arrangement described above where
application code wrote `messages` directly.

**Two layers, and the boundary between them is the point.**

    provider webhook -> quo_events (RAW LOG)  -> [db trigger] -> messages (SPINE)
                                                              -> call_artifacts

`quo_events` is the **universal raw log**. Every event lands there with its
untouched payload in `raw_payload`, whatever it is and whether or not anything
downstream understands it. It gained `provider` (default `'quo'`),
`received_at`, `projected_at` and `projection_error`. It is append-only in
spirit: nothing edits history, and a payload we cannot parse today is still on
disk for when we can.

`messages` is the **spine** — the one table the application reads.

**Projection is the DATABASE's job, not the application's.** Trigger
`quo_events_project` fires `AFTER INSERT OR UPDATE` on `quo_events` and runs
`sc_quo_events_project()`, which calls `sc_project_raw_event(quo_events)`.
Application code must not write `messages`. Two writers on the same rows is
precisely the failure this removes — see §2b.

Dedupe is `messages_provider_idx`, a unique partial index on
`(provider, provider_message_id) WHERE provider_message_id IS NOT NULL`. As of
2026-08-27 no row has a null `provider_message_id`, so the index covers the
whole table and a duplicate is structurally impossible rather than merely
unlikely.

**`call_artifacts` holds what a call produced**, one row per message per kind
per source. Live counts on 2026-08-27:

| kind | rows | note |
|---|---|---|
| `recording` | 16 | audio, no text content |
| `summary` | 15 | avg 366 chars |
| `transcript` | 15 | avg 2,594, **max 10,579** — never load into a list |
| `next_steps` | 9 | avg 125 chars |

`messages.summary` and `messages.summary_source` are a **display cache**.
`call_artifacts` is authoritative. If the two disagree, the artifact wins.

Artifact events correctly produce no `messages` row. That is why `quo_events`
(1,184) exceeded `messages` (1,138) by 46 on 2026-08-27: exactly 16 recordings
+ 15 summaries + 15 transcripts. Not a defect — do not "fix" it.

**`sc_spine_drift` is the alarm that did not exist on 21 August.**

    select count(*) from sc_spine_drift   -- 0 means everything that arrived reached the app

`projection_defects` records what failed and why. On 2026-08-21 at 03:14 UTC
SMS projection in application code stopped and never ran again; 48 texts landed
in the database and never reached the app, and nothing was watching. A non-zero
drift count is that outage, visible this time. Surface it in the UI.

**Two kinds of drift row (2026-09-28).** `unprojected_raw_event` is the alarm —
an event landed and never became a message; it alone is the drift *count*
(`/api/dashboard/drift`), a banner on Threads, a red banner at the top of
**Logs** and a red dot on the Logs icon (2026-09-30: out of the header —
Coy).
`open_defect` is a note on a message that DID arrive (e.g. Quo called a text
from Coy's own Cell line "inbound"; the projection filed it outbound) — shown
only on **Logs** (`/api/logs`), with Dusty's reads and same-person
merges. Coy: drift belongs on a logs page, not in the inbox. The one open
defect on 2026-09-28 is that Cell-line text; nothing is missing.

**Intake writes the raw log before anything that can fail (quo-intake v10, deployed as version 69,
2026-10-04).** Coy texted the Quo line from his Google Voice line, which is one
of the org's own lines. Migration 019's `contacts_not_org_line` guard refused to
make a contact of it, and that exception 500'd the webhook BEFORE `quo_events`
was written, so the text was lost without a trace. Now:

- an event whose counterparty is one of our own lines is stored with no
  contact, skips leads and the legacy tables, and gets an
  `own_line_counterparty` defect. Logs shows it as a note: "A text between two
  of your own lines". It never appears in Threads, because nobody else is in it.
  Testing intake needs a phone that is not one of the org's lines.
- any other error stores the event first (no contact) with an `intake_error`
  defect, which shows red on Logs, and the webhook answers 200. Only when that
  write fails too does Quo get a 500 and retry.
- a call follow-up whose call has no `voip_calls` row is stored as well
  (before v10 it was dropped). The projection attaches it by `callId`, or records
  `artifact_without_call`.

**Attachments — migration 027 (applied 2026-09-27).** Photos, videos, PDFs and
contact cards sent by text live in `message_media`, one row per file, written by
the projection (`sc_project_raw_event()`) and backfilled from
`quo_events.raw_payload.media` and `sms_threads.media_urls`. Before 027 the
projection kept only the first URL, and in `messages.recording_url` — a photo
filed as a call recording. That write is still there for compatibility and
should go once nothing reads it. Files are copied lazily into the private
`message-media` bucket the first time a thread is opened
(`/api/messages/[id]/media`) and served by short-lived signed URL. Storage paths
are `{org_id}/…` in both `message-media` and `call-audio`, and `storage.objects`
policies scope reads and writes to `get_user_org_ids()`. Before 027 there were
**no** storage policies, which is why the call-audio player never worked.

**Call audio — copied on first play (migration 041, 2026-09-28).** Coy: the
recordings belong on the customer and vendor pages. A call with a recording
shows **Play recording**; the tap calls `/api/messages/[id]/audio?kind=recording`
(or `voicemail`), which signs the stored copy if there is one, and otherwise
asks the Quo API for a fresh link (`GET /v1/call-recordings/{callId}`,
`QUO_API_KEY` server-side), falls back to the link on record, copies the file
into `call-audio/{org_id}/{message_id}-{kind}.mp3`, stamps
`call_artifacts.storage_path`, and signs that. Nothing downloads until the tap.
Migration 041 added the missing INSERT policy on `call-audio` (the caller's own
org folder only — verified). When Quo refuses, the row says why ("may need
QUO_API_KEY"), never a dead player. As of 2026-09-28 `QUO_API_KEY` is **not**
set in Vercel; 129 calls carry a recording link, none copied yet.

## 2d. Lines and providers — migration 035 (applied 2026-09-27)

Quo today; other providers or Coy's own AI voice stack later, on the same
schema. **A contact is the other person's number; the line is a property of
each message.** One person calling two of Coy's lines is one thread.

- `org_phone_numbers.provider` (quo | twilio | telnyx | retell | vapi |
  own_stack | other), `provider_number_id`, and `default_lead_source` — a
  tracking number printed only on the website makes its callers website leads.
  Provider was set only where the data proves it (Main and Cell: every message
  projected from Quo); Third is unknown until Coy sets it.
- `messages.phone_number_id` is filled by trigger `messages_set_line`
  (whichever address is one of the org's lines) and was backfilled: 1,466 of
  1,505 messages; 39 involve none of the three lines and stay null.
- `messages.provider` stays per message — where that event came from — and the
  dedupe index `(provider, provider_message_id)` still keys on it.
- Settings → Phone lines edits label, provider and default source
  (`/api/lines`). A thread shows the line on each message only when it spans
  more than one.
- Seen in the data: (225) 529-9098 is a relay that texts "New call from:
  Baton Rouge Concreters, Number: +1…" for every website call (~150). Each of
  those numbers is a website lead — the first real input for lead sources.
- **Lines, providers and logs (Claude Design package 9, `Lines.dc.html`;
  Coy, 2026-10-04: "go ahead with the lines/providers/logs").** The design's
  `providers` / `lines` / `line_events` tables are **not** made: a line is
  this `org_phone_numbers` row, the event log is `quo_events` (§2a — every
  event saved as it arrived, before it is filed), the stamp is
  `messages.phone_number_id`. **Migration 077** (applied 2026-10-04 on Coy's
  "Apply 077"; checked after: the column, anon can't run replay) adds only `org_phone_numbers.color_token`
  (hiviz · chalk · violet · green · teal; null = assigned in order) and
  `sc_replay_raw_event(event)` — Replay: runs the projection again for one
  raw event of the caller's org (SECURITY DEFINER, membership checked,
  authenticated only; the dedupe index makes a second message impossible).
  Rehearsed (rolled back): a member replayed a text and a call summary, 1,565
  messages and 380 artifacts before and after; a stranger "event not found";
  anon refused; a colour off the list refused. One reader,
  `src/lib/lines-server.ts`, serves both pages: an event's line is whichever
  of its two numbers is ours (`quo_events.phone_number_id` is never filled);
  its status (`eventStatus()`, `src/lib/lines.ts`, tested) is **failed**
  (projecting threw, or unfiled 2+ minutes), **pending**, **late** (a
  recording / summary / transcript more than 10 minutes after its call
  ended) or **OK**; latency = filed − received. Measured 2026-10-04: 94
  events in 7 days, none failed, filed in the same instant.
  **Lines** (`/dashboard/more/lines`, was "Phone lines"): a card per line —
  number, name, Primary (Make primary), health (Healthy / N failed / no
  events), Provider, "A new caller here is a…" (the lead source, §2d), Today
  (calls · texts since Central midnight), Last event, the webhook (Quo's is
  the deployed `quo-intake`) with Copy, Threads › / Logs ›, the colour, and a
  red strip when an event failed. Providers on the right: Quo (connected,
  lines, whether `QUO_API_KEY` is set) and Twilio / Telnyx / your own stack
  shown **Not built** — only Quo's intake exists, and the page says so rather
  than offering a webhook that goes nowhere. **+ Add a line** (a drawer; the
  + on a phone): who runs it, the number (typed — reading Quo's numbers
  needs the API key), name, lead source, the webhook to point Quo at, then
  "Waiting for the first event…" until one arrives (`POST /api/lines`;
  members may write `org_phone_numbers` under its RLS). The design's
  per-line *bucket* for a new caller is not built: the lead source is what
  §2d defines, and filing callers by line would be a classification rule.
  **Logs** (`/dashboard/more/logs`): the event table on top — chips for Line
  (with counts), Provider and Event (All · Calls · Texts · Webhooks · Needs
  you = not OK), kept in the address (`?line=&provider=&event=`), "N of M
  events · last 7 days"; a red alarm with **Replay event** when anything in
  view failed; a row opens a drawer with the payload as it arrived, the
  trace (received, filed, error, defects) and links to the contact and
  message (`/api/logs/events[/id[/replay]]`). Data checks, Dusty's reads and
  merges stay below unchanged.
  **A thread, stamped by line** — when the org has two or more lines: every
  call card says "● via Website · Quo" and every text "● via Main"; a line
  filter (only lines this person reached) beside All · Calls · Texts; **Call
  from ▾** (your phone dials — choose the same line in Quo); the composer's
  line chip and "Text (225) … from Main" (the line Send uses since
  2026-10-05, §6 Texts send through Quo); "first reached you on the Website line, Oct 3" — on the header until
  2026-10-05, now a **Lead source** line at the top of Internal notes (Coy:
  "a place in the notes for the lead source")
  (`/api/threads/[id]` returns `lines`, `first_line`, each message's
  `line_id`). On a phone the toolbar wraps, the line filter its own row. Not
  built: a thread made from a line.

## 2e. Files — uploads Dusty reads (migrations 045–046, 2026-09-29)

Coy: *"I need to be able to upload documents and photos for Dusty to parse."*

- **`job_files`** (existing table, extended) holds every upload: on a job, an
  area (`section_id`) or a person (`contact_id`); `category` (photo, plan,
  spec, bid, vendor quote, receipt, contract, other — a first guess from the
  name, Coy's to change), note, `show_on_proposal`, soft delete. RLS by
  `get_user_org_ids()`; anon's grants on it were revoked.
- **Bytes go straight to storage.** `POST /api/files` records the row and
  returns a signed upload link to the private bucket `job-files`
  (`{org_id}/{job|contact}/{file}/{name}`, 100 MB); the browser sends the file
  there, never through a Vercel function; `/api/files/[id]/done` confirms it
  arrived. Storage lives behind `src/lib/files.ts` / `files-server.ts` so S3
  (Coy, later) is one module.
- **Texted photos are in the same list** ("From texts") — `message_media`,
  copied in lazily by the thread's media route as before.
- **Dusty reads them in the background** — edge function `read-files`,
  pg_cron every minute, claim `sc_files_claim` (service role), the enricher's
  vault token, heartbeat `read-files`. JPEG/PNG photos go to Hermes as images
  (verified 2026-09-29: an image passes through); PDFs have their text pulled
  out (unpdf) and read; scanned PDFs, HEIC photos, video and spreadsheets are
  **skipped with the reason**, never marked read. He writes `summary`,
  `extracted_text` and `facts` (bid due, date, address, vendor, amount, psi,
  thickness, reinforcement, dimensions, quantities, notes). **Facts are
  suggestions** (§2b) — shown on the file, never applied — and from a
  document a number is kept only if it is written in it (`sanitizeRead()`,
  the dictation rule). Failed reads retry after 30 minutes, three tries.
  **A read that kills the reader is not retried forever (migration 080,
  applied 2026-10-05 on Coy's "apply 080"; `read-files` v15).** Walker High's 25 MB spec book ran the
  function out of memory mid-read; the row stayed "reading" and was claimed
  again every 10 minutes with no limit — 340 times, "Reading 2635 Walker High
  Dugouts Specs…" on the activity line on every open, ~8.5 GB downloaded
  (the egress overage). Now a PDF over 12 MB is skipped with the reason
  (`readable()`, `MAX_PDF_BYTES`; the largest read so far was 4 MB), and a
  file still "reading" after three tries is marked skipped
  (`sc_files_claim`, 080). Checked after: the spec book is skipped with
  the reason. The 340 failed tries stored nothing; egress is not stored
  data, so there was nothing to delete.
  **v3 (2026-09-29, prompt `read-files-v2-price-lines`)** also reads
  `price_lines` off a quote, price list, receipt or invoice — name, item #,
  unit, unit price, qty — keeping a line only if its unit price is written
  in the document (never a line total divided out); read from a photo there
  is no text to check, so they are marked `price_lines_from_photo`. The file
  viewer counts them and points to the Price book, where they are imported
  (§3). `{"sample_quote": true}` reads a made-up quote with no customer data
  (verified 2026-09-29: all 5 lines, exact prices, subtotal/tax left out).
  **v5 (2026-09-29, prompt `read-files-v3-vendor-details`)** reads, from a
  receipt, invoice, quote or price list, **who issued it** —
  `vendor_details` {name, phone, email, address} as printed in the issuer
  block (the seller, never "sold to" / "bill to") — and the tax **as
  printed**: `tax_pct` only if a rate is printed, else `subtotal` and
  `tax_amount`. Each is kept only if it is in the text (`readVendor()`: the
  phone's digits, the email, the name's words, the address's number and
  street). The item # is the product code, never a ticket or order number;
  fees (fuel, short load, environmental, delivery) and per-yard add-ons
  (slump, fiber) are their own lines; the same product on several tickets
  is listed each time and folded into one row by the import. Checked
  against Coy's real Angelle Concrete Group invoice (text sent with
  `{"sample_text": …}`, bank lines removed, nothing stored): all 9 lines with
  codes 8006 / MR6 / 2 and exact prices, the vendor block, subtotal $3,807.00
  and tax $399.74 — **no rate printed, none invented**. A receipt or quote
  may be uploaded with no job or person (`/api/files`, "inbox"); it is filed
  on its vendor (`PATCH /api/files/[id] {contact_id}`) once Coy confirms who
  it is from (§3).
- Dusty's chat context on a job or person includes their files' reads
  (newest 20); the activity line shows each read, and "Reading …" spins the
  emblem.

## 2h. The email mirror — migration 061, `email-intake` (2026-10-01)

Coy forwards bid emails from admin@saccobuilt.com to
**intake-concrete@agentmail.to**; his own Hermes agent reads them for scopes.
ScopeCrete mirrors that inbox (Coy, 2026-10-01): each email is kept, its
attachments become the org's files, and it is filed on the right customer.
**Nothing is extracted here** — since §2i (same day) the bid reader does
that, and it replaces his Hermes agent. The §2a shape, for email:

    AgentMail webhook -> email-intake (signature checked) -> email_events (RAW LOG)
                                                          -> emails (SPINE) -> email_attachments -> job_files

- **Signed or nothing.** `verify_jwt` is off (`supabase/config.toml`); the
  function checks the webhook signature itself (Svix scheme, HMAC-SHA256 with
  `AGENTMAIL_WEBHOOK_SECRET`, five-minute window — `verifySvix()` in
  `rules.ts`). Unsigned or wrong → 401, nothing stored; no secret → 503 and the
  heartbeat says "not configured". A refusal records the header NAMES only,
  never values. Worker calls (`{"retry"}`, `{"ping"}`, `{"reproject"}`) carry
  the enricher's vault token.
- **Raw first.** The untouched payload goes into `email_events`, keyed on the
  delivery id (a retry is a no-op), before anything parses it; 200 at once,
  projection in the background. AgentMail's docs and API are refused by this
  container's network policy, so `readMessage()` reads fields tolerantly and a
  row that doesn't parse keeps its reason (`projection_error`) and can be
  re-projected once the real payload is seen.
- **A big email comes without its text (2026-10-02, `email-intake` v10).**
  AgentMail leaves `text` / `html` out of the webhook for a large message
  and sends only `body_url`. Coy's Walker High forward (Ben Bourgeois, LA
  Contracting) was stored with an empty body, so the bid reader saw a
  subject alone and called it "not a bid". Now, when a delivery has no
  text, the function asks AgentMail's message API for it, then the body
  link (`bodyFrom()` reads JSON, HTML, plain text or raw MIME, tested); a
  re-projection fills a blank body on the existing row without touching
  Coy's filing; still none → `projection_error` says why.
- **Dusty sees the inbox with nothing open (2026-10-02).** Coy asked a cold
  chat "did you get it?" and Dusty had no context at all. The cold chat and
  the catch-up carry **The intake inbox**: the last 8 emails (sender,
  subject, where filed, what the bid reader made of it, or that its text
  didn't come through) and the newest one's text when it is under two days
  old (`inboxBlock()` in `src/lib/dusty/context.ts`, under RLS).
  **And the last three days of calls and texts (2026-10-03):** asked "what
  happened to my new customer that called in yesterday?", Dusty said he had
  no record of Johnette Wilson's call — the cold chat carried no messages.
  It now opens with every call and text since three days ago, newest
  first, in Central time, with each person's bucket, contact id and his
  status line (`recentBlock()`), and the id list he plans archives from is
  newest first too, so "the top" means what it means on Coy's screen.
- **Whose mail counts.** `org_inbound_addresses` maps the inbox to the org;
  `org_inbound_senders` (admin@saccobuilt.com, coysacco@gmail.com) are the
  forwarders. Anything else is kept as **quarantined**, its files **held**
  (not fetched) until Coy files it.
- **Who it's from, and where it goes.** `originalSender()` reads the
  forwarded block (Gmail, Outlook, Apple). Its address exactly on a contact
  (`contact_emails`, merges followed) → filed on that contact and its
  customer, `match='exact'`, shown "Auto". The same company domain on exactly
  one customer → **a suggestion only** (`domain_suggested`, one tap to
  accept); free mail and the org's own domain never match. Otherwise
  **Unfiled**. A job is never guessed here and no contact is created here —
  the bid reader (§2i) does both for a forwarded bid, on Coy's instruction.
- **Files.** Each attachment is fetched with `AGENTMAIL_API_KEY` into the
  private `job-files` bucket (`{org}/email/{email}/{file}/{name}`) as a
  `job_files` row with `source='email'`, `email_id`, the email's contact and
  customer, and `read_state='waiting'` so Dusty's reader reads it (§2e). Small
  inline images are signature logos, skipped with the reason. A failed fetch
  retries every 5 minutes (pg_cron `email-intake-retry`), three tries.
- **Coy files it** (`PATCH /api/emails/[id]`, `match='coy'`): a customer
  and/or a job; filing on a job moves its files onto the job and turns **In
  plan room** on for its PDFs; all empty puts it back to Unfiled (Undo).
  Members may update only the filing columns (column grants);
  `sc_email_filing_guard` (SECURITY DEFINER) refuses another org's customer,
  contact or job and releases a quarantined email's held files.
- **Dusty files an email, and the intake files more on its own (2026-10-05,
  `email-intake` v11).** Coy forwarded John Freeling's redlined MSA (Icon
  Technologies) and asked Dusty to file it on the customer; Dusty answered
  that he had no file id. Two gaps: the intake inbox in his context listed
  emails with no ids and not their files, and both forwards sat unfiled —
  the newer one came from BlueMail, whose forward has no marker
  ("Subject: / Date: / From:" under its signature), so no writer was read;
  the older named john.freeling@iconbuild.com, which wasn't on John's
  contact. Now: the inbox block lists each email as `email <id>` with every
  file that came with it as `(file <id>)` (and what is still being copied
  in); Dusty's plan step `file_email` {email, kind customer | contact | job,
  id or cust1 / job1} goes through the Emails sheet's own filing (`PATCH
  /api/emails/[id]`, files follow), the card naming the email, its sender and
  its files; and when the person it lands on is the writer (their contact
  named, or the same name) the sender's address is added to them (`POST
  /api/contacts/[id]/emails`, never someone else's), so the next one files
  itself. The intake reads a From: line with a header line beside it as a
  forward (`headerBlock()`), and when no address matches, a writer's **whole
  name** (two words or more, `fullName()`) on exactly one person files it as
  Auto with the reason ("the only contact by that name") — never against a
  different company the domain points at, never between two people of the
  same name. A re-projection now files an email nobody has filed (never one
  Coy filed) and its files follow. Tested in `tests/email-intake.test.mjs`
  and `tests/dusty-plan.test.mjs`.
- **Where Coy sees it:** Documents → **Emails** (unfiled and quarantined
  first; the sheet has the sender, the files, the text and the filing); the
  customer page's Threads → **Emails** channel (no longer "not connected");
  the activity line (each email in the last day, "file it" when unfiled);
  Dusty's job and customer context (subjects, senders, dates — not bodies).
- Rehearsed before applying: the inbox and both forwarders seeded on the
  org; a duplicate delivery refused; Coy sees the email, files it, and its
  held file is released; Coy can't edit the subject or write the raw log;
  another org's customer refused; a stranger sees and updates nothing; anon
  refused.
- **Applied 2026-10-01**, through `execute_sql` in pieces: `apply_migration`
  and any statement containing `drop` timed out at the connector's approval
  gate even with write tools allowed, so the `drop … if exists` lines were
  left out (nothing existed to drop). Not listed in
  `supabase_migrations.schema_migrations`; the file is the record. Checked
  after: RLS on all five tables, 6 policies, both triggers, the retry cron,
  anon has no grants, members read and file only. **`email-intake` v1
  deployed** (verify_jwt off). Smoke test via `pg_net`: an unsigned POST →
  503 "not configured" (no webhook secret yet), nothing stored; `{"ping"}` →
  `AGENTMAIL_API_KEY` set and AgentMail answers 200.

## 2i. Bid intake — a forwarded bid email becomes the job (migration 063, `bid-intake`, 2026-10-01)

Coy: *"fully automatic … this should replace the Hermes agent because this
system should become my harness for quote."* His bids arrive as emails
linking a Box folder ("an Organization folder … named the same as the
folder in the Box.com download"); he wants the job, the customer, the
concrete scope and the plans in the Plan Room without a tap, and the
answers in Dusty's chat and on the dashboard instead of Discord.

**This reverses two §2h rules, on Coy's instruction, for a bid email he
forwarded:** the customer and the estimator's contact ARE created, and the
job IS made (or an addendum joins the open one). §2b's rule still holds in
spirit — the reader only ADDS (it never suppresses a lead or hides
anything), everything it makes is recorded, and **Undo bid** takes it back.

    email-intake (§2h) → emails ─► sc_bid_claim opens a bid_packages row per email
      bid-intake (pg_cron every minute, vault token, Hermes first):
        waiting → listing (Box) → fetching → scanning → extracting → filing → filed

- **Box** — `boxLinks()` finds app.box.com/s/…, acme.app.box.com/s/…,
  /v/vanity and /folder/123 links (also inside Outlook Safe Links). The
  folder is listed with the Box API (Client Credentials Grant: Coy's own Box
  app, `BOX_CLIENT_ID` / `BOX_CLIENT_SECRET` / `BOX_SUBJECT_ID` [/
  `BOX_SUBJECT_TYPE`] in Supabase secrets; the `BoxApi: shared_link=` header
  reads a GC's "people with the link" folder) — up to 400 files, 6 folders
  deep. Without the keys a package waits in **needs_setup** and the activity
  line says so. Each file is copied into `job-files`
  (`{org}/bid/{package}/{file}/{name}`) as a `job_files` row with
  `source='email'` and the email's id; ≤ 40 MB in memory, bigger streamed;
  over 100 MB (the bucket's limit) skipped with the reason; a .zip ≤ 60 MB
  unpacked. Drawings are `category='plan'` and go **In plan room**; specs and
  the ITB go to Dusty's file reader (§2e).
- **Reading** — each PDF ≤ 40 MB is read page by page on the server: the
  title block with the app's own reader (`sheets.ts`, a generated copy of
  `src/lib/plan-sheets.ts` + `parsePrintedScale`, tested equal) and the pages
  that talk about concrete or the bid (`concretePage()`, `bidPage()`). One
  Hermes call (prompt `bid-intake-v1`) over the email, the excerpts
  (labelled file · page · sheet) and the sheet index returns the bid facts
  and **every concrete item**. `sanitizeBid()` keeps a value only if it is
  written there: names by their words, emails and phones by their digits, a
  psi or thickness only as printed, a due ISO only when its month and day
  match the words (then Central → UTC), a sheet only if one by that number
  was read, an item only with its exact line. Our own names are never the GC.
- **Filing** — customer: the email's exact match, else the estimator's
  email on a contact, else the company domain on exactly one customer, else
  a NEW customer named from the GC as written (no name → none is made);
  contact: the estimator (name, email, phone as printed) unless their
  number is already a contact, filed customer as **auto** with
  `auto_classified_reason`; job: an open job with the same Box link, or the
  same customer + `projectKey()` (an addendum) — else a new one in **New
  lead / Bid invite** (`status='invited'`, `origin='machine'`,
  `lead_source='gc_invite'`, counted), title, site, `bid_due_at`,
  `itb_received_at`, `box_url`, the scope summary. **Each concrete item is a
  section** (`origin='bid'`, `source_ref` = sheets · spec · the line; psi and
  depth only as written, dimensions blank for the Plan Room; a re-read never
  overwrites one). The drawings' sheets become `plan_sheets`
  (`number_source='read'`; scale printed, never applied — §6 Plan Room).
  Assemblies do not load on bid sections (dimensions are measured first).
  The email is filed on the job.
- **Undo bid** (`sc_undo_bid`, SECURITY DEFINER, members): the job it made
  archived, the Box files it copied hidden, a contact it made back to
  Unsorted and archived (unless Coy confirmed them since), a customer it
  made archived, the email back to Unfiled; the package is never re-run.
  Nothing is deleted.
- **Where Coy sees it** — the job page's **Bid** strip (GC, estimator, due
  with hours left in red under 48, pre-bid, the Box folder, files copied /
  sheets read, **Scope from the bid** with each item's sheet and line, the
  email, Undo bid; `/api/jobs/[id]/bid`); the Dashboard's **Bids due** tile;
  the activity line ("New bid: …", "Bid stuck: …", "Reading a bid…"); Dusty's
  job context (**The bid** block) and catch-up. `{"ping"}`,
  `{"package": id}` and `{"retry": id}` with the worker token.
- Rehearsed before applying: a package opened per email; members read, can't
  write or claim; Undo archives the job and contact and unfiles the email; a
  stranger sees nothing and can't undo; anon refused. **Applied 2026-10-01**
  (piecewise via `execute_sql`, no `drop`), `bid-intake` v1 deployed
  (verify_jwt off; ping: Box not configured, Hermes ok; no token → 401), cron
  `bid-intake` every minute.
- **Live 2026-10-02.** AgentMail webhook + `AGENTMAIL_WEBHOOK_SECRET` set;
  Coy's Box app (Client Credentials, `BOX_SUBJECT_TYPE=user`, his user id —
  not the enterprise id, which Box refuses with HTTP 400) answers. First
  real bid: LA Contracting's Burgess Ave. Sidewalk – Phase 4 (DOTD), a Box
  folder with `PLANS.pdf` and `_h.015211_proposal.pdf`, filed 20 s after it
  landed. What it taught, all fixed (`bid-intake` v11):
  - **The plans are the drawings; everything else is words** (Coy). A
    DOTD "proposal" is the bid book — special provisions and the item
    schedule — so `docRole()` files *proposal* / *special provisions* as
    **spec**: read for scope and requirements, kept out of the Plan Room,
    and handed to Dusty's file reader (§2e). Its 200+ pages had become fake
    "sheets" (D-1 "Demolition"…).
  - **Scanned plan sets have no text.** `PLANS.pdf` (74 pages) is images,
    so no sheet number, title or scale can be read and nothing in it can be
    quoted; the scope comes from the email and the spec book, and the
    takeoff is Coy's. (OCR of drawings is not built.)
  - unpdf's document has no `destroy()`; calling it failed every scan after
    the read had finished. Optional now.
  - **A known phone is the person, and their customer is the customer** —
    checked before a customer is made (`contacts.phone`, then
    `contact_phones`, merges followed). The first run made a second
    customer for Dylan's work line; it was folded in
    (`merged_into_customer_id`). An existing customer or contact with a
    BLANK name is filled from the bid as written (`filled_customer`,
    `filled_contact` on the package), never overwritten.
  - A quote mark is a quote mark: straight, curly and prime are one mark
    in `sanitizeBid()` (the walk and drive were dropped for `4"` vs `4”`).
  - The Box folder's name goes to the model ("BD26178 H.015211 Burgess Ave.
    Sidewalk – Phase 4") and Coy's own lines above the forwarded message are
    read as his notes (prompt `bid-intake-v2-folder-and-notes`). A re-run of
    a package updates the job IT made (title, site, customer, due).
  - **A file too big for a server read is skipped, not retried forever
    (v12, Walker High, 2026-10-02).** A 25 MB spec book ran the function
    out of CPU time mid-scan, every minute. Files are now scanned smallest
    first, and each is marked before its read; a file found still marked
    (the platform stopped the run) is skipped with the reason — Dusty's
    file reader and the Plan Room still read it.
  - Still Coy's: Dylan is two contacts (work line, cell) under two
    customers — "Same person as…" and + Add contact join them.

## 2c. One contact is one person — migration 028 (applied 2026-09-27)

A person with two numbers is ONE contact. `contact_phones` lists every number;
the merged-away contact keeps its row, points at the person with
`merged_into_contact_id`, and is excluded from every count.

- **Merges are human-confirmed, one pair at a time.** "Same person as…" on the
  conversation screen. The system never merges on its own; matching names are a
  suggestion at most.
- **Merges are reversible.** `sc_merge_contacts()` records every moved row id in
  `contact_merges.undo_payload`; `sc_unmerge_contacts()` moves back exactly those
  rows still on the winner. A merge that cannot be undone should not be offered.
- **The functions are SECURITY DEFINER with an explicit membership check**, not
  invoker. `voip_calls` has no user write policy and `sms_threads` is
  service-role only, so an invoker merge would move texts and silently leave
  calls behind. Execute is granted to `authenticated` only; a stranger gets
  "contact not found".
- **Same name, same email → a suggestion (2026-09-28).** Amber texted from two
  numbers and became two contacts, both named Amber. The person page (and
  the plain conversation) now shows "Also Amber · (225) … — same name. Same
  person?" with **Review**, which opens the merge on its confirm step. Still
  one human tap per pair; nothing merges on a match alone.
- **Everything that resolves a contact follows the pointer.** `quo-intake` v57
  `upsertContact()` hops `merged_into_contact_id`; `sc_quo_events_project()`
  redirects an event keyed to a merged-away contact before projecting it; the
  conversation API redirects to the person. Pointers are kept one level deep —
  merging B into C re-points anything already merged into B.

## 2b. Lead creation — the guard, and what it deliberately does not do

`quo-intake` does not create a NEW lead when the contact's customer is a
**confirmed** vendor or sub: `relation IN ('vendor','sub')` AND
`relation_confirmed_at IS NOT NULL`. It fails OPEN — any lookup error creates
the lead — and an existing open lead is always returned regardless of relation,
so a later reclassification never orphans a lead a human already worked.

**It ships as-is and deliberately does NOT suppress on an unconfirmed
classification.** This is a rule, not a gap waiting to be closed:

> A machine opinion changes what Coy is **asked**. It never changes what he is
> **shown**. Suppression requires a human confirmation.

**Classifying by hand (2026-09-27; since 2026-09-28 the Threads buckets).**
Filing a person in Threads (`sc_classify_contact`) writes the relation with
`relation_source='manual'`, `relation_confirmed_at` and
`relation_confirmed_by`, and creates the `customers` row when the contact has
none. That IS the human confirmation, so a confirmed vendor or sub is
suppressed by the guard. (The old `/api/customers/[contactId]/relation` route
and its Unclassified list are gone — 2026-09-30.)

**The background enricher (2026-09-27, migrations 029–033).** Contacts are
read with the app closed. pg_cron calls the `enrich-contacts` edge function
every minute (v13; 4 readers, each claiming one contact at a time until the
queue is empty or 45 s have passed, so a backlog drains in minutes; source in
`supabase/functions/enrich-contacts/`:
`rules.ts` the rules, `pipeline.ts` one contact, `index.ts` the worker). There
is no button.

- **Who is read** — view `sc_enrich_due` (security_invoker): everyone not
  merged and not filed as spam — named and sorted people too, since migration
  037, for their status line; the name and bucket steps still only touch the
  unnamed and the unsorted — with something THEY said (inbound text, or a
  call transcript/summary), quiet for 3 minutes (a burst of texts, or a
  transcript landing after its call, is read once), and never read or changed
  since the last read. A failed read retries after 30 minutes.
- **Claiming** — `sc_enrich_claim(n)` (service role only) inserts a `running`
  row in `contact_enrich_runs`; a partial unique index makes a double claim
  impossible; a run not finished in 10 minutes is reaped as `abandoned`. Every
  read ends as proposed / named / unchanged / no_words / model_error / failed.
- **Auth** — the call carries vault secret `enrich_worker_token`, checked by
  `sc_enrich_worker_authorized()`. Nobody types it or sees it. `verify_jwt` is
  off because the token is not a JWT (see `supabase/config.toml`).
- **Hermes first** — the worker checks `HERMES_API_KEY` is set and Hermes
  `/health` answers BEFORE claiming, so an outage never marks anyone read.
  Hermes URL defaults to §8's; key in Supabase → Edge Functions → Secrets.
- **Transcripts reach the model as US:/THEM:**, never phone numbers.
  "Their words" on a call are the THEM lines whichever side dialled — before
  this, a call Coy placed counted as nothing the caller said.
- **Visible** — `sc_worker_heartbeats` (no tenant data) says ok /
  not_configured / hermes_unreachable / error. The activity line under the
  header (§6) shows it, with every read and the org's waiting count
  (`/api/activity`, `sc_enrich_status()` under RLS).
- **Hermes is slow** — measured 2026-09-27, successful reads take 20–85 s
  (a small model direct is under 10) and a third timed out at 55 s. The
  model timeout is 90 s while the cause on the VPS is found; failed reads
  retry after 30 minutes on their own.
- **Pause** — `select cron.unschedule('enrich-contacts');`

The in-app `/api/enrich` route and its button/15-minute browser runner are
gone: one reader, one place.

**ONE exception to asking first — self-introductions (Coy, 2026-09-27).**
*"If AI is smart enough to create a summary of the transcript, then it should
be smart enough to label the phone number with the name of the person."* A
name is written without asking ONLY when all of these hold:

- the contact has no name, and its name is not human-confirmed (the database
  enforces the second: `sc_guard_contact_identity`);
- the model proposed the name, AND `findSelfIdentification()` independently
  finds the person saying it about themselves — "this is / my name is / it's /
  I'm <name>", or "<name> here" — in an inbound text or on a transcript line
  spoken from the contact's own number. Our side never counts; a call summary
  (no speaker) never counts; the whole name must be said; "this is Mike's
  wife" is not Mike;
- they did not introduce themselves under a second name on that number
  (shared line, relay, or "It's Jose, spelled j o s e" correcting a mishearing)
  — that is a question;
- Coy has not undone that name for that contact before.

**A spelled name is the name; a misheard hello is not (`enrich-contacts`
v24, prompt `enrich-v13-spelled-names-2026-10-02`).** Johnette Wilson's first
call (2026-10-02) opened with "Charlie." — the transcriber's hearing of her
hello — and later "My name is Jonette, j o h n e t t e, Wilson." The model
proposed Charlie and nothing named her. Now: letters spelled right after a
heard name ARE the name (`withSpelledNames()`: same first letter, length
within three — "Jonette, j o h n e t t e," reads "Johnette"); when the
model's pick isn't something they introduced themselves by, the pipeline puts
forward the one name they did introduce, with a Capitalised surname when said
right after it (`introducedName()` / `introducedOver()`), and
`findSelfIdentification()` still has to find it before it is written — the
evidence is the line as spoken, spelling and all. Two different introductions
("My name is Joe … It's Jose, spelled j o s e") are still a question. The
prompt says a lone word at the top of a call is not a name, and that "Corey"
on our side is Coy; the transcript the model reads has our side's
"Corey/Cory" turned into Coy (`relabelTranscript()`). Tested in
`tests/enrich-selfid.test.mjs`. Deployed source read back equal to the repo.

**Nothing waits on a new message any more (`enrich-contacts` v25–v26,
2026-10-03).** Coy: *"This last phone call from Johnette … was as clear as
day … And it's still unnamed in the threads … we need to figure out where the
gaps are and close them."* Three gaps, measured on her thread:
- **Old reads kept old outcomes.** A contact is read again only when something
  new is said, so a rule fixed after a read never reached them. Johnette's text
  "Hi, this is Johnette." was blocked by the v12 rule that counted the call's
  heard "Jonette" as a second name; v24 fixed the rule, but nothing re-asked.
  Every run now ends with `recheckNames()` (no model call): the unnamed with a
  standing name suggestion first, then one-word names Dusty wrote, through
  `applySelfIdentified()` as a fresh read would. It named Johnette and
  Pashawn on its first run.
- **Half a name.** When the model's pick ("Johnette") was said and the fuller
  name ("Johnette Wilson") was too, the whole one wins (`introducedOver()`),
  and a one-word name Dusty wrote may grow into it — never a name Coy wrote
  (`extending` in `applySelfIdentified()`).
- **Customers waited for a 20-in-a-row streak.** See the next paragraph.

It is written with `name_source='machine'`, a `contact_name_claims` row
(`claim_type='self_identification'`, the exact line as `evidence_quote`) and
`name_claim_id`. The row shows **Auto** and, expanded, the line with **Keep**
(→ `name_source='human'`) and **Undo** (name off, claim `rejected`, never
re-applied) — `PATCH /api/name-claims/[id]`. Dry run against the live data on
2026-09-27: 29 of the 176 unnamed contacts qualify.

**A name we greet them by is a suggestion (Coy, 2026-10-05, decision card:
"Suggest it"; `enrich-contacts` v28).** John (Icon Technology) never said his
own name on his call — only Coy did, "Hey, mister John." — so the number stayed
unnamed and nothing was even suggested. Now, when the person has no name of
their own introduction, the name OUR side opens a line with ("Hey, mister
John", "Hi Sarah", "Good morning Mr. Davis") is put on the suggestion
(`greetedName()` / `ourLines()` in `rules.ts`, tested: a Capitalised name
only, never one of ours, a greeting that ends its sentence ("Good morning. Are
you …") names nobody, two different names on one number is no
suggestion), with the greeting added to its evidence ("you greeted them: …").
It is never written by itself — `findSelfIdentification()` still only counts
their own words — so the row asks "is this John?" and Coy's tap names them.
People already read were given theirs once (`{"greetings": true}` on the
worker, `backfillGreetings()`); a standing suggestion with no name picks one
up the next time they are read. The first fill (2026-10-05) suggested Chad,
Michael and Carlos; a fourth ("Are", from "Good morning. Are you …") was
taken back and the rule fixed.

Everything else is unchanged. A customer / sub / vendor call is NEVER applied
automatically — it can hide a real lead — and a name from anywhere other than
the person's own introduction is still a suggestion to confirm.

**Buckets — one classification (migration 032, 2026-09-27).** Threads
sorts PEOPLE into four buckets: **customer · vendor · personal · spam**
(synopsis §5.3: buckets are code, types are data — `org_contact_subtypes`;
people looking for work are vendor / `looking_for_work`, subs are vendor /
`subcontractor`). `contacts.contact_type` is the truth. `customers.relation`
used to be a second, overlapping system; it is now kept in step by
`sc_classify_contact()`, the one writer (vendor → `vendor`, or `sub` for
subcontractor / looking for work; customer → `customer`), so the quo-intake
lead guard keeps working unchanged. A bucket shows only when
`classification_confirmed_at` (Coy put them there) or `auto_classified_at`
(Dusty filed them — spam, or a bucket he has earned, below) is set; everyone else is **Unsorted**. The
190 legacy `'customer'` defaults are not customers.

**Spam is the one bucket Dusty files itself** (Coy, 2026-09-27), shown as
"Spam · auto" with **Not spam** in the row. Only when the model says spam AND
`spamSignal()` finds evidence in their words (short-code sender, one-time
passcode, "reply STOP" opt-out, stock scam line) AND Coy has never written
or called back, onto a contact nobody has sorted. Not spam → back to Unsorted,
`auto_classify_blocked_at` set, never auto-filed again. Dry run 2026-09-27:
one contact qualifies (Handoff one-time passwords). Filed spam is not re-read.

**Status lines (migration 037, `enrich-contacts` v8, 2026-09-28).** Each read
also writes `contacts.status_summary` (one sentence: where things stand),
`recent_summary` (two to four sentences on the latest conversations) and, for
customers, `job_type_hint`, stamped `status_summary_at`. A display cache of
Dusty's words, like `messages.summary` — it classifies nothing and names
nobody, and phone numbers are stripped out of it. A person already named AND
sorted is read for this alone (outcome `summarized`, no proposal, nothing
asked). Our own messages count as a change, so a quote sent refreshes the
line. Everyone read before 2026-09-28 00:15 UTC was read once more to
backfill.

**Dusty learns from Coy's sorting, and earns the other buckets (Coy,
2026-09-27; migration 036, `enrich-contacts` v7).** Every contact Coy files is
a labelled example: Dusty's guess (the latest `contact_proposals` row made
before Coy decided) against Coy's answer.

- **Track record** — view `sc_bucket_agreement` (security_invoker): per org
  and bucket, `guesses`, `agreed`, and `streak` (hits since the last miss).
  Computed, never stored, so it cannot drift. A miss is Coy filing a guess
  somewhere else, or undoing an automatic filing. The activity line shows it
  ("matched you on 18 of 20 customers — 7/20 in a row").
- **Corrections go into the prompt** — the last 10 contacts Coy filed
  differently from Dusty's guess, with the quoted line, appended to the system
  prompt as data ("You said customer; Coy filed them as vendor (lead gen)").
  Loaded once per org per run, service role, org filter explicit.
- **Earned autonomy** — once a bucket's `streak` reaches **20**
  (`AUTO_STREAK`), Dusty files new guesses of that bucket himself: the same
  marks and conditions as spam (`auto_classified_at`, nobody sorted them, never
  un-filed), shown "Filed as X by Dusty" with **Keep** / **Not X**. One miss
  and he is back to asking.
  **Superseded 2026-10-03 — Dusty files everyone (Coy: "Just let Dusty work
  on filing everything. I can always change it to a different bucket.").**
  Measured that day: customer guesses matched Coy 19 of 21 times, but the last
  miss had reset the streak to 0, and 158 people sat in Unsorted. Now any
  suggestion of customer / vendor / sub / personal at **70+** confidence
  (`AUTO_FILE_CONFIDENCE`) is filed — the streak still files below it — and
  spam at **85+** (`AUTO_SPAM_CONFIDENCE`) even without a stock spam line, but
  never someone Coy wrote to or called back. "unknown" is never filed; anyone
  Coy filed or un-filed is never touched. Same marks as before: auto, Keep /
  Not X. People already read are filed from their standing suggestion by
  `recheckBuckets()` (25 a run, no model call): the first run filed 17
  customers, 7 vendors and 1 personal, all at 70+, and the jobs trigger made
  their New-lead jobs, each with **Accept** and uncounted until Coy keeps
  the customer. **What did not change:** an automatic vendor or sub writes
  only `contacts.contact_type`, never `customers.relation`, so quo-intake
  still makes their leads until Coy taps Keep — a machine opinion still never
  hides a lead.
- **An automatic vendor or sub never hides a lead.** Only
  `contacts.contact_type` is written; `customers.relation` stays unconfirmed,
  so quo-intake keeps creating their leads until Coy taps Keep. §2b's rule
  holds: suppression requires a human.

**Jobs follow the bucket (migration 038, Coy 2026-09-28).** *"If a contact is
categorized as a customer because there is context for a job like Amber, then
the job should automatically be created"* — and a mistake is undone by moving
them out. Trigger `contacts_bucket_jobs` → `sc_customer_job_for()`:

- **Becomes a customer** (Coy, or Dusty on an earned streak), has no live job,
  and Dusty's latest read names the work, the site or the size → one job in
  New lead, `origin='classification'`, title from project type + site, type
  from `job_type_hint`, lead source from the first message's line. Coy filed
  them → it counts (`confirmed_at`). Dusty filed them → **Accept** on the
  board, not counted, until Coy keeps the customer (which confirms the job).
- **Leaves Customer** → that automatic job is archived (`archived_at`,
  `archived_reason='moved to vendor'`) if nobody worked it (still New lead, no
  sections). A worked job — or any other job of theirs — is never touched on
  its own: it gets `flag_reason` ("Customer is now filed as vendor — archive
  this job?") with **Archive / Keep** on the board.
- **Comes back to Customer** → the archived job is restored and the flag
  cleared. Nothing is deleted.
- Archived jobs are out of the board, Threads, the Customers screens, cash
  flow and Dusty's context. `jobs.job_type` is now nullable with no default
  (Coy's call, 2026-09-28): an automatic job with no hint shows **Type?**.
- Backfill 2026-09-28: Amber already had a job, so none was made; the other
  confirmed customer got "Repair" — Dusty's summary says Coy referred them on,
  so that one is for Coy to move to Lost.
- **An automatic job says why it exists (2026-09-29).** Coy: *"It just says
  new job, and there is a phone number. No idea what the job is or why it was
  classified as a customer."* `GET /api/jobs/[id]` returns `description` and,
  for `origin='classification'`, a `why` block read from the contact and its
  latest customer proposal: when and by whom they were filed, Dusty's status
  line, the company he heard, and the quoted line. The job page shows it as
  **Why this job** with a link to their page. The trigger's fallback title
  ("New job") is not a name: the page shows the box empty, asking for one.
- **The customer's name leads the job's name (migration 067, applied
  2026-10-03 on Coy's "Apply 067").** Coy: *"it is best if the last name of
  the customer (or company name) precedes the job description … Wilson
  Driveway Repair that way I can find the job from the job page easier."*
  A person's job takes their last name (Jr / Sr / II dropped); a company's —
  a commercial or public customer, or a customer named other than its
  person — the company's name without LLC / Inc. It is stored in the title
  (`sc_job_name_prefix()`, triggers `jobs_name_prefix`, `contacts_name_jobs`,
  `customers_name_jobs`), so the board, search and Dusty all read it, and
  `jobs.name_prefix` remembers what was put in front: a title that already
  carries the name is left alone; most automatic jobs are made before the
  person is named, so the name is added when it arrives and swapped when it
  changes ("Johnette …" → "Wilson …"); a name Coy takes back out is not put
  back; "New job" waits until he names it; a phone number is no name.
  Backfill renamed 14 open jobs. `bid-intake` v13 matches an addendum on the
  title without the name and keeps it in front on a re-read
  (`titleWithoutPrefix()` / `titleWithPrefix()`, tested). Rehearsed (rolled
  back) before applying: unnamed → named → renamed → removed by Coy →
  already named → "New job" → named by Coy.
- **No name, no job (migration 068, applied 2026-10-03 on Coy's "Apply
  068").** Coy: *"A job should not be created if the person doesn't have a
  name … I would rather not create a job if I don't at least have the
  person identified as a customer with a name."* `sc_customer_job_for()`
  makes — and restores — nothing while neither the person nor their
  customer has a name (`sc_contact_has_name()`: letters, not a phone
  number). When the person is named later (their own introduction, Coy's
  pencil, a bid), trigger `contacts_named_jobs` makes the job then (and
  067 puts their name in front). Backfill: the 15 open automatic jobs of
  unnamed people nobody had worked (New lead, no sections, budget lines or
  files) were archived `archived_reason='waiting for a name'` — listed on
  Archived & deleted with Restore, and brought back on their own when the
  person is named. Worked jobs (two with a section) and a Lost one were left.
  Rehearsed (rolled back): 15 waiting; naming one brought it back; an
  unnamed person filed customer got no job; named, they got "Verdi
  Driveway".
- **Jobs by hand — migration 076 (applied 2026-10-04 on Coy's "apply
  076").** Coy, on the Jobs board: *"if the job is
  suggested but not counted. I don't want to automatically create the job.
  Later, once the system is working correctly we can automatically create
  jobs, but for now i'll create it manually. Or I can ask dusty to create it;
  he should have that ability."* `sc_customer_job_for()` makes (and restores)
  a job only when Coy filed the customer himself; a customer Dusty filed gets
  none. Coy makes it with **+ New job**, or asks Dusty, whose plan step
  `new_job` (§3) goes through the same `POST /api/jobs` on Coy's Apply and
  counts like his own. The unworked suggestions already on the board (New
  lead, no sections, budget lines or files — 7 on 2026-10-04) are archived
  `archived_reason='suggested — make jobs by hand'`, with Restore on Archived
  & deleted. Rehearsed (rolled back): 7 archived, none uncounted left, a named
  customer Dusty filed got no job. Bid intake (§2i) still makes its jobs.
  **Coy's own filing still makes one — named properly** (Coy: *"you can still
  create a job for a customer that I create as long as the job is named
  properly"*): Dusty's job title, else the kind of work, with the customer's
  name in front (067); with neither, no job — never "New job". Checked after
  applying: 7 archived, 0 uncounted left. Four older counted jobs still
  titled "New job" were left for Coy to name.

**Dusty seeds next steps (`enrich-contacts` v9+, 2026-09-28).** Each read
may add up to three things waiting on Coy — "Send the walkway repair price" —
to `contact_tasks` with `source='dusty'`, the line that shows it is owed, and a
due date only when one was said. Never one that matches an item Coy already
has, done or dismissed (`title_key`); never for someone filed personal or spam.
Coy's own items are `source='coy'`. **Reminders:** the activity line shows
every open item due today or overdue (Central time), each linking to the
person; Dusty's context on a person includes their open next steps and his
status line, so "what do I owe Amber?" is answered from the checklist.

**Coy's notes (migration 041, `enrich-contacts` v13, 2026-09-28).** *"Where
do notes land? Dusty needs access to all customer and vendor notes."* The
composer's Note tab saves to `contact_notes` (`POST /api/people/[id]/notes`,
RLS by `get_user_org_ids()`, anon refused). Notes show in the person's
timeline (a Notes filter on their page), in Dusty's chat context (newest 20)
and in the background read as a COY'S NOTES block after the conversation —
used for the status line and next steps, never as evidence, never as a
self-introduction, and not a turn (so `evidence_turn` still indexes messages).
A note alone does not queue a re-read; the next message does.

**Job titles and musings (migrations 039–040, `enrich-contacts` v11,
2026-09-28).** Coy: *"a 1-3 word summary should be the job title. But the
customer name and address and a short description below."* An automatic job
is titled with Dusty's `job_title` (1–3 words, sanitised: more words → none)
or else the kind of work ("Repair"); `jobs.address` takes his site hint and
`jobs.description` his scope summary; the board card shows title, then
customer · address, then the description. Existing automatic jobs were
rewritten the same way. Each read also leaves a **musing** on its run row
(`contact_enrich_runs.musing`) — one light line about the conversation, no
names or numbers, about what happened, never claiming anything is happening
now. Commercial jobs from emailed bid requests and plans will carry their job
information from the request once email reaches the app (not yet).

**Dusty dreams (migration 058, `dusty-dream` v1, Coy 2026-09-30).** *"I'd
like him to compile and learn and make funny comments about phone
conversations and text messages that are in the database from today and
days/weeks past."* pg_cron runs `dusty-dream` every two hours (the
enricher's vault token, Hermes first). Per org it takes today's calls and
texts since its last "today" dream (at least 4), else one earlier day in the
last 30 it hasn't dreamed about, and writes 1–3 light, past-tense lines to
`dusty_dreams` with the message ids they are about. People filed personal or
spam are left out; phone numbers and emails are scrubbed before the model
sees anything and again from what it writes; a line claiming "right now", a
dollar amount, or tied to no real message is dropped (`rules.ts`, tested).
The activity line shows unseen dreams like musings, linked to the thread.
Nothing else is written. First run 2026-09-30: five memory dreams.

**Vendors on jobs** — `job_vendors` (job, contact, role = vendor subtype,
note), RLS by `get_user_org_ids()`. **Next steps** — `contact_tasks` (title,
due date, `source` coy | dusty, `status` open | done | dismissed, the line
that prompted it); `title_key` recognises the same item so a dismissed Dusty
suggestion is never re-added. Anon is refused on both (verified).

An `enrich-contacts` proposal is an opinion. It can raise the question — "this
looks like a sub, confirm?" — and once a human answers, the answer is load
bearing. Until then the lead appears. The cost of that is a junk lead in the
list; the cost of the alternative is a real customer silently disappearing
because a model guessed wrong and nobody was asked. Those are not symmetric.

---

## 3. Costing engine

The engine was recalibrated against real approved work (Gulfline Paving,
quote 24-318-1). Earlier synthetic calibration was unreliable — it contained
two errors that happened to cancel.

**Labor is priced by SQUARE FOOT, not crew-hours.** Reference rates from that
job: $1.43/sqft form-up-and-finish, $2.00/sqft demolition. Production rate
scales with job size — bigger jobs are more efficient per sqft.

**How a job is priced (Coy, 2026-09-30; migration 057) — this replaces
markup per cost type and §4's off-the-top floor:**

    price = cost × (1 + O.H.) ÷ (1 − margin)

O.H. (overhead, default **15%** on Coy's word) and margin are the JOB's —
`estimates.overhead_pct` / `margin_pct`, copied from the org's defaults
(`org_money_settings`, edited in **Price book → Defaults**) when a budget is
made, then changed on that budget alone. A line can carry its own margin
(`estimate_line_items.margin_pct`). Card markups, group markups and markup
per cost type are no longer read (the columns stay). Coy: *"All the markup
and margin exists only per job in the budget … There can be default margin
settings applied across any new job budget."* The old Gulfline markups
(materials 30.61%, labor 41.77%, equipment 30.12%) are history, not inputs.

**Discounts touch the PRICE column only.** This is not a preference, it is a
correctness rule. On the reference job a $4,000 discount was entered as a
negative line in BOTH cost and price, which dropped reported cost and inflated
margin from a true 27.7% to a reported 39.4%. The schema enforces
`discount_amount CHECK >= 0` so the old shape is structurally impossible.

Tax lands on the taxed lines' cost only, not the full bid, at the **job's**
rate — its parish's (`tax_parishes`, the org's own rates, entered in Price
book → Defaults; `src/lib/tax.ts` finds the parish from the job's address,
else the customer's), or a rate typed on the job (`jobs.tax_rate_source =
'override'`). No parish or no rate → the taxed lines are blocked by name
("parish unknown — set it on the job"). Coy: *"Sales tax should be
calculated from the job location."*

**Tax by the job's address — TaxLocus (migration 078, applied 2026-10-04 on
Coy's "apply 078"; Coy's TaxLocus key).** `TAXLOCUS_API_KEY` is in Vercel (production, preview,
development); only the server reads it (`src/lib/tax-lookup-server.ts`).
`POST https://api.taxlocus.com/v1/rate/lookup` (Bearer key) with the job's
address — its own fields or line, else its customer's (`addressParts()`; a
street with a number and a city or zip, else nothing is looked up) — and
`product_category: "goods.general"`. The reply's `combined_rate`, its
`breakdown` (state, parish, city, school or transit district), `as_of` and
`resolution` are kept on the job as `jobs.tax_lookup` with the address asked
about (`readTaxLocus()`, tested; checked live on a public building, the State
Capitol: 10.5% = LA 5% + City of Baton Rouge / EBRP School District 5.5%,
rooftop). The order a job's rate is chosen in (`jobTax()`): a rate Coy typed;
a parish he picked; **the looked-up rate, while the job's address is still
the one looked up**; the parish read from the address and the org's table.
Looked up once per address when the budget opens; the tax sheet shows the
rate, its parts and its date with **Look up again** (`POST
/api/jobs/[id]/tax`, which replaces a picked parish). Free tier: 1,000
lookups a month. (Before 078 the reads fell back and nothing looked up.)

Equipment rental bills by the day.

**Where it lives (2026-09-27): `src/lib/engine/index.ts`.** Pure functions,
tested by `npm test` (`node --test tests/*.test.mjs`). It is the ONLY
place a scope is priced. It is deliberately NOT v34's `computeJob()`, which
prices labour by crew-hours, uses one global markup and adds overhead as a
percentage of labour — all three contradict this section and §4.

- **Nothing is assumed.** A missing length, width or depth is `missing`; a
  missing setting or card price blocks the line and its option and is named
  (`budget()`), never a number built on a guess.
- **Prices come only from cost cards (step 3b, migration 050, 2026-09-29).**
  A job is priced by its budget — lines copied from Coy's cards in the Price
  book — and nothing else. The old rate path (`price()`: a price per yard,
  form & finish and demo per sq ft, mobilization, short-load %, "what tax
  applies to", reinforcement types) is gone from the engine, the scope page,
  Cost settings and Dusty; those things are cards now. Measured before it
  went: no rates were ever recorded and no section used a reinforcement
  type, so nothing priced changed. The retired `org_cost_settings` columns
  stay in the table unused and are written as null (they carry Gulfline
  COLUMN DEFAULTS from migration 004, so a first save must not leave them to
  the database). Since migration 057 **nothing in `org_cost_settings` is
  read**: waste is on the concrete card (`rule_params.waste_pct`, 0 allowed,
  blank blocks), a short-load fee is its own card, tax is the job's, and
  margin / O.H. / the day minimum / pay-yourself live in
  `org_money_settings` (no column defaults, so nothing is filled in that
  nobody entered). The Markups & overhead page is gone entirely (Coy, 2026-09-30:
  "remove it from the settings completely") — no Settings entry, no
  `/dashboard/costs` route; Price book → Defaults is the one place. A job with no budget lines has **no
  price**, and the scope rail and Dusty say so.
- **Tax is a pass-through**: charged at cost on the lines whose card is taxed
  (materials by default), carried in both columns, not given O.H. or
  margin, while the budget's tax switch is on.
- **`job_sections.cubic_yards` must not be displayed.** It is a generated
  column, `… * COALESCE(depth_in, 4)`, so a section with no depth reads 14.8
  yards for a 30×40 (verified 2026-09-27). The section API writes `depth_in`
  and `psi` explicitly as null so the schema defaults (4 in, 3000 psi) never
  stand in for a measurement. Fixing the column needs a migration and Coy's
  instruction.
- **Reinforcement is a card (step 3b; was migration 042's types).** Mesh by
  the sheet, rebar by the stick, fiber by a per-yard dose — any card counted
  that way (`isReinforcementCard()`), with its numbers on the card's rule
  (`ruleQty()`: sheet coverage; spacing both ways, stick length, lap; dose).
  A section's Reinforcement picker lists those cards; picking one records it
  on the section (`reinforcement_item_id`) and puts that card on the area's
  budget as its one reinforcement line (`section_role`); changing it swaps
  the line, none removes it (`setReinforcement()` in
  `src/lib/budget-server.ts`). An assembly's reinforcement is labelled
  "default for residential driveways" and never replaces Coy's own pick.
  Dictation matches the spoken reinforcement against these cards.
  `org_reinforcement_types` / `_defaults` are no longer read (tables kept).
  **The section card's Reinforcement field is gone (Coy, 2026-10-02: "I'm
  going to pull things in from the price book")** — mesh and rebar are
  budget lines added from the Price book like anything else; a
  reinforcement line already on a budget stays, and dictation and
  assemblies still set one.
- **Cost cards (migration 047, Coy 2026-09-29)** — `cost_items`: Coy's
  catalog of what he buys and charges for, each with its **vendor** (a
  contact), group (`cost_groups`), cost type, unit and unit cost, taxed or
  not (materials default taxed), optional markup, the vendor's item number,
  when and how the price was confirmed (quote, receipt, invoice, typed,
  import), and
  the rule that turns a scope into a quantity (by the yard, sq ft, foot of
  edge, sheet, stick, day, once per job, or typed). A blank unit cost stays
  blank; the card says what it still needs (`cardGaps()`) and a price that
  uses it will be blocked by name. Edited in the **Price book** (below;
  `/api/cost-items`, `/api/cost-groups`) and seen per vendor on the vendor
  page → **Prices**. Retiring a card keeps it (`active=false`)
  so a budget that used it still reads. Anon's grants on
  `cost_groups`, `estimates`, `estimate_line_items`, `documents`,
  `document_events`, `invoices`, `payments` were revoked with it.
- **Assemblies (step 3b, migration 050, Coy 2026-09-29)** —
  `cost_assemblies` + `cost_assembly_items`: Coy's default set of cards for
  a kind of area ("Residential driveway": 3000 psi by the yard, form &
  finish by the foot, 6x6 mesh), for a job type (or any) × a kind of area
  (or any — then only loaded by hand), and a quantity for cards counted by hand. At most one auto-loading
  assembly per job type × kind of area (unique index); `pickAssembly()`
  takes the exact job type, else "any job". When a section is added or its
  kind changes, `loadAssembly()` fills that area's budget — **only if the
  area has no lines yet**, so it never swaps or duplicates — each line
  "from Residential driveway" (`estimate_line_items.assembly_id`). It is
  Coy's own setting, not an assumption. The budget's card picker loads any
  assembly onto an area by hand (`POST /api/jobs/[id]/budget/assembly`).
  Removing a section removes its lines from the working budget. APIs:
  `/api/assemblies[/id[/items[/itemId]]]`, session client, every id checked.
- **The imported catalog, cleaned up (migration 050, Coy's choices).** His
  JobTread import had put each cost code in the description and left 0
  groups: cost codes became **groups** (24; 426 of 427 cards filed; the
  "Cost code …" text taken out of descriptions), and slab-geometry rules
  guessed from units (yards, sq ft, edge, sheets, sticks) were reset to
  typed quantities outside 2800 Concrete (52 cards; by the day and once per
  job kept everywhere). Snapshot first in `cost_items_backup_050` (no app
  access) so it can be put back. Imports now do the same: a cost code is
  the group when the file has no group column, and a slab-geometry guess is
  made only when the group is concrete (or there is none).
- **The Price book (migration 049, Coy 2026-09-29)** — the cost catalog's
  own page, `/dashboard/price-book` (JobTread calls it the cost catalog; Coy
  named it). **Price history:** `cost_item_prices`, one row per price a card
  has had, written by trigger `cost_items_price_log` (as the caller, under
  RLS) whenever `unit_cost` is set or changes, carrying the card's
  `price_as_of` / `price_source` and — new on `cost_items` —
  `price_import_id` / `price_file_id`, which a price set by hand clears. No
  path changes a price without a history row. **Imports** (`cost_imports`):
  a CSV or .xlsx from JobTread, another CRM or any spreadsheet is parsed in
  the browser (`src/lib/price-import.ts`, tested; `read-excel-file`) — the
  file is never uploaded. The header row is found under any title lines;
  columns are guessed from header words and Coy confirms them; each vendor
  name is matched to a contact filed as vendor, or none — **no contact is
  ever created**. Values: money parsed, markup from the file or derived from
  price ÷ cost ("from price"), a blank cost stays blank, an unknown type is
  Other and flagged, how a card is counted is a **guess** from its unit that
  Coy can change. Matching: vendor + item # first, else vendor + name + unit
  (retired cards don't match). The preview says New · Price change (old →
  new) · Same · Skipped (why) per row, and only ticked rows are sent
  (`POST /api/price-book/import`, ≤ 2,000 rows, every id checked against the
  org). A price change touches **the price only** — markup, group, rule
  stay. A group named in the file is made. **Undo** (`…/import/[id]/undo`)
  retires the cards the import made and puts back the prices it changed,
  unless Coy changed them since. **A vendor's quote** takes the same road:
  pick the vendor and the PDF or photo, it is saved to their files
  (`category='vendor_quote'`), Dusty reads it in the background (§2e), and
  its `price_lines` land in the same preview, matched against that vendor's
  cards — or pick a quote he has already read. Imported with
  `kind='vendor_quote'`, `price_source='quote'` and the file on each price,
  so history links back to the quote. Quote lines start as materials; a line
  with no unit is skipped by name. A suggestion until Coy imports it (§2b).
- **One item, many vendors (migrations 051–052, Coy 2026-09-29).** *"I would
  have multiple vendors to choose from for concrete ready mix … still have
  that in a unified cost book … I can select default vendor in the costbook
  and vendor page. That's the price that pulls into the budget."*
  `cost_item_sources` is one vendor's price for one item (unit cost, their
  item #, unit, date, where from, the receipt, the tax rate printed on their
  invoice; unique per item × vendor; member RLS, anon revoked).
  `cost_items.default_source_id` is **the vendor whose price budgets use**.
  While it is set, triggers keep the item's own price fields (unit cost,
  vendor, item #, date, source, file) **in step with that vendor's price**
  (`cost_items_default_source`, `cost_item_sources_sync`) — so the budget
  copy, the grid and history read the item as before, and there is one
  writer per value: a price typed on a card with a default vendor is
  written to that vendor's price (`PATCH /api/cost-items/[id]`), a vendor
  chosen on a card becomes its default carrying the price, a vendor named
  on a new card becomes its first price. An item with no vendor price keeps
  its own. **History is per vendor** (`cost_item_prices.source_id`; the
  ▲▼ compares a vendor with their own last price); choosing a default is
  not a new price and writes no row (052). `contacts.service_area` says
  where a vendor delivers — **price and area now, distance later** (Coy;
  needs a maps key). **APIs:** `/api/cost-items/[id]/sources` (list
  cheapest first, add by hand), `…/sources/[sourceId]` (`{default:true}`,
  re-price, remove — the default leaving keeps its price as the item's
  own), `/api/vendors` (list with counts; create — Coy's tap, filed vendor
  via `sc_classify_contact`, a phone or email already on a contact returns
  409 naming them instead), `/api/vendors/[id]` (prices with ★ and the
  cheapest other vendor, files, jobs; edit). **Imports with a vendor**
  (a receipt, a quote, or a spreadsheet row naming one) write THAT
  vendor's price — made, re-priced, or **added to an existing item** (the
  merge Coy asked for: Angelle's price on "3000 psi ready mix") — and make
  them the default when the row says so or the item has none; what each
  did is kept in `cost_imports.undo_payload`, and Undo puts back exactly
  that (a price Coy changed since is kept). **"Same item as…"**
  (`POST /api/cost-items/[id]/merge`, 052 `cost_item_merges`): this item's
  vendor prices move to the other (a vendor who already prices it keeps
  that price; theirs stays on the retired item, named), it is retired, its
  assembly rows follow; the default comes along only if the other has
  none. Budget lines keep their copies. Undo
  (`/api/cost-item-merges/[id]/undo`) moves back what is still where the
  merge left it. **The budget:** a card copies its default vendor's price
  and remembers the vendor (`estimate_line_items.source_id`); the line's
  **Vendor** picker pulls another vendor's price onto that line only
  (`source_pinned`, ✎) or goes back to Default. A later change is shown,
  never applied: "vendor's price changed", "default vendor is now X", or
  "card price changed" — each with update. **New vendors are made only by
  Coy's tap** (receipt flow, + Vendor); a spreadsheet import still never
  creates a contact.
- **The job budget (migration 048, Coy 2026-09-29)** — JobTread's maths on
  lines from cost cards. A job has ONE working estimate (`status='draft'`,
  unique per job); its `estimate_line_items` are the budget, and proposal
  versions (next) will be frozen copies of it. Adding a card **copies it
  onto the line** (name, unit, unit cost, type, taxed, markup, rule, vendor,
  price date), so a later card change never reprices a sent quote — the line
  says so with **↻** beside the unit cost (tap to take the new price;
  since 2026-10-05 the line under the name is gone — Coy; and the line's sheet no longer opens with the worked-out sum "2 days × $250.00 = … → $821.43", only what blocks it — its own margin is the sheet's **Margin % · this line only**). Under each line's
  name is its **note** ("+ note", typed in place, saved on blur as the
  line's `description`; on the phone cards too). Per line (`budget()` /
  `ruleQty()` in `src/lib/engine`, tested in `tests/budget.test.mjs`):
  **qty** from the card's rule on the line's area (whole job = every area)
  — yards with the card's waste, sq ft, perimeter (needs L and W), sheets,
  sticks, days on the job, once — or typed by Coy (`qty_source='set'`, ✎,
  ↺ back to the rule); **ext cost** = qty × unit cost; **O.H.** = ext cost ×
  the job's O.H. %; **ext price** = (ext cost + O.H.) ÷ (1 − margin), the
  line's margin else the job's, else blocked by name. **Tax is a switch**
  (`estimates.tax_on`): at cost, on taxed lines, at the job's rate, a
  pass-through. **Discount** is on price only. A tier shows cost, O.H.,
  profit and margin = (total − tax − cost − O.H.) ÷ (total − tax). Anything
  missing blocks that line and its tier by name.
  **Good / better / best** — `estimate_options`: a line with no option is in
  every option; a line with one is in that option only; each option's total
  = shared + its own. `estimates.selected_option_id` is the one the customer
  accepts (step 5). **Options only differ when lines are tagged** (Coy,
  2026-10-03: "I don't see what the 'good', 'better', 'best' options actually
  do") — the budget now says so in words when every line is in every option,
  and how to make Better differ. On the proposal, **Option → Every option —
  the customer picks** (`display.all_options`) prices each option as its own
  proposal would be (`priceChoices()`, `src/lib/proposal.ts`, tested) and
  shows them side by side: what every option includes, then each option's
  own lines and total. Its draws are percentages that add up to 100% — a $
  draw can't fit two totals — and the final refuses otherwise.
  **Removed 2026-10-05 (Coy, on a decision card: "Remove it") — one price
  per job.** Alternatives are optional add-ons on the proposal (priced, not
  in the total). The budget has no option bar and a line no Option picker;
  the proposal has no Option picker or "Every option" mode. Nothing reads
  `estimate_options` any more (budget API, proposal, Dashboard totals,
  Dusty), so every line is in the one price. Tables and columns stay (4
  option rows, 0 tagged lines, 0 selected, 0 proposals showing every
  option — measured that day, so no price moved); the options API and the
  document's side-by-side view for an old frozen copy are left dormant.
  Once a budget has lines it IS the price: the takeoff
  rail and phone strip show each option's total, cost, O.H., margin and
  whether it is under the **job minimum** (§4); Dusty's scope context
  quotes each option, area by area, from the same `budget()`
  (`src/lib/pricing-server.ts` is the one reader of a job's pricing for the
  budget API, the Dashboard and Dusty). APIs: `/api/jobs/[id]/budget` (GET,
  PATCH tax / discount / margin_pct / overhead_pct),
  `…/budget/lines[/lineId]`, `…/budget/options[/optionId]` — session client,
  org from the session; lines carry `org_id` with a restrictive org policy.
- **The proposal's price (migration 060, Coy 2026-10-01).** The proposal is
  the budget made presentable; it never prices anything. `priceDraft()`
  (`src/lib/proposal.ts`, tested in `tests/proposal.test.mjs`) runs the
  engine's `budget()` for the chosen option, then **rounds the price (before
  tax and discount) UP to the next $50 — on the proposal only** (Coy); the
  budget, the Dashboard and Dusty keep the exact number. The extra is profit.
  Each line sells at its own price × rounded ÷ calculated, the largest line
  taking the last cent, so the lines add up to the total exactly. A hidden
  line or area drops out of the total; a hidden price shows "—" and still
  counts; an optional add-on is priced and listed, never in the total (and the
  rest is rounded without it). When every line is an add-on the proposal
  says so ("Every line is marked an optional add-on …"), not "nothing on
  the budget", and lists each add-on with **Put in the price** — the
  per-line toggle is in the price list, which a blocked proposal doesn't draw
  (Coy, 2026-10-02: "I clicked it, and then it disappeared"). The budget
  marks such a line "optional on the proposal ×" (tap to put it back) and
  its line sheet has the switch (`PATCH …/proposal {addon: {line_id, on}}`). Tax stays a pass-through: its own line, or
  folded into the taxed lines (same total either way). Draws (% or $) must add
  up to the total within $1 before Print or Final (`drawsCheck()`, checked
  again on the server). **Project types** (`org_project_types`: Residential,
  Commercial, Government and any Coy adds) carry an O.H. and margin that a
  new budget for a job of that type copies (`workingEstimate()`; blank = the
  org defaults), plus what a proposal shows, its draws, and which warranty
  and contract load — edited in **Price book → Defaults**.
- **Quantities measured on the plans (migration 059, Coy 2026-09-30).** A
  budget line can be counted from a Plan Room takeoff group: `qty_rule =
  'from_takeoff'` with `estimate_line_items.takeoff_parameter_id`. Its
  quantity is the group's measured total in the card's unit (SF, LF or EA;
  CY from an area group that has a depth, no waste added) — `ruleQty()` /
  `takeoffUnit()` in `src/lib/engine`, tested in `tests/takeoff.test.mjs`. A
  unit that doesn't match, a group with nothing measured, or any of its shapes
  on a sheet with no scale **blocks the line by name** ("Takeoff: Slab on
  grade — sheet C-6 scale not set"); a total that left a shape out would be
  wrong. Re-measuring moves the line. The totals come from one reader,
  `loadTakeoff()` (`src/lib/plans-server.ts`), used by the budget API, the
  Dashboard's `job-totals.ts` and Dusty — the same number everywhere.
- **Square yards and areas with no sides (Coy, 2026-10-02).** *"The existing
  section fields do not apply to government work … I need to be able to
  remove the length, width … calculate not just square feet, but square
  yards."* A section is **Measured by** Length × width or **Area only**; area
  only keeps the area (and the thickness), typed in sq ft or sq yd and stored
  as sq ft in `sqft_override` (no migration; the sq ft / sq yd choice is kept
  per device, sq yd by default when the bid's line says SY). A bid section
  offers **Use the bid's 1,769.80 SY** — one tap, never filled by itself. A
  card counted **by the area** whose unit is SY counts square yards (sq ft ÷
  9, `ruleQty()`; a takeoff area group feeds an SY card the same way). The
  budget lists every area, lines or not, each with **+ Add**, its size and
  its price per SY / SF — how a unit-price bid reads. **Not in the Price
  book? Make it here** in the card picker creates the card in the Price book
  and puts it on the budget in one go (or on this budget only).
- **The budget opens the Price book itself (Coy, 2026-10-02: "toggle back
  and forth … to the cost book and pull items from there").** Every area's
  **+ Add** (and **+ Add items from the Price book** on each section card)
  opens the real Price book page (`PriceBook` with `pick`) wide over the job:
  find, by group / by vendor, columns — plus **+** on every item, **Add all
  N** on every group and **Load** on every assembly, into the area picked at
  the top. A tapped **+** turns into a green **✓** (✓2 when added twice) and a
  green toast pinned at the top of the book says "Added X to the budget ·
  N added so far". A bid line's own area ("1,769.80 SY") becomes the section's area
  (`itemQuantity()` in `bid-intake/rules.ts` — the number is on the line the
  bid wrote; a count like "8 EA" isn't an area and stays for the line).
  Deployed in `bid-intake` v12 (2026-10-02).
  **Fixed 2026-10-02:** every card from the JobTread import carries
  `price_source='import'`, which a budget line's check (048) does not
  allow, so no card could be added. `lineSource()` (`budget-server.ts`)
  leaves a source the line can't hold blank on the line (the card keeps
  it).
- **A section measured by count (migration 065, applied 2026-10-02 on
  Coy's "Apply 065").** Coy: *"it's actually a quantity per item. So it's not
  an area, it's a quantity."* `job_sections.count_qty` / `count_unit`
  (nullable, checked > 0, unit ≤ 12 characters; additive, RLS unchanged). A
  section is **Measured by** Length × width · Area only · **Count** — "How
  many" and its unit (EA by default); a bid line's "8 EA" is one tap. A
  counted section has no area and no pour, so nothing on it is missing; a
  line on it priced per each (typed-quantity rule, unit EA / each, or the
  same unit word) takes the count as its quantity unless Coy types one
  (`ruleQty()`), and its items and groups sit under it like any other area.
  The budget shows "8 EA · $X/EA"; the proposal shows "8 EA"; Dusty sees
  "counted 8 EA". A section set to Count shows no Thickness or Concrete
  cells (Coy: "thickness isn't required for counted items").
- **A section measured in linear feet (Coy, 2026-10-02: "in addition to
  length/width, area and counts, I need linear ft").** **Measured by** gains
  **Linear ft**: the length is stored as the count with `count_unit='LF'`
  (no migration); a line on it priced per LF (LF, lin ft, ft) takes it. For a
  pour — a grade beam, a curb — the beam's **width (in)** is kept in
  `width_ft` and its **depth** in `depth_in`: plan area = LF × width, yards =
  area × depth (`quantities()`, tested on Walker High's 430 LF of 8" × 18"
  grade beams). Without them the yards name what they need; nothing per LF
  waits. A bid line's "430 LF" is one tap. The proposal shows "430 LF";
  Dusty sees the LF, the plan area and the yards.
- **Dusty plans budgets; Coy applies them (Coy, 2026-10-02: "chat with Dusty
  to analyze the list of items in my cost book and apply the items that I
  might need or create new items or modify cost items and organize by
  groups").** On a job Dusty's context carries every area by an 8-character
  ref (with its SF and SY) and the whole Price book by item ref, group, unit,
  cost and rule. Asked to build or fix the budget he answers in words and ends
  with one ```` ```scopecrete-plan ```` block — add an item or a whole group to
  an area (a qty only when written or said), make a new item (and put it on
  the budget), change an item's cost / unit / name / group, make a group
  (`src/lib/dusty/plan.ts`, tested: refs only from the context, a made-up ref
  or step is dropped, no cost stays null). The panel shows it as numbered
  steps with **Apply** (`plan-card.tsx`); the tap runs them through the same
  APIs Coy's own taps use, under his session (`apply-plan.ts`), and the
  budget reloads. **Dusty still changes nothing himself.**
  **Since 2026-10-03 a plan can also make areas and count from a takeoff:**
  `new_area` (a key — new1, new2 — a name, a kind of area, and a size in
  sq ft, LF or a count and a depth only when written in the context) which
  later steps put items on by its key; and `add` with `takeoff: <group ref>`,
  a line counted from a Plan Room group (the aerial or a sheet) that moves
  when Coy re-measures. The context lists takeoff groups by ref.
  **And the Price book and its assemblies (Coy, 2026-10-03: "it would be
  good if dusty could edit my cost book (add, remove, edit cost items/groups
  and build out cost assemblies for specific jobs … pull in an Assembly for
  a driveway breakout and pourback and build an assembly if there isn't
  one").** New steps: `retire_item` ("remove" is retire — budgets that used
  it keep their lines; Show retired brings it back), `rename_group`,
  `remove_group` (only an empty group; otherwise kept, saying how many items
  are in it), `new_assembly` (a key — asm1 — name, job type, kind of area,
  `auto` only when Coy asks and only with a kind of area, and its items with
  a quantity only for items counted by hand), `add_to_assembly`,
  `remove_from_assembly` and `load_assembly` (onto an area, through
  `/api/jobs/[id]/budget/assembly`). A `new_item` may take a key (item1) so
  a later step can put it in an assembly. His context lists every assembly
  by ref with what it applies to and its items, and he is told to load one
  that fits before building another. **Price book steps need no job:** on
  the Price book page Dusty is HOT on "Price book & money" (the `cash`
  context, which now carries the whole book and its assemblies — no new
  context kind, so `dusty_conversations` needed no migration), and a plan's
  budget steps there are skipped by name ("needs the job open"). Tested in
  `tests/dusty-plan.test.mjs`. Still Coy's tap; Dusty changes nothing.
  **And a job (Coy, 2026-10-04: "Or I can ask dusty to create it; he should
  have that ability").** `new_job` {contact (full id from his context),
  title, job_type, address, description — only as written or said} → `POST
  /api/jobs` on Coy's Apply (which now also takes `description`); the card
  names the person. In every context (`RECORD_RULES`); tested in
  `tests/dusty-plan.test.mjs`.
  **And a parish's sales tax (Coy, 2026-10-03: "Dusty needs to be able to
  update the sales tax for the parish the address found").** Asked "add a tax
  rate for East Baton Rouge", Dusty said he had no step for it. `set_tax`
  {parish, rate_pct (under 30), for_job, source} — on Coy's Apply it is saved
  through `POST /api/tax-parishes` (Price book → Defaults, noted "From
  Dusty's plan: …") and, with a job open, sets the job's parish
  (`PATCH /api/jobs/[id] {tax_parish}`). His job and Price book contexts list
  the parish rates on file next to the job's "no rate for <parish>". The rate
  is never assumed: Dusty says where it came from in `source` (Coy's words, or
  "Dusty's figure — check the parish's published rate") and the card says
  **Check the rate before you apply**; Coy's tap is the entry. Looking the
  rate up by address (Louisiana's own lookup) still waits on API access.
- **Units and how a line is counted (Coy, 2026-10-03: "Need to change unit
  types. Sometimes it's days/sqft. I need to be able to add and edit unit
  types from this panel and inside the costbook").** A budget line's sheet
  has **How it's counted** (the card rules — by the day, by the area, once
  per job, typed …; "Measured in the Plan Room" kept for a takeoff line) and
  **Unit**, on that line only (`PATCH …/budget/lines/[id] {qty_rule, unit}`;
  a rule other than typed counts from the area again). The Price book card
  sheet's Unit is the same **unit picker** (`unit-picker.tsx`): the units
  already on the org's items, most used first, then the common ones
  (`src/lib/units.ts`, tested — case never doubles), **+ New unit…** to type
  one (1–20 characters), and **Edit units…** — each unit with how many items
  use it and **Rename**, which changes it on every item and vendor price
  (`GET/PATCH /api/price-book/units`, session client); budgets already made
  keep their copies. Checked in the harness: a line set to by the day, a new
  unit "Truck", LS renamed "Lump sum" on 9 items.
  **Superseded 2026-10-05 — one Unit type (Coy: "if it's just the unit type
  then it needs to be renamed 'unit type'. And the dropdown list should be
  simple: SqFt, SqYd, LnFt, CuYd, Each, + (to add my own)").** "How it's
  counted" is gone from the line sheet, the new-line form and the Price book
  card: one **Unit type** picker — SqFt · SqYd · LnFt · CuYd · Each, then Coy's
  own units ("Your own": Days, Lump Sum …), then **+ Add my own unit type…**
  (Rename units… only in the Price book). **The unit decides the quantity**
  (`ruleForUnit()`, `src/lib/units.ts`, tested): SqFt / SqYd → the area (SY ÷
  9), LnFt → the edge, or the length of an area measured in LF (`ruleQty()`
  now takes it), CuYd → yards of concrete with the card's waste, Each and
  anything else → typed (or an area's count); of his own, Days → days on the
  job, Lump Sum → once; Sheet / Stick count by the sheet / stick on a card
  (its coverage and spacing). A Plan Room line stays measured. Old names show
  as their type ("Square Feet" is SqFt) and nothing stored was rewritten; a
  line still typed whose unit would count itself says "Quantity typed · ↺
  Count it from the area".
- **A line's group follows its Price book item (Coy, 2026-10-04: "I have an
  uncategorized cost item and I can't change it inside the budget … if I
  update it in the price book, it doesn't update in the budget").** The group
  is where an item sits, not a price, so it is not a frozen copy: moving an
  item in the Price book moves every budget line of it
  (`syncLineGroups()`, `budget-server.ts`), a line's sheet has **Group**
  (from a Price book item it moves the item too; a one-off line moves
  alone), and lines copied before an item was moved catch up when the budget
  is opened. Sent proposals keep their frozen snapshot.
- **Base, vapor barrier and day-rate equipment** are cards like anything
  else (by the sq ft, by the day); nothing is priced that has no card.
- **Dictating a section (2026-09-28).** Dictate on a section card records up
  to 60 s; `/api/jobs/[id]/sections/[sectionId]/dictate` sends the audio to
  Groq Whisper (`GROQ_API_KEY`, server side — only audio goes to Groq), asks
  Dusty (Hermes) to put the words into fields, and `sanitizeDictation()`
  (`src/lib/dictate.ts`) keeps a number only if it was **said** — digits or
  words, feet-and-inches included — and a work type or reinforcement only if
  it is a real one (a reinforcement card, since step 3b). The card applies it through the normal section PATCH and
  shows "Heard: …" with Undo. Nothing is estimated.

---

## 4. Overhead, the job minimum, and burn (rewritten 2026-09-30)

Coy's notes on the old Markups & overhead page replaced this section's
off-the-top divisor (11%) and the crew-day floor:

- **Overhead is a % on every job** — *"This is really considered Overhead
  (O.H.). 15% overhead can be applied to every job."* It is in the price
  (§3: cost × (1 + O.H.) ÷ (1 − margin)), not a separate floor.
- **The job minimum.** *"There are no default crew days. And there is no
  default number of people on a crew. There is only a minimum of $ per day
  that people require to show up and work. And therefore there is a
  minimum for a job."* `org_money_settings.day_minimum` × the days Coy sets
  on the job (`jobs.duration_days`, blank until he does) =
  `jobMinimum()` in `src/lib/engine`. The budget footer and the scope rail
  show it and say "under the job minimum" when a tier's total is below it;
  with no days or no day minimum they name what is missing.
- **Burn and pay-yourself live on the Cash page** — *"Our monthly burn rate
  can be calculated in the 'cash' page."* Recurring overhead items
  (`overhead_items`; quarterly ÷ 3, annual ÷ 12, one-time excluded) plus a
  fixed draw = the monthly burn; runway = cash ÷ burn. `pct_profit` comes
  out after a job clears. Both are edited there (`CashSettings`,
  `/api/settings/money`).
- **Production days are still DISCOVERED, not entered** (receipts, daily
  logs) — when they exist they will replace the days Coy types.
- The old columns (`owner_fee_pct`, `estimator_fee_pct`, `tax_reserve_pct`,
  `assumed_billable_days`, markups per type, `sales_tax_pct`, waste and
  short load) stay in `org_cost_settings`, unread. Nothing was dropped.

---

## 5. Cash-flow dashboard

**Not a bookkeeping tool.** Big-rocks planning — jobs, invoices, draws, the
nut. Precise on big money, deliberately loose on small stuff.

**Three layers on one timeline:** COLLECTED (cash landed), COMMITTED (earned
and owed — the receivables gap), PROJECTED (quoted × close rate). Money in
above the axis, money out below.

**Cash vs accrual is a toggle, not a choice.** The gap between them is "owed
to you."

**Chart structure — settled, do not redesign without cause:**

- ONE continuous ribbon of MONTH bars, wider than the screen, swiped left and
  right across months and years. Current month centered on open.
- The ribbon is always months. No pinch, no grain toggle.
- Tapping a month opens a BAND showing that month's WEEKS — two roads,
  revenue above the line, expense below, net printed per week.
- Tapping a week opens that week's DAYS.
- Depth lives in the band, not the ribbon.
- Weeks first, days on demand. The question a week answers is "was that week
  positive or negative."
- The band sits ABOVE the ribbon so both are on one screen.

**Runway** = cash ÷ monthly burn, shown big. Red under 1 month, orange under 2.

**The green line is cash position** — what's left in the account, running
forward from the last balance check. Bars are flow, the line is level. It
carries its own scale, not the bars'; say so in the UI.

**Starting cash is a manual balance checkpoint (v1).** Later, read-only bank
sync **reconciles the ANCHOR, not transactions** — compare actual against
model-expected, show the gap as drift (untracked burn) as one lump, quietly
correct the anchor. Never import a transaction ledger.

**Known gap:** projection currently spreads pipeline evenly. It needs an
expected start date per quoted job before it means anything. Add the field.

---

## 6. Interface rules

- ScopeCrete header is sticky on every page.
- **Threads v2 — contacts → threads → channels (migration 073, applied
  2026-10-03 on Coy's "Apply 073"; Claude Design handoff
  `design_handoff_threads_v2`).** A **thread** is a saved set of contacts;
  the five role buckets are the system threads (worked out from
  `contact_type`, never stored), and Coy makes his own (`threads`,
  `thread_contacts`, RLS by `get_user_org_ids()`, anon nothing; retired with
  `archived_at`). **+ New thread**: a name, then pull its people from **a
  job** (its contact, its customer's people, its crew & suppliers —
  `sc_job_people()`), **a customer** (its people), or **hand-picked**; a job
  or customer thread **follows them** — anyone added later joins
  (`added_by` job-sync / customer-sync, triggers on `job_vendors`, `jobs`,
  `contacts`, `threads`); it never takes anyone out. Being in a thread never
  moves anyone out of Customer or Vendor. APIs `/api/threads/custom`
  (GET; `?job=` / `?customer=` previews who it starts with; POST),
  `…/custom/[id]` (rename, retire), `…/custom/[id]/contacts` (add, take one
  out); `/api/threads?thread=<id>` lists its members, including people with
  no calls or texts yet; `/api/threads/counts` adds `custom`. Rehearsed
  (rolled back): a job thread filled from its job, a supplier put on the job
  joined it, a stranger sees none, anon refused.
  **Level 1** — a 72px rail on a desktop (Customer · Unsorted · Vendor ·
  Personal · Spam, a rule, **Yours** with initials and counts, **+ New**);
  a drawer behind ☰ on a phone (the bucket chips are gone). `?t=` picks the
  thread (`?f=` still works); `threads-ctx.tsx` holds it, the threads Coy
  made and the counts. **Level 2** — the thread's name in its colour, its
  count, **Sort ▾** (Recent → A–Z → By role, remembered per thread on the
  device), a job thread's job line and **+ Add contact** (a floating + on a
  phone). Rows: initials (a dashed # for no name), name, **role tag**
  (Customer · Cust. contact — anyone on a customer other than its primary —
  · Vendor · Sub · Personal · Spam · Unsorted; not repeated in its own
  bucket), age; "Homeowner · 2 numbers · email"; Dusty's line or the last
  message. A tap opens them; **▾** (only while something about who they are
  is undecided) drops down the filing tools as before; swipe, Select and
  Archive are unchanged. **Opening a contact folds the list to 56px of
  initials** (› brings it back; another thread un-folds it).
  **Level 3** — every contact opens here, customers included (no more jump
  to the customer page): name and role, **Customer page ›** / **Vendor page
  ›** / **Contact ›** (their own page, `?person=1`: next steps, jobs, About),
  **Ask Dusty**, ⋯ (File as, Same person as, New scope / the job, Archive);
  "Homeowner · 2 numbers · email · in Example Driveway Repair · last heard 2h
  ago"; then the **channels** — **each phone number its own**, calls,
  voicemails and texts on it in one timeline (`messages.counterparty`
  decides; `buildChannels()` / `inChannel()`, `src/lib/v34/threads.ts`,
  tested), then **Email** (the mirrored emails filed on them) and **Chat**
  (not built — "Not joined · invite"). **All · Calls · Texts** filter a phone
  channel; **Call** dials that number; the composer texts or emails it.
  **Search** (the glass) drops down at the top of the chat, its full width
  (Coy, 2026-10-05: "a simple search bubble … I don't need the 'this
  number, john, whole thread' buttons or the other buttons if the search
  features have intelligence built in") — one box, no scope or type
  buttons: it searches everything with the person (every number and
  channel), and when nothing of theirs matches, the whole thread, saying
  so; a word like "photos", "voicemail" or "pdf" picks the kind
  (`readThreadQuery()`, `src/lib/v34/threads.ts`, tested; types from
  `message_media.kind`) — `/api/threads/search`; a result opens its
  channel at the message. The line under the channel tabs ("Everything on
  this number, oldest first" …) is gone (Coy). **The list's header stays
  put** while the list scrolls, and its own 🔍 searches that list by a word,
  a name or a place — names, numbers, Dusty's lines, their address, their
  customer's and their jobs' addresses and titles (`places` on
  `/api/threads`, searched, never shown), and every word said in their
  calls and texts (`/api/threads/search` on the thread's people).
  **Live (Coy, 2026-10-05: "I sent a test text message … it's not showing up
  in threads … I would like the webhooks to be near instant from quo").**
  Quo was never the delay: Bubba's text reached `quo_events` and `messages`
  2.1 s after Quo stamped it. The Threads list, the open conversation and a
  person's page read once when opened, so a text that landed while they were
  on screen waited for a reload. Now one watcher per tab
  (`src/lib/v34/live-threads.ts`, `useLiveThreads()`) tells them something
  changed and they refetch their own reads (counts included): Supabase
  Realtime on `messages` INSERT — instant since **migration 082** (applied 2026-10-05 on Coy's "Apply 082") put
  `messages` in the `supabase_realtime` publication (RLS decides who hears;
  the payload is never drawn) — and, working without it, a poll of
  `/api/threads/latest` (the newest message id and Dusty's newest filing,
  two one-row reads) every 15 s while the tab is visible and at once when it
  comes back into view. Don't poll `/api/threads` itself: it reads up to
  4,000 messages.
  **On a phone (Coy, 2026-10-05)** the thread's name and the person share one
  row ("‹ Unsorted  (225) 446-2212"), with no role tag (the thread's name says
  it). The channel tabs are one line each, an icon and a short name — ☎ Cell
  (a first number's default name, was Mobile; ✎ renames it Office …), an
  envelope alone for Email, ✦ **AI Chat**, **Notes** (was Internal notes) —
  and + adds a number (was "+ Number"). A ▴ beside ⋯ folds the whole header
  to the name's row (facts, tabs and toolbar hidden; ▾ brings them back),
  remembered on the device (`sc:thread-head-folded`). An open thread covers
  the dashboard header (`.sc-pinned-full`; the footer stays), its tabs'
  icons centred; the toolbar is one row — **All · Calls · Texts** and the
  line filter as drop-downs, Call from ▾ and search beside them — and the
  line a text goes from is picked there only (the composer's own line chip
  is gone). A call card says "● via Quo" (the provider; the line's name on
  hover — "batonrougeconcreters.com" pushed it out of the card).
  **Internal notes is the first tab on the left (Coy, 2026-10-04)** — a
  person still opens on their conversation; the tab's "@ to tag" line is gone
  (the box below says it). **+ Number adds a number (Coy: "should also allow
  me create a new phone number and save it and label it")** — a dialog for
  the number and what it is (Office, Work …), saved on `contact_phones`
  (`PATCH /api/contacts/[id]/phones`) as its own channel; a number that is
  already someone else's thread answers 409 with who, and offers "Join their
  thread to this one" (the Same person as… merge); "Or join another thread of
  theirs…" opens that merge directly. **"US" and "THEM" are "We" and
  "Customer" (Coy: "'US' is confusing … 'Them' … should be replaced by
  'Customer'")** — the background reader is shown transcripts labelled
  US/THEM and its summaries and quotes kept the words; `plainSpeakers()`
  (`src/lib/speakers.ts`, tested; "Vendor" for someone filed vendor) turns them
  round wherever Dusty's status lines, recent summaries, quotes and next-step
  lines are sent out — Threads, the person and customer pages, the activity
  line, Why this job — and in Dusty's own context. Stored text is unchanged.
  **Name a number (Coy, 2026-10-03: "instead of 'phone 2' it can say
  'office'")**: ✎ beside the open phone channel's name saves its label on
  `contact_phones` (`PATCH /api/contacts/[id]/phones`, 30 characters, blank
  = the default; a number they used that isn't listed is added with it).
  **Sort** is a drop-down (Recent · A–Z · By role), and a system thread
  shows no description line under its name (Coy: "remove this line").
  **Archived is a tab of its own (Coy, 2026-10-04: "The archived threads
  needs it's own tab in the tab menu below Vendor, that is filterable").** In
  the rail (and the phone drawer) under Vendor, with its count; the list has
  chips by bucket (All · Customer · Unsorted · Vendor · Personal · Spam, each
  with its count), the search box searches the archive, and Sort applies.
  The old "Archived · N" link above the list is gone.
  **All is the first tab (Coy, 2026-10-04: "an 'ALL' thread as a catchall
  for anything that isn't archived or labeled spam").** Everyone in every
  bucket, Unsorted included, newest first, each row with its bucket tag;
  spam and the archived are left out (the count is `/api/threads/counts`'s
  `all`); Whole thread search covers the same people (`bucket=all`).
  **Why it was archived (Coy, 2026-10-04: "When i select to archive a
  thread, i would like to make a note as to why … so that dusty or any
  internal user can see the reason … if the customer contacts me again we
  will have all of that context").** Archive and Delete ask in a small dialog
  (`ArchiveDialog`, `archive-actions.tsx`; it replaced the browser's
  confirm) with an optional **Why?** box — on a thread's ⋯ Archive, bulk
  Archive N, Archive lost · N, and Delete on a vendor, customer or job. The
  reason is saved as the row's `archived_reason` (no migration — nothing reads
  a contact's reason as a fixed word) and, for each person, as an internal
  note "Archived — <reason>" (`archiveRecords()`), so it is in their Internal
  notes tab and Dusty's context for good, even after Undo. Dusty's own archive
  steps give their label as the reason. **When they come back** (a call or
  text after the archive): their row in Threads says "↩ Back · archived
  Oct 3: <reason>", their thread opens with a banner "Back — they got in touch
  after you archived them on … Why: …" (still archived: the same banner with
  Unarchive), the activity line says "<name> is back — archived Oct 3:
  <reason>" for a week, and Dusty's context on them carries "Archived by Coy
  on … : <reason>". Checked in the harness: the reason posted with the
  archive; the banner on a returning person.
  **The archive note stands out (Coy, 2026-10-04).** A note "Archived — …"
  or "Deleted — …" (`archiveNote()`, `src/lib/archive.ts`, tested) is drawn as
  a grey card with a box icon and ARCHIVED (DELETED in red), the date, by
  whom ("Dusty's plan, your tap" when Dusty proposed it) and "Why: …" — in
  Internal notes and in the timeline (`ArchiveNoteCard`).
  **Asking Dusty to archive (Coy: "I want to be able to prompt dusty to
  archive a thread").** His archive step takes a `reason` — Coy's words when
  he gave one, else the plain fact from the context, never a guess — shown on
  the plan card ("Why (saved as an internal note): …") and saved as the
  archive note on Apply. "This thread" on a person's page is the contact in
  his Ids block. Still Coy's tap.
  **Internal notes (Coy, 2026-10-04: "I need to be able to create internal
  notes. The internal notes tab can also allow me to tag other internal
  members in the Org").** A tab after the person's numbers — **Internal
  notes** (`internal-notes.tsx`): their `contact_notes` with who wrote each,
  and a box where **@** offers the org's members (`sc_org_people` via
  `/api/org`). A tag is written into the note itself as `@[Name](u:<user
  id>)` (`src/lib/mentions.ts`, tested) — no migration; shown as a chip, and
  as plain "@Name" in the timeline and Dusty's context. A tagged member sees
  **"Tagged you on …"** on their activity line for a week, opening the tab
  (`?channel=notes`). Notes are never sent.
  **Whole thread search works in the buckets (Coy: "whole thread button isn't
  clickable").** A system thread has no saved list, so the button was off;
  `/api/threads/search?bucket=customer|vendor|personal|spam|unsorted` now
  works out its people the way Threads files them (400 most recent).
  **Done and lost customers (Coy: "a way to hide completed customer threads
  and archive lost thread").** `/api/threads` gives each person `job_state`
  — open while any job is open, done when every job is complete (or some
  lost), lost when every job is lost. In Customer, done ones are hidden
  behind **Done · N hidden — show** (remembered on the device), and **Archive
  lost · N** archives every all-lost customer in one tap with Undo (Select
  also has a **Lost · N** pick); like any archive, they come back if they
  call or text again.
  Not built: Dusty reading a whole custom thread (his context is still one
  contact), and "Jump to date".
- **Threads on a desktop (2026-10-01, Coy):** the five buckets are a second
  icon rail beside the main one (`SubRail`, with counts), **Customer**
  first and the default; the list follows `?f=` and says its bucket.
  Every bucket lists **newest first** (Coy, 2026-10-03: "it should be latest
  at the top" — Johnette Wilson had sunk to J under the old A–Z order);
  Customer, Vendor and Personal have an **A–Z ⇅** toggle (a bare number
  last), remembered on the device. The phone keeps the chips.
- **Threads is people, Jobs is work (2026-09-27; reshaped 2026-09-28).**
  Five chips, all on screen, no funnel: **Unsorted · Customer · Vendor ·
  Personal · Spam**. Unsorted is the inbox and opens first; filing someone
  moves them out of it into their bucket (the row leaves at once). A search
  looks in every bucket. Each bucket has one colour — Unsorted hi-viz, Customer
  green, Vendor blue, Personal violet, Spam red — used by its chip AND its tag
  on the row. The tag says how sure: **solid with ✓** Coy confirmed it,
  **outlined · auto** Dusty filed it, **dashed ?** Dusty's guess. A customer
  also shows the job type: the job's own when there is one, otherwise Dusty's
  `job_type_hint` with a "?". **Swipe on a phone:** right opens the four buckets behind the row (Dusty's
  guess marked); left opens **Spam · Archive** (Coy, 2026-10-05 — it used to
  accept the guess). Filing shows "Filed as X · Undo" for 5 s; Archive asks
  Why? first (`src/lib/swipe.ts`). **Select** is an icon beside Sort and the
  search in the list's header (Coy, 2026-10-05), not a word on a row of its own.
  **The tag is not repeated (Coy, 2026-09-28):** a row in a bucket's own
  chip shows no bucket tag, and the customer / vendor page shows none (only
  a small "auto" when Dusty filed them); Dusty's guesses on Unsorted rows and
  tags in search results (which cross buckets) stay.
  **The row, collapsed:** name, tag, job type, and Dusty's one sentence on
  where things stand (`contacts.status_summary`), falling back to the last
  message until he has read them. **Expanded:** his short summary of the
  latest conversations (`recent_summary`), the sorting buttons only while they
  are unsorted or auto-filed ("Change bucket" otherwise), the name question
  only for a number with no name, and ONE button through to their page. No
  call / text / email / composer in the row (Coy, 2026-09-28) — engaging on
  every channel belongs on the person's page.
- **Contacts — the book (Coy, 2026-10-05: "a Rolodex or contacts book of
  some kind for pure contact info that can be pulled into any thread and any
  channel and any vendor contact and any customer contact" — "Call it
  contacts").** No second table: the book IS `contacts` (one row per person,
  §2c), their extra numbers `contact_phones` and emails `contact_emails`;
  customer, vendor, personal and spam stay how a person is filed. A copy
  elsewhere would drift (§2b's `relation` vs `contact_type`) and Threads, Quo
  intake and email filing would not see it. No migration.
  **The page** `/dashboard/contacts` (rail after Cash, Toolbox on a phone):
  everyone not merged or archived, spam left out, each with every number and
  email, company, address, their customer and role (Customer · Cust. contact ·
  Vendor · Sub · Personal · Unsorted — `bookRole()`, only a bucket Coy or Dusty
  filed counts), last in touch; search by any word, and 3+ digits find a
  number however typed (`matchesBook()`); role chips with counts; A–Z or
  Recent (kept on the device); a table when wide, rows on a phone; a row opens
  their page (a vendor's vendor page). `src/lib/contacts-book.ts` (tested,
  `tests/contacts-book.test.mjs`), `src/lib/contacts-server.ts`,
  `src/components/v34/contacts.tsx`.
  **+ Contact** (on the page, and Dusty's + menu → New contact): someone who
  hasn't called — name, company, any numbers and emails with labels (Mobile,
  Office…), address, and optionally what they are (Unsorted by default;
  customer / vendor / personal filed by `sc_classify_contact`, Coy's tap).
  `POST /api/contacts` writes every number and email into the lists Threads
  and email-intake read (the first is primary and also on the contact row),
  `address_source='coy'`. A number or email already on someone (their row or
  their lists, merges followed — `ownerOf()`) is 409 naming them, never a
  second person. Rehearsed (rolled back) on the live data: the insert and its
  lists pass the checks and no job is made.
  **One contact picker** (`ContactPicker`): search the book, + New contact at
  its foot (seeded with what was typed, made inline, then picked; a duplicate
  offers "Use them"). Used by the customer page's + Add contact, + Add contact
  on a thread Coy made (pick several), a job's Crew & suppliers ("Someone else
  from Contacts", made as a vendor) and an email's filing.
  **An email's person (the email-drafts design asks for it).** The email sheet
  has **Person** — Pick from Contacts / Change / Take off — beside Customer and
  Job, and an email filed on a customer with no person goes on its primary
  person (`PATCH /api/emails/[id]`), so it reaches their Email channel. When
  the sender's address isn't on that person: "… isn't on Amber yet. **Add
  it**" → `POST /api/contacts/[id]/emails` (onto `contact_emails`, and the row
  when it has none; someone else's → 409), so the next email from it files
  itself (§2h exact match). Onsite estimators (§2j) read no contacts, so the
  page is not theirs (`redirectFor()`). Not built: importing a phone's or
  Google's address book (later, Coy).
- **Archive and delete, restorable (migration 066, applied 2026-10-03 on
  Coy's "Apply 066").** Coy: *"I have a lot of these calls where nothing was
  said … I need to be able to archive these threads … in bulk on the threads
  home page and inside the thread itself. Also there needs to be a way to
  delete customers and vendors and jobs. Also Dusty needs the ability to do
  all of it for me if I ask."* His answers: **Delete removes and is
  restorable** (calls, texts and files stay on record — §2's never-wiped
  rule); **an archived number comes back when it calls or texts again**,
  like email. `contacts.archived_at/_by/_reason`, `customers.archived_*`,
  `jobs.archived_by`, and `archive_log` (one row per tap: kind, action,
  `via` coy | dusty, and the **stamp** given to every row touched, so Undo
  puts back only rows still carrying it). RLS by `get_user_org_ids()`;
  members insert the log and may set only `undone_at` (Supabase's default
  table grants were revoked first — the rehearsal caught them); anon
  nothing. **Threads:** **Select** → tick rows, **Nothing said · N** ticks
  every thread that is only calls with no summary, voicemail or words
  (`isSilent()`; checked 2026-10-03: none of them has a transcript or
  summary artifact either), **Archive N** with Undo; **Archived · N** lists
  them with **Unarchive**. A thread is out of the lists and counts while
  `archived_at` is later than their last inbound message
  (`isArchivedNow()`, worked out on read — nothing re-writes it). Inside a
  thread: **Archive** by Call · File as · Same as. **Delete** on a vendor's
  page (the contact), a customer's page (the customer, its people and its
  open jobs, `archived_reason='deleted with their customer'`) and a job's
  header (`jobs.archived_at`, which every list already leaves out); each
  confirms, says it is restorable, and shows Undo in a toast that survives
  leaving the page (`ArchiveToast` in the layout). A deleted job or customer
  opened by link shows **Restore**; **Archived & deleted**
  (`/dashboard/archive`) lists every deleted customer and job. The Customers,
  Vendors and person lists leave archived rows out. **Dusty** proposes it
  (`RECORD_RULES`, in every context): his context lists every thread,
  customer and job by full id, threads with nothing said marked NOTHING
  SAID; his plan's `archive` / `restore` steps take full ids only, and the
  card lists the REAL names they touch, read from the database
  (`/api/archive/names`), before Coy taps Apply — Dusty still changes
  nothing himself. APIs: `/api/archive` (GET lists, POST archive/delete),
  `/api/archive/[logId]/undo`, `/api/archive/restore`,
  `/api/threads?view=archived` — session client, org from the session,
  every id checked against it. Tested: `tests/archive.test.mjs`,
  `tests/dusty-plan.test.mjs`. Rehearsed (rolled back): a member archives
  and undoes; can't rewrite the log; a stranger sees no log and can't
  un-archive; anon refused.
- **Customer page and Vendor page (2026-09-28)** — `/dashboard/messages/[id]`
  renders `src/components/v34/person-view.tsx` for anyone filed vendor (and a
  customer's person with `?person=1`; since 2026-09-30 a customer's person
  otherwise opens the customer page, below); unsorted, personal and spam keep
  the plain conversation. Header: bucket tag
  (✓ / auto), subtype or job type, Dusty's status line, numbers, email,
  address. **Call · Text · Email · Ask Dusty** — Text writes a draft to copy
  into Quo (no send path, below); Email is mailto: and off when no address is
  known; Ask Dusty opens the panel on this person (`sc:dusty-open`). **Next
  steps**: Dusty's items marked with "why" (the line), Coy's own, due dates,
  overdue in red; tick, dismiss, add. Tabs **Activity** (the timeline, filter
  All · Texts · Calls; Email shown off until email is connected; composer;
  Same as…) · **Jobs** (customer: their jobs with stage, type, flags and Crew
  & suppliers, + Start a job; vendor: the jobs they're on, + Put them on a
  job) · **About** (Dusty's latest summary and what they said about the work).
  The job page carries the same Crew & suppliers row. APIs:
  `/api/people/[id]`, `/api/people?bucket=`, `/api/people/[id]/tasks`,
  `/api/tasks/[id]`, `/api/jobs/[id]/vendors` — session client, org from the
  session. Job stages — New
  lead, Consultation, Estimating, Follow up, W.I.P., Complete, Lost — are the
  Jobs board (Scope renamed Jobs), a Kanban, not Threads chips.
- **Jobs board (migration 034, 2026-09-27)** — `/dashboard/scope`, stages in
  `src/lib/jobs/stages.ts` mapped onto `jobs.status` (`consultation` added;
  W.I.P. holds won → scheduled → in_progress, shown as a tag). Phone: stage
  strip + columns that swipe one per screen; desktop: all seven side by side.
  Cards: customer, address, type (residential / commercial / government =
  `public`), source, sections; Move sheet or one-tap next stage; unreviewed
  machine jobs shown with Accept, never counted. **Customer vs source:**
  `contact_id` / `customer_id` is who pays; `lead_source` (website, referral,
  gc_invite, lead_gen, repeat, direct, other) and `referred_by_contact_id` are
  how it reached us — Jeremy's referral: homeowner is customer, Jeremy the
  referrer; LA Contracting's bid invite: LA Contracting is customer.
  `jobs.job_type` is nullable since 038 (Coy, 2026-09-28): the New job sheet
  still requires a type; an automatic job with no hint shows **Type?**.
  **Sort and filter (Coy, 2026-10-04: "a sort button that sorts by date and
  name. And also a filter button that filters for job types and city").**
  **Sort** (Newest · Oldest · Last moved · Name A–Z) and **Filter** — job type
  (with Type?) and city, each with counts, any of each — with the filters in
  use as chips (×, Clear) and "N of M jobs"; remembered on the device
  (`src/lib/jobs/board-view.ts`, tested: a job's city is its own, else read
  from its address after the street).
  **The created date (Coy, 2026-10-04: "The job needs a created date").**
  Each card shows "Created Oct 2" (Central time) beside its tags; the job
  page's customer line ends "· created Oct 2, 2026". The relative time at
  the card's top right is how long it has sat in its stage. The header is 54px + the 38px activity line = `--sc-head` (92px);
  everything under or beside it measures from that variable. The phone footer
  is 58px = `--sc-foot`. A conversation or person page is `.sc-pinned` —
  fixed between the two on a phone — so only its list scrolls and its name bar
  never slides under the header (Coy, 2026-09-28; the old 72px guess left a
  14px gap and a scrolling body).
- **Correcting a person from their page (2026-09-28).** The pencil by the name
  saves Coy's name (`PATCH /api/contacts/[id]/name`, `name_source='human'`) —
  "Gary Davis" on Vance's number came from a contact card Vance texted. **File
  as… / Change bucket** opens the same bucket picker as Threads
  (`src/components/v34/bucket-picker.tsx`) on the plain conversation and the
  customer / vendor page. The plain conversation header is three rows: name
  (wraps to two lines), the facts at full width, then Call · File as · Same
  as · Scope.
- Cash flow is a page (in the Toolbox by default), not a slide-out drawer —
  a side drawer's horizontal swipe fights the ribbon's horizontal swipe.
- Settings opens from the header ☰: **You** (User — your name, ✎ — ·
  Email · Organization and role; 2026-09-30, Coy: the email is not the
  user), **Organisation** (name, logo, people — §2g), **Phone lines**,
  **Appearance**, **Menus**, Sign out. Pricing defaults (margin, O.H., day
  minimum, parish tax rates — §3, §4) are only in Price book → Defaults;
  pay-yourself and recurring overhead are on the **Cash** page. The Settings sheet starts
  under the whole header (`--sc-head`).
- **The header's + is gone too (Coy, 2026-10-01)** — its menu opened under
  Dusty. **Dusty's + (his header) is the create menu:** New chat · New
  customer · New job · Add a receipt or quote · New invoice (off: not built).
  Each opens its own form on the page beside him (`?new=1` / `?receipt=1`,
  or the `sc:create` event when that page is already open); on a phone he
  steps aside. He creates nothing himself — the form is Coy's tap (§6 Dusty:
  read-only toward the business).
- **Sheets open beside Dusty (2026-10-01).** A drawer or modal
  (`.sc-drawer`) opened while Dusty is docked on a desktop sits in the page
  between the rail and his column, never under him.
- **The header's pipeline button is gone (Coy, 2026-09-30)** — the
  Dashboard carries the pipeline. **On a desktop its place, right of 🔍, is
  Dusty's button**: he opens down from the header on the right, and the
  rail has no Dusty item. On a phone he stays in the centre of the footer.
- **Navigation (2026-09-30, Coy).** Pages are listed once in
  `src/lib/v34/pages.ts`: Dashboard · Threads · Jobs · Cash · Contacts · Customers ·
  Price book · Vendors · Documents · Logs. **Phone footer:** three pages Coy
  picks (default Dashboard · Threads · Jobs) around **Dusty in the centre**,
  and **Toolbox** last. The Toolbox is a drawer that rises just above the
  footer (not a list over the page), its icons on the footer's own five
  columns; a page opens between the header and the footer, so Dusty stays
  one tap away. **Desktop rail:** every page, plus a Dusty item, in Coy's
  order. **Settings → Menus** reorders the rail (and the Toolbox) and ticks
  the three footer pages (`src/components/v34/toolbox.tsx`). The **More page
  is gone** — `/dashboard/more` redirects to the Dashboard; Lines and Logs
  keep their addresses.
- **Preferences follow the account (migration 053).** `user_preferences`
  (org, user, `prefs` jsonb < 64 KB), RLS org member AND `user_id =
  auth.uid()`, anon revoked (rehearsed: another user's row refused, a
  stranger sees none). `/api/prefs` GET, PATCH `{key, value}` for `menus`,
  `home`, `pricebook_cols` only; `usePref()` (`src/lib/v34/prefs.ts`) mirrors
  to the browser for the first paint and saves 600 ms after a change.
- **The Dashboard (2026-09-30, Coy: "customizable and will evolve")** is where
  the app lands (`/dashboard`, `src/components/v34/home.tsx`,
  `/api/dashboard/home`). Tiles: **calls today** (inbound calls since
  midnight Central), **new leads** (New lead stage; a job Dusty made counts
  only once accepted), **jobs in progress** and **quoted** (count, and $ from
  each job's budget through the engine — `src/lib/job-totals.ts`: the
  accepted option, else the only one, else "from" the lowest; a job with no
  budget is "no price yet", never $0), **work runway** (crew days of W.I.P.
  work ÷ crew days a month), **cash this month** (payments − receipts) and
  **profit this month** (less the monthly overhead; blank while overhead is
  not entered, since it would overstate). A blank tile shows "—" and says
  why. **Edit** shows, hides and orders tiles (saved to the account).
- **Search (migration 054, 2026-09-30).** The header's 🔍 opens a bar
  across the whole header row on every size, above everything including
  Dusty's docked column (drawn into the page body; Coy, 2026-10-05), with
  the results full width under it (`search-panel.tsx`,
  `/api/search`) over **everything**: people and vendors (name, company,
  email, address, service area, Dusty's status lines), messages (text, call
  summary, transcript), call artifacts, Coy's notes, jobs and files (name,
  note, Dusty's read, the document's text). Stored generated `search_tsv`
  columns with GIN indexes; `sc_search(q, per_kind)` is SECURITY INVOKER
  (RLS decides), execute for `authenticated` only; websearch syntax; 4+
  digits also match phone numbers. Rehearsed: a stranger gets nothing.
- **Files — one place, one name (migration 074, applied 2026-10-03).** Coy:
  *"documents really needs to be renamed 'files' across the board for
  continuity even in the database. The idea is there is one place for
  documents and files and there is a badass search filter system to get
  anything anytime … Jobtread has documents and files. I don't think it's
  needed to have both."* The table every upload lives in is **`files`**
  (was `job_files` — it holds people's, customers' and emails' files too);
  rows, policies, triggers and keys followed the rename, and
  `sc_files_claim`, `sc_plan_sheet_same_job`, `sc_search` and `sc_undo_bid`
  were re-pointed. **`job_files` remains as a view of `files`**
  (security_invoker, anon none) only for the deployed `read-files`,
  `email-intake` and `bid-intake`, whose repo source still names it; each
  moves to `files` at its next redeploy, then the view goes. The storage
  bucket keeps its id `job-files` (bucket ids can't be renamed; nobody sees
  it). The page is **Files** at `/dashboard/files` (`/dashboard/documents`
  redirects, `?file=` and all), the menu key is `files` (a saved menu's
  `documents` maps over), its search is `/api/files/search` (was
  `/api/documents`), and every label says Files. The customer page's
  Documents tab was folded into its Files tab the same day. Not renamed:
  `documents` / `document_events` (sent proposals and their openings since
  migration 075 — not files) and
  `doc_templates` (the proposal's warranty and contract text). Rehearsed
  (rolled back): 18 files before and after, through the view too; the
  service role inserts and updates through the view; a member sees all, a
  stranger none, anon nothing; search still finds files.
  **The filters (2026-10-03, Coy: "start with the search items you
  mentioned, including just whatever name I type in").** The search box finds
  the words in a file (name, note, Dusty's read, its text) **and any name
  typed** — a person, vendor, customer (with its people and jobs) or job
  whose name holds it brings every file filed on them, each row saying
  "Matched: filed on Angelle Concrete Group". Then **Type** (photos · PDFs ·
  other), **Way in** (uploaded · email · texted), **Job**, **Customer**,
  **Vendor**, **Person** (each listing only those with files, with counts),
  **When** (last 7 / 30 days, this year, or between two dates), and the
  category chips as before. Every filter in use is a chip with ×, plus Clear
  all; the whole filter lives in the page's address (`src/lib/files-filter.ts`,
  tested), so a filtered view can be linked. `/api/files/search` takes
  `q kind source job customer contact vendor since from to` and `facets=1`
  for the lists — session client, a typed name stripped of wildcards before
  it reaches a pattern.
  **Laid out like OneDrive (Coy, 2026-10-05: "toggle between photos and files … a left column as a type of file menu for folders … a search bar inside the file page … a filter bar … show the amount of remaining storage").** **Photos | Files** at the top: Photos is the filter's `kind=image`, drawn as a grid of thumbnails by month (Central time); Files is everything, photos included, as a list (a table — Name · Filed on · Size · Added — when there is room). The **folder column** on the left (≥ 900px measured; a drawer behind ☰ on a phone): All files, Recent (last 30 days), each kind (Plans, Specs, Bid invites, Vendor quotes, Receipts, Contracts, Photos, Proposals, Emails, Other, Unfiled), then Jobs · Customers · Vendors · People, each opening to every one with files and its count. Folders aren't stored: each sets the one filter's where to look (category, job, customer, vendor, person or since) and clears the other places, keeping the words, type, way in and dates (`folderPatch()` / `activeFolder()`, `src/lib/files-view.ts`, tested), so the address still carries the view. The search bar sits at the top of the content; the filters are one bar of drop-downs with the ones in use as chips (×, Clear all). **Storage** under the folders: "37.4 MB used of 1 GB · 987 MB left" with a bar, amber from 80%, red when full. `GET /api/files/storage` (session client) adds up `files.byte_size` for files not deleted and `message_media.byte_size` for texted files once stored, against `STORAGE_LIMIT_GB` (server side, default 1, Supabase's free plan). Call recordings, logos and proposal pictures aren't counted: nothing records their size. On a customer's Files tab the column stays, its customer stays pinned, and the folder lists are that customer's alone.
- **Documents (2026-09-30)** — `/dashboard/documents`
  (`src/components/v34/documents.tsx`, `/api/documents`): every uploaded file,
  newest first, searched through the same index, filtered by category (or
  Unfiled), job, person and date; tap for the files viewer, with links to its
  job and person. `?file=` opens one (search results link here). **Final
  proposals** are listed above the files (chip Proposals; number, job,
  customer, total — `job_proposals` with `status='final'`, read from their
  snapshots), each opening that version. **Emails** (migration 061, §2h):
  the mirrored inbox, unfiled first, each opening a sheet to file it.
  Texted photos stay on the person's page.
- Legend collapses to a chip.
- **Desktop (lg+, 2026-09-27)** takes its LAYOUT from the Claude Design desktop
  screens and its LOOK from v34 (Barlow Condensed / IBM Plex, hi-viz orange) —
  one design system, not two. The footer becomes a left rail. **The desktop
  header (2026-09-30, Coy):** logo │ Dusty's activity line on the same row,
  then 🔍 · pipeline · + · ☰ — no phone number, no "unnamed", no drift
  counter (drift is on Logs). `--sc-head` is 54px on a desktop (the line
  lives in the header) and 92px on a phone (the line is the row beneath).
  Threads
  is list · conversation · contact rail. **No dead margins (2026-09-29):** the
  customer / vendor page fills its pane — conversation on the left at full
  height, Next steps · Jobs · About in a 340px column on the right (the
  design's 1d) — whenever the pane is at least 880px wide, measured
  (`src/lib/v34/use-wide.ts`), not by breakpoint; narrower (a phone, or Dusty
  docked) it is the single column with tabs. The plain conversation's contact
  rail follows the same rule at 920px and carries Dusty's status line. The desktop design calls the list
  "Triage"; that word is not used — it is **Threads**, where every channel for
  a contact merges into one conversation.
- **Colour themes (2026-09-30, Claude Design handoff,
  `design/customer-and-themes/themes`).** Settings (☰) → **Appearance**:
  **Site Office** (default), **Blueprint**, **Kraft Yard**, **Night Shift**
  (dark), and since 2026-10-02 (themes v2, Claude Design) **Steel**,
  **Signal**, **Plex Office** and **Kraft (clean)**. **A theme carries its
  typefaces too** (`Theme.font`: display, body, strong, light, hand →
  `--sc-font-*`; the `disp` / `body` / … tokens read those variables, and the
  dashboard's base text is the theme's body face — IBM Plex Sans in Site
  Office, where it was Outfit; Barlow, Archivo, Atkinson Hyperlegible in the
  new ones). The wordmark keeps its own fixed letters, and chat bubbles keep
  Coy's muted colours (`DA` in `conversation.tsx`) rather than the handoff's
  `outBg`. `src/lib/v34/themes.ts` holds them; `v34-shell.css` carries each as
  `--sc-*` variables under `html[data-theme]` (generated from `themes.ts`);
  an inline script in `app/layout.tsx` sets `data-theme` from
  `localStorage` before first paint, and `useTheme()`
  (`theme-picker.tsx`) saves the choice to the account (`usePref("theme")`,
  migration 053). **Every `T.x` is a CSS variable**, so every screen follows
  with no branching; the *Dim fills the themes don't name are mixed from
  their colour and the card; `T.dark` stays dark (job money panels, white
  text) in every theme. Rules that keep dark themes readable: no hard-coded
  white backgrounds (`T.card`), text on the accent is `T.onHiviz` (dark in
  Night Shift), SVG icons draw in `currentColor`. The rail, paper header,
  wordmark (`--sc-hatch`, `--sc-guide`, `--sc-crete`) and chat bubbles
  (`T.sunk` / `T.outBg`) follow the theme.
- **Contact, customer and vendor pages look the same (Coy, 2026-10-05: "This 'contact' page is a mess … I would rather have consistent formatting across contact, customer and vendor … Really a contact needs to become a customer or vendor or spam anyway").** The customer page's parts moved into one module, `record-page.tsx`: ‹ back · name and role tag · the button row (folded into ⋯ on a phone) · the facts line · one row of tabs, then the Overview with a 400px right column (Location, the facts, Recent), contact cards with a line per number and email and Open in Threads ›, thread chips, panel titles and empty states. The customer page, a contact's own page (`?person=1`, `person-view.tsx`) and the vendor page (`/dashboard/vendors/[id]`) all use it. **A contact:** ‹ Back to the thread, the name with its pencil, the role tag (tap to change the bucket), Customer page › when they have one, Edit (name and address), New job, Ask Dusty; under ⋯ Call notes, File as… / Change bucket, Same person as…, Archive. Tabs Overview · Next steps · Jobs · Threads · Timeline · Files. While they are unsorted or filed by Dusty, the four buckets sit right under the header (Dusty's guess dashed, or Keep / Not X), since filing them is what the page is for. The Overview has Dusty's read, their card, next steps, jobs and the threads they're in. Files is the Files page pinned to them, with + Add files. **A vendor:** the same page, with Prices (★ = the price budgets use; their cards under it) and Receipts & quotes after Overview, + Receipt or quote as the main button, Edit as the vendor form, and Delete vendor under ⋯. `?person=1` for a vendor goes to their vendor page, which is their one page now; the vendor page's back link returns to the thread when opened from one. No API or data change.
  **The customer page's Threads tab (Coy, 2026-10-05: "supposed to be more useful … pull information from the thread into here. maybe a summary").** A card per person on the customer: Dusty's line on where it stands and on the latest conversations, their last three calls and texts (summary or words), last heard, Open in Threads › and "Every call and text in Timeline ›"; then the threads they're in. The "Not in any thread you made…" line is gone.
- **The customer page, reshaped (Threads v2 handoff §4, 2026-10-03).** "‹
  Back to the thread" when opened from Threads (else "‹ Customers"); name
  and role tag; **Edit · New job · Ask Dusty** (Call notes and Delete under
  ⋯); "Residential · since Sep 22 · 2 contacts · 1 job · $11,240 quoted".
  Tabs **Overview · Contacts · Jobs · Threads · Files**, then **Timeline**
  (the merged calls and texts with call notes, as before), **Payments**,
  **Schedule**. **Documents is gone** — Coy: *"documents and files are
  redundantly copying the same things over in each spot … a 'files' tab is
  the best one to keep"*; Files is the Files page itself pinned to the
  customer (its people's and jobs' files, `FilesPage` with `fixed` /
  `embedded`) — the same search, any name typed, chips and filters (2026-10-04)
  — and **+ Add files**. Overview: contact cards (initials,
  Primary, a line per number and email, **Open in Threads ›**), the jobs with
  their price, **Threads these contacts are in** (their bucket and every
  thread Coy made that holds one of them), and on the right the location and
  **Recent, across every contact and channel**. On a phone: the map, then
  contacts as rows with Threads ›, jobs, the thread chips. The second icon
  rail for the tabs is gone; one row of tabs on every size. What follows
  below about the old tabs is history.
- **The customer page (2026-09-30, migration 055)** —
  `/dashboard/customers/[customerId]` (`src/components/v34/customer-page.tsx`)
  and the **Customers list** `/dashboard/customers` (one row per customer,
  not per person; the rail's Customers item). **The list (2026-10-01, Coy):**
  type chips with counts (Residential · Commercial · Government · Type?) and
  a job-stage filter; views **Table** (wide: sort by any column; **Columns ▾**
  — last communication, recent conversations, first / last contact, contact,
  phone, email, address, city, state, zip, contacts, jobs, source, customer
  since), **Cards** (the phone's, with a sort) and **Board** (by the Jobs
  board's stage of their jobs, plus No job); view, sort and columns saved
  to the account (`customers_view`). **+ New customer** (`POST
  /api/customers`: a named customer, its contact filed customer through
  `sc_classify_contact`, the address as Coy's; a phone or email already on a
  contact is a 409 naming them). **No unnamed customers:** a customer's name
  is its own, else its people's — a name that is only a phone number (how
  `sc_classify_contact` names one made for an unnamed number) is no name;
  with none it is not listed, and the list says how many are waiting with
  a link to name each. A contact filed customer,
  opened from Threads, lands on its customer's page, Threads tab, filtered to
  them (`?person=1` keeps the person page). **Header:** CUSTOMER · name
  (Lexend) · address · contacts · jobs · since; Call · Text · Email · Edit ·
  **+ New scope** (a job for the primary contact, filed on the customer).
  **Tabs:** Details (Dusty's summary, job cards with Quote/Paid/Open or
  Invoiced/Paid/Open from the budget and payments, the newest four across
  channels) · **Threads** (every contact's calls and texts in one timeline,
  oldest at top, opening at the bottom; channel and contact filters with
  counts; the green phone button by each contact is the only Call control;
  call cards: Dusty's summary → next steps → recording → transcript on tap →
  **notes on that call** (`POST /api/messages/[id]/notes`); the message box
  only when Texts is picked; **Emails** lists the customer's mirrored emails,
  §2h) · Jobs ·
  Documents (`/api/documents?customer=`) · Payments · Files (on the primary
  contact) · Schedule — each says what is missing when empty. **Right panel
  (440px; on a phone the top of Details):** Location (address with Copy and
  Open in Maps; the map and street view only with
  `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`, street view only once
  `GOOGLE_MAPS_GEOCODE_KEY` has placed the address — neither is set yet, and
  the keyless embed is never used), the customer's facts (Edit), and
  **Contacts** — each with role, ★ Primary, one line per number or email
  (Call · Text), Make primary, Remove from customer, and **+ Add contact**
  (search, attach, Undo). APIs: `/api/customers`, `/api/customers/[id]`
  (GET/PATCH), `…/contacts` (search, attach), `…/contacts/[contactId]`
  (role, primary, detach), `…/timeline`, `/api/customer-moves/[id]/undo` —
  session client, org from the session. Dusty's "customer" context is the
  customer: its facts, every contact's block and their latest messages.
- **Site Office palette and wordmark (2026-09-30, Claude Design handoff,
  `design/palette-logo/`) — now the default theme.** Cream
  ground `#FBF6EC`, warm ink, terracotta accent `#B85A3C` (soft `#D97757`,
  text `#9A4527`); buckets Customer `#2F8A5B` · Vendor `#1E5AA8` · Personal
  `#6A55B0` · Spam `#B5412C` · Unsorted = accent. All of it is `T` in
  `src/lib/v34/tokens.ts` (same keys, so every screen follows), plus
  `LOGO_ACCENT` (the orange alternative), `BUCKET` and the font stacks
  `strong` (Lexend), `light` (Inter 300), `hand` (Kalam — Dusty's voice).
  **Header** is draft paper (`.sc-paper`, pencil-outlined `.sc-paper-btn`)
  with the **wordmark** (`src/components/v34/wordmark.tsx`: hatched "scope",
  thin orange "crete", Kalam ".ai"); the activity line (Inter 300, below) and
  its drop-down, like the pipeline and create drop-downs, is a white card.
  **Paper is the logo row only (Coy, 2026-09-30):** the activity line is set
  in the face of "crete" (Inter 300), and on a phone its own row is a solid
  `--sc-paper` with no grid (`.sc-activity-row`).
  The **rail is light** (`T.rail` `#F3ECDD`, no icon invert, active = white
  with a `#D97757` edge). One deviation from the handoff: it put the rail
  colour in `T.dark`, but the job page's money strip and takeoff rail use
  `T.dark` with white text — so the rail has its own key and `dark` stays
  dark (warm `#2A2A2A`). Fonts load from Google Fonts in `v34-shell.css`
  (before this, Barlow and Plex were named but never loaded on the
  dashboard). Type roles beyond the header and activity line (Lexend names
  and numbers, Inter panel titles) wait for Coy's feedback.
- **Dusty is the Scopecrete Lander (2026-10-04, Claude Design package,
  `design/dusty-lander/`; was the pixel foreman of 2026-09-30).** A hatched
  concrete block on steel legs, green-light eyes, a dish antenna and an
  orange ring. He lives in two places only: the **centre of the phone
  footer** (the header button on a desktop) and the **chat**.
  `src/components/v34/dusty-avatar.tsx` draws him inline from `dustySvg()`
  (`src/lib/v34/dusty-svg.ts`, a typed port of the package's `dusty.js`;
  ids from `useId()` so server and browser agree; its reduced-motion rule
  scoped to `svg[data-dusty]`); the drawings are also in
  `public/dusty/lander/` (240px, `-24` with heavier strokes, a 512px PNG).
  States come from real events only: **idle** (still at 24px and under),
  **loading** → listen (a chat loading, a voice note), **calculating** →
  sort (a reply streaming, the reader reading), **thinking** → scan,
  **done** → celebrate once then idle, **error** → alert (amber eyes) for a
  moment then idle; the package's own land and sleep exist, unused yet.
  `prefers-reduced-motion` stills him. In the chat: 96px when empty, 32px in
  the message bar once a chat is going. **The favicon and app icon are the
  ScopeCrete emblem** (Coy, 2026-10-05: "the emblem used as the favicon for
  the landing page, login page, and all the dashboards") — still, from his
  emblem pack: `public/favicon.ico` / `favicon.svg` / `apple-touch-icon.png`
  / `icon-192`·`512.png` and `site.webmanifest`, set once in
  `app/layout.tsx`. The pixel sprites stay in `public/dusty/` unused.
- **Dusty on the phone (Coy, 2026-10-05, notes from his phone).** The
  footer's centre Dusty is 40px in a 54px disc that rises above the 58px bar
  (`.sc-tab-dusty`), larger than the page icons beside him. On a phone the
  chat covers the whole screen, the header included (`.sc-dusty-sheet` top 0,
  safe-area padded); × closes it. The desktop dock is unchanged. The chat
  header has no "What's new?" button (the catch-up code is gone; saved
  catch-ups still open from history); "Looking at:" is 👀, and a chat's label
  drops its "scope:" prefix. **Text size:** "Aa" in the chat header (Small ·
  Normal · Large · Extra large, 0.88–1.3× via CSS `zoom` on the conversation),
  saved per account (`dusty_font`). Dusty sits at the bottom left of the
  message bar (36px), always there while the chat is open, in his live state;
  the 96px empty-state and 32px sprites are gone.
- **Hide the thought line (Coy, 2026-10-05: "it can be distracting").**
  Settings → **Dusty (AI)** → **Show Dusty's thought line**, **On a phone**
  and **On a desktop** apart (Coy, same day: "off on mobile and on on
  desktop") — `activity_line_phone` and `activity_line`, default on; the
  phone's follows the desktop's until it is set. Off on a phone,
  `html[data-activity-phone="off"]` makes `--sc-head` 54px, set before first
  paint by `app/layout.tsx` from the `sc:prefs` copy. Reminders, "is back", tags,
  proposal openings, bid notices and the reader-down warning only show on
  that line, so they go with it.
- **Dusty answers in Markdown (2026-09-30).** Coy: *"showing the
  calculations in .md format in the chat panel."* His prompt asks for
  lists, bold and, for a job, a table per area (area · qty · cost · O.H. ·
  margin · price) from the budget; `src/lib/markdown.ts` (tested) turns it
  into a tree and `markdown.tsx` renders it with React elements only — no
  HTML from a reply ever reaches the page.
- **The job page, 2026-09-30:** "Why this job" is an **ⓘ** in the header
  that opens it in a sheet. Each section has **Photos** under its
  dimensions — a camera button (several shots on a phone) filing each photo
  on that section (`job_files.section_id`, `section-photos.tsx`). Since
  2026-10-05 (Coy's toolbar notes) its buttons are **Copy** (photos on the job
  or texted, ticked onto the area), **Upload** (the device's files) and
  **Camera** — the camera in the page (`getUserMedia`, back camera): shoot
  several, × drops one, **Add N photos** uploads them together; no camera or
  refused → the phone's own camera. The section's plan sheets row sits under
  its photos; its Notes mic is the icon alone (a spinner while it writes it
  down); the budget's sales tax is "Sales tax 10.5% ⓘ", where it came from
  behind the ⓘ; and the proposal's Tax line chip reads "Tax · off in the
  budget" when the budget's tax is off (there is nothing to show or fold),
  a tap turning it on. While
  Dusty is docked on a desktop, the job's totals move **into his panel**
  (`#sc-dusty-slot`, `use-dusty-docked.ts`), folded to one line, and the
  page drops its right column.
- **The customer page header, 2026-09-30:** one row — "CUSTOMER | Maurice
  Watkins" (Lexend 18) with "1 contact · 1 job" beside it (contact → Details
  at Contacts; job → Jobs); Dusty's summary in Inter 300. **On a desktop the
  seven tabs are a second icon rail** beside the main one (`sub-rail.tsx`,
  72px, Details first) — the main rail picks the page, this one the
  sub-page; the phone keeps its row of tabs.
- Dusty has two entry points: COLD from the footer (no job context) and HOT
  from a page (that page preloaded). The chat's header is one line (Coy,
  2026-10-02): **"Looking at: <the job>"** when HOT, else the chat's title
  ("New chat").
- **Voice messages and attachments (2026-10-01).** An empty message box
  offers the **mic** (Telegram's way; typing turns it into Ask): it records
  at once with a breathing red dot, the time and a live level meter
  (`voice-recorder.tsx`), × throws it away, ➤ sends the audio to
  `/api/dusty/transcribe` (Groq Whisper, `GROQ_API_KEY`; nothing kept) and
  the words go to Dusty as the question. Three minutes at most. **+** left
  of the box attaches photos and files: uploaded through `/api/files` onto
  what the chat is about (the job, the person, the customer —
  `job_files.customer_id`), else unfiled in Documents (`from_dusty`); the
  question carries their ids and Dusty is given each one's read, or told it
  isn't read yet (the background reader reads it within minutes).
  **A photo he looks at himself (Coy, 2026-10-04: "I shared a screenshot …
  he said it will take a couple of minutes to read the screenshot and never
  responded").** An attached JPEG, PNG, WebP or GIF of 5 MB or less that the
  reader hasn't read yet is sent to the model as an image with that question
  (up to four; `seeableMime()`, `src/lib/dusty/see.ts`, tested), so he
  answers about it in the same reply — a screenshot of ScopeCrete is read as
  the screen. HEIC, PDFs and anything larger still wait for the reader.
  **The chat keeps its files (migration 079, applied 2026-10-04 on Coy's
  "apply 079"; checked after: the column, its ≤ 8 check, RLS unchanged — Coy 2026-10-04: "the chat
  history should at least keep the summary of the image that he read. We'll
  need to have a place for the photos uploaded to dusty to be saved in the
  database").** The uploads were already `files` rows (on what the chat is
  about, else unfiled `from_dusty`); `dusty_messages.file_ids` (≤ 8, nullable)
  now says which question carried them. Every later turn gives Dusty FILES
  ATTACHED EARLIER IN THIS CHAT — each by name and `file <id>` with the
  background reader's summary, facts and text once it has read it (within
  minutes), and the photo itself again while it hasn't (the four-image cap,
  this question's first) — so a follow-up question still knows what was in
  the picture. A reopened chat shows each question's photos as thumbnails
  (`/api/dusty/conversations/[id]` signs them), each opening in Files. Before
  079 is applied the route reads and writes without the column. **Dusty files
  them where Coy says** — plan steps `new_customer` (key `cust1`; name,
  type, person, phone, email, address only as said or written; through `POST
  /api/customers`, which now returns its person), `new_job` (now with a key
  `job1`, and `contact` may be `cust1`) and `file` {files, kind customer |
  contact | job, a full id or a key} → `PATCH /api/files/[id] {file_to}`, a
  move (the file leaves the job or person it was on; an old job's area and
  takeoff go; a file on no job leaves the Plan Room). The card lists the
  files' real names and where they go; Coy's tap applies it.
- **Dusty v1 (2026-09-27)** is wired: `src/components/v34/dusty-panel.tsx`
  rises from the footer on a phone and slides in from the right on desktop.
  It is HOT on whatever screen is open — a thread, a scope, a customer, or
  cost settings — and COLD anywhere else; the header says which. The browser
  sends only `{kind, id}` from its route; `/api/dusty` fetches the facts itself
  under the session (`src/lib/dusty/context.ts`), so RLS decides what Dusty can
  see and nothing typed in the browser becomes "context". Scope answers use
  the engine's own output, so Dusty quotes exactly the builder's numbers or
  names what blocks them. **Read-only toward the business:** no tools, no
  record changed, nothing sent — drafts come back as text to copy; on a job,
  a budget plan comes back as steps Coy applies with a tap (§3).
  **Docked on the right on a desktop (2026-09-29, Coy: "integrated into the
  main dashboard neatly so that I can see the rest of the dashboard").** At
  lg+ Dusty is a 400px column (`--sc-dusty`) under the header, no backdrop;
  `<main>` gains `.sc-with-dusty` (padding-right) so the page beside him stays
  whole and usable. He stays HOT on the page that is open; a continued chat
  about something else offers "Ask about this page instead". History is behind
  ☰ in his header on every size. On a phone he is still the full page below.
  **Beyond the open page (Coy, 2026-10-04: "Dusty has trouble seeing other
  contexts outside of what page is open … He needs to be aware of all phone
  calls, texts, emails, ect").** Every chat, whatever page it started on, now
  also carries BEYOND THE PAGE (`reachBlocks()` / `renderReach()` in
  `src/lib/dusty/context.ts`, ~45k characters, oldest lines trimmed first):
  everyone, every customer (with its people) and every job **named in the
  question** or Coy's last three messages (`mentioned()`,
  `src/lib/dusty/mentions.ts`, tested: a whole name, or a surname /
  distinctive first name of 4+ letters that isn't an everyday or trade word;
  a shared first name brings all who have it) — who they are, their last 40
  calls (Quo's summaries and next steps) and texts, Coy's notes, emails filed
  on them, their files' reads; **a search of everything** for the question's
  words (`sc_search` over people, texts, call summaries and transcripts,
  notes, jobs and files, OR'd, plus email subjects and text); and the last
  five days of calls and texts with the intake inbox (a cold chat already
  had three days of them). Under the session, like the rest; the prompt
  tells him never to say he can only see the open page.
  **People on customers, and names (Coy, 2026-10-05: "The actual customer
  name is Icon Technologies … John … is just a contact that's inside this
  customer. Can you fix it?").** Dusty had no step for it: his plan made a
  NEW customer with John's phone (which `POST /api/customers` refuses as a
  duplicate) and a `move_contact` step that doesn't exist. Now `new_customer`
  takes `contact` — someone already in the CONTEXT becomes its person (filed
  customer, primary; their own one-person customer renamed; 409 if they are
  on a customer with other people) — `attach_contact` {contact, customer
  full id or cust1} goes through the customer page's + Add contact
  (`sc_attach_contact`), and `set_name` {contact | customer} through the
  pencil and the customer's Edit. A customer has no phone column, so a
  company's office number is a contact on it: `new_contact` {customer, name,
  phone or email, label} — only one Coy gave or the context shows (he is told
  he can't look numbers up or search the web, and to ask) — through `POST
  /api/contacts` (filed customer) then + Add contact. Threads and the person
  page now show a business customer's name beside its person ("Icon
  Technologies" on John Freeling's row; `company` on `/api/threads` and
  `/api/people/[id]`). Tested in `tests/dusty-plan.test.mjs`.
  The prompt now says he is Dusty only, has no tools, files or sessions of
  his own, never narrates looking things up or names his setup, and takes
  Coy's word and spelling instead of asking him to confirm it.
  **No ids in his words (2026-10-05).** Asked whether a text from (727)
  628-9657 came in, he answered with "contact dd08251b-…". Ids are for plans
  only: the prompt says to name people (or give the number when there is no
  name), and the chat takes any full id, or an 8-character ref with "…",
  out of what is shown along with its "contact" / "(customer …)" label
  (`hideIds()` in `plan.ts`, tested); the plan block keeps its ids.
  **Hermes ran him as an agent with tools (seen 2026-10-05).** His answer
  read Hermes's own `state.db`, hit Hermes's command guard ("an error from my
  own security layer"), narrated each step, and said "I'm Coy, not Dusty" —
  Hermes's own persona and memory talking. That is the VPS's Hermes serving
  `/v1/chat/completions` with its toolsets, memory and persona on, which this
  section already forbids: the context carries customer texts, and a text
  can carry instructions to an agent with a terminal. Fix on the VPS: serve
  Dusty from a Hermes with no tools, no memory and no persona files (its own
  profile and port), or a plain pass-through to the model. Nothing in the
  app can turn those off.
  **The catch-up (2026-09-29; since 2026-09-30 the chat's "What's new?"
  button, the header emblem being gone)** asks "What's new since I last looked?" with context kind
  `activity` (migration 044): `activityContext()` reads, under RLS, who got in
  touch since this device's last catch-up (`localStorage`, clamped to 7 days,
  default 24 h) with Dusty's status lines, spam senders left out; the
  reader's runs; next steps due today or overdue (Central); and the unsorted
  count. Saved as "Catch-up · <date>". It does not make the background reader
  run early (that needs the worker token, which no browser request may reach).
  The logo goes to the Dashboard; the footer Dusty just opens the chat.
  **Full screen, and kept (migration 043, Coy 2026-09-28: "reference older
  conversations in a side project panel to select and continue").** Dusty is a
  page under the header, over the footer (v34 DustyScreen): header with
  hamburger, title, "Looking at …", + and ×; the history rail slides in from
  the LEFT on a phone and stays open on a desktop, grouped *About this
  person/job* · People · Jobs · Everything else; answers read like a page —
  the question as a heading, the answer full width, Copy under it.
  `dusty_conversations` / `dusty_messages` are private to the person (RLS:
  org member AND `user_id = auth.uid()`; verified a second user sees none).
  `/api/dusty` takes `{question, conversation_id?}`, reads the history from
  the database — never from the browser — and a continued chat keeps the
  context it started with. Opening Dusty on a person or job picks up the
  latest chat about them. **The model runs in the Hermes container on the VPS**
  (§8), reached over Tailscale Funnel at `HERMES_URL` with `HERMES_API_KEY`
  (OpenAI-compatible chat completions; Hermes routes via OpenRouter, model
  `HERMES_MODEL`, default `anthropic/claude-haiku-4.5` since 2026-09-28 — 3.5-haiku began returning empty 200s). No
  model-provider key lives in Vercel — except `GROQ_API_KEY`, for speech to
  text only (section dictation, above). The Vercel route stays the only thing
  that touches customer data — Hermes sees only the context the route sends.
  Hermes must serve Dusty with its tools OFF: the context carries customer
  texts, and a text can carry instructions. The old `/api/chat/dusty` — an
  unauthenticated relay to a private-IP Ollama box — is deleted.
- **Dusty's activity line (2026-09-27)** sits under the header on every
  screen (`src/components/v34/activity-line.tsx`, `/api/activity`). v34's
  StreamBar, fed by hardcoded DREAM_LINES, was never ported; this replaces it
  with **real rows only** — each line is a `contact_enrich_runs` row (reading,
  named, suggested, couldn't read), the waiting count, or the heartbeat. **Each
  new thing shows once per device, then leaves the line** (Coy, 2026-09-28:
  "don't be redundant"; reminders once a day); with nothing new it shows
  Dusty's unseen **musings** (above), then "All caught up · last read …". Tap
  to drop down the last ~20 with detail, each linking to its thread. A reader that isn't working
  (not configured, Hermes unreachable, error, silent >15 min) **pins** the line
  in amber and stops the cycling. The dot pulses only while a read is running
  or a Dusty reply is streaming. Idle says when something last happened; it
  never invents something happening now. **No bubble (2026-09-28):** the
  words sit on the grey glass row and type in letter by letter; a streaming
  Dusty reply shows its own tokens. **The dot says what kind of work
  (2026-09-30):** blue, slow glow — reading someone; amber, quick — Dusty
  answering; green, one blink — just named or filed; red, steady — the
  reader isn't working; grey — idle. Reduced motion stills it. **Since 2026-10-02 it
  is a diamond** that always glows (idle a slow grey breath), with a small
  arrow under it — the expand button; the chevron on the right is gone so
  musings get the whole width (Coy). **Since 2026-10-05 it is six small
  square dots** — green, orange, blue, twice — lighting one after another
  (Coy: "6 little square dots 3 different colors blinking in this order"),
  sitting low, level with the logo's ".ai"; quick while Dusty answers, slower
  while he reads, a slow pass at idle, all lit and steady when the reader
  isn't working (`Dots` in `activity-line.tsx`, `.sc-dots`); the whole line
  is the expand button. On a desktop
  the line sits in the header beside the logo and its drop-down is ~560px
  wide under it; on a phone it is the row under the header. The emblem and
  the line from it are gone; while a read runs the footer Dusty shows the
  mixer. **On a desktop it takes all the header's room up to the buttons**
  (2026-10-02, Coy: "there is enough room … don't cut it off"; it was capped
  at 720px with an empty spacer beside it). The words aren't cut before they
  reach it either: `/api/activity` clipped file names to 40 characters
  ("Reading 2635 Walker High Dugouts Specs 2026 08……"); its one-line
  summaries now carry up to ~140–220 characters and the line trims to the
  room it has.
  **Dusty's type is Figtree (Coy, 2026-10-05: "change the font for
  everything dusty write to Figtree … even the thoughts in the header";
  JetBrains Mono since 2026-10-02 before that)** — the activity line, its
  drop-down and thoughts, and the chat (questions, answers at 14px, his
  plans, the message box), in every theme (`agent` in `tokens.ts` →
  `--sc-font-agent`, next/font's `--font-agent`). Machine text on Lines and
  Logs (event types, webhook URLs, payloads) stays JetBrains Mono
  (`--sc-font-code`). Buttons and
  headers keep the theme's faces. **The drop-down comes down over
  everything** — the plan sheets panel, Dusty, any sheet: while it is open
  the header's layer is lifted (`html[data-head-drop] .sc-head-wrap`).
  **Thoughts can be read, traced and talked about (Coy, 2026-10-02: "this
  thought can be found nowhere in the dropdown and it doesn't scroll … it
  would be more interesting if I knew what the thought was being processed
  from … and maybe even comment on it in the dusty chat").** A line too long
  for its row, once typed, slides to its end, rests and slides back
  (`.sc-typed[data-marq]`, 40 px/s, measured on the DOM — no React state;
  still under reduced motion), and stays up long enough to slide through
  twice (`lingerMs()`, at least 20 s for a thought). The drop-down opens
  with **Dusty's thoughts**: each musing and dream in full, newest first,
  with where it came from — "From reading Dylan Ordoyne's calls and texts",
  or "A dream about Mon, Sep 28's calls and texts — Amber, Luis"
  (`/api/activity`). Tapping one goes to that person's page and opens Dusty
  there with `About your thought — "…" —` in his message box; his context on
  a person carries his own recent thoughts and dreams about them, so he can
  say what in the conversation it came from. **On a phone Dusty's chat
  covers the activity row** (it starts under the logo row, `.sc-dusty-sheet`
  at 54px) — his sprite in the message bar already says what he is doing.
- **Loading faster (Coy, 2026-10-05: "How can we get the app to load
  faster").** Measured that day: the database answered in IAD beside the
  functions, but every RLS read ran `get_user_org_ids()` once per row — it was
  plpgsql with no volatility, so VOLATILE, and no org_id index could be used
  (four list reads as Coy: 49.8 ms; STABLE: 10.9 ms). **Migration 083** marks
  it STABLE (waits on Coy's "apply 083"). Every API call checked the session
  with `auth.getUser()`, a round trip to Supabase Auth (p50 25 ms, p90 ~180
  ms), then `sc_my_orgs`, then `org_members`, one after another;
  `getApiSession()` now verifies the token locally with `getClaims()` (the
  project signs with published keys; the database checks the same signature on
  every query) and, on an org's address, takes the membership from
  `sc_my_orgs` alone — one round trip. `/api/session/me`, which the header
  waits on, runs its five reads side by side, and `/api/activity` (every 20 s)
  its six. The Threads badge and drift dot are read at most every 30 s, not on
  every page change. supabase-js and the search panel load only when needed:
  the dashboard's first JavaScript went 1,086 → 843 KB (320 → 257 KB gzipped).
  Not done: a service worker (the PWA has none, §8), so every launch fetches
  the page and its data afresh.
- **Taps stay quick (2026-09-30, Coy's interaction timing: INP 1,056 ms,
  976 ms of it input delay).** The activity line typed by setting React
  state every 18 ms and re-laid-out the page per letter; it now types with
  one stepped CSS clip (`.sc-typed`) on its own layer, the button is
  `contain: strict`. Dusty's streamed reply reaches the line through a small
  store (`src/lib/v34/dusty-live.ts`), not layout state, and tokens are
  drawn once per frame; earlier answers' Markdown is memoised. The Price
  book draws its rows 60 at a time (`ROW_CHUNK`). Measured in the harness at
  4× CPU slowdown: idle long tasks on the Price book 11 → 1 in 5 s, its
  biggest load task 775 → ~230 ms, every tap under 200 ms. Don't put
  per-frame or per-token state in `dashboard/layout.tsx`.
- **Chat bubbles are muted (2026-09-29, Coy: "easy on the eyes"):** theirs
  warm paper `#F7F6F2`, ours soft slate `#D8E1E8`, ink text on both
  (`DA.bubbleIn` / `DA.bubbleOut` in `conversation.tsx`). Hi-viz orange is
  for actions, not for our own words.
- Dusty conversations persist and are resumable (above), grouped by the
  person or job they are about.
- **Files panel (2026-09-29)** — `src/components/v34/files-panel.tsx` on the
  job page (under the sections) and the customer / vendor page (right column
  when wide, a Files tab when narrow): Add photos / files (camera or library,
  many at once; drag and drop on a desktop) with progress and retry; a grid
  filtered All · Photos · Documents · From texts; tap for the viewer — name,
  what it is, area, note, Show on proposal, delete, and Dusty's read.
- **Price book (2026-09-29)** — `src/components/v34/price-book.tsx`. On the
  desktop rail after Customers, and in the Toolbox on a phone; Cost settings
  links to it (one editor), and a vendor's page keeps its Prices door. No line of explanation under the title (Coy, 2026-10-05).
  Find, **By group · By vendor** (remembered per device), Show retired.
  **Wide (≥900px measured): a spreadsheet** — Item · Vendor (or Group) ·
  Item # · Type · Unit · Unit cost · Markup · Taxed · Counted on a job ·
  Price date · From; cost, markup and taxed edited in the cell (a cost typed
  there is stamped today, "typed"); a price older than 90 days says **old**.
  Narrow: cards. The card sheet shows **Price history** (date, price, ▲▼ %,
  from where). **Import ▾** opens the import (`price-import.tsx`) as a wide
  sheet over everything: file → columns and vendors → preview → Import N;
  recent imports sit under the header with **Undo**.
  **Columns (2026-09-30):** drag a header divider to size a column
  (double-click resets it); **Columns ▾** shows or hides any but Item.
  Saved to the account (`pricebook_cols`). The phone view is unchanged.
- **Scope rail with no budget (step 3b).** No lines → just the days box
  (since 2026-10-02, Coy: the orange **No price yet** box and its Assemblies
  button are gone — assemblies load inside the budget's areas — and so is
  the rail's "Read this on the phone" title). With lines → each option's total, cost, O.H.,
  margin, $/sf, and the job minimum (day minimum × days). The section's
  Reinforcement picker lists reinforcement cards and says "default for …"
  when an assembly chose it.
- **Price book → Assemblies (step 3b)** — `src/components/v34/assemblies.tsx`,
  the second tab (`?tab=assemblies`). A row: name, what it applies to
  ("Residential · Driveway", "Any job · Patio", "Loaded by hand"), card
  count, reinforcement, **Auto**. The sheet: name, job type, kind of area,
  "Fill new areas on its own", its cards (no reinforcement dropdown since
  2026-10-01 — Coy; mesh or rebar is a card like any other, and one set
  before shows with × to take it off) (rule and
  cost, a quantity box for typed ones, ×), + Add cards (search), delete.
  The budget's card picker has **Load an assembly** (pick the area first)
  and shows groups folded until you search; lines say "from X" and
  "reinforcement".
- **Vendors (migration 051, Coy 2026-09-29)** — its own page,
  `/dashboard/vendors`, on the desktop rail after Price book and in the Toolbox
  on a phone (`src/components/v34/vendors.tsx`). The list: find, All ·
  Suppliers · Subs · Equipment, each vendor's kind, where they deliver,
  phone, prices, how many items they are default on, newest price,
  receipts; **+ Vendor** (no phone needed) and **+ Add a receipt or quote**
  (the main button). **Delete** on a vendor's page (Coy, 2026-10-04: "Why
  can't I delete a vendor?") — the same restorable delete as their Threads
  page (§6 Archive and delete), with the Why? box. **Dusty is HOT on a
  vendor's page** (it was cold): `/dashboard/vendors/<id>` is that person's
  context, plus a **Vendor** block — their kind, where they deliver, every
  price of theirs in the Price book and the jobs they're on. A vendor's page (`/dashboard/vendors/[id]`) is
  business first: name, kind, area, phone, email, address (Edit), Call,
  Conversation (if they have messages); **Prices** — each item they price
  with their price, date, source, the cheaper/next vendor, and a **★**
  (theirs is the price budgets use; tap to make it so); **Receipts &
  quotes**; **Jobs** they're on. Their Threads page keeps its Prices tab,
  now at THEIR price with ★, linking here to change it.
- **A receipt → the vendor and their prices (2026-09-29)** —
  `src/components/v34/receipt-import.tsx`, from the Vendors list, a
  vendor's page, or Price book → Import → "A receipt, invoice or quote".
  Receipt · Invoice · Quote; **Take a photo** (camera) or **Choose a file**.
  With no vendor chosen it is saved unfiled and Dusty reads who it's from
  (§2e); `matchVendor()` (`src/lib/vendor-match.ts`, tested) matches the
  printed phone, then email (or its domain spelling the vendor's name —
  billing@angellematerials.com is Angelle Materials), then the name, then a
  distinctive first word only one vendor has — never a guess between two.
  Match → "From X", changeable, with "add the phone, email and address from
  it where their page has none". No match → **New vendor** with the details
  as printed and **Create vendor** — nothing is made without the tap; a
  number already on a contact offers to file that contact as vendor
  instead. Then the prices: repeated ticket lines folded to one row per
  item (`collapseLines()`: 10 + 10 + 3 CY → 23 CY on 3 tickets); each row
  matched by `matchItem()` (their item #, the name, a close name with every
  number the same — 3000 is never 4000) and saying **Price change** (old →
  new), **Add their price** (to an item priced by someone else or no one),
  **New item** (type / counted / group, guesses labelled) or **Same**, with
  an item picker to point it elsewhere and **Make default** (ticked for a
  new item or one with no default). Tax is shown as printed, or as
  "$399.74 on $3,807.00 — works out to 10.50% (worked out; no rate
  printed)"; it is not a price and does not change Cost settings. From a
  photo the screen says the prices could not be checked against text.
  **After Coy's first real invoice (2026-09-29):** the drawer's title is the
  document's name (✎ renames it) and its subtitle the vendor's NAME — never
  a phone number. A vendor matched by the number on the invoice but saved
  with no name (Angelle's line was one of his unnamed contacts) gets a Name
  box filled with the invoice's name, saved as Coy's on Next; the match says
  how it matched. The explanation sits behind **ⓘ**. Each row's item is
  found with a **search box** over the Price book (every word in the name,
  group or item #, grouped, 30 at most; + New item first) — never a
  427-item dropdown — and once Coy points Angelle's 8006 at his item, their
  item # is saved on their price, so the next invoice matches by # on its
  own. A new item's name is editable (Dusty's text, title-cased).
- **Price book with vendors (2026-09-29)** — the grid's Vendor column shows
  the default vendor and "+2" when others price the item; **By vendor**
  lists an item under every vendor that prices it, at that vendor's price
  (edited in the cell), ★ on the default. The card sheet: "Unit cost ·
  default vendor's", **Default vendor**, a **Vendors** section (each
  vendor's price, area, item #, date; ★ to switch; × to remove; + another
  vendor's price), **Same item as…** (merge, with Undo), and price history
  naming each price's vendor.
- **Budget (2026-09-29)** — `src/components/v34/job-budget.tsx` under the
  sections on the job page. (Its option bar is gone since 2026-10-05 — one
  price per job, §3.) **Wide (≥900px
  measured): a spreadsheet** — Item · Vendor · Qty · Unit · Unit cost · Ext
  cost · Markup · Unit price · Ext price · Margin · Tax, rows area ▸ cost
  group ▸ line with subtotals, qty / unit cost / markup edited in the cell,
  ƒ = from the rule, ✎ = typed. **Narrow: cost cards** — one per group with
  its total, lines inside, tap a line for its sheet. Footer: tax switch,
  discount, each option's cost / price / total / margin or what blocks it.
  **+ Add from cost cards**: pick the area, search, add a card or a whole
  group, or a one-off line. **The grid only when it fits (2026-10-02):** a table wider than
  its room hid its last columns behind Dusty's docked panel (Coy); when it
  would overflow, the budget shows the cards until it has more room than
  that.
  **Each section holds its own cost items (Coy, 2026-10-04: "the sections
  that are in the budget [should] have the budget line items in the sections
  themselves … The budget below can be an additional costs panel that
  includes the OH and shows a spreadsheet of how the labor, equipment and
  materials add up for all the sections and how the Over Head and profit all
  math out").** A section's card shows its lines — its Price book groups as
  sub-groups, then the items, then the section's total and $/SF — with **+ Add
  items from the Price book** (drawn there by `JobBudget` through a portal
  into the card's slot; no data change, one set of numbers). The panel under
  the sections is **Job totals**: options, **Additional costs · whole job**
  (lines on no section — mobilization, a permit, a pump day; **+ Whole-job
  cost**), tax / O.H. / margin / discount, each option's total, then **How it
  adds up** — a row per cost type (Materials, Labor, Equipment, Subcontract,
  Other) with each section's cost, then cost, O.H., profit and price — and the
  steps Cost → + O.H. → + Profit → Price → + tax − discount → Total (`Rollup`;
  for the option picked, else the first). The profit split and job minimum stay
  under it. **A section's Budget folds (Coy, 2026-10-05: "let the budget panel
  be colapsable")** — ▸ / ▾ Budget on its card hides the lines and keeps the
  section's total and + Add; folded sections are remembered on the device
  (`sc:budget-folded`).
- **The Plan Room (migration 059, 2026-09-30; Claude Design,
  `design/plan-room`).** Coy: *"scopecrete.ai will be a tool for me to do
  takeoffs manually."* (His own Hermes agent reads the bid emails he forwards
  to intake-concrete@agentmail.to; ScopeCrete will only mirror that inbox —
  next.) `/dashboard/scope/[jobId]/plans`, opened from the job header's
  **Plan room** button; the rail's Jobs stays lit and Dusty is HOT on the job.
  Four steps — three since 2026-10-05, when Files and Sheets became one
  **Files** tab (Coy: "one place where planset pdf, photos, images and any
  other file can live"): a folder column (All files · Photos, then the
  sheets by Concrete scope · All drawings · each discipline · Pages to
  read) beside what the folder holds; `?step=sheets` still opens it on the
  sheets. Photos, Aerial and Add plans sit at the far right of the steps'
  row (Coy).
  **Files** — every file on the job; PDFs and images carry **In plan room**
  (`job_files.in_plan_room`); drop plan sets to add them.
  **Sheets** — each in-room PDF is opened in the browser with **pdf.js**
  (`pdfjs-dist` legacy build — the modern one needs JavaScript most browsers
  don't have yet — and its worker from our own bundle, no CDN;
  `src/lib/pdf.ts`). Each page's text is read for its title block
  (`src/lib/plan-sheets.ts`, tested): sheet number, title, discipline from
  the prefix, and the printed scale. A first reading, kept apart from Coy's
  own (`number_source`). Several different scales and none in the title
  block → "set it with the Scale tool". Thumbnails are drawn in memory, never
  stored. **Scanned sets render (2026-10-02):** pdf.js is given its image
  decoders (JBIG2, JPEG 2000 — `wasmUrl`), standard fonts, CMaps and ICC
  profiles from `public/pdfjs/`, copied out of `pdfjs-dist` before
  `dev`/`build` (`scripts/copy-pdfjs-assets.mjs`, not committed); without
  them a scanned drawing was a white page. Burgess Ave's `PLANS.pdf` is 74
  pages, each ONE 1-bit CCITT G4 image of ~10,191 × 6,603 px on a 34×22 in
  sheet — and pdf.js v5 decodes CCITT through the same wasm module, so it
  was blank everywhere (reproduced on a copy of that shape: 0 painted
  pixels without, the drawing with). Phones also refused the ~67 MP image:
  pdf.js is told the canvas limit (`canvasMaxAreaInBytes`; ~16.7 MP on a
  touch device, ~33.5 MP on a desktop) so the worker shrinks it first, and a
  zoomed page canvas is capped the same way (sharpness gives, never the
  picture). `pdf-probe` (edge function, worker token, returns encodings and
  sizes only) is how the file was diagnosed. The Plan Room lists only the
  sheets of files that are **In plan room** (and any sheet with a shape on
  it); taking a file out takes its pages with it.
  **Drawings vs pages to read (Coy, 2026-10-02).** A page bigger than legal
  (longest side ≥ 1,150 pt, so 11×17 half-size sets count) is a drawing:
  measured, scaled, in Takeoff. A letter or legal page bound into a plan
  file is a **page to read** — listed under "Pages to read" and opened in a
  plain reader (fit width, zoom, previous / next), never offered for
  takeoff, unless Coy sets a scale on it (`isDrawing()`, `shared.ts`,
  tested). Coy suggested "no scale found" as the test; it can't be — a
  scanned set never has a readable scale, and those ARE the drawings.
  **Reading scanned sheets — OCR in the browser (migration 064, Coy
  2026-10-02: "option A … I just want to see if I can get some dimensions
  off of plans accurately"; the VPS service, option B, later).** A scan has no
  text, and a Supabase function has ~2 s of CPU, so the Plan Room reads it:
  tesseract.js (worker, LSTM cores and the `best_int` English data copied
  into `public/tesseract/` with pdf.js's files by
  `scripts/copy-static-assets.mjs` — our own origin, no CDN), PSM 11 (sparse
  text), 300 dpi. `src/lib/v34/plan-ocr-runner.ts` is one module-level
  reader (outside React, so it keeps going while Coy moves around the
  dashboard and never re-renders the layout; it stops on a reload, and the
  next Plan Room visit carries on): **1 · title blocks** of every scanned
  drawing — the right strip and bottom band flat, and the right edge turned
  a quarter (DOTD runs the title up the side) — then each sheet's title is
  chosen against the whole set (`chooseTitles()`): what is on ~every sheet
  is boilerplate (the firm, the project, the parish, the engineer, read
  loosely — OCR spells a name several ways), the seal and the review /
  initials boxes are never titles, and flat-vs-sideways is decided once for
  the set by which is lettered bigger; **2 · whole sheets** in 2,400 px tiles
  at 3× (~216 dpi — at 2× table totals were lost), as many parts at once as
  there are readers (three on a desktop, one on a phone), a tile under 60 %
  confidence read again at 4×, civil and structural first; a part that
  takes over 45 s is skipped, the reader restarted, and the sheet says which
  parts weren't read (on the dense profile sheet some parts never finish —
  a longer wait only cost minutes — so such a sheet is read in part). Words are kept in page points (`ocr_words`), the
  text as rows with " | " between columns so a table row reads
  "104+55 | RT | DRIVE | 39" (`ocr_text`), mean confidence (`ocr_conf`).
  **A sheet is read once** (stamped `ocr_title_at` / `ocr_at`); a desktop
  starts the rest on its own, a **phone only on a tap** ("Read the rest" —
  it crashed mobile browsers, Coy 2026-10-02), with no 4× re-reads there;
  **Pause** holds it for the tab; the Plan Room shows "36 of 74 scanned
  sheets read".
  Saved per sheet as it finishes (`POST /api/plan-sheets/[id]/ocr`: never
  over a number or title Coy typed; a printed scale is stored as printed,
  applied only by his tap). **Where it shows:** the activity line (header on
  a desktop, the bar on a phone) — "Reading sheet titles · Burgess Ave … ·
  12 of 74", then "Reading the plans · … · sheet 3 of 74 · part 5/12" — and
  a chip in the Plan Room header; the Sheets step refreshes as titles land.
  **Dusty** gets whole OCR'd sheets (the most concrete-heavy first, ~24k
  characters, the rest listed by sheet), told they are readings off a scan
  — a "+" can read as "4" (104+55 → 104455) — to quote the sheet and have
  Coy check a number there before he prices it. Nothing read is a
  measurement; quantities come from the takeoff. **Checked on Burgess Ave's
  real sheets** (three pages rebuilt from the stored scans with
  `pdf-probe`'s `{"image": n}`, processed in scratch only): titles "TITLE
  SHEET", "SUMMARY TABLES", "PROFILE"; the summary sheet's Proposed Concrete
  Drives table read "TOTAL | 450" (Dylan's email: 450 SY), 426 words at 88 %;
  ~6 s a sheet on a desktop with three readers, ~15 s on a phone's one;
  the dense profile sheet read at 54 % with three parts timed out. Sheet
  numbers on DOTD sets are plain digits ("3"), which the reader does not
  take for a sheet number — they show as p.3. `findDimensions()` finds
  12'-6", 5'-0", 6" in what was read (not the 2 of 1/2") for later use. Discipline filter, "Concrete scope" = civil + structural.
  **The sheets slide in on a phone (Claude Design master package
  2026-10-03, phone drawers §1).** In Takeoff on a phone the drawing gets the
  screen: a row with **☰ Sheets · N** and the current sheet (scale set /
  not), and the sheet list is a drawer that slides over the drawing from the
  left (`SlideDrawer` in `primitives.tsx`: scrim, Esc, a pull tab, swipe to
  open or close, still under reduced motion) — thumbnail with a CONCRETE chip
  for civil and structural, number · title, scale line; a tap picks the sheet
  and closes it. Open on the first visit to a job's Plan Room, closed after
  (`sc:plan-sheets-open:<job>` on the device). The desktop keeps its strip.
  **Takeoff** — the page on a canvas with an SVG layer in PDF points; tools
  Area, Rect, Linear, Count, Cutout, Scale (Auto is shown off: Dusty doesn't
  read drawings). **A sheet's scale is only ever one Coy set** — "Use 1/8" =
  1'-0"" (the printed one, his tap), or two clicks on a known dimension and
  its length; until then nothing drawn there is counted. Groups
  (`takeoff_parameters`: area / linear / count, colour, optional depth) total
  their shapes (`takeoff_measurements`, geometry in points); quantities are
  worked out (`src/lib/takeoff.ts`: shoelace minus cutouts, polyline length,
  count × the sheet's feet per point) and **never stored**. JobTread's tree:
  group row with total (and CY with a depth), a row per shape; the selected
  shape carries a floating label. Full screen; the hint bar floats over the
  drawing so starting a shape never moves the sheet under the next click.
  **Aerial of the site (Coy, 2026-10-03: "take a screenshot of the address
  on Google maps and measure the driveway area" — "mapbox and esri and
  Google if possible").** The Plan Room header's **Aerial** finds the job's
  address (else its customer's; Google's geocoder if its key is set, else
  Mapbox's, else Esri's public one — the result is not stored), shows it
  on **Esri**, **Mapbox** or **Google**, Coy drags to frame it and zooms
  (16–21; Mapbox 22), and **Put it in the Plan Room** saves the frame as a
  one-page PDF on the job, In plan room, with its sheet (`AERIAL`).
  The PDF is the tiles themselves (JPEG, nothing re-encoded), 1,280 ×
  1,024 points = tile pixels at that zoom, with a 50 ft bar, the provider's
  attribution and "imagery date not known" printed on it
  (`src/lib/aerial.ts`, tested: projection, scale against ground distance,
  tile cover, the PDF opening in pdf.js). **The scale is the map's
  arithmetic** — 156,543.03392 m · cos(lat) ÷ 2^zoom per point, 0.422 ft
  at zoom 20 in Baton Rouge — stored as the sheet's *printed* scale and,
  like any printed scale, used only on Coy's tap ("Use the map's scale",
  with a nudge to check it against the bar or a garage door). Checked in
  the harness: a 20 × 40 ft driveway drawn into fake tiles measures
  800 SF. **Google is a look only** — its terms don't allow keeping or
  tracing its imagery, so it is proxied with no caching and never saved.
  Keys stay on the server (`/api/aerial/tile`, `/api/aerial/google`,
  `/api/jobs/[id]/aerial`, session client): `MAPBOX_TOKEN`, optional
  `ESRI_API_KEY` (without it the public World Imagery tiles), and
  `GOOGLE_MAPS_GEOCODE_KEY` with the Maps Static API on.
  **Esri's grey tiles (2026-10-03):** where Esri's public tiles stop
  (often zoom 19) it answers with a small "Map data not yet available"
  picture. `fetchTile()` asks with `blankTile=false` and treats a tile
  under 6 KB as that placeholder, then draws the tile's box with Esri's map
  export, which uses the sharpest photo it has there — enlarged, not a
  sharper photo. Not testable from the agent container (map hosts are
  refused); check it on the preview.
  **Suggestions while typing (2026-10-03):** the address box offers up to
  six matches a quarter second after the last key (`/api/aerial/suggest`:
  Mapbox autocomplete when `MAPBOX_TOKEN` is set, else Esri's public
  suggest, resolved by its key when picked; nearest the map first; nothing
  stored). The drawer's subtitle names the place the map is on. Not built: the
  photo's date (Esri's metadata service), and Dusty outlining the
  driveway himself — when he does, it is a dashed suggestion Coy accepts.
  **Budget** — each group and the line that counts it, priced by the
  engine's `budget()`, each shape's share as a child row. (Until 069,
  **Send to budget** picked a Price book card and added a `from_takeoff`
  line; that line rule still works and Dusty's plans use it.)
  **Sections follow the Plan Room (migration 069, applied 2026-10-03 on
  Coy's "Apply 069").** Coy: *"Pushing to budget should push the area
  measured under the group. And I should be able to select the individual
  measurements … Section should follow any edit in the plan room … if I
  delete the measurement, it should delete it in the budget without deleting
  the whole section because i wouldn't want to lose all the cost items … I
  should be able to pull measurement into the budget from the budget page
  also."* `takeoff_measurements.section_id` (on delete set null) puts a shape
  in a budget section; `job_sections.takeoff_sync` (default on) says the
  section's size follows its shapes; `job_files.takeoff_measurement_id` (on
  delete set null) files a photo on a shape. Triggers keep all three on one
  job. **The size is the sum of the section's shapes** in the first shape's
  unit — area → `sqft_override` (and the groups' depth when they agree),
  linear → `count_qty` LF, count → `count_qty` EA; a shape of another kind
  is kept but not added, and a shape on a sheet with no scale leaves the size
  blank with the reason (`sectionTakeoff()` / `sectionPatch()`,
  `src/lib/takeoff-sections.ts`, tested). It is **written on the server**
  after every takeoff change — a shape drawn, re-shaped or deleted, a group's
  depth, a sheet's scale (`syncTakeoffSections()`) — so the engine, the
  Dashboard, Dusty and the proposal read the section as before. A shape
  deleted takes its share out; a section left with none has its size
  cleared and **keeps its cost items**. A size typed on the section turns
  the following off (✎ "size typed here" · **↺ follow the takeoff**).
  **Send to budget** now opens the group's shapes with a tick each (those not
  in a section yet ticked) and makes **each its own section**, **all in one
  section**, or adds them **into a section** already there, with a kind of
  area guessed from the group's name (`/api/jobs/[id]/takeoff/send`); the
  group row says "N of M in the budget" and a shape in one shows **$✓**. On
  the job page each section has a **Takeoff** strip — its shapes and total,
  ƒ follows / ✎ typed, and **Pick takeoffs** (every shape on the job by
  group; ticking one in another section moves it here; one kind per section;
  `PUT …/sections/[sid]/takeoff`) — and sections sit under their takeoff
  group's name, as in the Plan Room. Cost items go on afterwards, as before.
  **Editing a shape:** with Select, a picked shape shows its corners — drag
  one to move it, the dot mid-edge adds one, double-click removes one; the
  section follows. **Shape photos** on the toolbar (with a shape picked) ticks
  the job's photos of that area or takes new ones; they show under the
  shape's section and on the proposal. Checked in the harness: Send made one
  section per shape, a dragged corner saved the moved point (800 → 1,148 SF),
  a ticked photo was filed on the shape. **Checked again (2026-10-03):** a
  section made by Send now fills from Coy's auto-loading assembly for that kind
  of area, like one added by hand (it didn't); and a group's depth only fills a
  blank thickness — one typed on the section stays (a re-measure used to write
  the group's over it). Rehearsed (rolled back) before
  applying: a shape or photo on another job's section refused, the following
  on by default, a stranger sees nothing.
  **A colour per takeoff (migration 070, applied 2026-10-03 on Coy's "Apply
  070").** Coy: *"the ability to select different colors for each
  measurement in the parameters panel … The colors should show different on
  the drawing as well. The colors don't need to move over to the budget, it's
  just for the plan room."* `takeoff_measurements.color` (nullable `#rrggbb`,
  checked; null = the group's colour, as before). The colour bar on each
  takeoff's row in Parameters opens its swatches (`SHAPE_COLORS`, "group"
  first) and the drawing — fill, outline, corners — uses it (`shapeColor()`,
  `shared.ts`); a colour alone doesn't re-sync sections. The budget, the
  proposal's area maps and the sheet viewer keep the group's colour.
  Rehearsed (rolled back): a hex kept, anything else refused. Checked in the
  harness: the Apron recoloured blue on its row and on the sheet.
  **Tick to send (Coy, 2026-10-03: "a check box next to the measurement in
  the plan room parameters so that I can select the measurement and push to
  budget").** Each takeoff's row has a tick box; ticking any (one group at a
  time — a section takes one kind) turns the panel's button into **Send N to
  budget**, which opens the Send sheet with just those ticked. Checked in the
  harness: ticking Apron sent only Apron. **On the job page** the section's
  row is **Measurements** with a real button — **+ Pull measurements from the
  Plan Room** (Change measurements once it has some; Measure in the Plan Room
  › when nothing is measured yet) — Coy couldn't find the old "Pick takeoffs"
  link.
  **Perimeter of an area (Coy, 2026-10-04: "calculate the linear footage
  around the perimeter of that area").** Every area shape also gives its
  edge in LF — its outline closed, plus each cutout's outline (a hole is
  edge to form too) × the sheet's scale, never stored, none while the scale
  isn't set (`measurementPerimeter()`, `src/lib/takeoff.ts`, tested). Shown
  as "N LF edge" under the group's SF / CY and each takeoff's SF, and on the
  shape's floating label ("971 SF · 180 LF perimeter"). A budget line counted
  from an area group whose card is in LF takes the group's perimeter
  (`ruleQty()`, `perim_lf` on the takeoff total) — form & finish by the foot
  from the same outline. Dusty's job context carries it per group.
  Checked in the harness on a generated sheet: a 30×40 ft rectangle at
  1/8" = 1'-0" is exactly 1,200 SF (14.8 CY at 4"), $2,467 on a $1.43 card at
  15% O.H. and 20% margin; a 10×20 apron moved the line to 1,400 SF / $2,878;
  taps ~16 ms. Dusty's job context includes each sheet's scale and each
  group's total. APIs: `/api/jobs/[id]/plans` (GET), `…/plans/sheets`
  (POST, the browser's reading), `/api/plan-sheets/[id]` (PATCH scale /
  number / title), `/api/jobs/[id]/takeoff/parameters[/pid]`,
  `…/takeoff/measurements[/mid]` — session client, org from the session,
  every id checked against the job; triggers keep a shape's group and sheet
  on one job, and a sheet's file on its job.
- **Job › Proposal (migration 060, 2026-10-01; Claude Design,
  `design/proposal`).** Coy: *"Go ahead with the proposals."*
  `/dashboard/scope/[jobId]/proposal`, from the job header's **Proposal**
  button (`src/components/v34/proposal/`). Left, the job panel (a sheet on a
  phone): project type (switching loads that type's defaults, asking first),
  the option, cost → price by cost type with the **margin** (slider and box —
  it writes the job's `estimates.margin_pct`, so budget and proposal never
  disagree), "Calculated $X → rounded to $Y", the sub split (20/80, 30/70 —
  never on the document), and the warranty and contract pickers. Middle, the
  document — always white paper, whatever the theme: Cover (a photo from the
  job's files), Header, Scope (intro + each area's size and spec), Pricing,
  Payments, Warranty, Terms, Sign — each with an on/off pill; quick toggles
  Item prices · Qty · unit · Tax line; groups and lines shown/hidden, prices
  hidden, lines made optional. **The cover's dark band (Coy, 2026-10-04):**
  the logo on the left, the kind and title on the right, nothing else — the
  "Prepared for …" line was repeated below. **Since 2026-10-05 the band is
  its own strip** between the Cover and the Header (Coy: "The cover should
  not include this dark header. I don't want to lose this when I turn the
  header off"): the Cover switch hides only the photo, the Header switch
  only the quote number and Prepared by / for, and the band always carries
  the logo. In print the cover photo is an `<img>` (3.4 in tall), the band
  keeps its colour (`print-color-adjust: exact`) and nothing forces a page
  break after the cover, so photo, band and header open page 1 together
  with a photo or without one. **Prepared by** is the member preparing it — their
  name and phone from Settings → You (`PATCH /api/me {phone}`, kept on their
  own account), then the org; a final freezes them as
  `snapshot.prepared_by`, and the customer's copy carries name, phone and
  email only. **Prepared for** shows the phone as (225) 555-0100 and the
  email (the contact's, else their first listed one) when there is one.
  **Maps & photos per area (2026-10-03, Coy:
  "the customer can easily understand what this section is covering. They
  will have the map view + photos for that map area"):** under the Scope's
  list, each area with takeoff shapes shows the part of their sheet — the
  aerial or a plan page — with the shapes drawn on it (drawn in the browser
  from the plan with pdf.js, `area-visuals.tsx`), beside up to four of its
  photos (filed on the area or on one of its shapes); an eye hides one area's,
  the **Maps & photos** quick toggle hides all (`display.picsOff`,
  `hide_area_pics`). Read live from the Plan Room, like the cover photo — a
  final shows today's shapes for its areas. **Since 2026-10-05 the photos are
  thumbnails** (76px square on a phone, 92 on a desktop), each opening full
  size, and a section's **Photos** row on the job page has a **Proposal**
  switch that is that area's eye (`PATCH /api/jobs/[id]/proposal {pics:
  {section_id, on}}`, read with `GET …/proposal?display=1`, which makes no
  draft; with none, the switch opens one). A link made without the browser
  (sent from Threads or Dusty) now takes photos filed on an area's takeoff
  shapes too, as the Preview does. Warranty and terms are edited in place;
  **Save as template** writes them back (same name updates it, a new name
  makes one). **Edit with Dusty** opens him with a starter question, and
  **Use this** under his answer (`setDustyUse()` in `dusty-live.ts`) puts it
  in the section — Coy's tap; Dusty writes nothing. **Print / PDF** is the
  browser's print (`@media print` shows the pages only); a PDF filed on the
  job needs a server renderer — later. **Preview** (it was Mark final —
  below) freezes the document when it is sent, in `job_proposals.snapshot` (the priced document and the warranty and
  terms as worded), refused while draws don't add up; the database refuses
  any change to a final (`sc_job_proposal_guard`); **New version** starts
  the next draft. One draft per job. `doc_templates` were seeded from the
  design's text (from Coy's won quotes) as **starter** text — "{org}" is the
  org's name, the license number a blank — marked "check it with your
  attorney" until Coy saves his own. Dusty's job context has the proposal
  (total, rounding, what's hidden, draws) and never makes a draft. APIs:
  `/api/jobs/[id]/proposal` (GET, PATCH), `…/final`, `…/new-version`,
  `/api/project-types[/id]`, `/api/doc-templates[/id]` — session client, org
  from the session, every id checked. Rehearsed: one draft per job; a final
  with no snapshot, or an edit to a final, refused; a stranger sees 0 rows
  and can't write; anon refused.
- **Preview and send — the proposal by link (migration 075, Coy
  2026-10-03: "Mark final should be changed to: 'Preview' … the preview of
  the proposal that the customer would see when I send it … send the proposal
  via text and email … track every time the customer views the proposal …
  hosted on the cloud").** The proposal toolbar's **Preview** (Mark final is
  gone, and so is the "Fix the budget first" button — Coy: "doesn't even
  work"; why it can't be sent is said in words on the Preview) opens the
  document exactly as the customer gets it — read-only, hidden sections,
  groups and lines gone, no empty cover, no draw checks — as a **Phone** or
  **Desktop**, with **Text it · Email it · Copy link** (`preview.tsx`).
  Sending a draft freezes it as a final version first (the same server check
  as before); then its **link** is made: a `documents` row (the old empty
  placeholder for sending quotes) with `proposal_id`, a 32-character random
  `token`, `shown` — the customer's copy, built by `publicSnapshot()`
  (`src/lib/proposal-links.ts`, tested) WITHOUT cost, O.H., profit, margin,
  hidden lines or groups (not even their names), hidden prices (zeroed) or
  the areas' notes — and `assets`, the storage paths of the logo, cover and
  each area's photos and map (the map drawn with its shapes into a JPEG by
  the browser, `mapPicture()`, and uploaded to
  `job-files/{org}/proposal/{doc}/`). Text and Email open **Coy's own**
  Messages or mail app with the words and the link (`sms:` / `mailto:`) —
  ScopeCrete sends nothing (§10); `sent_via` records which. A new version's
  link retires the old ones (the customer sees "replaced — ask for the
  latest"); **Turn this link off** revokes one. The customer opens
  **`/p/<token>`** (Vercel, public, no sign-in, `noindex`): `/api/p/[token]`
  calls `sc_shared_proposal()` — SECURITY DEFINER, the ONE thing anon may
  execute here — which returns `shown` for a live link only and logs a
  `viewed` event (a hashed IP, the browser) with `view_count`,
  `first_viewed_at` / `last_viewed_at`, unless the reader is in the org (Coy
  checking his own link isn't a view). Pictures are signed by the same
  request's client; storage policy `shared_proposal_assets` lets anon read
  an object only while a live link lists its path (`sc_shared_asset()`).
  Anon has no grant on `documents` or `document_events`; members read and
  write them under `get_user_org_ids()`; a link must point at a FINAL
  proposal on its own job (`documents_guard`). **Tracking:** the toolbar's
  line ("v1 sent · opened 3 times · last 2h ago"), the Preview's list of
  every opening with the device, and the activity line ("Proposal opened:
  Wilson Driveway Replacement"). APIs: `/api/jobs/[id]/proposal/link` (GET
  the job's links with their openings; POST the link for the newest final),
  `/api/proposal-links/[id]` (PATCH `{sent}` / `{revoke}`) — session client,
  org from the session, every file id checked against the job; `/api/p/[token]`
  — no service role. Rehearsed (rolled back): a member makes a link; one on a
  draft refused; anon reads the frozen copy and the view is logged once; a
  member's own opening not logged; a bad token null; a listed path readable
  by anon, an unlisted one not; anon can't read either table; a stranger sees
  no links and can't make one; a revoked link is gone and its pictures with
  it. **Applied 2026-10-04 on Coy's "apply 075"** (with anon's leftover
  grants on `contact_phones` revoked; checked after: the columns, the guard
  trigger, the storage policy, anon may execute only the two functions and
  holds no grant on `documents`, `document_events` or `contact_phones`, a bad
  token returns nothing). A preview deployment may sit behind Vercel's own login — send links
  from scopecrete.ai. Not built: the customer accepting or picking an option
  on the page (e-sign), and a PDF filed on the job.
- **The job's Bid strip (2026-10-01, §2i)** — full width like the section
  cards (2026-10-02, Coy: "needs to be the same width as everything else");
  folded by default since
  2026-10-02 (Coy: "doesn't take up a lot of space on my mobile phone") to
  one row, "Bid · due Tue, Oct 13 …", ▶ opens it, remembered per device. On a job a forwarded bid made
  or fed: GC, estimator, bids due (hours left, red under 48), pre-bid, the
  Box folder and what was copied and read, **Scope from the bid** (each
  item with its sheet, spec and line) and **Undo bid**. The Dashboard has a
  **Bids due** tile (open bid invites by due date).
- **Job header (2026-10-02, Coy's notes on the Burgess job):** ‹ Jobs and
  the job name on one row (bold, smaller), the four chips small on one row
  under it, the customer line and description (left out when the Bid strip
  below shows the bid's scope summary — Coy: "redundant"), then the job's
  switch above the money strip. **Delete is at the bottom of the job page**
  (Coy, 2026-10-04: on a phone it pushed Proposal off the screen), and the
  header's sheets button reads **Sheets (n)** on one line. **Since
  2026-10-05 all three views share one top row** (`JobHeaderRow`,
  `job-tabs.tsx`; Coy: "I like the layout of the budget page the best with
  the job name on the top left and the 'plan room, budget, proposal'
  buttons on the top right … Any buttons currently in the top right need to
  be moved down below"): ‹ Jobs, the job's name (and the ⓘ, or the
  proposal's number and draft / final, with its price line under it) on
  the left, the switch alone on the right. Each view's own buttons sit
  below: the Budget's Sheets (n) on the first takeoff group's row ("Driveway Area · takeoff group · 1 section · 894 SF"), else under the name; the Plan Room's
  reading chips, Photos, Aerial and Add plans on the row under the name;
  the Proposal's version, Item prices · Qty · unit · Tax · Maps & photos,
  Print / PDF and Preview on the settings row beside Project type,
  Warranty and Contract (on a phone, the buttons on their own row and the
  settings folded).
- **Summary, a fourth view (Coy, 2026-10-05: "a summary page to the left
  of the plan room … including all the chips" and "all of the lines and
  words directly below the job name … we can add to the summary page").**
  Summary · Plan room · Budget · Proposal, at `/dashboard/scope/[jobId]/summary`
  (`job-summary.tsx`): the four chips, customer · address · created date, the
  description, Why this job (no longer an ⓘ sheet), the Bid strip, the price
  at a glance from the engine's `budget()` over `/api/jobs/[id]/budget`
  (total, cost, O.H., profit, margin, tax, job minimum, or what blocks it),
  the proposal's link (version, sent, opened —
  `/api/jobs/[id]/proposal/link`), and Delete job at the bottom (a deleted
  job opened there shows Restore — `GET /api/jobs/[id]` now returns
  `archived_at`). No new API. Dusty is HOT on the job there. An onsite
  estimator gets no Summary tab, and `redirectFor()` sends /summary to the
  job page. The Budget's chip row, customer and description lines, ⓘ and
  Delete moved to Summary (the Bid strip stays on both); the Proposal's
  number, draft / final and price left the name's row for one line above
  its settings. The Jobs board still opens a job on its Budget.
  **On a phone** (Coy: "the job name in the center of the page … plan room,
  budget, and proposal button … center of the page below the job name") the
  name is centred on its own line (‹ Jobs at its left edge; the Budget's
  editable name centred too) and the switch centred under it; the desktop
  keeps name left, switch right (`JobHeaderRow`).
- **The job page gets the phone's whole screen (Coy, 2026-10-05: "when I
  scroll down let the main dashboard header disappear under the job page
  header").** On a phone, scrolling down the job page slides the dashboard
  header away (`useHideHeadOnScroll()`, `html[data-head-hide]` sets
  `--sc-head` to 0) and the job's own header and money strip stay pinned at
  the top; scrolling up brings it back. Desktop unchanged.
- **One job, three views (Coy, 2026-10-02: "no way … to get back from the
  proposal page" and "one job budget page, and I can toggle between that
  budget and the proposal").** **Plan room · Budget · Proposal** — in the
  order of the work (Coy, 2026-10-03: "Plan Room, Budget, Proposal. That is
  the work flow"); the same
  segmented switch (`job-tabs.tsx`) on the job page, the Plan Room header
  and the proposal toolbar, so each is one tap from the others. The
  proposal's slide-over **Job panel is gone**: the money moved to the
  Budget (margin and O.H. already there; **cost by type** as one bar and the
  **profit split with a sub** — saved on the proposal draft, never on the
  document, never changing the price — in the budget footer,
  `PriceSummary`), and what shapes the document stays on the proposal as a
  **Proposal settings** strip (project type, option, warranty, contract;
  folded on a phone, open on a desktop). The proposal's sub-line says the
  total and "rounded up to …", or why there is no price.
- **Each section's plan sheets (Coy, 2026-10-02: "I need to verify the
  scopes on the sheets the scopes were taken from … expand and view each
  sheet … on desktop, a panel to the left or right of the budget").** Under
  a section's bid line, **Check it on A2.1 · A2.2** — the sheets its line
  names, linked only when a sheet by that exact number was read off the
  plans (`sheetsFor()`, `src/lib/section-sheets.ts`, tested: A2.1 is never
  A2.10). A tap opens the **sheet viewer** (`sheet-viewer.tsx`): on a desktop
  a panel over the right ~58% of the page — the page itself narrows to the
  room left of it (`html[data-sheets]`), so the budget stays in view, and
  with Dusty docked it sits between the page and him — with the sheets down
  its side: this section's, the other sections', then the rest of the set
  — each sheet once, in the first group that names it (several sections
  share a sheet; the first build listed them over and over);
  on a phone the whole screen with the sheets as chips. Fit · − · + (ctrl +
  wheel), drag to pan, ‹ › and the arrow keys. **Measure in the Plan Room ›**
  opens Takeoff on that sheet (`?step=takeoff&sheet=`) — measuring stays
  there, with its scale rule. The job header's **Plan sheets (n)** opens the
  same panel on every section's sheets. Attaching a sheet a bid line didn't
  name needs a place to keep it (a column on `job_sections`) — not built.
- **Dusty reads the plans' words (2026-10-02).** Asked to check each scope on
  its sheet, he answered that the plan files were "not read" — he had only
  their names. His job context now carries **What the plans and specs say**:
  the bid reader's text of every page that mentions concrete, labelled
  `[file · p.N · A2.1 Title]` (drawings first, ~40k characters), with the
  instruction to quote the sheet and point out what disagrees, and to send
  Coy to the sheet under the section. What is drawn but not written isn't
  in it, and he says so.
- **Call notes → Dusty's quote (Coy, 2026-10-03: "make notes on a live
  call so that Dusty can finish putting the quote together from aerial
  imagery afterwards").** **Call notes** on the person page and the customer
  page opens a pad (`call-notes-pad.tsx`, drawn at the page's top level) that
  saves as Coy types: the first words make a `contact_notes` row
  (`POST /api/people/[id]/notes`), each pause updates it
  (`PATCH /api/notes/[id]`), and a copy stays on the device until the server
  has it. **Quo sends a call only after hang-up** (no ringing event reaches
  us — measured 2026-10-03), so the note waits on the person; once the call
  arrives it is attached to the call it was written during —
  `callForNote()` (`src/lib/call-notes.ts`, tested): the call's own window
  from Quo's `call.completed` (`createdAt` → `completedAt`, raw log §2a),
  from 2 minutes before it rang to 15 minutes after hang-up, a note during a
  call beating the tail of the one before. A note in no window stays a plain
  note; a call with no window takes none. Attaching is done by the reads that
  show notes (the pad, the person and customer timelines, Dusty's job
  context — `settleCallNotes()`, session client, notes from the last three
  days with no call yet, no migration). The pad then says "On the 3:54 PM
  call" with **Draft the quote**, also on every call card:
  `POST /api/messages/[id]/quote` finds the call's job, else the caller's or
  their customer's newest open job — or, on Coy's yes, starts one — opens
  it, and puts the question in Dusty's box for Coy to send. Dusty's job
  context carries **Calls about this job** (the newest four with summary,
  next steps and Coy's notes on each; transcripts of the newest two, marked
  machine-heard, Coy's notes winning) beside the Plan Room's measured
  aerial, and he answers with a budget plan (§3) Coy applies. A "Call
  starting" banner needs Quo's ringing event switched on — not built.
- **Texted photos onto the job (Coy, 2026-10-03: "she texted pictures. I
  would like to be able to pull those pictures into the plan room so that I
  can compare them to the aerial … into the budget and plan room and
  proposal").** A texted photo stays in `message_media` (the text is never
  changed); **+ Job** copies it into the job's files —
  `/api/jobs/[id]/texted-photos` (GET the photos texted by the job's person
  and their customer's other people, each with `file_id` once on the job;
  POST `{media_ids}` or `{all:true}`), session client, only those people's
  inbound photos. The copy is a `job_files` row (`source='text'`,
  `message_id`, `source_url='message_media:<id>'` so it is copied once,
  category photo, **In plan room**, Dusty reads it), named "Texted by
  Johnette Wilson · Oct 2 3.41 PM.jpg" (`src/lib/texted-photos.ts`, tested).
  A photo not yet stored is first copied in from Quo (`captureMedia()`,
  `src/lib/message-media-server.ts`, shared with the thread's media route).
  As a job file it can be set to an area (shows under that section's
  Photos) and picked as the proposal's cover. **Where:** the job page's
  Files → From texts (**+ Job** on each, **Add all N to the job**, "On the
  job ✓"), and the Plan Room's **Photos** panel (`photos-panel.tsx`) — a
  column down the right, open over any step and over full-screen takeoff
  (a Photos button on its toolbar too), with the job's photos one at a time,
  large, ‹ › and Full size, and below, the ones texted but not yet on the
  job with **+ Job** / **Bring all N in**. Only PDFs become sheets; a photo
  is for looking at beside the aerial, not for measuring.
- **Section Notes replace Prep and Access (Coy, 2026-10-03, two Vercel
  notes: "Prep can be removed from the sections" and "Access can be removed
  … replaced by 'notes'. The notes can be typed or dictated verbally").**
  Every section has one **Notes** box — typed, or **Say it** (records with
  the chat's recorder, Groq writes it down through `/api/dusty/transcribe`,
  the words are added to the box). Kept in `job_sections.access_notes`, no
  migration: measured that day, no section had anything in `prep_notes` or
  `access_notes`. Section dictation fills Notes with whatever was said that
  isn't a field (`sanitizeDictation()` no longer writes `prep_notes`), and
  Dusty reads them as the section's notes.
- **Job header (2026-09-28)** — four tappable chips, each opening its list:
  **Status** (the seven stages, with W.I.P.'s won / scheduled / pouring),
  **Type**, **Source** and **Vendors (n)** (crew on the job, add by subtype)
  — `src/components/v34/job-chips.tsx`.
- **Receipts are camera-first, always.** Photograph, never type. Dusty reads
  vendor, amount, date and clarifies conversationally. Invoices and payments
  stay quick structured forms.
- **The composer never appears to send.** (2026-09-27; texts send since
  2026-10-05, below) Email has no send path. The composer (thread screen, and compact in the row expand)
  writes, keeps a per-device draft and copies it for pasting into Quo; Send is
  shown switched off with its reason. **The box is empty** — no placeholder
  words (Coy, 2026-10-05); it is labelled for screen readers only. **Notes save** (2026-09-28, above). The
  **mic dictates** into the box with the browser's own speech recognition —
  Chrome sends the audio to Google to transcribe; nothing of ours stores it;
  off, with the reason, where the browser has none. The composer's Call and +
  attach are gone (Coy: the Call is at the top; attach did nothing). An earlier composer appended messages locally and faked a Dusty reply
  a second later; that must not come back. Email's Send is still off.
- **Sending proposals — Threads, the Preview and Dusty (Coy, 2026-10-05: "a
  clean way to actually send proposals via text and email manually and for
  dusty to send them. And I want him to watch how i do it and learn and
  improve").** One road, `sendProposal()` (`src/lib/v34/send-proposal.ts`),
  always Coy's tap: the link (`POST /api/jobs/[id]/proposal/link {auto:true}`
  — the live one for the newest final, else a new one; a draft newer than the
  last final is frozen first, as Preview does; with no browser the cover is
  the proposal's own, each area's photos are its job photos, and no map
  pictures), the words with `{link}` / `{first}` / `{title}` filled
  (`src/lib/proposal-send.ts`, tested), a text through Quo (`POST /api/texts`,
  §6 Texts) or an email in Coy's own mail app (mailto: — **ScopeCrete has no
  outbound email yet**), then the link marked sent. **Threads:** the
  composer's **Proposal** opens a sheet — the person's and their customer's
  jobs with a proposal (`GET /api/proposals?contact=`), Text · Email, the
  words, **Preview** (the customer's page `/p/<token>` in a sheet; Coy signed
  in isn't counted as a view), Send. A text with a proposal link shows
  "Proposal P-2 · opened 3 times · Preview" under it (`?token=`). **The
  Preview's** Text it now sends through Quo with words Coy can change ("Or
  open it in your Messages app" keeps the old sms:). **Dusty:** every chat
  carries **The business** (orgs.name — he had called it "Baton Rouge
  Concreters", the lead-gen relay's name, also in his text example) and
  **Proposals to send** — each job's proposal, its full job id, version,
  draft/final, total, link URL, sent and opened — and the plan step
  `send_proposal` {job, via text | email, body with {link}, subject, contact?};
  the card shows the words in a box Coy can change before Send.
  **Learning:** each send is kept in Coy's own `user_preferences.prefs.proposal_sends`
  (newest 12; his words as a pattern, and Dusty's draft beside them when
  Coy changed it — `POST /api/proposal-sends`, no migration). The next send
  starts from his last words for that channel, and Dusty is shown them, where
  Coy changed his draft, and the last texts with a /p/ link in them (sent
  from the Quo app too), and told to write that way.
- **Texts send through Quo (Coy, 2026-10-05: "send text messages through the
  app through quo manually or through dusty"; decision card: "Build both").**
  10DLC was not in fact waiting: 129 texts Coy sent from the Quo website line
  since 2026-08-27 came back from Quo `delivered`, so that line is carrier
  registered (inferred from the log; Coy confirms in Quo → US Carrier
  Registration). Quo's API also needs **prepaid API credits** ($0.01 a
  segment, Quo → Plans & Billing) and `QUO_API_KEY` (in Vercel). The
  composer's **Send** (text channel; Copy stays) posts to `POST /api/texts`
  {contact_id, body, to?, line_id?} — session client, org from the session:
  `to` must be one of the person's own numbers (`contacts.phone` /
  `contact_phones`), never one of the org's lines (default: the number they
  last used); the line must be one of the org's **Quo** lines (default: the
  Quo line they last reached, else the primary — `pickLine()`,
  `src/lib/texting.ts`, tested); then `sendQuoText()` (`src/lib/quo.ts`,
  `POST https://api.quo.com/v1/messages`, `QUO_API_BASE` overrides the host),
  never retried. Nothing is shown as sent until Quo takes it, and the text
  appears in the thread only when Quo's webhook brings it back
  (`message.delivered` → `quo_events` → `messages`, §2a) — the app writes no
  message itself. After a send (the composer or Dusty's card) the open
  thread checks again at 3, 8 and 16 s (`expectMessage()`, `live-threads.ts`)
  rather than waiting for the 15 s poll. Quo's refusals are put in words (`quoError()`: key, credits,
  registration). The hint shows the segment count. **Dusty** proposes a text
  only when Coy asks: plan step `text` {contact — a full id from his context,
  body, to only when Coy names a number} (`src/lib/dusty/plan.ts`, tested);
  the card shows the words and who they go to, and its button reads **Send**;
  Coy's tap sends it through the same route (`applyRecords()`). §10's rule
  holds: every text is Coy's tap. Testing sends only to a phone of Coy's that
  is not one of the org's lines, never a customer.

---

## 7. Agent rules

**Git is the coordination layer.** Any agent can merge to `master` and
deploy — but only when explicitly instructed to, in that conversation, by
Coy. Never on an agent's own initiative, no matter how green the build looks.
Default mode is still branches and PRs; a merge is an exception each time,
not a standing grant carried over from a prior approval. Parallel work uses
separate git worktrees so two agents cannot touch the same files.

**Checks every change passes (2026-09-30, Coy).** Three layers, the same
checks in each:

- **CI** — `.github/workflows/ci.yml` on every pull request and every push to
  `master`: `npm ci`, typecheck (`tsc --noEmit`), `npm run lint`, `npm test`,
  `npm run build` (placeholder Supabase values; no secret). To make it a gate
  Coy turns on branch protection for `master` (require a PR, require the
  "typecheck · lint · test · build" check, block direct pushes) — a GitHub
  setting no agent can change.
- **Agents** — a Claude Code `Stop` hook (`.claude/settings.json` →
  `.claude/hooks/verify.sh`) runs typecheck, lint on the changed files and the
  tests whenever an agent has changed code (uncommitted, untracked or
  unpushed) and will not let it stop while they fail; after one retry it lets
  it stop but makes it say what fails. It skips the build (too slow for
  every turn) — CI has it.
- **Lint scope** — everything except `docs/**` and `design/**` (mockups).
  In `supabase/functions/**` an `any` is a warning, not an error: those files
  must match the deployed functions byte for byte (§2). `master` lints with
  0 errors since the dead mock-data `/scope-builder/[leadId]` page and the
  unused v0 `ScopeTab` were deleted.

**Superadmin agent guardrails — non-negotiable:**

1. The agent gets **named RPC functions**, never raw SQL, and never the
   service-role key anywhere a browser can reach.
2. Every agent action writes to an **audit table**: who, what, when, which org.
3. **Writes require human confirmation** before executing. Read-only first.

Superadmin is cross-tenant. One bad tool call reads or destroys every
contractor's data at once.

**No API route may use the service-role key on a request path reachable by a
browser.** This is not limited to the superadmin agent — it applies to every
route under `src/app/api/`. Service role bypasses RLS entirely, so a
browser-reachable route holding it is a full cross-tenant data leak whether
or not it means to be. Use a session-scoped Supabase client (`@supabase/ssr`,
reading the request's auth cookies) so RLS applies, and derive `org_id` from
the authenticated session's `org_members` row — never from a query param,
request body, or any other caller-supplied value. This rule exists because
`api/dashboard/cashflow/route.ts` shipped in PR #1 with exactly this bug:
service-role client, `org_id` read straight off the query string, no auth
check — any unauthenticated caller could pull any org's full financials.

**Do not apply widening database changes on agent judgment.** Restrictive and
additive changes only, with confirmation.

---

## 8. Deployment

- Web app: Vercel. Preview per branch.
- VPS: agents, telephony, anything holding a socket or needing a persistent
  process.
- **Hermes (Dusty's model) on the VPS** is published with Tailscale Funnel on
  its own port: `https://srv1594563.tail0f2914.ts.net:8443`
  (`/v1/chat/completions`, `/health`), bearer-key auth. Only `/api/dusty` on
  Vercel calls it. **Funnel is per port, not per path** — turning it on for 443
  made OpenClaw and the Hermes dashboard public too. So 8443 carries Hermes
  alone and is public; 443 (`/` OpenClaw, `/hermes-dash`) is `tailscale serve`
  only, tailnet-reachable. Never put anything else on the Funnel port, and test
  public reachability from a device that is NOT on Tailscale.
- **`email-intake`** (Supabase edge function, §2h) is the only door for
  mail: AgentMail's webhook → it, signed. **`bid-intake`** (§2i) reads what
  it mirrors. Once a real bid lands correctly, Coy turns off his own Hermes
  agent's AgentMail webhook — ScopeCrete replaces it (Coy, 2026-10-01).
- Do not run two production paths for the web app.
- **Fonts are self-hosted (2026-10-05).** Every typeface the app and site
  load through Next is a woff2 in `src/fonts/` (latin, copied from Google
  Fonts, OFL), loaded with `next/font/local` — never `next/font/google`, so
  `next build` downloads nothing. A failed Google Fonts fetch failed the
  production build of PR #30; the same commit built on a retry.
- `scopecrete.ai` points at the Vercel project; Cloudflare DNS-only for that
  record.
- **Doors (Coy, 2026-10-04: "the dashboard login page to land on
  app.scopecrete.ai/login and … the Sacco Enterprises dashboard … at a
  subdomain of app.scopecrete.ai … each organization will have its own").**
  `src/lib/hosts.ts` (tested) names the host; `src/proxy.ts` routes on it:
  **scopecrete.ai / www** — the public site: `/` is the landing page
  (`src/app/welcome`, from Coy's Claude Design package, 2026-10-04; also at
  `/welcome` on any host for previews), its Log in buttons go to
  `app.scopecrete.ai/login` and Request access is an email to
  admin@scopecrete.ai (no form until one really sends). Since Design 10
  (2026-10-05) its phone demo is the real app, call to final proposal, in
  eight steps on autoplay (`field-demo.tsx`, Site Office, sample names
  only); `/login` and
  `/dashboard…` go to app; `/p/…` (proposal links), `/calculator`, `/auth`, `/invite`
  stay. **app.scopecrete.ai** — `/login` is the sign-in page (`/` sends
  there; the design's Login screen, `src/components/site/sign-in.tsx`:
  email and password, Forgot password, Continue with Google, and a Request
  access tab that is an email — the design's phone sign-in is left out, no
  texting until 10DLC; the invite page `/invite/<token>` wears the same
  frame, `auth-shell.tsx`). **On a preview deployment the sign-in page
  says so** in a yellow strip — "Feedback sandbox · not the live site" on
  `claude/feedback`, "Preview · <branch>" on others, nothing in production
  (`src/lib/sandbox.ts`, from Vercel's `VERCEL_ENV` / `VERCEL_GIT_COMMIT_REF`,
  tested); signed in, `/login` and `/dashboard…` go on to the org's own
  address. **`<orgs.slug>.app.scopecrete.ai`** — that org's dashboard
  (Sacco Enterprises is `sbuild`, its existing slug); `/` → `/dashboard`;
  signed out → app's `/login?next=`; a non-member is sent to their own org;
  `getApiSession()` takes the org the address names, and only if the caller
  is a member (RLS shows no other). **Any other host** (*.vercel.app,
  previews, localhost) works as before. The auth cookie is written for
  `.app.scopecrete.ai` on app and org hosts (`cookieDomain()`, passed to
  every Supabase client), so one sign-in covers both. Customer links
  (`/p/…`) made on app or an org's address point at `https://scopecrete.ai`.
  Each org's address needs a DNS record (Cloudflare: CNAME `<slug>.app` →
  `cname.vercel-dns.com`, DNS only) and the domain added to the Vercel
  project — Vercel issues a wildcard (`*.app`) certificate only with its
  own nameservers, so for now it is one record per org. Supabase Auth's
  redirect list must carry `https://app.scopecrete.ai/**` and
  `https://*.app.scopecrete.ai/**` for Google and emailed sign-in links.
- **Installing the app (Coy, 2026-10-05: "prompts me to install it from the
  master branch and it doesn't prompt me to install it on any sandbox
  branches").** `/site.webmanifest` is a route (`src/lib/install.ts`,
  tested): only an org's own address on the production build
  (`VERCEL_ENV=production`, `<slug>.app.scopecrete.ai`) gets the manifest
  (opens on `/dashboard`); previews, the feedback sandbox, the landing page,
  app.scopecrete.ai and localhost get 404, so Chrome never offers to install
  them. Chrome's own banner shows when Chrome decides, so Settings (☰) has
  **Install the app** whenever the browser says it can be installed there.
  There is no service worker (next-pwa is a webpack plugin; the Turbopack
  build never ran it).

**Per-org Hermes containers are under review.** Clean isolation, but N
long-running processes per N contractors does not survive growth and is the
line item that eats a $79 subscription. Prefer one multi-tenant agent service
with org identity as a request parameter, isolation enforced by RLS and
scoped credentials. Keep containers only where a persistent process is
genuinely required.

---

## 9. Security posture

- Repo is private as of 2026-08-13. It was public before that — treat every
  credential that has ever touched it as compromised and rotate.
- API keys live in environment variables or the process manager's secret
  store. Never in the repo, never in a chat, never in a commit.
- One key per purpose (Claude Code, app server, each agent) so a leak is
  revoked in isolation.
- Anon-role read policies were removed in a prior migration; anon must not
  regain read access to contact, comms, or job data.
- `get_user_org_ids()` is the isolation helper, and the migration off the
  `app.current_org_id` GUC is **done**: measured 2026-09-27, 130 of 149 public
  policies use `get_user_org_ids()` and **0** reference the GUC (the rest are
  `service_role`-only). Any new policy uses the helper.
- **Fixed 2026-09-27: `enrich-contacts` v2 was callable with the public anon
  key.** It had `verify_jwt` on and no auth of its own; the anon key in the
  browser bundle IS a valid JWT, so anyone could invoke it and get contacts'
  phone numbers back (`dry_run` returned whole proposal rows). v3 checks a
  vault token and returns counts only. `verify_jwt` alone is not auth.
- **Map keys for aerials (2026-10-03):** `MAPBOX_TOKEN` and `ESRI_API_KEY` are
  server-side only; the browser loads tiles through `/api/aerial/tile`.
- **Google Maps keys (2026-09-30):** `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` is
  public by design — restrict it to the app's domains in Google Cloud.
  `GOOGLE_MAPS_GEOCODE_KEY` is server-side only (geocoding on address save).
- **Known exposure, fixed by 081 (applied 2026-10-05):** the views `sc_spine_drift`,
  `sc_open_name_questions`, `leads_view`, `vendors_view` and `job_close_rates`
  are not `security_invoker`, so they run as their owner and bypass RLS — a
  cross-tenant read the day a second org exists, and a read past an onsite
  estimator's limits. 081 makes `sc_spine_drift` invoker and takes
  authenticated's select off the other four. Views must be created
  `with (security_invoker = true)`.

---

## 10. Parked

- State and public work — separate engine. Prevailing wage, certified payroll,
  bid bonds, prequal, DOT specs. Do not bolt onto the private-work estimator.
  **Exception (Coy, 2026-10-02):** a public bid's unit-price items (SY, EA)
  are priced in the ordinary budget — areas measured by area alone, cards
  counted in square yards (§3). That is the estimator, not the public-work
  engine.
- Outbound texting needed 10DLC registration — the Quo line turned out to be
  registered; texts send through Quo on Coy's tap since 2026-10-05 (§6).
- All outbound contact is the contractor himself. No bot-initiated outreach.
