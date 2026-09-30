-- 056 — The org's name and logo (Coy on Vercel, 2026-09-30; Claude Design
-- handoff design/org-branding/). "We need a way to change the Organization
-- name … that will reflect across the database … I also want to be able to
-- upload a logo for my org."
--
--   * The name lives ONCE, in orgs.name; everything reads it by org_id.
--     Renaming is sc_rename_org(org, name): SECURITY DEFINER, owners only,
--     1–120 characters, audited. Deliberately NOT an UPDATE policy on orgs —
--     that would also let a caller rewrite plan_tier, api_key_hash and
--     webhook_url.
--   * Logos: orgs.logo_light_path (dark lettering, light themes) and
--     logo_dark_path (light lettering, Night Shift) — storage paths in the
--     PRIVATE bucket org-branding, {org_id}/logo-{variant}-{stamp}.{ext},
--     served by signed redirect. Members read; only that org's owners write.
--     Set through sc_set_org_logo(org, variant, path), which accepts only a
--     path in the org's own folder.
--   * org_audit: who renamed the org or changed a logo, old → new. Members
--     read it; nothing writes it but the functions above.
--   * sc_org_people(org): the members with name and email (from auth.users),
--     for Settings → Organisation → People. SECURITY DEFINER, members only.
--
-- Additive: two columns, one table, one bucket, functions. Nothing widened on
-- orgs itself.

alter table public.orgs
  add column if not exists logo_light_path text,
  add column if not exists logo_dark_path text;

create table if not exists public.org_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid,
  action text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index if not exists org_audit_org_idx on public.org_audit (org_id, created_at desc);
alter table public.org_audit enable row level security;
revoke all on public.org_audit from anon;
revoke insert, update, delete, truncate on public.org_audit from authenticated;
grant select on public.org_audit to authenticated;
drop policy if exists org_audit_select on public.org_audit;
create policy org_audit_select on public.org_audit for select to authenticated
  using (org_id = any (public.get_user_org_ids()));

-- ------------------------------------------------------------------ rename
create or replace function public.sc_rename_org(p_org uuid, p_name text)
returns public.orgs
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_old text;
  v_row public.orgs;
begin
  if auth.uid() is null or not (p_org = any (public.get_user_owner_org_ids())) then
    raise exception 'not allowed: only an owner can rename the organisation' using errcode = '42501';
  end if;
  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'The name must be 1 to 120 characters.' using errcode = '22023';
  end if;
  select name into v_old from public.orgs where id = p_org for update;
  if v_old is distinct from v_name then
    update public.orgs set name = v_name where id = p_org;
    insert into public.org_audit (org_id, user_id, action, old_value, new_value)
      values (p_org, auth.uid(), 'org_renamed', v_old, v_name);
  end if;
  select * into v_row from public.orgs where id = p_org;
  return v_row;
end $$;

-- ------------------------------------------------------------------ logo
create or replace function public.sc_set_org_logo(p_org uuid, p_variant text, p_path text)
returns public.orgs
language plpgsql security definer set search_path = public
as $$
declare
  v_old text;
  v_row public.orgs;
begin
  if auth.uid() is null or not (p_org = any (public.get_user_owner_org_ids())) then
    raise exception 'not allowed: only an owner can change the logo' using errcode = '42501';
  end if;
  if p_variant not in ('light', 'dark') then
    raise exception 'variant must be light or dark' using errcode = '22023';
  end if;
  if p_path is not null and (p_path not like p_org::text || '/logo-' || p_variant || '-%' or p_path like '%..%') then
    raise exception 'that file is not in this organisation''s folder' using errcode = '42501';
  end if;
  if p_variant = 'light' then
    select logo_light_path into v_old from public.orgs where id = p_org for update;
    update public.orgs set logo_light_path = p_path where id = p_org;
  else
    select logo_dark_path into v_old from public.orgs where id = p_org for update;
    update public.orgs set logo_dark_path = p_path where id = p_org;
  end if;
  insert into public.org_audit (org_id, user_id, action, old_value, new_value)
    values (p_org, auth.uid(), case when p_path is null then 'logo_removed' else 'logo_set' end || ':' || p_variant, v_old, p_path);
  select * into v_row from public.orgs where id = p_org;
  return v_row;
end $$;

-- ------------------------------------------------------------------ people
create or replace function public.sc_org_people(p_org uuid)
returns table (user_id uuid, name text, email text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select m.user_id,
         nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
         u.email::text, m.role, m.created_at
  from public.org_members m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org
    and auth.uid() is not null
    and p_org = any (public.get_user_org_ids())
  order by m.created_at;
$$;

revoke all on function public.sc_rename_org(uuid, text) from public, anon;
revoke all on function public.sc_set_org_logo(uuid, text, text) from public, anon;
revoke all on function public.sc_org_people(uuid) from public, anon;
grant execute on function public.sc_rename_org(uuid, text) to authenticated;
grant execute on function public.sc_set_org_logo(uuid, text, text) to authenticated;
grant execute on function public.sc_org_people(uuid) to authenticated;

-- ------------------------------------------------------------------ bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-branding', 'org-branding', false, 5242880, array['image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists org_branding_select on storage.objects;
create policy org_branding_select on storage.objects for select to authenticated
  using (bucket_id = 'org-branding'
         and (storage.foldername(name))[1] = any (array(select x::text from unnest(public.get_user_org_ids()) x)));

drop policy if exists org_branding_insert on storage.objects;
create policy org_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-branding'
              and (storage.foldername(name))[1] = any (array(select x::text from unnest(public.get_user_owner_org_ids()) x)));

drop policy if exists org_branding_update on storage.objects;
create policy org_branding_update on storage.objects for update to authenticated
  using (bucket_id = 'org-branding'
         and (storage.foldername(name))[1] = any (array(select x::text from unnest(public.get_user_owner_org_ids()) x)))
  with check (bucket_id = 'org-branding'
              and (storage.foldername(name))[1] = any (array(select x::text from unnest(public.get_user_owner_org_ids()) x)));

drop policy if exists org_branding_delete on storage.objects;
create policy org_branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-branding'
         and (storage.foldername(name))[1] = any (array(select x::text from unnest(public.get_user_owner_org_ids()) x)));
