-- 011_enrichment_support.sql — ScopeCrete.ai
--
-- Additive only. No column is dropped, no type is widened, no policy is
-- loosened. Required before the voicemail backfill (piece 1) and the
-- proposal-based enricher (piece 2) can run.
--
-- NOT YET APPLIED. Per DECISIONS.md §7, schema changes need confirmation
-- before an agent runs them.

-- ---------------------------------------------------------------------------
-- 1. Somewhere to record where the audio actually landed
-- ---------------------------------------------------------------------------
-- voip_calls.recording_url holds a share.quo.com link with a `?sig=` query
-- parameter — a PRESIGNED url, not a durable one. We do not own that file and
-- the signature will stop working. The downloaded copy needs its own column;
-- recording_url is preserved untouched so the provenance of the original link
-- survives.

alter table public.voip_calls
  add column if not exists recording_storage_path text,
  add column if not exists recording_fetched_at   timestamptz,
  add column if not exists transcribed_at         timestamptz,
  add column if not exists transcription_model    text;

comment on column public.voip_calls.recording_storage_path is
  'Path within the call-audio storage bucket. recording_url is the original '
  'presigned provider link and may already be expired; this is our own copy.';

-- ---------------------------------------------------------------------------
-- 2. Private bucket for call audio
-- ---------------------------------------------------------------------------
-- Private. These are customer voicemails — a public bucket would expose every
-- caller's recording to anyone holding the URL.

insert into storage.buckets (id, name, public)
select 'call-audio', 'call-audio', false
where not exists (select 1 from storage.buckets where id = 'call-audio');

-- Service role bypasses RLS and is what the backfill function uses, so no
-- permissive object policy is added here. Reader access for the app is a
-- separate, deliberate decision — signed URLs minted server-side are the
-- intended path, not a blanket select policy.

-- ---------------------------------------------------------------------------
-- 3. Evidence that can actually point at the evidence
-- ---------------------------------------------------------------------------
-- contact_proposals.evidence_message_id is a FK to public.messages(id).
-- public.messages currently holds ZERO rows — the conversation history this
-- enricher reads lives in public.sms_threads and public.voip_calls. Setting
-- evidence_message_id to an sms_threads id would violate the FK, so the
-- provenance requirement cannot be met through that column as it stands.
--
-- Rather than repoint or drop that FK (messages is clearly the intended
-- unified comms table and will matter later), add sibling columns that can
-- reference where the evidence really is today. evidence_message_id stays and
-- becomes usable unchanged once messages is populated.

alter table public.contact_proposals
  add column if not exists evidence_sms_thread_id uuid
      references public.sms_threads(id) on delete set null,
  add column if not exists evidence_voip_call_id  uuid
      references public.voip_calls(id) on delete set null,
  add column if not exists source_fingerprint     text;

comment on column public.contact_proposals.evidence_sms_thread_id is
  'The sms_threads row the proposal was drawn from. Sibling to '
  'evidence_message_id, which FKs to public.messages (empty as of 2026-08-21).';

comment on column public.contact_proposals.source_fingerprint is
  'Hash of the conversation the proposal was derived from. Used for '
  'idempotency: unchanged conversation => no new proposal.';

-- Enforce the provenance rule structurally rather than by convention.
-- Every proposal must point at something and quote it.
alter table public.contact_proposals
  drop constraint if exists contact_proposals_requires_evidence;

alter table public.contact_proposals
  add constraint contact_proposals_requires_evidence check (
    evidence_quote is not null
    and (
      evidence_message_id    is not null
      or evidence_sms_thread_id is not null
      or evidence_voip_call_id  is not null
    )
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
