-- 101_remove_member.sql
-- Coy, 2026-10-11: "An owner need to be able to remove people in the settings
-- for the organization."
--
-- 062's sc_remove_member was never applied (held at the connector's approval
-- gate). This is it, checked against the database as it is after 063–100:
--   * owners only, of the org the session names (company switcher: p_org);
--   * never yourself, never the last owner — every owner row of the org is
--     locked first, so two owners removing each other at once can't leave none;
--   * deletes that one org_members row; their account and their other orgs
--     stay (nothing references org_members, so nothing cascades);
--   * their tag notifications in THIS org go (member_notifications_own_read
--     lets a user read their own rows with no membership check);
--   * any open invite for their email to this org is withdrawn, so the old
--     link can't put them straight back;
--   * audited member_removed, as 062 had it.
-- Additive: one function. Security definer, explicit owner check, execute for
-- authenticated only.

create or replace function public.sc_remove_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_email text; v_owners int;
begin
  if auth.uid() is null or not (p_org = any (public.get_user_owner_org_ids())) then
    raise exception 'not allowed: only an owner can remove people' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You can''t remove yourself.' using errcode = '22023';
  end if;
  -- lock the org's owners (and the person) before counting
  perform 1 from public.org_members
    where org_id = p_org and (role = 'owner' or user_id = p_user) for update;
  select m.role into v_role from public.org_members m
    where m.org_id = p_org and m.user_id = p_user;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  select count(*) into v_owners from public.org_members where org_id = p_org and role = 'owner';
  if v_role = 'owner' and v_owners <= 1 then
    raise exception 'The organization needs at least one owner.' using errcode = '22023';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user;

  delete from public.org_members where org_id = p_org and user_id = p_user;
  delete from public.member_notifications where org_id = p_org and user_id = p_user;
  if v_email is not null then
    update public.org_invites set revoked_at = now()
      where org_id = p_org and lower(email) = lower(v_email)
        and accepted_at is null and revoked_at is null;
  end if;
  insert into public.org_audit (org_id, user_id, action, old_value, new_value)
    values (p_org, auth.uid(), 'member_removed', coalesce(v_email, p_user::text) || ' (' || v_role || ')', null);
end $$;

revoke all on function public.sc_remove_member(uuid, uuid) from public, anon;
grant execute on function public.sc_remove_member(uuid, uuid) to authenticated;
