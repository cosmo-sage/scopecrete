-- 080 — Dusty's file reader gives up on a file that keeps killing it.
--
-- Walker High's 25 MB spec book ran read-files out of memory mid-read. The run
-- died before it could write an outcome, so the row stayed 'reading'; after
-- 10 minutes sc_files_claim took it again — with no limit on tries. 340 tries
-- by 2026-10-05: "Reading 2635 Walker High Dugouts Specs…" on the activity
-- line every time Coy opened the app, and ~8.5 GB downloaded from storage
-- (the free plan's egress overage).
--
-- Now a file found still 'reading' after three tries is marked 'skipped' with
-- the reason, never claimed again (the same rule bid-intake v12 uses). Failed
-- reads keep their own three-try limit. Restrictive: nothing new is read.

create or replace function public.sc_files_claim(p_limit integer default 1)
 returns table(id uuid, org_id uuid, name text, kind text, mime_type text, byte_size bigint, storage_path text)
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  update public.files d
     set read_state = 'skipped',
         read_error = 'stopped the reader ' || d.read_attempts || ' times mid-read — too big to read on the server; the bid reader and the Plan Room still read it'
   where d.deleted_at is null and d.read_state = 'reading'
     and d.read_at < now() - interval '10 minutes' and d.read_attempts >= 3;

  return query
  update public.files f
     set read_state = 'reading', read_at = now(), read_attempts = f.read_attempts + 1
   where f.id in (
     select d.id from public.files d
      where d.deleted_at is null and d.fetch_state = 'fetched'
        and (d.read_state = 'waiting'
             or (d.read_state = 'failed' and d.read_at < now() - interval '30 minutes' and d.read_attempts < 3)
             or (d.read_state = 'reading' and d.read_at < now() - interval '10 minutes' and d.read_attempts < 3))
      order by d.created_at
      limit greatest(1, least(p_limit, 10))
      for update skip locked)
  returning f.id, f.org_id, f.name, f.kind, f.mime_type, f.byte_size, f.storage_path;
end;
$function$;
