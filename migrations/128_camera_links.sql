-- 128 — a camera link for a customer (Coy, 2026-10-24: "a clean way to send a
-- link to the camera that would be linked to a job so that a customer can just
-- click the link in a text message and open a camera on their phone and capture
-- images and video just like in the sections on the budget? And any images and
-- video would be uploaded to the files for that job/contact").
--
-- One private link — scopecrete.ai/cam/<token>, no login, like /p/, /b/ and /c/
-- — for a job and the person it is sent to (or a person alone), optionally one
-- of the job's sections. It opens a camera on their phone; every photo and
-- video is a `files` row on that job, section and person, source 'capture',
-- named "Photo from Johnette · Oct 24 2.31 PM.jpg", Dusty reading the photos.
-- A link lasts 30 days unless Coy turns it off sooner.
--
-- Anon may run only the doors:
--   sc_camera_link(token)          what the page shows; the opening counted
--                                  (not when the reader is in the org);
--   sc_camera_upload_ok(name)      storage: anon may upload only under
--                                  {org}/camera/{link}/ of a live link,
--                                  400 objects a day (a shot and its thumbnail);
--   sc_camera_shot(token, …)       records one uploaded shot as a file, once
--                                  per shot (the phone's own id), the first of
--                                  a visit leaving an internal note on the person.
-- Members make, read and turn off links; nothing else writes them.
--
-- Additive only. RLS by get_user_org_ids(); anon no grant on the table; a guard
-- keeps the job, section and person on the link's org.

create table if not exists public.camera_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  section_id uuid references public.job_sections(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  token text not null unique check (length(token) >= 24),
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  view_count integer not null default 0,
  opened_at timestamptz,
  last_viewed_at timestamptz,
  shot_count integer not null default 0,
  last_shot_at timestamptz,
  check (job_id is not null or contact_id is not null)
);
create index if not exists camera_links_job_idx on public.camera_links (org_id, job_id, created_at desc);
create index if not exists camera_links_contact_idx on public.camera_links (org_id, contact_id, created_at desc);

create or replace function public.sc_camera_link_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.job_id is not null and not exists (select 1 from jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'that job is not in this org';
  end if;
  if new.section_id is not null and not exists (select 1 from job_sections s where s.id = new.section_id and s.org_id = new.org_id
      and s.job_id is not distinct from new.job_id) then
    raise exception 'that section is not on this job';
  end if;
  if new.contact_id is not null and not exists (select 1 from contacts c where c.id = new.contact_id and c.org_id = new.org_id) then
    raise exception 'that person is not in this org';
  end if;
  return new;
end $$;
create or replace trigger camera_links_guard before insert or update of org_id, job_id, section_id, contact_id on public.camera_links
  for each row execute function public.sc_camera_link_guard();

alter table public.camera_links enable row level security;
revoke all on public.camera_links from anon, authenticated;
grant select, insert on public.camera_links to authenticated;
grant update (revoked_at) on public.camera_links to authenticated;
create policy camera_links_member_read on public.camera_links
  for select to authenticated using (org_id = any (public.get_user_org_ids()));
create policy camera_links_member_insert on public.camera_links
  for insert to authenticated with check (org_id = any (public.get_user_org_ids()));
create policy camera_links_member_update on public.camera_links
  for update to authenticated using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));

-- What the page shows.
create or replace function public.sc_camera_link(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l camera_links; own boolean; org_name text; job_title text; job_addr text; sec text; first text;
begin
  if p_token is null or length(p_token) < 24 then return null; end if;
  select * into l from camera_links where token = p_token;
  if not found then return null; end if;
  select name into org_name from orgs where id = l.org_id;
  if l.revoked_at is not null or l.expires_at < now() then
    return jsonb_build_object('gone', true, 'org_name', org_name);
  end if;
  own := coalesce(l.org_id = any(get_user_org_ids()), false);
  if not own then
    update camera_links set view_count = view_count + 1, last_viewed_at = now(), opened_at = coalesce(opened_at, now()) where id = l.id;
  end if;
  select title, address into job_title, job_addr from jobs where id = l.job_id;
  select name into sec from job_sections where id = l.section_id;
  select nullif(split_part(btrim(coalesce(first_name, name, '')), ' ', 1), '') into first from contacts where id = l.contact_id;
  return jsonb_build_object('gone', false, 'own', own, 'org_name', org_name, 'link_id', l.id, 'org_id', l.org_id,
    'job', job_title, 'address', job_addr, 'section', sec, 'first_name', first,
    'expires_at', l.expires_at, 'shots', l.shot_count);
end $$;
revoke all on function public.sc_camera_link(text) from public;
grant execute on function public.sc_camera_link(text) to anon, authenticated;

-- Storage: an upload under a live link's own folder, at most 400 objects a day.
create or replace function public.sc_camera_upload_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(p_name, '/', 2) = 'camera'
     and split_part(p_name, '/', 3) ~ '^[0-9a-f-]{36}$'
     and p_name not like '%..%'
     and exists (select 1 from camera_links l
                  where l.id::text = split_part(p_name, '/', 3)
                    and l.org_id::text = split_part(p_name, '/', 1)
                    and l.revoked_at is null and l.expires_at > now())
     and (select count(*) from storage.objects o
           where o.bucket_id = 'job-files'
             and o.name like split_part(p_name, '/', 1) || '/camera/' || split_part(p_name, '/', 3) || '/%'
             and o.created_at > now() - interval '1 day') < 400;
$$;
revoke all on function public.sc_camera_upload_ok(text) from public;
grant execute on function public.sc_camera_upload_ok(text) to anon, authenticated;

create policy camera_link_uploads on storage.objects for insert to anon
  with check (bucket_id = 'job-files' and public.sc_camera_upload_ok(name));

-- One shot, already in storage, recorded as a file. p_path and p_thumb under the
-- link's own folder; p_client_id the phone's own id for the shot, so a retry
-- returns the same file.
create or replace function public.sc_camera_shot(p_token text, p_client_id uuid, p_path text, p_thumb text,
  p_taken_at timestamptz, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l camera_links; prefix text; had uuid; fid uuid; sz bigint; mime text; knd text; ext text;
  who text; fname text; cust uuid; quiet boolean; when_txt text; t timestamptz; body text;
begin
  if p_token is null or length(p_token) < 24 then raise exception 'not a camera link'; end if;
  select * into l from camera_links where token = p_token;
  if not found or l.revoked_at is not null or l.expires_at < now() then raise exception 'this link is turned off — ask for a new one'; end if;
  if p_client_id is null then raise exception 'a shot needs its id'; end if;

  select id into had from files where org_id = l.org_id and client_id = p_client_id;
  if had is not null then return jsonb_build_object('ok', true, 'id', had); end if;

  prefix := l.org_id::text || '/camera/' || l.id::text || '/';
  if p_path is null or left(p_path, length(prefix)) <> prefix or p_path like '%..%' then raise exception 'that file isn''t from this link'; end if;
  if p_thumb is not null and (left(p_thumb, length(prefix)) <> prefix or p_thumb like '%..%') then p_thumb := null; end if;
  select (o.metadata ->> 'size')::bigint, lower(split_part(coalesce(o.metadata ->> 'mimetype', ''), ';', 1)) into sz, mime
    from storage.objects o where o.bucket_id = 'job-files' and o.name = p_path;
  if not found then raise exception 'the file hasn''t arrived yet'; end if;
  knd := case when mime ~ '^image/(jpeg|png|webp)$' then 'image' when mime ~ '^video/(mp4|webm|quicktime)$' then 'video' end;
  if knd is null then raise exception 'only photos and videos'; end if;
  if p_thumb is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'job-files' and o.name = p_thumb) then p_thumb := null; end if;

  t := case when p_taken_at is null or p_taken_at > now() + interval '5 minutes' or p_taken_at < now() - interval '30 days' then now() else p_taken_at end;
  select nullif(split_part(btrim(coalesce(first_name, name, '')), ' ', 1), '') into who from contacts where id = l.contact_id;
  ext := case mime when 'image/png' then 'png' when 'image/webp' then 'webp' when 'video/mp4' then 'mp4'
    when 'video/webm' then 'webm' when 'video/quicktime' then 'mov' else 'jpg' end;
  when_txt := replace(replace(to_char(t at time zone 'America/Chicago', 'Mon FMDD FMHH12:MI AM'), ':', '.'), '  ', ' ');
  fname := case knd when 'video' then 'Video' else 'Photo' end || ' from ' || coalesce(who, 'the customer') || ' · ' || when_txt || '.' || ext;
  select customer_id into cust from jobs where id = l.job_id;
  if cust is null then select customer_id into cust from contacts where id = l.contact_id; end if;

  -- The first shot of a visit (nothing for two hours) tells the team.
  quiet := l.last_shot_at is null or l.last_shot_at < now() - interval '2 hours';

  insert into files (org_id, job_id, section_id, contact_id, customer_id, name, kind, category, mime_type, byte_size,
    storage_path, thumb_path, source, fetch_state, captured_at, read_state, client_id, taken_at, note)
  values (l.org_id, l.job_id, l.section_id, l.contact_id, cust, fname, knd, 'photo', mime, sz,
    p_path, p_thumb, 'capture', 'fetched', now(), case when knd = 'image' then 'waiting' end, p_client_id, t,
    left(concat_ws(' — ', 'From ' || coalesce(who, 'the customer') || '''s camera link', nullif(btrim(p_note), '')), 2000))
  on conflict (org_id, client_id) where client_id is not null do nothing
  returning id into fid;
  if fid is null then
    select id into fid from files where org_id = l.org_id and client_id = p_client_id;
    return jsonb_build_object('ok', true, 'id', fid);
  end if;

  update camera_links set shot_count = shot_count + 1, last_shot_at = now() where id = l.id;

  if quiet and l.contact_id is not null then
    body := '📷 ' || coalesce(who, 'They') || ' is sending photos and video from the camera link'
      || coalesce(' for ' || (select title from jobs where id = l.job_id), '')
      || coalesce(' · ' || (select name from job_sections where id = l.section_id), '')
      || '. They land in Files as they arrive.';
    insert into contact_notes (org_id, contact_id, job_id, body) values (l.org_id, l.contact_id, l.job_id, body);
  end if;

  return jsonb_build_object('ok', true, 'id', fid);
end $$;
revoke all on function public.sc_camera_shot(text, uuid, text, text, timestamptz, text) from public;
grant execute on function public.sc_camera_shot(text, uuid, text, text, timestamptz, text) to anon, authenticated;
