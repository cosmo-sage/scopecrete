-- 121 — View company: a ScopeCrete admin looks at another company's app, read only
-- (Coy, 2026-10-22: "I want a view company button in Admin. Admin@saccobuilt.com
-- will be the super admin for now.").
--
-- Cross-tenant, so §7's superadmin rules to the letter:
--   * named SECURITY DEFINER functions only, each calling sc_admin_check()
--     (platform_admins, 084) first; execute for authenticated only;
--   * every view started and ended is written to admin_audit with its reason;
--   * read only — enforced by Postgres, not only by the app.
--
-- 1. admin_company_views — one row per look: the admin, the company, the
--    reason, when it started, when it ends on its own (8 hours), when it was
--    ended. RLS on, no policies, no grants: read only through the functions.
--
-- 2. sc_admin_view_start(org, reason) — ends the admin's open view, opens one
--    on that company, audited "View company". sc_admin_view_end() — ends it,
--    audited "End view". sc_admin_viewing() — the admin's open view, if any.
--
-- 3. get_user_org_ids() — the one isolation helper every org policy uses —
--    answers with ONLY the viewed company when all three hold:
--      a. the request carries the header x-sc-view-org = that company
--         (the app sends it only while the admin's own View company cookie
--         is on; PostgREST hands request headers to the database as
--         request.headers);
--      b. the caller has an open, unexpired view of that company and is still
--         in platform_admins;
--      c. the transaction is READ ONLY. PostgREST runs GET and HEAD, and
--         calls to STABLE functions, read only; every insert, update and
--         delete runs read-write, where the header is ignored and the
--         admin's own memberships apply — so no write can land in the
--         viewed company, whatever the app does.
--    Otherwise it is exactly what it was (083): the caller's memberships,
--    onsite estimators left out.
--
-- Additive: one new table and three functions; get_user_org_ids keeps its
-- signature, volatility and answer for everyone not viewing.

create table if not exists public.admin_company_views (
  id            uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  org_id        uuid not null references public.orgs(id) on delete cascade,
  reason        text not null check (char_length(reason) between 3 and 500),
  started_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '8 hours',
  ended_at      timestamptz
);
create index if not exists admin_company_views_open
  on public.admin_company_views (admin_user_id) where ended_at is null;
alter table public.admin_company_views enable row level security;
revoke all on public.admin_company_views from public, anon, authenticated;

create or replace function public.sc_admin_viewing()
returns table (org_id uuid, name text, slug text, started_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path to 'public'
as $function$
  select v.org_id, o.name, o.slug, v.started_at, v.expires_at
    from admin_company_views v
    join orgs o on o.id = v.org_id
    join platform_admins a on a.user_id = v.admin_user_id
   where v.admin_user_id = auth.uid() and v.ended_at is null and v.expires_at > now()
   order by v.started_at desc
   limit 1
$function$;

create or replace function public.sc_admin_view_start(p_org uuid, p_reason text)
returns table (org_id uuid, name text, slug text, started_at timestamptz, expires_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_name text;
begin
  perform sc_admin_check();
  select o.name into v_name from orgs o where o.id = p_org;
  if v_name is null then raise exception 'No such company.' using errcode = '22023'; end if;
  if char_length(v_reason) < 3 then raise exception 'Give a reason — it goes in the admin log.' using errcode = '22023'; end if;
  update admin_company_views set ended_at = now()
   where admin_user_id = auth.uid() and admin_company_views.ended_at is null;
  insert into admin_company_views (admin_user_id, org_id, reason)
    values (auth.uid(), p_org, left(v_reason, 500));
  perform sc_admin_audit('View company', p_org, v_name || ' · read only, 8 hours', v_reason, null, null);
  return query select * from sc_admin_viewing();
end $function$;

create or replace function public.sc_admin_view_end()
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; v_name text;
begin
  perform sc_admin_check();
  select v.org_id, o.name into v_org, v_name
    from admin_company_views v join orgs o on o.id = v.org_id
   where v.admin_user_id = auth.uid() and v.ended_at is null
   order by v.started_at desc limit 1;
  if v_org is null then return; end if;
  update admin_company_views set ended_at = now()
   where admin_user_id = auth.uid() and ended_at is null;
  perform sc_admin_audit('End view', v_org, v_name, 'ended', null, null);
end $function$;

revoke all on function public.sc_admin_viewing() from public, anon;
revoke all on function public.sc_admin_view_start(uuid, text) from public, anon;
revoke all on function public.sc_admin_view_end() from public, anon;
grant execute on function public.sc_admin_viewing() to authenticated;
grant execute on function public.sc_admin_view_start(uuid, text) to authenticated;
grant execute on function public.sc_admin_view_end() to authenticated;

create or replace function public.get_user_org_ids()
returns uuid[]
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_hdr text;
  v_org uuid;
begin
  if current_setting('transaction_read_only', true) = 'on' then
    v_hdr := nullif(current_setting('request.headers', true), '');
    if v_hdr is not null then
      v_hdr := v_hdr::json ->> 'x-sc-view-org';
      if v_hdr ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_org := v_hdr::uuid;
        if exists (select 1 from admin_company_views v
                     join platform_admins a on a.user_id = v.admin_user_id
                    where v.admin_user_id = auth.uid() and v.org_id = v_org
                      and v.ended_at is null and v.expires_at > now()) then
          return array[v_org];
        end if;
      end if;
    end if;
  end if;
  return array(select org_id::uuid from org_members where user_id = auth.uid() and role <> 'field');
end $function$;
