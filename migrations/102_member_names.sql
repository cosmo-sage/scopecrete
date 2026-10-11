-- 102_member_names.sql
-- Coy, 2026-10-11: "Why can't I set a name for invitees? And why is no name
-- set? He should be able to add his name with the sign up page."
--
-- Why "No name yet": sc_org_people() reads a member's name from their own auth
-- account (full_name / name — Google fills it, an emailed sign-in link does
-- not), else from the contact an onsite estimator is tied to. Nobody but the
-- person could set it. The invite page now asks for a name before Join (saved
-- on their account, no migration); this lets an owner name anyone.
--
-- Additive:
--   * org_members.display_name — the name this org knows them by, 1–80 chars;
--   * sc_set_member_name(org, user, name) — an owner names anyone in their org,
--     anyone names themselves; blank clears it; audited member_named;
--   * sc_org_people() reads display_name first (same columns as before).
-- Members get no new UPDATE path on org_members.

alter table public.org_members add column if not exists display_name text
  check (display_name is null or char_length(display_name) between 1 and 80);

create or replace function public.sc_set_member_name(p_org uuid, p_user uuid, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
        v_old text;
begin
  if auth.uid() is null or not (
       p_org = any (public.get_user_owner_org_ids())
       or (p_user = auth.uid() and exists (select 1 from public.org_members where org_id = p_org and user_id = p_user))) then
    raise exception 'not allowed: only an owner can name people' using errcode = '42501';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'A name is 1 to 80 characters.' using errcode = '22023';
  end if;
  select display_name into v_old from public.org_members where org_id = p_org and user_id = p_user for update;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  if v_old is distinct from v_name then
    update public.org_members set display_name = v_name where org_id = p_org and user_id = p_user;
    insert into public.org_audit (org_id, user_id, action, old_value, new_value)
      values (p_org, auth.uid(), 'member_named', v_old, v_name);
  end if;
  return v_name;
end $$;

create or replace function public.sc_org_people(p_org uuid)
returns table (user_id uuid, name text, email text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id,
         coalesce(nullif(btrim(m.display_name), ''),
                  nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
                  nullif(btrim(c.name), '')),
         u.email::text, m.role, m.created_at
  from public.org_members m
  join auth.users u on u.id = m.user_id
  left join public.contacts c on c.id = m.contact_id
  where m.org_id = p_org and auth.uid() is not null and p_org = any (public.get_user_org_ids())
  order by m.created_at;
$$;

revoke all on function public.sc_set_member_name(uuid, uuid, text) from public, anon;
grant execute on function public.sc_set_member_name(uuid, uuid, text) to authenticated;
revoke all on function public.sc_org_people(uuid) from public, anon;
grant execute on function public.sc_org_people(uuid) to authenticated;
