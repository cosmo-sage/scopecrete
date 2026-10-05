-- 081 — Onsite estimators: people in the org who see only the jobs and pages
-- Coy gives them (Coy, 2026-10-05: "I need be able to use onsite estimators
-- and give them access to the app to upload photos and plans and take
-- measurements … when I create a user I need to be able to set permissions.
-- I want to be able to enable access to specific jobs and pages. Also they
-- need to be setup as a vendor before I can enable internal access. Internal
-- users can be mentioned with @(username) in the customer notes and get a
-- notification.")
--
-- * The role 'field' (062's "field crew", never used — 0 members) is now an
--   ONSITE ESTIMATOR: limited to the jobs and pages on their membership.
--   get_user_org_ids() — the helper behind ~130 policies — leaves 'field'
--   memberships out, so an estimator reads NOTHING of the org by default
--   (contacts, texts, calls, customers, cash, the inbox …). What they may
--   reach is granted back below, table by table, for their jobs only.
--   Owners and members are unchanged.
-- * Pages an estimator can be given: 'files' (photos and files on their jobs,
--   upload too), 'plan_room' (sheets and takeoffs), 'budget' (the job's budget
--   and the Price book to read). The job page itself (its areas) always.
--   Jobs: every job (all_jobs) or the ones in org_members.job_ids.
-- * An estimator must be a contact filed as VENDOR first (org_members /
--   org_invites .contact_id) — checked when invited and when changed.
-- * Tagging: a note that tags a member (@[Name](u:<id>), 2026-10-04) writes a
--   member_notifications row for them (trigger on contact_notes), so a
--   tagged estimator — who can't read contact_notes — still sees it.
-- * sc_my_orgs(): the org's name, slug and logos for any member, so the
--   header, sign-in routing and session work for an estimator without
--   giving them the orgs row (webhook_url, api_key_hash).
-- * The five views that ran as their owner (DECISIONS §9's known exposure)
--   would hand an estimator every org's rows: sc_spine_drift becomes
--   security_invoker; leads_view, vendors_view, job_close_rates and
--   sc_open_name_questions (nothing in the app reads them) lose
--   authenticated's select.
--
-- Additive and restrictive only: no column or row is removed.

set lock_timeout = '8s';

-- ── Membership ─────────────────────────────────────────────────────────────
alter table public.org_members
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists pages text[] not null default '{}',
  add column if not exists all_jobs boolean not null default false,
  add column if not exists job_ids uuid[] not null default '{}';
alter table public.org_members add constraint org_members_pages_known
  check (pages <@ array['files', 'plan_room', 'budget']::text[]);

alter table public.org_invites
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists pages text[] not null default '{}',
  add column if not exists all_jobs boolean not null default false,
  add column if not exists job_ids uuid[] not null default '{}';

-- ── Helpers ────────────────────────────────────────────────────────────────
-- Full access: owners, members, billing. Estimators are left out on purpose.
create or replace function public.get_user_org_ids()
returns uuid[] language plpgsql security definer set search_path to 'public' as $$
begin
  return array(select org_id::uuid from org_members where user_id = auth.uid() and role <> 'field');
end $$;

-- Every org this person belongs to, estimators included (their own row, prefs, org name).
create or replace function public.sc_member_org_ids()
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(org_id), '{}') from org_members where user_id = auth.uid();
$$;

-- Orgs where this person is an estimator with that page.
create or replace function public.sc_field_org_ids(p_page text)
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(org_id), '{}') from org_members
   where user_id = auth.uid() and role = 'field' and (p_page is null or p_page = any (pages));
$$;

-- Jobs this person may reach as an estimator (with that page, or any page when null).
create or replace function public.sc_field_job_ids(p_page text)
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(j.id), '{}')
    from org_members m
    join jobs j on j.org_id = m.org_id
   where m.user_id = auth.uid() and m.role = 'field'
     and (p_page is null or p_page = any (m.pages))
     and (m.all_jobs or j.id = any (m.job_ids));
$$;

create or replace function public.sc_my_orgs()
returns table (id uuid, slug text, name text, logo_light_path text, logo_dark_path text, role text, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select o.id, o.slug, o.name, o.logo_light_path, o.logo_dark_path, m.role, o.created_at
    from org_members m join orgs o on o.id = m.org_id
   where m.user_id = auth.uid()
   order by o.created_at;
$$;

-- An estimator's own access, for the app to hide what they can't open.
create or replace function public.sc_my_access(p_org uuid)
returns table (role text, pages text[], all_jobs boolean, job_ids uuid[], contact_id uuid)
language sql stable security definer set search_path to 'public' as $$
  select m.role, m.pages, m.all_jobs, m.job_ids, m.contact_id
    from org_members m where m.org_id = p_org and m.user_id = auth.uid();
$$;

-- Who a job is for — name and phone — for an estimator on that job, so they can meet the
-- customer onsite. Nothing else of the contact; a non-estimator gets nothing here (RLS gives them more).
create or replace function public.sc_field_job_contact(p_job uuid)
returns table (id uuid, name text, phone text)
language sql stable security definer set search_path to 'public' as $$
  select c.id, c.name, c.phone from jobs j join contacts c on c.id = j.contact_id
   where j.id = p_job and j.id = any (public.sc_field_job_ids(null));
$$;
revoke all on function public.sc_field_job_contact(uuid) from public, anon;
grant execute on function public.sc_field_job_contact(uuid) to authenticated;

revoke all on function public.sc_member_org_ids() from public, anon;
revoke all on function public.sc_field_org_ids(text) from public, anon;
revoke all on function public.sc_field_job_ids(text) from public, anon;
revoke all on function public.sc_my_orgs() from public, anon;
revoke all on function public.sc_my_access(uuid) from public, anon;
grant execute on function public.sc_member_org_ids() to authenticated;
grant execute on function public.sc_field_org_ids(text) to authenticated;
grant execute on function public.sc_field_job_ids(text) to authenticated;
grant execute on function public.sc_my_orgs() to authenticated;
grant execute on function public.sc_my_access(uuid) to authenticated;

-- ── What an estimator may reach ────────────────────────────────────────────
create policy org_members_own_row on public.org_members for select to authenticated
  using (user_id = auth.uid());
alter policy user_preferences_own on public.user_preferences
  using (org_id = any (public.sc_member_org_ids()) and user_id = auth.uid())
  with check (org_id = any (public.sc_member_org_ids()) and user_id = auth.uid());

-- The job and its areas (always, on their jobs). No insert, update or delete on jobs.
create policy jobs_field_select on public.jobs for select to authenticated
  using (id = any ((select public.sc_field_job_ids(null))::uuid[]));
create policy job_sections_field on public.job_sections for all to authenticated
  using (job_id = any ((select public.sc_field_job_ids(null))::uuid[]))
  with check (job_id = any ((select public.sc_field_job_ids(null))::uuid[]));

-- Photos and files on their jobs ('files'); the Plan Room's PDFs ('plan_room') to read.
create policy files_field on public.files for all to authenticated
  using (job_id = any ((select public.sc_field_job_ids('files'))::uuid[]))
  with check (job_id = any ((select public.sc_field_job_ids('files'))::uuid[]));
create policy files_field_plan_room on public.files for select to authenticated
  using (in_plan_room and job_id = any ((select public.sc_field_job_ids('plan_room'))::uuid[]));

-- The Plan Room ('plan_room').
create policy plan_sheets_field on public.plan_sheets for all to authenticated
  using (job_id = any ((select public.sc_field_job_ids('plan_room'))::uuid[]))
  with check (job_id = any ((select public.sc_field_job_ids('plan_room'))::uuid[]));
create policy takeoff_parameters_field on public.takeoff_parameters for all to authenticated
  using (job_id = any ((select public.sc_field_job_ids('plan_room'))::uuid[]))
  with check (job_id = any ((select public.sc_field_job_ids('plan_room'))::uuid[]));
create policy takeoff_measurements_field on public.takeoff_measurements for all to authenticated
  using (exists (select 1 from public.takeoff_parameters p where p.id = takeoff_measurements.parameter_id
                 and p.job_id = any ((select public.sc_field_job_ids('plan_room'))::uuid[])))
  with check (exists (select 1 from public.takeoff_parameters p where p.id = takeoff_measurements.parameter_id
                 and p.job_id = any ((select public.sc_field_job_ids('plan_room'))::uuid[])));

-- The budget ('budget'): the job's estimate and lines; the Price book and pricing defaults to read.
create policy estimates_field on public.estimates for all to authenticated
  using (job_id = any ((select public.sc_field_job_ids('budget'))::uuid[]))
  with check (job_id = any ((select public.sc_field_job_ids('budget'))::uuid[]));
create policy estimate_line_items_field on public.estimate_line_items for all to authenticated
  using (exists (select 1 from public.estimates e where e.id = estimate_line_items.estimate_id
                 and e.job_id = any ((select public.sc_field_job_ids('budget'))::uuid[])))
  with check (exists (select 1 from public.estimates e where e.id = estimate_line_items.estimate_id
                 and e.job_id = any ((select public.sc_field_job_ids('budget'))::uuid[])));
-- The one restrictive policy in the way: an estimator's lines carry their org too.
alter policy estimate_line_items_org_member on public.estimate_line_items
  using (org_id is null or org_id = any (public.get_user_org_ids()) or org_id = any (public.sc_field_org_ids('budget')))
  with check (org_id = any (public.get_user_org_ids()) or org_id = any (public.sc_field_org_ids('budget')));
create policy estimate_options_field on public.estimate_options for select to authenticated
  using (exists (select 1 from public.estimates e where e.id = estimate_options.estimate_id
                 and e.job_id = any ((select public.sc_field_job_ids('budget'))::uuid[])));
create policy cost_items_field on public.cost_items for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('budget'))::uuid[]));
create policy cost_groups_field on public.cost_groups for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('budget'))::uuid[]));
create policy cost_assemblies_field on public.cost_assemblies for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('budget'))::uuid[]));
create policy cost_assembly_items_field on public.cost_assembly_items for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('budget'))::uuid[]));
create policy cost_item_sources_field on public.cost_item_sources for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('budget'))::uuid[]));
create policy org_money_settings_field on public.org_money_settings for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('budget'))::uuid[]));
create policy tax_parishes_field on public.tax_parishes for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('budget'))::uuid[]));
create policy org_project_types_field on public.org_project_types for select to authenticated
  using (org_id = any ((select public.sc_field_org_ids('budget'))::uuid[]));

-- Storage: the bytes of the files above, and the org's logo for the header.
create policy job_files_objects_field_select on storage.objects for select to authenticated
  using (bucket_id = 'job-files' and exists (
    select 1 from public.files f where f.storage_path = storage.objects.name
      and (f.job_id = any ((select public.sc_field_job_ids('files'))::uuid[])
           or (f.in_plan_room and f.job_id = any ((select public.sc_field_job_ids('plan_room'))::uuid[])))));
create policy job_files_objects_field_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'job-files' and exists (
    select 1 from public.files f where f.storage_path = storage.objects.name
      and f.job_id = any ((select public.sc_field_job_ids('files'))::uuid[])));
create policy org_branding_field_select on storage.objects for select to authenticated
  using (bucket_id = 'org-branding' and (storage.foldername(name))[1] = any (
    array(select x::text from unnest(public.sc_field_org_ids(null)) x)));

-- ── Views that ran as their owner ──────────────────────────────────────────
alter view public.sc_spine_drift set (security_invoker = true);
revoke select on public.leads_view, public.vendors_view, public.job_close_rates, public.sc_open_name_questions from anon, authenticated;

-- ── People: names, invites, access ─────────────────────────────────────────
-- A member's name: their own, else the vendor contact they were invited as.
create or replace function public.sc_org_people(p_org uuid)
returns table (user_id uuid, name text, email text, role text, joined_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select m.user_id,
         coalesce(nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
                  nullif(btrim(c.name), '')),
         u.email::text, m.role, m.created_at
  from public.org_members m
  join auth.users u on u.id = m.user_id
  left join public.contacts c on c.id = m.contact_id
  where m.org_id = p_org and auth.uid() is not null and p_org = any (public.get_user_org_ids())
  order by m.created_at;
$$;

-- Owners: each member's access, and each invite's.
create or replace function public.sc_org_access(p_org uuid)
returns table (user_id uuid, contact_id uuid, contact_name text, pages text[], all_jobs boolean, job_ids uuid[])
language sql stable security definer set search_path to 'public' as $$
  select m.user_id, m.contact_id, c.name, m.pages, m.all_jobs, m.job_ids
  from public.org_members m left join public.contacts c on c.id = m.contact_id
  where m.org_id = p_org and auth.uid() is not null and p_org = any (public.get_user_owner_org_ids());
$$;

-- The checks every grant of access goes through.
create or replace function public.sc_check_access(p_org uuid, p_role text, p_contact uuid, p_pages text[], p_jobs uuid[])
returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if p_role not in ('owner', 'member', 'field') then
    raise exception 'Role is owner, member or onsite estimator.' using errcode = '22023';
  end if;
  if not (coalesce(p_pages, '{}') <@ array['files', 'plan_room', 'budget']::text[]) then
    raise exception 'Unknown page.' using errcode = '22023';
  end if;
  if p_contact is not null and not exists (
      select 1 from contacts where id = p_contact and org_id = p_org and merged_into_contact_id is null and archived_at is null) then
    raise exception 'That vendor isn''t in this organisation.' using errcode = '22023';
  end if;
  if p_role = 'field' then
    if p_contact is null then
      raise exception 'Set them up as a vendor first, then give them access.' using errcode = '22023';
    end if;
    if not exists (select 1 from contacts where id = p_contact and contact_type = 'vendor') then
      raise exception 'File them as a vendor first, then give them access.' using errcode = '22023';
    end if;
  end if;
  if exists (select 1 from unnest(coalesce(p_jobs, '{}')) j where not exists (select 1 from jobs where id = j and org_id = p_org)) then
    raise exception 'A job picked isn''t in this organisation.' using errcode = '22023';
  end if;
end $$;
revoke all on function public.sc_check_access(uuid, text, uuid, text[], uuid[]) from public, anon, authenticated;

-- 062's invite, still callable, but an estimator needs their vendor and access: sc_invite_member.
create or replace function public.sc_create_invite(p_org uuid, p_email text, p_role text default 'member')
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  return query select * from public.sc_invite_member(p_org, p_email, p_role, null, '{}', false, '{}');
end $$;

create or replace function public.sc_invite_member(p_org uuid, p_email text, p_role text, p_contact uuid,
  p_pages text[], p_all_jobs boolean, p_jobs uuid[])
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role text := coalesce(nullif(btrim(p_role), ''), 'member');
  v_field boolean := coalesce(nullif(btrim(p_role), ''), 'member') = 'field';
  v_token text; v_id uuid; v_exp timestamptz;
begin
  if auth.uid() is null or not (p_org = any (public.get_user_owner_org_ids())) then
    raise exception 'not allowed: only an owner can invite people' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    raise exception 'That email doesn''t look right.' using errcode = '22023';
  end if;
  perform public.sc_check_access(p_org, v_role, p_contact, p_pages, p_jobs);
  if exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id
             where m.org_id = p_org and lower(u.email) = v_email) then
    raise exception '% is already in the organisation.', v_email using errcode = '23505';
  end if;
  update public.org_invites set revoked_at = now()
    where org_id = p_org and email = v_email and accepted_at is null and revoked_at is null;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.org_invites (org_id, email, role, token_hash, invited_by, contact_id, pages, all_jobs, job_ids)
    values (p_org, v_email, v_role, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), p_contact,
            case when v_field then coalesce(p_pages, '{}') else '{}' end,
            v_field and coalesce(p_all_jobs, false),
            case when v_field then coalesce(p_jobs, '{}') else '{}' end)
    returning id, org_invites.expires_at into v_id, v_exp;
  insert into public.org_audit (org_id, user_id, action, old_value, new_value)
    values (p_org, auth.uid(), 'member_invited', null, v_email || ' as ' || v_role);
  return query select v_id, v_token, v_exp;
end $$;

create or replace function public.sc_accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.org_invites; v_me text;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into v from public.org_invites
    where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if not found then raise exception 'That invite link isn''t valid.' using errcode = 'P0002'; end if;
  if v.revoked_at is not null then raise exception 'That invite was withdrawn.' using errcode = '22023'; end if;
  if v.accepted_at is not null then
    if v.accepted_by = auth.uid() then return v.org_id; end if;
    raise exception 'That invite was already used.' using errcode = '22023';
  end if;
  if v.expires_at < now() then raise exception 'That invite has expired — ask for a new one.' using errcode = '22023'; end if;
  select lower(u.email) into v_me from auth.users u where u.id = auth.uid();
  if v_me is distinct from v.email then
    raise exception 'This invite is for %. Sign in with that email.', v.email using errcode = '42501';
  end if;
  insert into public.org_members (user_id, org_id, role, contact_id, pages, all_jobs, job_ids)
    values (auth.uid(), v.org_id, v.role, v.contact_id, v.pages, v.all_jobs,
            array(select j.id from public.jobs j where j.org_id = v.org_id and j.id = any (v.job_ids)))
    on conflict (user_id, org_id) do nothing;
  update public.org_invites set accepted_at = now(), accepted_by = auth.uid() where id = v.id;
  insert into public.org_audit (org_id, user_id, action, old_value, new_value)
    values (v.org_id, auth.uid(), 'member_joined', null, v.email || ' as ' || v.role);
  return v.org_id;
end $$;

-- An owner changes a member's role, vendor, pages and jobs.
create or replace function public.sc_set_member_access(p_org uuid, p_user uuid, p_role text, p_contact uuid,
  p_pages text[], p_all_jobs boolean, p_jobs uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_old text; v_email text; v_field boolean := p_role = 'field';
begin
  if auth.uid() is null or not (p_org = any (public.get_user_owner_org_ids())) then
    raise exception 'not allowed: only an owner can change access' using errcode = '42501';
  end if;
  select m.role, u.email into v_old, v_email from public.org_members m join auth.users u on u.id = m.user_id
    where m.org_id = p_org and m.user_id = p_user for update of m;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  perform public.sc_check_access(p_org, p_role, p_contact, p_pages, p_jobs);
  if p_user = auth.uid() and p_role <> v_old then
    raise exception 'You can''t change your own role.' using errcode = '22023';
  end if;
  if v_old = 'owner' and p_role <> 'owner'
     and (select count(*) from public.org_members where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'The organisation needs at least one owner.' using errcode = '22023';
  end if;
  update public.org_members
     set role = p_role, contact_id = p_contact,
         pages = case when v_field then coalesce(p_pages, '{}') else '{}' end,
         all_jobs = v_field and coalesce(p_all_jobs, false),
         job_ids = case when v_field then array(select distinct unnest(coalesce(p_jobs, '{}'))) else '{}' end
   where org_id = p_org and user_id = p_user;
  insert into public.org_audit (org_id, user_id, action, old_value, new_value)
    values (p_org, auth.uid(), 'member_access', v_email || ' (' || v_old || ')',
            p_role || case when v_field then ' · ' || array_to_string(coalesce(p_pages, '{}'), ',')
              || ' · ' || case when coalesce(p_all_jobs, false) then 'all jobs' else coalesce(array_length(p_jobs, 1), 0) || ' jobs' end else '' end);
end $$;

revoke all on function public.sc_org_access(uuid) from public, anon;
revoke all on function public.sc_invite_member(uuid, text, text, uuid, text[], boolean, uuid[]) from public, anon;
revoke all on function public.sc_set_member_access(uuid, uuid, text, uuid, text[], boolean, uuid[]) from public, anon;
grant execute on function public.sc_org_access(uuid) to authenticated;
grant execute on function public.sc_invite_member(uuid, text, text, uuid, text[], boolean, uuid[]) to authenticated;
grant execute on function public.sc_set_member_access(uuid, uuid, text, uuid, text[], boolean, uuid[]) to authenticated;

-- ── Tagged in a note → a notification for that member ─────────────────────
create table if not exists public.member_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'tag' check (kind in ('tag')),
  note_id uuid references public.contact_notes(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  title text,
  body text,
  by_user uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (note_id, user_id)
);
create index if not exists member_notifications_user_idx on public.member_notifications (user_id, created_at desc);
alter table public.member_notifications enable row level security;
revoke all on public.member_notifications from anon, authenticated;
grant select on public.member_notifications to authenticated;
grant update (read_at) on public.member_notifications to authenticated;
create policy member_notifications_own on public.member_notifications for select to authenticated
  using (user_id = auth.uid() and org_id = any (public.sc_member_org_ids()));
create policy member_notifications_own_read on public.member_notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.sc_note_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_name text; v_customer uuid; v_job uuid;
begin
  if new.body is null or new.body !~ '\(u:[0-9a-f-]{36}\)' then return new; end if;
  select coalesce(nullif(btrim(c.name), ''), c.phone), c.customer_id into v_name, v_customer
    from contacts c where c.id = new.contact_id;
  for v_uid in
    select distinct (m[1])::uuid from regexp_matches(new.body, '\(u:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)', 'gi') m
  loop
    continue when v_uid = new.created_by;
    continue when not exists (select 1 from org_members where org_id = new.org_id and user_id = v_uid);
    -- The job to open: the note's own, else this person's (or their customer's) newest open job
    -- the member may reach — an estimator can't open the thread itself.
    select j.id into v_job from jobs j
      where j.org_id = new.org_id and j.archived_at is null
        and (j.id = new.job_id or j.contact_id = new.contact_id or (v_customer is not null and j.customer_id = v_customer))
        and exists (select 1 from org_members om where om.org_id = new.org_id and om.user_id = v_uid
                    and (om.role <> 'field' or om.all_jobs or j.id = any (om.job_ids)))
      order by coalesce(j.id = new.job_id, false) desc, j.created_at desc limit 1;
    insert into member_notifications (org_id, user_id, kind, note_id, contact_id, job_id, title, body, by_user, created_at)
      values (new.org_id, v_uid, 'tag', new.id, new.contact_id, v_job, v_name, new.body, new.created_by, new.created_at)
      on conflict (note_id, user_id) do update set body = excluded.body;
    v_job := null;
  end loop;
  return new;
end $$;
revoke all on function public.sc_note_mentions() from public, anon, authenticated;
create trigger contact_notes_mentions after insert or update of body on public.contact_notes
  for each row execute function public.sc_note_mentions();

-- Tags from the last week, so nobody tagged before this misses theirs.
update public.contact_notes set body = body
  where created_at > now() - interval '7 days' and body ~ '\(u:[0-9a-f-]{36}\)';
