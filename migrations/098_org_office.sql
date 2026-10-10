-- 098 — the org's office and the radius it works in (Coy, 2026-10-10: "set my
-- office location in the settings of my organization and have that shown on
-- the map. When I open the map, it should be centered on the office with a
-- radius of whatever I want to set around the office … 80 miles").
--
-- One row per org: the office's address as the map spelled it, its point, and
-- the service radius in miles. Members read it (the Map draws it); only the
-- org's owners write it, like the org's name and logo (Settings →
-- Organisation). No change to `orgs` itself, so sc_my_orgs and the org's
-- other columns stay as they are.
--
-- Additive only: a new table, RLS on, anon nothing. Until this is applied
-- Settings says the office waits for 098 and the Map opens on its pins.

create table if not exists public.org_office (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  address text not null check (char_length(address) between 3 and 300),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_mi numeric(6,1) check (radius_mi is null or (radius_mi > 0 and radius_mi <= 1000)),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.org_office enable row level security;
revoke all on public.org_office from anon;
revoke all on public.org_office from authenticated;
grant select, insert, update, delete on public.org_office to authenticated;

drop policy if exists org_office_read on public.org_office;
create policy org_office_read on public.org_office for select to authenticated
  using (org_id = any (public.get_user_org_ids()));

drop policy if exists org_office_owner_write on public.org_office;
create policy org_office_owner_write on public.org_office for all to authenticated
  using (org_id = any (public.get_user_owner_org_ids()))
  with check (org_id = any (public.get_user_owner_org_ids()));
