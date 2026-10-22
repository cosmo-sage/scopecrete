-- 122 — Invite tracking: did the contractor open the link, and where did he stop
-- (Coy, 2026-10-22: "Is there a way for me to see if a contractor opens the link
-- that I send to set up his organization? I would like to see how many times he
-- clicked the link, or if he got stuck in the process").
--
-- Before 122 nothing recorded an opening: an invite was sent (org_invites.created_at)
-- and joined (accepted_at), nothing in between.
--
-- 1. org_invite_events — one row per thing the invitee did on the link:
--      opened       the invite page loaded (signed in or not)
--      signed_in    the page loaded signed in with the invite's email (once a person)
--      wrong_email  the page loaded signed in with another email (once a person)
--      password_set they saved a password after joining
--      joined       Join worked
--      installed    they opened the company from their home screen (once a person)
--    with the browser in a few words ("iPhone · Safari"), never the IP.
--    RLS on, no policies, no grants: written and read only through the functions.
--
-- 2. sc_invite_track(token, step, device) — SECURITY DEFINER, anon and
--    authenticated (the link is opened signed out). Knows nothing but what the
--    token names. Steps a caller may send: opened, password_set, joined; opened
--    adds signed_in / wrong_email by itself. Not counted: a member of the company
--    or a ScopeCrete admin opening someone else's link to check it. 300 events an
--    invite at most. Returns nothing.
--
-- 3. sc_invite_installed(org, device) — the signed-in person's own accepted
--    invite to that company gets "installed", once.
--
-- 4. sc_admin_invite_funnel(org) — sc_admin_check() first; the company's invites,
--    newest first, with opens, first and last opened, the steps reached and the
--    last device. Counts, no content.
--
-- Additive: one table, three functions. Nothing existing changes.

create table if not exists public.org_invite_events (
  id         uuid primary key default gen_random_uuid(),
  invite_id  uuid not null references public.org_invites(id) on delete cascade,
  org_id     uuid not null references public.orgs(id) on delete cascade,
  step       text not null check (step in ('opened','signed_in','wrong_email','password_set','joined','installed')),
  user_id    uuid,
  device     text check (char_length(device) <= 80),
  at         timestamptz not null default now()
);
create index if not exists org_invite_events_invite on public.org_invite_events (invite_id, at desc);
alter table public.org_invite_events enable row level security;
revoke all on public.org_invite_events from public, anon, authenticated;

create or replace function public.sc_invite_track(p_token text, p_step text, p_device text default null)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v org_invites;
  v_me text;
  v_dev text := nullif(left(btrim(coalesce(p_device, '')), 80), '');
begin
  if p_step not in ('opened','password_set','joined') then return; end if;
  select * into v from org_invites
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then return; end if;
  if (select count(*) from org_invite_events e where e.invite_id = v.id) >= 300 then return; end if;
  if auth.uid() is not null then
    select lower(u.email) into v_me from auth.users u where u.id = auth.uid();
  end if;

  if p_step = 'opened' then
    -- Someone of the company, or a ScopeCrete admin, checking the link isn't the invitee.
    if v_me is distinct from v.email and auth.uid() is not null and (
         exists (select 1 from org_members m where m.org_id = v.org_id and m.user_id = auth.uid())
      or exists (select 1 from platform_admins a where a.user_id = auth.uid())) then
      return;
    end if;
    insert into org_invite_events (invite_id, org_id, step, user_id, device)
      values (v.id, v.org_id, 'opened', auth.uid(), v_dev);
    if auth.uid() is not null then
      if not exists (select 1 from org_invite_events e where e.invite_id = v.id and e.user_id = auth.uid()
                        and e.step in ('signed_in','wrong_email')) then
        insert into org_invite_events (invite_id, org_id, step, user_id, device)
          values (v.id, v.org_id, case when v_me = v.email then 'signed_in' else 'wrong_email' end, auth.uid(), v_dev);
      end if;
    end if;
    return;
  end if;

  -- password_set and joined: only the person the invite was made for.
  if auth.uid() is null or v_me is distinct from v.email then return; end if;
  if p_step = 'joined' and v.accepted_by is distinct from auth.uid() then return; end if;
  if p_step = 'password_set' and not coalesce((select u.encrypted_password is not null and u.encrypted_password <> ''
                                                 from auth.users u where u.id = auth.uid()), false) then
    return;
  end if;
  if exists (select 1 from org_invite_events e where e.invite_id = v.id and e.step = p_step) then return; end if;
  insert into org_invite_events (invite_id, org_id, step, user_id, device)
    values (v.id, v.org_id, p_step, auth.uid(), v_dev);
end $function$;

create or replace function public.sc_invite_installed(p_org uuid, p_device text default null)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if auth.uid() is null then return; end if;
  select i.id into v_id from org_invites i
   where i.org_id = p_org and i.accepted_by = auth.uid()
   order by i.accepted_at desc limit 1;
  if v_id is null then return; end if;
  if exists (select 1 from org_invite_events e where e.invite_id = v_id and e.step = 'installed') then return; end if;
  insert into org_invite_events (invite_id, org_id, step, user_id, device)
    values (v_id, p_org, 'installed', auth.uid(), nullif(left(btrim(coalesce(p_device, '')), 80), ''));
end $function$;

create or replace function public.sc_admin_invite_funnel(p_org uuid)
returns table (invite_id uuid, email text, role text, sent_at timestamptz, expires_at timestamptz,
               accepted_at timestamptz, revoked_at timestamptz, opens integer,
               first_opened timestamptz, last_opened timestamptz, steps text[],
               last_step text, last_at timestamptz, last_device text)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform sc_admin_check();
  return query
    select i.id, i.email, i.role, i.created_at, i.expires_at, i.accepted_at, i.revoked_at,
           (select count(*)::int from org_invite_events e where e.invite_id = i.id and e.step = 'opened'),
           (select min(e.at) from org_invite_events e where e.invite_id = i.id and e.step = 'opened'),
           (select max(e.at) from org_invite_events e where e.invite_id = i.id and e.step = 'opened'),
           coalesce((select array_agg(distinct e.step) from org_invite_events e where e.invite_id = i.id), '{}'),
           l.step, l.at, l.device
      from org_invites i
      left join lateral (select e.step, e.at, e.device from org_invite_events e
                          where e.invite_id = i.id order by e.at desc limit 1) l on true
     where i.org_id = p_org
     order by i.created_at desc
     limit 20;
end $function$;

revoke all on function public.sc_invite_track(text, text, text) from public;
revoke all on function public.sc_invite_installed(uuid, text) from public, anon;
revoke all on function public.sc_admin_invite_funnel(uuid) from public, anon;
grant execute on function public.sc_invite_track(text, text, text) to anon, authenticated;
grant execute on function public.sc_invite_installed(uuid, text) to authenticated;
grant execute on function public.sc_admin_invite_funnel(uuid) to authenticated;
