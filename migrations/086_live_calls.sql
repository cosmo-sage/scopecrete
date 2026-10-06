-- 086 — A call that is happening now, and incoming alerts (Coy, 2026-10-06:
-- "There needs to be a way for me to be notified inside the scopecrete app for
-- incoming emails, text messages and phone calls. And if there is an active
-- phone call I would like that thread channel to show it's active.")
--
-- Quo sends `call.ringing` when a call starts and `call.completed` when it
-- ends (the recording, transcript and summary follow). Until now quo-intake
-- answered `call.ringing` with "ignored" and nothing was kept, and Quo's
-- webhook wasn't sending it anyway (none in quo_events). A call is "live" from
-- its ring until its completion.
--
-- Why a table of its own and not quo_events: every quo_events row is projected
-- into `messages` by trigger (§2a). A ringing event would become a second call
-- message — or collide with call.completed on the same call id — and
-- sc_project_raw_event would need rewriting. A live call is state, not
-- history: one row per call, ended when the call ends. The ring's payload is
-- kept on the row as it arrived.
--
-- Written only by quo-intake (service role). Members read their org's rows
-- under get_user_org_ids() (onsite estimators: none, as for messages). Anon
-- nothing. In supabase_realtime so the app hears a ring the moment it lands
-- (RLS decides who hears); `emails` too, so a forwarded email shows at once.
-- A handful of rows a day.
--
-- Additive. Undo:
--   alter publication supabase_realtime drop table public.live_calls, public.emails;
--   drop table public.live_calls;

create table if not exists public.live_calls (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  provider        text not null default 'quo',
  call_id         text not null,
  contact_id      uuid references public.contacts(id) on delete set null,
  phone_number_id uuid references public.org_phone_numbers(id) on delete set null,
  direction       text check (direction in ('inbound','outbound')),
  from_phone      text,
  to_phone        text,
  counterparty    text,
  status          text not null default 'ringing' check (status in ('ringing','answered','ended')),
  started_at      timestamptz not null default now(),
  answered_at     timestamptz,
  ended_at        timestamptz,
  raw_payload     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, call_id)
);

create index if not exists live_calls_org_open on public.live_calls (org_id, started_at desc) where ended_at is null;

alter table public.live_calls enable row level security;
revoke all on public.live_calls from anon, authenticated;
grant select on public.live_calls to authenticated;

create policy live_calls_member_read on public.live_calls
  for select to authenticated
  using (org_id = any (public.get_user_org_ids()));

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_calls') then
    alter publication supabase_realtime add table public.live_calls;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'emails') then
    alter publication supabase_realtime add table public.emails;
  end if;
end $$;
