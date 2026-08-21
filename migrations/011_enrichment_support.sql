-- 011_enrichment_support.sql — ScopeCrete.ai
--
-- Additive only. No column is dropped, no type is widened, no policy is
-- loosened. Required before the proposal-based enricher can run.
--
-- Storage columns and the call-audio bucket were originally drafted here for a
-- voicemail-only backfill. That function was superseded before it ever ran, and
-- those objects now live in 013 alongside the rest of the call-media work.
-- This migration is scoped to contact_proposals only.

-- ---------------------------------------------------------------------------
-- Evidence provenance
-- ---------------------------------------------------------------------------
-- public.messages is fully backfilled as of 2026-08-21: 1,069 rows covering
-- all 435 voip_calls and 634 sms_threads, each with legacy_id, import_source,
-- contact_id and customer_id set. Verified: 0 voip_calls without a twin, 0
-- duplicate twins.
--
-- So contact_proposals.evidence_message_id works exactly as designed and the
-- enricher cites it directly. An earlier draft of this migration added
-- evidence_sms_thread_id / evidence_voip_call_id sibling columns because
-- messages was empty at the time; that plan is dropped. The enricher now reads
-- the conversation FROM messages, so every id it cites is already a messages id.

alter table public.contact_proposals
  add column if not exists source_fingerprint text;

comment on column public.contact_proposals.source_fingerprint is
  'Hash of the conversation the proposal was derived from. Used for '
  'idempotency: unchanged conversation => no new proposal.';

-- Enforce the provenance rule structurally rather than by convention.
-- Every proposal must point at something and quote it.
alter table public.contact_proposals
  drop constraint if exists contact_proposals_requires_evidence;

alter table public.contact_proposals
  add constraint contact_proposals_requires_evidence check (
    evidence_quote is not null and evidence_message_id is not null
  ) not valid;

-- NOT VALID so the constraint applies to new rows without failing on any
-- pre-existing ones. contact_proposals is empty today, so validate it:
alter table public.contact_proposals
  validate constraint contact_proposals_requires_evidence;

-- Model and prompt version are provenance too, not decoration.
alter table public.contact_proposals
  alter column model set not null,
  alter column prompt_version set not null;

-- One live proposal per contact. Superseding is an UPDATE to 'superseded',
-- never a DELETE, so the history of what the model used to think survives.
create unique index if not exists contact_proposals_one_pending_per_contact
  on public.contact_proposals (contact_id)
  where status = 'pending';

create index if not exists contact_proposals_contact_status_idx
  on public.contact_proposals (contact_id, status);
