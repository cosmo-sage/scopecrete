-- 029 — the background enricher.
--
-- Coy, 2026-09-27: "build the background job so it runs when the app is
-- closed." The enrich-contacts edge function becomes a worker that pg_cron
-- calls every five minutes. It reads unnamed contacts whose traffic changed,
-- writes a contact_proposals row for each (a question for Coy), and names a
-- contact only when the person introduced themselves (DECISIONS §2b).
--
-- Additive only: two extensions, two tables, one view, three functions and
-- one vault secret. Nothing existing is altered. The cron schedule itself is
-- migration 030, applied after the worker is deployed and answering.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Every read of a contact, one row each. The worker claims a contact by
-- inserting a 'running' row; the partial unique index makes a second claim of
-- the same contact impossible while the first is in flight.
-- ---------------------------------------------------------------------------
create table if not exists public.contact_enrich_runs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  outcome     text not null default 'running'
              check (outcome in ('running', 'proposed', 'named', 'unchanged', 'no_words',
                                 'model_error', 'failed', 'abandoned', 'skipped')),
  proposal_id uuid references public.contact_proposals(id) on delete set null,
  claim_id    uuid references public.contact_name_claims(id) on delete set null,
  note        text
);

create unique index if not exists contact_enrich_runs_one_running
  on public.contact_enrich_runs (contact_id) where outcome = 'running';
create index if not exists contact_enrich_runs_contact_started
  on public.contact_enrich_runs (contact_id, started_at desc);
create index if not exists contact_enrich_runs_org_started
  on public.contact_enrich_runs (org_id, started_at desc);

alter table public.contact_enrich_runs enable row level security;
revoke all on public.contact_enrich_runs from anon;
-- Read-only to members of the org. Only the worker (service role) writes.
create policy contact_enrich_runs_read on public.contact_enrich_runs
  for select to authenticated using (org_id = any (public.get_user_org_ids()));

-- ---------------------------------------------------------------------------
-- The worker's pulse. No tenant data, ever: a status word and a sentence
-- about configuration or reachability, so the app can say "the background
-- reader isn't connected" instead of silently showing nothing.
-- ---------------------------------------------------------------------------
create table if not exists public.sc_worker_heartbeats (
  worker    text primary key,
  ticked_at timestamptz not null default now(),
  status    text not null check (status in ('ok', 'not_configured', 'hermes_unreachable', 'error')),
  detail    text
);
alter table public.sc_worker_heartbeats enable row level security;
revoke all on public.sc_worker_heartbeats from anon;
create policy sc_worker_heartbeats_read on public.sc_worker_heartbeats
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Who is due a read. security_invoker (DECISIONS §9): under a user's session
-- RLS scopes it to their org; the worker runs it as service role.
--
--   - unnamed, not merged away, name not human-confirmed
--   - has something THEY said: inbound text, or a call with a transcript or
--     summary (a rough 15-character floor; worthEnriching() in the worker is
--     the real test)
--   - quiet for 3 minutes, so a burst of texts is read once, together, and a
--     call's transcript (which lands minutes after the call) is included
--   - never read, or new activity since the last read, or the last read
--     failed more than 30 minutes ago
-- ---------------------------------------------------------------------------
create or replace view public.sc_enrich_due with (security_invoker = true) as
with activity as (
  select m.contact_id,
         max(greatest(m.created_at, coalesce(a.created_at, m.created_at))) as changed_at,
         max(m.occurred_at) as last_at,
         sum(case when m.channel <> 'call' and m.direction = 'inbound'
                  then length(coalesce(m.body_text, '')) else 0 end)
           + 100 * count(a.id) + sum(length(coalesce(m.summary, ''))) as words
  from public.messages m
  left join public.call_artifacts a
    on a.message_id = m.id and a.kind in ('transcript', 'summary')
  where m.contact_id is not null
    and (m.direction = 'inbound' or m.channel = 'call')
  group by m.contact_id
), last_run as (
  select distinct on (r.contact_id) r.contact_id, r.started_at, r.outcome
  from public.contact_enrich_runs r
  order by r.contact_id, r.started_at desc
)
select c.org_id, c.id as contact_id, a.last_at, a.changed_at
from public.contacts c
join activity a on a.contact_id = c.id
left join last_run r on r.contact_id = c.id
where c.merged_into_contact_id is null
  and coalesce(btrim(c.name), '') = ''
  and c.name_source is distinct from 'human'
  and a.words >= 15
  and a.changed_at < now() - interval '3 minutes'
  and (r.contact_id is null
       or (r.outcome <> 'running' and a.changed_at > r.started_at)
       or (r.outcome in ('model_error', 'failed', 'abandoned')
           and r.started_at < now() - interval '30 minutes'));

revoke all on public.sc_enrich_due from anon;

-- ---------------------------------------------------------------------------
-- Claim up to p_limit due contacts, most recent traffic first. Reaps runs
-- that never finished (a crashed worker) so they become due again.
-- Service role only.
-- ---------------------------------------------------------------------------
create or replace function public.sc_enrich_claim(p_limit integer default 6)
returns table (run_id uuid, org_id uuid, contact_id uuid)
language sql
security invoker
set search_path = public
as $$
  update public.contact_enrich_runs
     set outcome = 'abandoned', finished_at = now(),
         note = 'worker did not finish within 10 minutes'
   where outcome = 'running' and started_at < now() - interval '10 minutes';

  with picked as (
    select d.org_id, d.contact_id
    from public.sc_enrich_due d
    order by d.last_at desc nulls last
    limit greatest(1, least(p_limit, 25))
  )
  insert into public.contact_enrich_runs as r (org_id, contact_id)
  select p.org_id, p.contact_id from picked p
  on conflict (contact_id) where outcome = 'running' do nothing
  returning r.id, r.org_id, r.contact_id;
$$;

revoke all on function public.sc_enrich_claim(integer) from public, anon, authenticated;
grant execute on function public.sc_enrich_claim(integer) to service_role;

-- ---------------------------------------------------------------------------
-- The worker's own credential. pg_cron presents it; the worker checks it
-- here. It never leaves the database: nobody types it, nobody pastes it.
-- ---------------------------------------------------------------------------
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'enrich_worker_token',
  'Bearer token pg_cron presents to the enrich-contacts worker (migration 029).'
)
where not exists (select 1 from vault.secrets where name = 'enrich_worker_token');

create or replace function public.sc_enrich_worker_authorized(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_token) >= 32, false) and exists (
    select 1 from vault.decrypted_secrets
    where name = 'enrich_worker_token' and decrypted_secret = p_token
  );
$$;

revoke all on function public.sc_enrich_worker_authorized(text) from public, anon, authenticated;
grant execute on function public.sc_enrich_worker_authorized(text) to service_role;

-- ---------------------------------------------------------------------------
-- For the Threads screen: how many of MY contacts are waiting, and when a
-- contact of mine was last read. Invoker, so RLS scopes both to the caller.
-- ---------------------------------------------------------------------------
create or replace function public.sc_enrich_status()
returns table (waiting bigint, last_read_at timestamptz, named_7d bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.sc_enrich_due),
    (select max(finished_at) from public.contact_enrich_runs where outcome <> 'running'),
    (select count(*) from public.contact_enrich_runs
      where outcome = 'named' and finished_at > now() - interval '7 days');
$$;

revoke all on function public.sc_enrich_status() from public, anon;
grant execute on function public.sc_enrich_status() to authenticated;
