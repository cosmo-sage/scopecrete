-- 063 — Bid intake: a forwarded bid email becomes the job, its customer and
-- contact, its concrete scope and its plans (Coy, 2026-10-01: "fully
-- automatic … this should replace the Hermes agent because this system
-- should become my harness for quote").
--
-- The worker is the edge function `bid-intake` (service role inside the
-- function only; pg_cron every minute with the enricher's vault token). This
-- migration adds where it keeps its work, the claim, and Coy's Undo.
--
-- Additive only. Jobs it makes use the existing origin 'machine' (the
-- origin check is not widened) and are found through bid_packages.job_id;
-- Box files are job_files with source 'email' (they came in by email) and a
-- bid_package_files row. Sections it makes carry origin 'bid'.

set lock_timeout = '8s';

create table if not exists public.bid_packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  email_id uuid not null unique references public.emails(id) on delete cascade,
  state text not null default 'waiting' check (state in
    ('waiting','listing','fetching','scanning','extracting','filing','filed','not_a_bid','needs_setup','failed','undone')),
  box_url text,
  box_folder_id text,
  box_folder_name text,
  job_id uuid references public.jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  facts jsonb,
  dropped jsonb,
  created jsonb not null default '{}'::jsonb,
  error text,
  attempts int not null default 0,
  claimed_at timestamptz,
  next_try_at timestamptz not null default now(),
  filed_at timestamptz,
  undone_at timestamptz,
  undone_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bid_packages_due_idx on public.bid_packages (state, next_try_at);
create index if not exists bid_packages_job_idx on public.bid_packages (job_id);

create table if not exists public.bid_package_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  package_id uuid not null references public.bid_packages(id) on delete cascade,
  box_file_id text,
  path text,
  name text not null,
  byte_size bigint,
  role text check (role is null or role in ('drawings','spec','itb','other')),
  job_file_id uuid references public.job_files(id) on delete set null,
  fetch_state text not null default 'waiting' check (fetch_state in ('waiting','fetched','failed','skipped')),
  fetch_error text,
  attempts int not null default 0,
  scan_state text not null default 'waiting' check (scan_state in ('waiting','scanned','skipped','failed')),
  scan_error text,
  pages jsonb,
  text_excerpt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, box_file_id),
  unique (package_id, job_file_id)
);
create index if not exists bid_package_files_pkg_idx on public.bid_package_files (package_id, fetch_state);

alter table public.jobs add column if not exists box_url text;
alter table public.job_sections add column if not exists origin text;
alter table public.job_sections add column if not exists source_ref text;
alter table public.job_sections add constraint job_sections_origin_check check (origin is null or origin in ('bid'));
alter table public.job_sections add constraint job_sections_source_ref_check check (source_ref is null or length(source_ref) <= 300);

-- Members read their org's packages; only the worker (service role) writes.
alter table public.bid_packages enable row level security;
alter table public.bid_package_files enable row level security;
revoke all on public.bid_packages from anon, authenticated;
revoke all on public.bid_package_files from anon, authenticated;
grant select on public.bid_packages to authenticated;
grant select on public.bid_package_files to authenticated;
create policy bid_packages_member_read on public.bid_packages for select to authenticated
  using (auth.uid() is not null and org_id = any (public.get_user_org_ids()));
create policy bid_package_files_member_read on public.bid_package_files for select to authenticated
  using (auth.uid() is not null and org_id = any (public.get_user_org_ids()));

create or replace function public.sc_bid_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger bid_packages_touch before update on public.bid_packages
  for each row execute function public.sc_bid_touch();
create trigger bid_package_files_touch before update on public.bid_package_files
  for each row execute function public.sc_bid_touch();

-- The worker's claim: first opens a package for every email that has none
-- (not quarantined, last 30 days), then hands out due ones, one at a time.
create or replace function public.sc_bid_claim(p_limit int default 1)
returns setof public.bid_packages
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bid_packages (org_id, email_id)
  select e.org_id, e.id from public.emails e
   where e.status <> 'quarantined' and e.created_at > now() - interval '30 days'
     and not exists (select 1 from public.bid_packages b where b.email_id = e.id)
  on conflict (email_id) do nothing;
  return query
  update public.bid_packages p set claimed_at = now(), attempts = p.attempts + 1
   where p.id in (
     select b.id from public.bid_packages b
      where b.state in ('waiting','listing','fetching','scanning','extracting','filing','needs_setup','failed')
        and b.next_try_at <= now()
        and (b.claimed_at is null or b.claimed_at < now() - interval '10 minutes')
        and (b.state <> 'failed' or b.attempts < 6)
      order by b.created_at
      limit greatest(1, least(p_limit, 5))
      for update skip locked)
  returning p.*;
end $$;
revoke all on function public.sc_bid_claim(int) from public, anon, authenticated;
grant execute on function public.sc_bid_claim(int) to service_role;

-- Coy's Undo: the job archived, its files hidden, a person the bid made
-- put back in Unsorted (and its customer with it), the email back to
-- Unfiled. Nothing is deleted; the package says it was undone and is never
-- re-run.
create or replace function public.sc_undo_bid(p_package uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.bid_packages; c jsonb; n int;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into v from public.bid_packages where id = p_package for update;
  if not found or not (v.org_id = any (public.get_user_org_ids())) then
    raise exception 'bid not found' using errcode = 'P0002';
  end if;
  if v.undone_at is not null then return; end if;
  c := v.created;
  if c ? 'job_id' then
    update public.jobs set archived_at = now(), archived_reason = 'bid undone'
     where id = (c->>'job_id')::uuid and org_id = v.org_id and archived_at is null;
  end if;
  update public.job_files set deleted_at = now()
   where org_id = v.org_id and deleted_at is null
     and id in (select (jsonb_array_elements_text(coalesce(c->'file_ids', '[]'::jsonb)))::uuid);
  if c ? 'contact_id' then
    update public.contacts set auto_classified_at = null, auto_classified_reason = null, status = 'archived'
     where id = (c->>'contact_id')::uuid and org_id = v.org_id and classification_confirmed_at is null;
  end if;
  if c ? 'customer_id' then
    update public.customers set status = 'archived'
     where id = (c->>'customer_id')::uuid and org_id = v.org_id;
  end if;
  update public.emails set job_id = null, customer_id = null, contact_id = null, match = 'none', status = 'unfiled', filed_at = null, filed_by = null
   where id = v.email_id and org_id = v.org_id;
  update public.bid_packages set state = 'undone', undone_at = now(), undone_by = auth.uid() where id = v.id;
end $$;
revoke all on function public.sc_undo_bid(uuid) from public, anon;
grant execute on function public.sc_undo_bid(uuid) to authenticated;

-- The worker, every minute.
select cron.schedule('bid-intake', '* * * * *', $cron$
  select net.http_post(
    url := 'https://cxiusuewtrvcpqequueh.supabase.co/functions/v1/bid-intake',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'enrich_worker_token')),
    timeout_milliseconds := 10000);
$cron$);
