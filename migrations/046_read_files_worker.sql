-- 046 — Dusty's file reader: the claim, and the minute it runs on.
--
-- read-files (edge function) reads what Coy uploads (migration 045). It
-- claims one file at a time here, as service role; the token it is called
-- with is the enricher's vault secret (sc_enrich_worker_authorized).
--
-- Due: uploaded (fetch_state 'fetched'), not deleted, and
--   waiting — never read;
--   or failed 30+ minutes ago with fewer than 3 tries;
--   or stuck "reading" 10+ minutes (a run that died).
-- FOR UPDATE SKIP LOCKED keeps two overlapping runs off the same file.
--
-- Additive: one function (service role only) and one cron job.

create or replace function public.sc_files_claim(p_limit integer default 1)
returns table (id uuid, org_id uuid, name text, kind text, mime_type text, byte_size bigint, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.job_files f
     set read_state = 'reading', read_at = now(), read_attempts = f.read_attempts + 1
   where f.id in (
     select d.id from public.job_files d
      where d.deleted_at is null and d.fetch_state = 'fetched'
        and (d.read_state = 'waiting'
             or (d.read_state = 'failed' and d.read_at < now() - interval '30 minutes' and d.read_attempts < 3)
             or (d.read_state = 'reading' and d.read_at < now() - interval '10 minutes'))
      order by d.created_at
      limit greatest(1, least(p_limit, 10))
      for update skip locked)
  returning f.id, f.org_id, f.name, f.kind, f.mime_type, f.byte_size, f.storage_path;
end;
$$;

revoke all on function public.sc_files_claim(integer) from public, anon, authenticated;
grant execute on function public.sc_files_claim(integer) to service_role;

select cron.schedule(
  'read-files',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://cxiusuewtrvcpqequueh.supabase.co/functions/v1/read-files',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'enrich_worker_token')
    ),
    timeout_milliseconds := 10000
  );
  $cron$
);
