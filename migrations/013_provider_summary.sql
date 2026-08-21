-- 013_provider_summary.sql — ScopeCrete.ai
--
-- Additive only. NOT YET APPLIED (DECISIONS.md §7).

-- The provider's own AI summary of a call, as returned by
-- GET /v1/call-summaries/{callId} and by the call.summary.completed webhook.
--
-- Distinct from voip_calls.summary, which already exists and holds exactly one
-- row today (written by the call.summary.completed handler on 2026-08-20). The
-- two are the SAME data from the same source, so quo-intake v7 now writes both
-- and they will not diverge. Once the backfill has run and the values are
-- confirmed identical, `summary` should be dropped in favour of this column —
-- a name that says where the text came from, which matters when a
-- ScopeCrete-generated summary eventually exists alongside it.
alter table public.voip_calls
  add column if not exists provider_summary text,
  add column if not exists provider_summary_fetched_at timestamptz;

comment on column public.voip_calls.provider_summary is
  'Quo/OpenPhone AI call summary. Same source as voip_calls.summary, which is '
  'retained only for backward compatibility and should be retired.';

-- Storage columns for the audio we fetch ourselves. The webhook only ever
-- hands us a presigned URL, so without a durable copy the audio expires.
alter table public.voip_calls
  add column if not exists recording_storage_path text,
  add column if not exists recording_fetched_at   timestamptz,
  add column if not exists transcript_fetched_at  timestamptz;

comment on column public.voip_calls.recording_storage_path is
  'Path in the private call-audio bucket. recording_url is the provider''s '
  'presigned link and expires; this is our own copy.';

-- Private bucket. These are customer call recordings — a public bucket would
-- expose every caller's audio to anyone holding the URL.
insert into storage.buckets (id, name, public)
select 'call-audio', 'call-audio', false
where not exists (select 1 from storage.buckets where id = 'call-audio');

-- Lets the backfill find its remaining work without a sequential scan.
create index if not exists voip_calls_backfill_pending_idx
  on public.voip_calls (created_at desc)
  where recording_storage_path is null or transcript is null or provider_summary is null;
