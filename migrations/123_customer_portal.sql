-- 123 — a customer's portal, by link (Coy, 2026-10-22: "a vendor portal page.
-- somewhere customers like Gulfline paving can go to see all the proposals that
-- i've sent and bid requests they can send and upload"; decision card: "Both:
-- link first, login after").
--
-- One private link per customer — scopecrete.ai/c/<token>, no login, like a
-- proposal's /p/ or a vendor's /b/. On it the customer sees every proposal sent
-- to them (each opening its own /p/ link) and the bid requests they sent, and
-- sends a new one: what it is, where, when it's due, a note, who they are, and
-- their plans, specs and photos.
--
-- A request becomes a job in the org that made the link: Bid invite, lead
-- source gc_invite, counted (Coy made the link, so the customer is his), on
-- that customer, with the sender as its person when they are one of the
-- customer's people. Its files are `files` rows on the job, waiting for Dusty's
-- reader, PDFs In plan room. An internal note on the job's person says it came.
--
-- Anon may run only the doors:
--   sc_portal(token)                    what the link shows, the opening logged
--                                       (not when the reader is in the org);
--   sc_portal_request(token, …, files)  a new request, checked here;
--   sc_portal_upload_ok(name)           storage: anon may upload only under
--                                       {org}/portal/{portal}/ of a live link,
--                                       60 files a day.
-- Members make, read and turn off links; requests are written only by the door.

create table if not exists public.customer_portals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  token text not null unique check (length(token) >= 24),
  created_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  view_count integer not null default 0,
  opened_at timestamptz,
  last_viewed_at timestamptz
);
create index if not exists customer_portals_customer_idx on public.customer_portals (org_id, customer_id, created_at desc);
-- One live link per customer.
create unique index if not exists customer_portals_live_idx on public.customer_portals (customer_id) where revoked_at is null;

create table if not exists public.portal_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  portal_id uuid not null references public.customer_portals(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 120),
  address text check (address is null or length(address) <= 200),
  due_on date,
  note text check (note is null or length(note) <= 4000),
  from_name text check (from_name is null or length(from_name) <= 80),
  from_phone text check (from_phone is null or length(from_phone) <= 30),
  from_email text check (from_email is null or length(from_email) <= 200),
  file_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists portal_requests_customer_idx on public.portal_requests (org_id, customer_id, created_at desc);

create or replace function public.sc_portal_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from customers c where c.id = new.customer_id and c.org_id = new.org_id) then
    raise exception 'that customer is not in this org';
  end if;
  return new;
end $$;

create or replace trigger customer_portals_guard before insert or update of org_id, customer_id on public.customer_portals
  for each row execute function public.sc_portal_guard();

alter table public.customer_portals enable row level security;
alter table public.portal_requests enable row level security;
revoke all on public.customer_portals, public.portal_requests from anon, authenticated;
grant select, insert on public.customer_portals to authenticated;
grant update (revoked_at) on public.customer_portals to authenticated;
grant select on public.portal_requests to authenticated;

create policy customer_portals_member_read on public.customer_portals
  for select to authenticated using (org_id = any (public.get_user_org_ids()));
create policy customer_portals_member_insert on public.customer_portals
  for insert to authenticated with check (org_id = any (public.get_user_org_ids()));
create policy customer_portals_member_update on public.customer_portals
  for update to authenticated using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));
create policy portal_requests_member_read on public.portal_requests
  for select to authenticated using (org_id = any (public.get_user_org_ids()));

-- What the link shows.
create or replace function public.sc_portal(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p customer_portals; own boolean; org_name text; cust_name text; props jsonb; reqs jsonb;
begin
  if p_token is null or length(p_token) < 24 then return null; end if;
  select * into p from customer_portals where token = p_token;
  if not found then return null; end if;
  select name into org_name from orgs where id = p.org_id;
  if p.revoked_at is not null then return jsonb_build_object('gone', true, 'org_name', org_name); end if;
  select coalesce(nullif(btrim(name), ''), 'Your company') into cust_name from customers where id = p.customer_id;
  own := coalesce(p.org_id = any(get_user_org_ids()), false);
  if not own then
    update customer_portals set view_count = view_count + 1, last_viewed_at = now(),
      opened_at = coalesce(opened_at, now()) where id = p.id;
  end if;

  -- Proposals sent to them: a live link (or one they signed) on one of their jobs.
  select coalesce(jsonb_agg(x order by x ->> 'sent_at' desc nulls last), '[]'::jsonb) into props from (
    select jsonb_build_object('token', d.token, 'number', coalesce(d.signed_number, d.shown ->> 'number'),
      'job', j.title, 'address', j.address, 'total', coalesce(d.signed_total, (d.shown -> 'price' ->> 'total')::numeric),
      'sent_at', coalesce(d.sent_at, d.created_at), 'viewed', d.view_count > 0, 'signed_at', d.signed_at,
      'signed_by', d.decided_name, 'job_status', j.status) as x
      from documents d join jobs j on j.id = d.job_id
     where d.org_id = p.org_id and d.proposal_id is not null and j.customer_id = p.customer_id
       and j.archived_at is null and d.status <> 'void'
       and (d.signed_at is not null or (d.revoked_at is null and (d.expires_at is null or d.expires_at > now())))
       and (d.sent_at is not null or d.signed_at is not null)
     limit 100) s;

  -- What they asked for, with where it stands.
  select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]'::jsonb) into reqs from (
    select jsonb_build_object('id', r.id, 'title', r.title, 'address', r.address, 'due_on', r.due_on,
      'at', r.created_at, 'files', cardinality(r.file_ids), 'from', r.from_name,
      'job_status', j.status, 'archived', j.archived_at is not null) as x
      from portal_requests r left join jobs j on j.id = r.job_id
     where r.customer_id = p.customer_id and r.org_id = p.org_id
     limit 100) s;

  return jsonb_build_object('gone', false, 'own', own, 'org_name', org_name, 'customer_name', cust_name,
    'portal_id', p.id, 'org_id', p.org_id, 'proposals', props, 'requests', reqs);
end $$;
revoke all on function public.sc_portal(text) from public;
grant execute on function public.sc_portal(text) to anon, authenticated;

-- Storage: an upload under a live link's own folder, at most 60 a day.
create or replace function public.sc_portal_upload_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(p_name, '/', 2) = 'portal'
     and split_part(p_name, '/', 3) ~ '^[0-9a-f-]{36}$'
     and exists (select 1 from customer_portals p
                  where p.id::text = split_part(p_name, '/', 3)
                    and p.org_id::text = split_part(p_name, '/', 1)
                    and p.revoked_at is null)
     and (select count(*) from storage.objects o
           where o.bucket_id = 'job-files'
             and o.name like split_part(p_name, '/', 1) || '/portal/' || split_part(p_name, '/', 3) || '/%'
             and o.created_at > now() - interval '1 day') < 60;
$$;
revoke all on function public.sc_portal_upload_ok(text) from public;
grant execute on function public.sc_portal_upload_ok(text) to anon, authenticated;

create policy portal_uploads on storage.objects for insert to anon
  with check (bucket_id = 'job-files' and public.sc_portal_upload_ok(name));

-- A new request. p_files: [{path, name, category}] — each path under this
-- link's folder and already in storage.
create or replace function public.sc_portal_request(p_token text, p_title text, p_address text, p_due date,
  p_note text, p_name text, p_phone text, p_email text, p_files jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p customer_portals; c customers; person uuid; job uuid; req uuid; x jsonb; n int := 0; fid uuid;
  path text; fname text; cat text; ext text; knd text; sz bigint; mime text; ids uuid[] := '{}';
  digits text; body text; t text; prefix text;
begin
  if p_token is null or length(p_token) < 24 then raise exception 'not a portal link'; end if;
  select * into p from customer_portals where token = p_token;
  if not found or p.revoked_at is not null then raise exception 'this link is turned off — ask for a new one'; end if;
  if coalesce(p.org_id = any(get_user_org_ids()), false) then raise exception 'this is your own link — your customer sends requests from it'; end if;
  if (select count(*) from portal_requests where portal_id = p.id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many requests today — call us';
  end if;
  t := btrim(coalesce(p_title, ''));
  if length(t) < 1 then raise exception 'say what the job is'; end if;
  if length(t) > 120 then raise exception 'the job''s name is too long'; end if;
  if p_note is not null and length(p_note) > 4000 then raise exception 'the note is too long'; end if;
  if p_address is not null and length(p_address) > 200 then raise exception 'the address is too long'; end if;
  if p_due is not null and (p_due < current_date - 1 or p_due > current_date + 730) then raise exception 'that due date isn''t right'; end if;
  if length(coalesce(p_name, '')) > 80 or length(coalesce(p_phone, '')) > 30 or length(coalesce(p_email, '')) > 200 then
    raise exception 'your name, phone or email is too long';
  end if;
  select * into c from customers where id = p.customer_id;

  -- The sender, when they are one of the customer's people (by email, then phone).
  if nullif(btrim(p_email), '') is not null then
    select ce.contact_id into person from contact_emails ce join contacts k on k.id = ce.contact_id
     where ce.org_id = p.org_id and k.customer_id = c.id and k.merged_into_contact_id is null
       and lower(ce.email::text) = lower(btrim(p_email)) limit 1;
  end if;
  digits := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if person is null and length(digits) = 10 then
    select k.id into person from contacts k
     where k.org_id = p.org_id and k.customer_id = c.id and k.merged_into_contact_id is null
       and (right(regexp_replace(coalesce(k.phone, ''), '\D', '', 'g'), 10) = digits
         or exists (select 1 from contact_phones cp where cp.contact_id = k.id
                     and right(regexp_replace(cp.phone, '\D', '', 'g'), 10) = digits))
     limit 1;
  end if;
  person := coalesce(person, c.primary_contact_id);

  insert into jobs (org_id, customer_id, contact_id, title, address, description, job_type, status, origin,
    lead_source, confirmed_at, stage_changed_at, bid_due_at, itb_received_at)
  values (p.org_id, c.id, person, t, nullif(btrim(p_address), ''), nullif(left(btrim(p_note), 900), ''),
    case when c.customer_type in ('commercial', 'public') then c.customer_type else 'commercial' end,
    'invited', 'machine', 'gc_invite', now(), now(),
    case when p_due is null then null else (p_due::timestamp + interval '17 hours') at time zone 'America/Chicago' end, now())
  returning id into job;

  if p_files is not null and jsonb_typeof(p_files) = 'array' then
    prefix := p.org_id::text || '/portal/' || p.id::text || '/';
    for x in select * from jsonb_array_elements(p_files) loop
      n := n + 1;
      exit when n > 40;
      path := x ->> 'path';
      continue when path is null or left(path, length(prefix)) <> prefix or path like '%..%';
      continue when exists (select 1 from files where storage_path = path);
      select (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype' into sz, mime
        from storage.objects o where o.bucket_id = 'job-files' and o.name = path;
      continue when not found;
      fname := left(coalesce(nullif(btrim(x ->> 'name'), ''), split_part(path, '/', 5)), 200);
      ext := lower(substring(fname from '\.([A-Za-z0-9]+)$'));
      knd := case when ext = 'pdf' then 'pdf'
        when ext in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif') then 'image'
        when ext in ('mp4', 'mov', 'm4v', 'webm') then 'video'
        when ext in ('doc', 'docx', 'txt', 'md') then 'doc'
        when ext in ('xls', 'xlsx', 'csv') then 'sheet' else 'other' end;
      cat := case when x ->> 'category' in ('plan', 'spec', 'photo', 'bid', 'other') then x ->> 'category'
        when knd = 'image' then 'photo' when knd = 'pdf' then 'plan' else 'other' end;
      insert into files (org_id, job_id, customer_id, contact_id, name, kind, mime_type, byte_size, storage_path,
        category, source, fetch_state, captured_at, read_state, in_plan_room, note)
      values (p.org_id, job, c.id, person, fname, knd, mime, sz, path, cat, 'upload', 'fetched', now(),
        case when knd = 'video' then null else 'waiting' end, knd = 'pdf' and cat = 'plan',
        'Sent from ' || coalesce(nullif(btrim(c.name), ''), 'the customer') || '''s portal')
      returning id into fid;
      ids := ids || fid;
    end loop;
  end if;

  insert into portal_requests (org_id, portal_id, customer_id, job_id, title, address, due_on, note,
    from_name, from_phone, from_email, file_ids)
  values (p.org_id, p.id, c.id, job, t, nullif(btrim(p_address), ''), p_due, nullif(btrim(p_note), ''),
    nullif(btrim(p_name), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''), ids)
  returning id into req;

  if person is not null then
    body := 'Bid request from ' || coalesce(nullif(btrim(c.name), ''), 'the customer') || '''s portal'
      || coalesce(' — ' || nullif(btrim(p_name), ''), '') || ': ' || t
      || coalesce(', due ' || to_char(p_due, 'Dy, Mon FMDD'), '')
      || case when cardinality(ids) > 0 then ', ' || cardinality(ids) || ' file' || case when cardinality(ids) = 1 then '' else 's' end else '' end
      || coalesce('. ' || nullif(concat_ws(' · ', nullif(btrim(p_phone), ''), nullif(btrim(p_email), '')), ''), '')
      || coalesce('. Their note: ' || nullif(btrim(p_note), ''), '');
    insert into contact_notes (org_id, contact_id, job_id, body) values (p.org_id, person, job, left(body, 3900));
  end if;

  return jsonb_build_object('ok', true, 'id', req, 'files', cardinality(ids));
end $$;
revoke all on function public.sc_portal_request(text, text, text, date, text, text, text, text, jsonb) from public;
grant execute on function public.sc_portal_request(text, text, text, date, text, text, text, text, jsonb) to anon, authenticated;
