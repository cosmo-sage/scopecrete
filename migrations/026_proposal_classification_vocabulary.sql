-- 026_proposal_classification_vocabulary.sql
--
-- APPLIED 2026-09-27 on Coy's explicit instruction (the plan approval covering
-- 026-028). It waited for that approval because widening a CHECK is a widening
-- change, which DECISIONS.md §7 says an agent does not make on its own
-- judgment. Verification results are recorded at the bottom of this file.
--
-- THE PROBLEM, measured 2026-09-27
--
-- Three vocabularies describe the same idea and they do not agree:
--
--   enrich-contacts emits     customer | vendor | sub | not_work | unknown
--   contact_proposals CHECK   customer | vendor | personal | spam
--   customers.relation CHECK  customer | vendor | sub
--
-- Only `customer` and `vendor` are legal in all three. `sub`, `not_work` and
-- `unknown` are rejected on INSERT by contact_proposals_classification_check.
--
-- Proven, as the `authenticated` role in a rolled-back transaction:
--
--   insert into contact_proposals (…, classification, …) values (…, 'sub', …);
--   ERROR: 23514 violates check constraint
--          "contact_proposals_classification_check"
--
-- WHY THIS HAS NEVER BEEN SEEN
--
-- enrich-contacts has never run — contact_proposals is 0 rows. And a
-- `dry_run` would not catch it either, because dry_run returns the row without
-- inserting it. Only a real run hits the constraint.
--
-- WHAT IT WOULD COST
--
-- Every contact the model classifies `sub`, `not_work` or `unknown` comes back
-- `insert_error` and no proposal is stored. Two of those are not edge cases:
--
--   `sub` is the PRIMARY WORKED EXAMPLE in DECISIONS.md §2. Luis, +1985…8307,
--   324 messages, the contact the whole direction-of-ask rule was written
--   around. His proposal cannot be stored.
--
--   `unknown` is the enricher's designed fallback — "If you cannot see the
--   direction, the answer is unknown. Guessing customer creates a fake lead;
--   unknown costs nothing." Across 197 contacts, most of which are a single
--   missed call, it is likely the most common answer. Every one fails.
--
-- THE FIX
--
-- Widen contact_proposals to the union of what the enricher emits and what the
-- table already holds. `personal` and `spam` are kept because the column
-- already allows them and dropping a value is the restrictive direction — that
-- is a separate decision, not something to fold into a fix for this.
--
-- customers.relation is NOT touched. It is correct that a relation is only
-- customer, vendor or sub: `not_work` and `unknown` are the absence of a
-- business relationship, not a kind of one. The API route rejects an attempt to
-- confirm those with a readable 400 rather than a constraint error.

begin;

alter table public.contact_proposals
  drop constraint if exists contact_proposals_classification_check;

alter table public.contact_proposals
  add constraint contact_proposals_classification_check
  check (classification = any (array[
    'customer',   -- money flows from them to us
    'vendor',     -- money flows from us to them, for materials or equipment
    'sub',        -- money flows from us to them, for labour
    'not_work',   -- spam, robocall, wrong number, political text
    'unknown',    -- the direction of the ask is not visible in the text
    'personal',   -- pre-existing value, kept
    'spam'        -- pre-existing value, kept; overlaps not_work
  ]));

comment on constraint contact_proposals_classification_check
  on public.contact_proposals is
  'Matches enrich-contacts'' five values plus the two the column already held. '
  'customers.relation is deliberately narrower (customer|vendor|sub) — not_work '
  'and unknown are the absence of a relationship, not a kind of one.';

commit;

-- VERIFY, after applying. Each states what failure looks like.
--
--   -- Passes if all five insert. Fails on 23514, which means the CHECK did not
--   -- take and enrich-contacts will still drop three of its five answers.
--   -- The five go on FIVE contacts: contact_proposals_one_pending allows only
--   -- one pending proposal per contact, so putting them all on one contact
--   -- fails with 23505 for a reason that has nothing to do with this CHECK.
--   begin;
--   insert into public.contact_proposals
--     (org_id, contact_id, classification, confidence, evidence_quote,
--      evidence_message_id, model, prompt_version)
--   select '<org>', c.id, v.cls, 50, 'x',
--          (select id from public.messages limit 1), 'test', 'test'
--     from (select id, row_number() over () rn from public.contacts limit 5) c
--     join (select cls, row_number() over () rn
--             from unnest(array['customer','vendor','sub','not_work','unknown']) cls) v
--     using (rn);
--   rollback;
--
--   Result 2026-09-27: customer, not_work, sub, unknown, vendor — all five.
--
--   -- Passes if this FAILS with 23514 — customers.relation must stay narrow.
--   -- (An earlier draft used `update … where false`, which touches no row and
--   -- so could never fail. A check that cannot fail is not a check.)
--   begin;
--   insert into public.customers (org_id, relation) values ('<org>', 'unknown');
--   rollback;
--
--   Result 2026-09-27: 23514 customers_relation_check — correctly rejected.
