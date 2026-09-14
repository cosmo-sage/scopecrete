-- 025_ai_answering_service.sql
-- AI answering service — Retell AI + Twilio, multi-tenant.
-- Rewrite of the 2026-09-14 "AI Answering Service — Supabase Schema Migration"
-- draft, corrected against the live schema of cxiusuewtrvcpqequueh.
--
-- APPLIED 2026-09-14 to cxiusuewtrvcpqequueh, on Coy's explicit instruction
-- (DECISIONS.md §7). Supabase migration name: ai_answering_service.
--
-- Verified after applying:
--   orgs count ......................... 1        (no second org created)
--   public.phone_numbers ............... NULL     (no duplicate table)
--   contact_timeline security_invoker .. true
--   contact_timeline as NON-member ..... 0 rows   <- RLS proven, not assumed
--   contact_timeline as Coy ............ 1,340 rows (812 sms + 528 call)
--   org_phone_numbers where ai_enabled . 0        (AI off until switched on)
--   new columns ........................ 7 of 7
--   security advisor ................... 0 new findings
--
-- ============================================================================
-- WHAT CHANGED FROM THE DRAFT, AND WHY
-- ============================================================================
--
-- 1. NO `phone_numbers` TABLE. `org_phone_numbers` already exists and already
--    holds +12255083258 (label 'Third'), +12253782458 ('Main') and
--    +19858608287 ('Cell'). api/threads/route.ts reads it to decide which side
--    of a conversation is us. A second table means two answers to "is this our
--    number" and the threads list would disagree with the call router.
--    This migration EXTENDS the existing table.
--
-- 2. NO `orgs` INSERT. The draft inserted slug 'sacco-builders' with
--    ON CONFLICT (slug) DO NOTHING. The live org's slug is 'sbuild', so the
--    conflict never fires and it creates a SECOND, EMPTY org — the phone number
--    and agent attach to that, and none of the 173 contacts / 1,341 messages /
--    57 leads belong to it. Everything would render empty. The org is
--    61e26b09-da88-4c9f-bd0c-a47054b86234 and it already exists.
--
-- 3. NO `call_recordings`. That table does not exist. Call media lives in
--    `voip_calls` + `call_artifacts`.
--
-- 4. `contact_timeline` READS `messages`, NOT `quo_events`. DECISIONS.md §2a:
--    quo_events is the raw log, `messages` is the spine and "the one table the
--    application reads". messages already holds sms (813) and call (528),
--    deduped by messages_provider_idx, with body_text/summary/transcript/
--    recording_url/from_address/to_address/occurred_at. The draft's three-way
--    UNION rebuilds from raw parts what migration 016 already built, and its
--    SMS arm filtered on event_type IN ('sms_received','sms_sent') — values
--    that do not exist here (real ones are message.received / message.delivered
--    / call.completed), so it would have returned zero texts.
--    The draft also referenced 8 columns that do not exist:
--      voip_calls.transcript_summary, .from_number, .to_number, .started_at
--      inbound_emails.body, .from_address, .to_address, .received_at
--    inbound_emails has 0 rows; when email starts flowing it should project
--    into `messages` like every other channel, and this view gets it for free.
--
-- 5. `security_invoker = true` ON THE VIEW. This is the important one.
--    On PostgreSQL 17 a view runs as its OWNER by default, which BYPASSES RLS
--    on the underlying tables. Without this, contact_timeline would expose
--    every org's message bodies to any authenticated caller. leads_view,
--    vendors_view and job_close_rates already set it; sc_spine_drift and
--    sc_open_name_questions do NOT and are latent cross-tenant leaks the moment
--    a second contractor is onboarded (see the note at the bottom).
--
-- 6. RLS USES get_user_org_ids(). DECISIONS.md §9 names it as THE isolation
--    helper, and §9 says core isolation is still mid-migration off the
--    app.current_org_id GUC. The draft's `auth.uid() IN (SELECT user_id FROM
--    org_members ...)` is a third dialect and makes that cleanup worse.
--
-- 7. THE service_role POLICIES ARE DROPPED. `FOR ALL USING (auth.role() =
--    'service_role')` is a no-op: the service role bypasses RLS entirely. It
--    reads as protection while doing nothing.
--
-- 8. transfer_keywords LIVES ON ONE TABLE. The draft put it on both, giving two
--    places to set one rule. It is agent behaviour, so it sits on voice_agents.
--    Its default was '{representative, human, agent, manager}' — the spaces are
--    part of the strings, so it would have matched " human" with a leading
--    space and never fired.
--
-- 9. messages GAINS phone_number_id. The draft linked voip_calls, quo_events,
--    sms_threads and leads but not the spine — which is the table every screen
--    reads, and therefore the one per-client reporting has to group by.

begin;

-- ============================================================================
-- 1. Extend org_phone_numbers with routing configuration
-- ============================================================================
-- Existing columns kept as they are: id, org_id, phone_e164, label,
-- is_primary, active, created_at. Note the existing names — phone_e164 not
-- phone_number, active not is_active.

alter table public.org_phone_numbers
  add column if not exists twilio_sid         text,
  add column if not exists ai_enabled         boolean not null default false,
  add column if not exists routing_mode       text not null default 'human_first',
  add column if not exists forward_to_phone   text,
  add column if not exists business_hours     jsonb,
  add column if not exists after_hours_action text not null default 'ai_answer',
  add column if not exists updated_at         timestamptz not null default now();

-- ai_enabled defaults FALSE so this migration cannot silently put an AI on the
-- three numbers already in the table. Answering a customer's call is not
-- something to switch on by side effect of a schema change.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'org_phone_numbers_routing_mode_chk') then
    alter table public.org_phone_numbers
      add constraint org_phone_numbers_routing_mode_chk
      check (routing_mode in ('human_first', 'ai_first'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'org_phone_numbers_after_hours_chk') then
    alter table public.org_phone_numbers
      add constraint org_phone_numbers_after_hours_chk
      check (after_hours_action in ('ai_answer', 'voicemail', 'forward'));
  end if;

  -- A number can only belong to one org. Without this, two orgs could claim the
  -- same line and inbound routing would be ambiguous.
  if not exists (select 1 from pg_constraint where conname = 'org_phone_numbers_phone_e164_key') then
    alter table public.org_phone_numbers
      add constraint org_phone_numbers_phone_e164_key unique (phone_e164);
  end if;
end $$;

create index if not exists idx_org_phone_numbers_ai_enabled
  on public.org_phone_numbers (org_id) where ai_enabled = true;

comment on column public.org_phone_numbers.ai_enabled is
  'Whether the AI answering service handles this line. Defaults false — turning it on is a deliberate act, never a migration side effect.';
comment on column public.org_phone_numbers.routing_mode is
  'human_first = ring forward_to_phone first, AI picks up on miss. ai_first = AI answers immediately and warm-transfers on request.';
comment on column public.org_phone_numbers.forward_to_phone is
  'Where to ring the human: human_first routing, and emergency transfer.';
comment on column public.org_phone_numbers.business_hours is
  'e.g. {"timezone":"America/Chicago","monday":{"open":"07:00","close":"18:00"}}. Null means always treat as open.';

-- RLS already exists on this table as org_phone_numbers_rw, scoped to
-- get_user_org_ids(). Nothing to add; the new columns inherit it.

-- ============================================================================
-- 2. voice_agents — the AI's prompt, voice and transfer rules
-- ============================================================================

create table if not exists public.voice_agents (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs(id) on delete cascade,
  phone_number_id       uuid references public.org_phone_numbers(id) on delete set null,

  name                  text,
  is_active             boolean not null default true,
  is_default            boolean not null default false,

  system_prompt         text not null,
  provider              text not null default 'retell',
  provider_agent_id     text,
  voice_id              text,
  language              text not null default 'en',
  temperature           real not null default 0.7,
  max_duration_seconds  integer not null default 300,

  transfer_if_urgent    boolean not null default true,
  transfer_keywords     text[] not null default '{representative,human,agent,manager,emergency}',

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_voice_agents_org_id on public.voice_agents (org_id);
create index if not exists idx_voice_agents_phone_number_id on public.voice_agents (phone_number_id);

-- One default agent per org, enforced rather than hoped for. The draft's
-- partial index was not unique, so an org could carry two defaults and the
-- router would pick arbitrarily.
create unique index if not exists uq_voice_agents_one_default_per_org
  on public.voice_agents (org_id) where is_default;

alter table public.voice_agents enable row level security;

drop policy if exists voice_agents_rw on public.voice_agents;
create policy voice_agents_rw on public.voice_agents
  for all
  using (org_id = any (get_user_org_ids()))
  with check (org_id = any (get_user_org_ids()));

-- FOR ALL, not FOR SELECT: the contractor edits his own agent's prompt from the
-- dashboard. A read-only policy would make that screen silently fail to save.

comment on table public.voice_agents is
  'AI voice agent config per org. provider/provider_agent_id keep this portable — Retell today, something else later, without a schema change.';
comment on column public.voice_agents.system_prompt is
  'System prompt for the voice agent: personality, qualification criteria, what to collect.';
comment on column public.voice_agents.transfer_keywords is
  'Lower-cased words that trigger a transfer to a human. No spaces after the commas in the default — they would become part of the strings.';

-- ============================================================================
-- 3. Link traffic back to the number it arrived on
-- ============================================================================
-- call_recordings is NOT in this list: it does not exist. Call media is
-- voip_calls + call_artifacts.

alter table public.messages    add column if not exists phone_number_id uuid references public.org_phone_numbers(id);
alter table public.voip_calls  add column if not exists phone_number_id uuid references public.org_phone_numbers(id);
alter table public.quo_events  add column if not exists phone_number_id uuid references public.org_phone_numbers(id);
alter table public.sms_threads add column if not exists phone_number_id uuid references public.org_phone_numbers(id);
alter table public.leads       add column if not exists source_phone_number_id uuid references public.org_phone_numbers(id);

create index if not exists idx_messages_phone_number_id    on public.messages    (phone_number_id) where phone_number_id is not null;
create index if not exists idx_voip_calls_phone_number_id  on public.voip_calls  (phone_number_id) where phone_number_id is not null;
create index if not exists idx_quo_events_phone_number_id  on public.quo_events  (phone_number_id) where phone_number_id is not null;
create index if not exists idx_sms_threads_phone_number_id on public.sms_threads (phone_number_id) where phone_number_id is not null;
create index if not exists idx_leads_source_phone_number_id on public.leads      (source_phone_number_id) where source_phone_number_id is not null;

comment on column public.messages.phone_number_id is
  'Which of our numbers this message came through. Nullable: the 1,341 rows that predate the AI service have no value and are not backfilled here.';

-- ============================================================================
-- 4. leads.retell_call_id
-- ============================================================================

alter table public.leads add column if not exists retell_call_id text;
create index if not exists idx_leads_retell_call_id
  on public.leads (retell_call_id) where retell_call_id is not null;

comment on column public.leads.retell_call_id is
  'Retell call id that produced this lead. Links back to the Retell dashboard for replay.';

-- ============================================================================
-- 5. contact_timeline — one chronological view per contact
-- ============================================================================
-- Built on `messages`, the spine. It already carries sms and call, deduped, and
-- will carry email the moment email projects into it. No UNION needed.
--
-- security_invoker = true is load bearing: without it this view runs as its
-- owner and returns every org's messages to any caller.

drop view if exists public.contact_timeline;

create view public.contact_timeline
with (security_invoker = true)
as
select
  m.id                as message_id,
  m.contact_id,
  m.org_id,
  m.phone_number_id,
  m.channel,
  m.direction,
  m.occurred_at,
  -- What to show in a list. body_text for a text, the summary for a call
  -- (which may be a voicemail transcript — summary_source says which).
  coalesce(nullif(btrim(m.body_text), ''), nullif(btrim(m.summary), '')) as preview,
  m.summary_source,
  m.from_address,
  m.to_address,
  m.duration_seconds,
  m.recording_url,
  -- Deliberately NOT selecting m.transcript. Transcripts reach ~10,600
  -- characters; a timeline that carries them is a timeline nobody can page
  -- through. Fetch it per message on expand, as the app already does.
  (m.transcript is not null) as has_transcript
from public.messages m
where m.contact_id is not null;

comment on view public.contact_timeline is
  'Per-contact chronological timeline over the messages spine. security_invoker=true so the caller''s RLS applies — without it this view leaks every org. Order in the query, not the view.';

-- Note: no ORDER BY in the view. A view-level ORDER BY is not guaranteed to
-- survive being wrapped in an outer query and forces a sort on every read.
-- Callers should ORDER BY occurred_at DESC.

commit;

-- ============================================================================
-- SEED — run separately, after Twilio is configured. NOT part of the migration.
-- ============================================================================
-- No org INSERT. The org exists: 61e26b09-da88-4c9f-bd0c-a47054b86234 ('sbuild').
-- +12255083258 is already a row in org_phone_numbers, labelled 'Third'.
--
--   update public.org_phone_numbers
--      set label              = 'Sacco Builders Main Line',
--          twilio_sid         = '<PN... from Twilio>',
--          ai_enabled         = true,
--          routing_mode       = 'human_first',
--          forward_to_phone   = '+1225XXXXXXX',
--          business_hours     = '{"timezone":"America/Chicago",
--                                 "monday":{"open":"07:00","close":"18:00"},
--                                 "tuesday":{"open":"07:00","close":"18:00"},
--                                 "wednesday":{"open":"07:00","close":"18:00"},
--                                 "thursday":{"open":"07:00","close":"18:00"},
--                                 "friday":{"open":"07:00","close":"18:00"},
--                                 "saturday":{"open":"08:00","close":"14:00"}}'::jsonb,
--          updated_at         = now()
--    where phone_e164 = '+12255083258'
--      and org_id     = '61e26b09-da88-4c9f-bd0c-a47054b86234';
--
--   insert into public.voice_agents (org_id, phone_number_id, name, system_prompt, voice_id, is_default)
--   select '61e26b09-da88-4c9f-bd0c-a47054b86234', pn.id, 'Sacco Receptionist',
--          'You are the receptionist for Sacco Builders & Co ...',
--          '<elevenlabs voice id>', true
--     from public.org_phone_numbers pn
--    where pn.phone_e164 = '+12255083258';

-- ============================================================================
-- VERIFICATION — each check with the result that means FAILURE
-- ============================================================================
-- 1. Still exactly one org. More than one row means the draft's INSERT ran.
--      select count(*) from public.orgs;                       -- expect 1
--
-- 2. No duplicate phone table.
--      select to_regclass('public.phone_numbers');             -- expect NULL
--
-- 3. The view is invoker-scoped. 'NOT SET' here is the cross-tenant leak.
--      select coalesce((select option_value from pg_options_to_table(c.reloptions)
--                       where option_name='security_invoker'), 'NOT SET')
--        from pg_class c join pg_namespace n on n.oid=c.relnamespace
--       where n.nspname='public' and c.relname='contact_timeline';   -- expect 'on'
--
-- 4. The timeline sees the real traffic. 0 means it is reading the wrong table.
--      select channel, count(*) from public.contact_timeline group by channel;
--      -- expect EXACTLY sms 812, call 528 (measured 2026-09-14 by running the
--      -- view's SELECT body read-only before writing this file).
--      -- 812, not 813: one sms row has a null contact_id and is filtered out.
--      -- Of the 1,340, only 845 carry a preview. The other 495 are calls with
--      -- no summary — missed calls with nothing captured, which is the gap the
--      -- AI answering service exists to close.
--
-- 5. The AI is off until switched on deliberately.
--      select count(*) from public.org_phone_numbers where ai_enabled;  -- expect 0

-- ============================================================================
-- SEPARATE, PRE-EXISTING, NOT FIXED HERE
-- ============================================================================
-- sc_spine_drift and sc_open_name_questions have no security_invoker, so they
-- run as owner and ignore RLS. Invisible with one org; real cross-tenant leaks
-- the day a second contractor is onboarded — which is what this whole migration
-- is for. Deliberately left alone: they are unrelated to the AI service and
-- changing them is its own reviewable change.
--
--   alter view public.sc_spine_drift set (security_invoker = true);
--   alter view public.sc_open_name_questions set (security_invoker = true);

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- begin;
-- drop view if exists public.contact_timeline;
-- drop table if exists public.voice_agents cascade;
-- alter table public.messages    drop column if exists phone_number_id;
-- alter table public.voip_calls  drop column if exists phone_number_id;
-- alter table public.quo_events  drop column if exists phone_number_id;
-- alter table public.sms_threads drop column if exists phone_number_id;
-- alter table public.leads       drop column if exists source_phone_number_id;
-- alter table public.leads       drop column if exists retell_call_id;
-- alter table public.org_phone_numbers
--   drop column if exists twilio_sid,
--   drop column if exists ai_enabled,
--   drop column if exists routing_mode,
--   drop column if exists forward_to_phone,
--   drop column if exists business_hours,
--   drop column if exists after_hours_action,
--   drop column if exists updated_at;
-- alter table public.org_phone_numbers drop constraint if exists org_phone_numbers_routing_mode_chk;
-- alter table public.org_phone_numbers drop constraint if exists org_phone_numbers_after_hours_chk;
-- -- NOTE: org_phone_numbers_phone_e164_key is left in place deliberately. It is
-- -- a correctness constraint that should have existed anyway.
-- commit;
