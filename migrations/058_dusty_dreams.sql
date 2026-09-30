-- 058 — Dusty's dreaming (Coy on Vercel, 2026-09-30): "I'd like him to
-- compile and learn and make funny comments about phone conversations and
-- text messages that are in the database from today and days/weeks past."
--
--   * dusty_dreams — one light, past-tense line about a window of calls and
--     texts, with the message and contact ids it is about. Written only by
--     the dusty-dream edge function (service role); org members read them.
--   * pg_cron runs dusty-dream every two hours with the enricher's vault
--     token (checked in the function by sc_enrich_worker_authorized).
--     Pause: select cron.unschedule('dusty-dream');
--
-- Additive: one table and one schedule.

create table if not exists public.dusty_dreams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  span text not null check (span in ('today', 'memory')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  dream text not null check (length(dream) between 1 and 200),
  message_ids uuid[] not null default '{}',
  contact_ids uuid[] not null default '{}',
  model text,
  created_at timestamptz not null default now()
);
create index if not exists dusty_dreams_org_idx on public.dusty_dreams (org_id, created_at desc);
alter table public.dusty_dreams enable row level security;
revoke all on public.dusty_dreams from anon;
revoke insert, update, delete, truncate on public.dusty_dreams from authenticated;
grant select on public.dusty_dreams to authenticated;
drop policy if exists dusty_dreams_member_select on public.dusty_dreams;
create policy dusty_dreams_member_select on public.dusty_dreams for select to authenticated
  using (org_id = any (public.get_user_org_ids()));

select cron.schedule(
  'dusty-dream',
  '23 */2 * * *',
  $cron$
  select net.http_post(
    url := 'https://cxiusuewtrvcpqequueh.supabase.co/functions/v1/dusty-dream',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'enrich_worker_token')
    ),
    timeout_milliseconds := 10000
  );
  $cron$
);
