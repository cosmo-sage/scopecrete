-- 113 — site photo capture and Sites (Coy, 2026-10-15: "our own little company
-- cam app for Scopecrete … a lightweight version of that to take pictures on
-- site really quickly and then pull those projects or jobs into Scopecrete" and
-- "I can map cam and zoom into the address, and it automatically creates a
-- project from that with that address … I can add a name or not … and go ahead
-- and snap pictures and take video, and it's already a project … whenever I
-- create a customer or a job, I can choose to input a project from the company
-- cam style photo capture").
--
-- A **site** is an address and its pin, an optional name, and the photos and
-- videos taken there. No customer, no stage, no price: it is never a job and is
-- never counted (§2, "no money without a job"). A job can be made from it
-- (POST /api/jobs {site_id}); the site then names its job and its photos move
-- onto the job (files.job_id set, files.site_id kept). Photos taken there later
-- go onto that job.
--
-- Photos and videos from the Camera page are `files` rows with source
-- 'capture': where and when they were taken (columns, never the file — the
-- browser re-encodes, so no EXIF GPS rides on a picture sent to a customer), a
-- 400 px thumbnail beside the file (thumb_path), and the phone's own id for the
-- shot (client_id) so a retried upload finds its row instead of making a second.
-- storage_provider says where the bytes live, for a later move to Cloudflare R2.
--
-- Additive only. RLS on sites by get_user_org_ids() (members; onsite estimators
-- read none of it, as for appointments); anon nothing; a guard keeps the job and
-- customer on the site's org, and a file's site on its org.

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text check (name is null or length(name) between 1 and 120),
  address text check (address is null or length(address) <= 200),
  lat double precision not null check (lat between -85 and 85),
  lng double precision not null check (lng between -180 and 180),
  job_id uuid references public.jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists sites_org_idx on public.sites (org_id, created_at desc) where archived_at is null;
create index if not exists sites_job_idx on public.sites (job_id) where job_id is not null;

create or replace function public.sc_site_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.job_id is not null and not exists (select 1 from jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'that job is not in this org';
  end if;
  if new.customer_id is not null and not exists (select 1 from customers c where c.id = new.customer_id and c.org_id = new.org_id) then
    raise exception 'that customer is not in this org';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger sites_guard before insert or update on public.sites
  for each row execute function public.sc_site_guard();

alter table public.sites enable row level security;
revoke all on public.sites from anon, authenticated;
grant select, insert, update on public.sites to authenticated;
create policy sites_member on public.sites
  for all to authenticated using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));

-- The capture columns on files.
alter table public.files
  add column if not exists site_id uuid references public.sites(id) on delete set null,
  add column if not exists client_id uuid,
  add column if not exists taken_at timestamptz,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists gps_accuracy_m real,
  add column if not exists thumb_path text,
  add column if not exists storage_provider text not null default 'supabase';

alter table public.files drop constraint if exists files_capture_point;
alter table public.files add constraint files_capture_point
  check ((lat is null and lng is null) or (lat between -85 and 85 and lng between -180 and 180));
alter table public.files drop constraint if exists files_storage_provider_check;
alter table public.files add constraint files_storage_provider_check
  check (storage_provider in ('supabase', 'r2'));
alter table public.files drop constraint if exists job_files_source_check;
alter table public.files add constraint job_files_source_check
  check (source = any (array['upload', 'text', 'email', 'capture']));

create unique index if not exists files_client_id_idx on public.files (org_id, client_id) where client_id is not null;
create index if not exists files_site_idx on public.files (site_id, taken_at desc) where site_id is not null;
create index if not exists files_capture_inbox_idx on public.files (org_id, taken_at desc)
  where source = 'capture' and job_id is null and site_id is null and deleted_at is null;

create or replace function public.sc_file_site_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.site_id is not null and not exists (select 1 from sites s where s.id = new.site_id and s.org_id = new.org_id) then
    raise exception 'that site is not in this org';
  end if;
  return new;
end $$;
create trigger files_site_guard before insert or update of site_id on public.files
  for each row execute function public.sc_file_site_guard();
