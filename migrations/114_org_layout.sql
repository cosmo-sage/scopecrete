-- 114 — The org's layout, shared with every internal user (2026-10-21).
-- APPLIED 2026-10-22 on Coy's "apply 114, 115 and 116".
--
-- Coy, answering the database-vs-UI audit: "The Organization work space is shared
-- by default for all internal users of that Org, but it's also customizable per
-- user. So if I share my Org with a new admin user, he will see it as I have it,
-- but will then be able to customize the app to his liking and will be unique to
-- his user account. And depending on the permissions of the user (estimator,
-- admin, ect.) certain jobs/customers will be available or hidden."
--
-- One row per org holding the layout keys (Work Spaces on the rail, their order,
-- shelves, the Work Spaces Coy made and what is in them). An owner's own layout
-- changes are written here too; anyone else's stay in their user_preferences row
-- (053), which wins key by key over this one. Read by members under
-- get_user_org_ids() — an onsite estimator (role field) is not in it, so they keep
-- their own — and written by owners only. What a user may see is still RLS on the
-- jobs, customers and vendors themselves.
--
-- Additive: one new table. Nothing else changes.

create table if not exists public.org_layouts (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  layout jsonb not null default '{}'::jsonb
    check (jsonb_typeof(layout) = 'object' and pg_column_size(layout) < 65536),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.org_layouts enable row level security;

create policy org_layouts_read on public.org_layouts
  for select to authenticated
  using (org_id = any (public.get_user_org_ids()));
create policy org_layouts_owner_insert on public.org_layouts
  for insert to authenticated
  with check (org_id = any (public.get_user_owner_org_ids()));
create policy org_layouts_owner_update on public.org_layouts
  for update to authenticated
  using (org_id = any (public.get_user_owner_org_ids()))
  with check (org_id = any (public.get_user_owner_org_ids()));

revoke all on public.org_layouts from anon;
revoke all on public.org_layouts from authenticated;
grant select, insert, update on public.org_layouts to authenticated;

-- Start each org's layout from its owners' saved layout (the newest owner row's keys).
insert into public.org_layouts (org_id, layout, updated_by, updated_at)
select distinct on (p.org_id) p.org_id,
  (select coalesce(jsonb_object_agg(k, p.prefs -> k), '{}'::jsonb)
     from unnest(array['shelves','spaces_pins','spaces_rail','spaces_collections','spaces_col_members']) k
    where p.prefs ? k),
  p.user_id, now()
from public.user_preferences p
join public.org_members m on m.org_id = p.org_id and m.user_id = p.user_id and m.role = 'owner'
where p.prefs ?| array['shelves','spaces_pins','spaces_rail','spaces_collections','spaces_col_members']
order by p.org_id, p.updated_at desc
on conflict (org_id) do nothing;
