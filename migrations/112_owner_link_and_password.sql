-- 112 — a new owner link for a company, and "have I set a password?"
-- (Coy, 2026-10-15: "I need to send Jeremy a new link … I want it to prompt
-- him to set up a password when he logs into the app").
--
-- 1. sc_admin_owner_link(org, email, reason) — Admin → a company → People →
--    New owner link. The only way to give a company with no owner a fresh
--    invite: an owner invites their own people (sc_invite_member), and Admin's
--    New company refuses a slug that is taken. Same rules as 092's
--    create_org and 062's invites: a ScopeCrete admin only (sc_admin_check),
--    the open invites for that email to that org withdrawn first, a random
--    token returned once and kept only as its SHA-256, 14 days, audited in
--    org_audit and admin_audit with the reason. Nothing is deleted.
--
-- 2. sc_my_password_set() — whether the signed-in account has a password,
--    so the invite page asks for one only when there is none. Reads only the
--    caller's own auth.users row (auth.uid()); returns a boolean, never the
--    hash. Execute for authenticated only.
--
-- Additive: two functions, no table changes.

create or replace function public.sc_admin_owner_link(p_org uuid, p_email text, p_reason text)
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text; v_token text; v_exp timestamptz;
begin
  perform sc_admin_check();
  select name into v_name from orgs where id = p_org;
  if v_name is null then raise exception 'No such company.' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'That email doesn''t look right.' using errcode = '22023'; end if;
  if exists (select 1 from org_members m join auth.users u on u.id = m.user_id
             where m.org_id = p_org and lower(u.email) = v_email) then
    raise exception '% is already in %.', v_email, v_name using errcode = '23505';
  end if;
  update org_invites set revoked_at = now()
    where org_id = p_org and email = v_email and accepted_at is null and revoked_at is null;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into org_invites (org_id, email, role, token_hash, invited_by)
    values (p_org, v_email, 'owner', encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
    returning org_invites.expires_at into v_exp;
  insert into org_audit (org_id, user_id, action, old_value, new_value)
    values (p_org, auth.uid(), 'member_invited', null, v_email || ' as owner');
  perform sc_admin_audit('New owner link', p_org, v_name || ' · ' || v_email, p_reason,
    null, jsonb_build_object('owner', v_email));
  return query select v_token, v_exp;
end $function$;

revoke all on function public.sc_admin_owner_link(uuid, text, text) from public, anon;
grant execute on function public.sc_admin_owner_link(uuid, text, text) to authenticated;

create or replace function public.sc_my_password_set()
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select coalesce((select u.encrypted_password is not null and u.encrypted_password <> ''
                   from auth.users u where u.id = auth.uid()), false)
$function$;

revoke all on function public.sc_my_password_set() from public, anon;
grant execute on function public.sc_my_password_set() to authenticated;
