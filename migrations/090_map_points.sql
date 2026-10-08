-- 090 — a point on the map for each job and vendor (Coy, 2026-10-08: the Map
-- page, Claude Design 11 — "add the map page to the main menu … push the
-- snipits from the map into the takeoffs tool").
--
-- The Map page looks up a job's site address (else its customer's) and a
-- vendor's address once, with the same geocoder the Plan Room's satellite uses
-- (src/lib/aerial-server.ts findAddress), and keeps the point here so it isn't
-- looked up on every visit. `geocode_query` is the address that was looked up:
-- when the address changes, the point no longer matches and is looked up
-- again. A point is never an address — nothing reads it but the map.
--
-- Additive only: nullable columns, no default, no grant or policy change (the
-- tables' RLS by get_user_org_ids() covers them). Until this is applied the
-- page looks addresses up on each visit and keeps nothing.

alter table public.jobs
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_query text;

alter table public.contacts
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_query text;

alter table public.jobs add constraint jobs_point_range
  check ((lat is null or lat between -90 and 90) and (lng is null or lng between -180 and 180)) not valid;
alter table public.contacts add constraint contacts_point_range
  check ((lat is null or lat between -90 and 90) and (lng is null or lng between -180 and 180)) not valid;

-- Undo:
-- alter table public.jobs drop constraint jobs_point_range, drop column lat, drop column lng, drop column geocoded_at, drop column geocode_query;
-- alter table public.contacts drop constraint contacts_point_range, drop column lat, drop column lng, drop column geocoded_at, drop column geocode_query;
