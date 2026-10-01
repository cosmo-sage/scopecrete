-- 062 — Inviting people into the org (Coy, 2026-10-01: "I need a way to add
-- other users to my Org (Sacco Enterprises) and send invites to the
-- dashboard. This would be done in the User Settings.")
--
-- An owner makes an invite for an email and a role; the app shows a link
-- (/invite/<token>) for Coy to send himself — mail or text, from his own
-- account (DECISIONS §10: outbound contact is the contractor himself). The
-- invitee signs in with THAT email (Google or an emailed sign-in link) and
-- accepts; only then is an org_members row written.
--
-- * Only the token's SHA-256 is stored; the token is shown once, to the owner
--   who made it. 14 days, one use, revocable.
-- * Everything is a SECURITY DEFINER function with an explicit check, execute
--   for `authenticated` only: owners make, list and revoke; the invitee
--   accepts only an invite for their own sign-in email. There is no INSERT
--   policy on org_invites and none is added to org_members.
-- * An owner can remove a member (never themselves, never the last owner).
-- * org_audit records member_invited / invite_revoked / member_joined /
--   member_removed.
-- * Roles: owner, member, field (org_members' check also has billing). Today
--   a role decides only who may rename, brand and invite (owners) — every
--   member sees the org's data under get_user_org_ids().

set lock_timeout = '8s';

create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  role text not null default 'member' check (role in ('owner', 'member', 'field')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz
);
create index if not exists org_invites_org_idx on public.org_invites (org_id, created_at desc);

alter table public.org_invites enable row level security;
revoke all on public.org_invites from anon, authenticated;
grant select on public.org_invites to authenticated;
-- Owners see their org's invites (never the token — only its hash is stored).
create policy org_invites_owner_read on public.org_invites for select to authenticated
  using (auth.uid() is not null and org_id = any (public.get_user_owner_org_ids()));

create or replace function public.sc_create_invite(p_org uuid, p_email text, p_role text default 'member')
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role text := coalesce(nullif(btrim(p_role), ''), 'member');
  v_token text;
  v_id uuid;
  v_exp timestamptz;
begin
  if auth.uid() is null or not (p_org = any (public.get_user_owner_org_ids())) then
    raise exception 'not allowed: only an owner can invite people' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    raise exception 'That email doesn''t look right.' using errcode = '22023';
  end if;
  if v_role not in ('owner', 'member', 'field') then
    raise exception 'Role is owner, member or field.' using errcode = '22023';
  end if;
  if exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id
             where m.org_id = p_org and lower(u.email) = v_email) then
    raise exception '% is already in the organisation.', v_email using errcode = '23505';
  end if;
  -- One live invite per email: a new one replaces the old.
  update public.org_invites set revoked_at = now()
    where org_id = p_org and email = v_email and accepted_at is null and revoked_at is null;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.org_invites (org_id, email, role, token_hash, invited_by)
    values (p_org, v_email, v_role, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
    returning id, org_invites.expires_at into v_id, v_exp;
  insert into public.org_audit (org_id, user_id, action, old_value, new_value)
    values (p_org, auth.uid(), 'member_invited', null, v_email || ' as ' || v_role);
  return query select v_id, v_token, v_exp;
end $$;

create or replace function public.sc_revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.org_invites;
begin
  select * into v from public.org_invites where id = p_invite;
  if not found or auth.uid() is null or not (v.org_id = any (public.get_user_owner_org_ids())) then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if v.accepted_at is not null then raise exception 'That invite was already accepted.' using errcode = '22023'; end if;
  if v.revoked_at is null then
    update public.org_invites set revoked_at = now() where id = p_invite;
    insert into public.org_audit (org_id, user_id, action, old_value, new_value)
      values (v.org_id, auth.uid(), 'invite_revoked', v.email, null);
  end if;
end $$;

-- What the invite page shows the signed-in invitee before they accept.
create or replace function public.sc_invite_peek(p_token text)
returns table (org_name text, role text, email text, invited_by_name text, state text, email_matches boolean)
language plpgsql stable security definer set search_path = public as $$
declare v public.org_invites; v_me text;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into v from public.org_invites
    where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then return query select null::text, null::text, null::text, null::text, 'unknown'::text, false; return; end if;
  select lower(u.email) into v_me from auth.users u where u.id = auth.uid();
  return query
    select o.name, v.role, v.email,
           nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
           case when v.accepted_at is not null then 'accepted' when v.revoked_at is not null then 'revoked'
                when v.expires_at < now() then 'expired' else 'open' end,
           v_me = v.email
    from public.orgs o left join auth.users u on u.id = v.invited_by where o.id = v.org_id;
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
  insert into public.org_members (user_id, org_id, role) values (auth.uid(), v.org_id, v.role)
    on conflict (user_id, org_id) do nothing;
  update public.org_invites set accepted_at = now(), accepted_by = auth.uid() where id = v.id;
  insert into public.org_audit (org_id, user_id, action, old_value, new_value)
    values (v.org_id, auth.uid(), 'member_joined', null, v.email || ' as ' || v.role);
  return v.org_id;
end $$;

create or replace function public.sc_remove_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_email text;
begin
  if auth.uid() is null or not (p_org = any (public.get_user_owner_org_ids())) then
    raise exception 'not allowed: only an owner can remove people' using errcode = '42501';
  end if;
  if p_user = auth.uid() then raise exception 'You can''t remove yourself.' using errcode = '22023'; end if;
  select m.role, u.email into v_role, v_email from public.org_members m join auth.users u on u.id = m.user_id
    where m.org_id = p_org and m.user_id = p_user for update of m;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  if v_role = 'owner' and (select count(*) from public.org_members where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'The organisation needs at least one owner.' using errcode = '22023';
  end if;
  delete from public.org_members where org_id = p_org and user_id = p_user;
  insert into public.org_audit (org_id, user_id, action, old_value, new_value)
    values (p_org, auth.uid(), 'member_removed', v_email || ' (' || v_role || ')', null);
end $$;

revoke all on function public.sc_create_invite(uuid, text, text) from public, anon;
revoke all on function public.sc_revoke_invite(uuid) from public, anon;
revoke all on function public.sc_invite_peek(text) from public, anon;
revoke all on function public.sc_accept_invite(text) from public, anon;
revoke all on function public.sc_remove_member(uuid, uuid) from public, anon;
grant execute on function public.sc_create_invite(uuid, text, text) to authenticated;
grant execute on function public.sc_revoke_invite(uuid) to authenticated;
grant execute on function public.sc_invite_peek(text) to authenticated;
grant execute on function public.sc_accept_invite(text) to authenticated;
grant execute on function public.sc_remove_member(uuid, uuid) to authenticated;
