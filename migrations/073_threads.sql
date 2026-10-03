-- 073 — threads you make (Claude Design handoff "Threads v2", 2026-10-03;
-- Coy: "Apply 073").
--
-- A thread is a saved SET of contacts to see together. The five role buckets
-- (Customer · Unsorted · Vendor · Personal · Spam) stay virtual — worked out
-- from contacts.contact_type as /api/threads/counts does. These two tables hold
-- the ones Coy makes, e.g. "Wilson Driveway Repair" = the homeowner, his wife,
-- the ready-mix dispatcher, the finisher, the permit office. Being in a thread
-- never moves anyone out of Customer or Vendor.
--
-- A thread made from a job (job_id, source='job') follows the job: anyone on it
-- later — its contact, its customer's people, its crew & suppliers
-- (job_vendors) — is added with added_by='job-sync'. Removing someone by hand
-- is Coy's to do; the sync only adds. A thread made from a customer
-- (customer_id, source='customer') follows its people the same way
-- (added_by='customer-sync').
--
-- Additive: two tables, five functions, six triggers. RLS by
-- get_user_org_ids(); anon nothing. A thread is retired with archived_at.

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null default 'custom' check (kind in ('custom')),
  job_id uuid references public.jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  source text not null default 'manual' check (source in ('job', 'customer', 'manual')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists threads_org on public.threads (org_id) where archived_at is null;

create table if not exists public.thread_contacts (
  thread_id uuid not null references public.threads(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by text not null default 'user' check (added_by in ('user', 'job-sync', 'customer-sync')),
  primary key (thread_id, contact_id)
);
create index if not exists thread_contacts_contact on public.thread_contacts (contact_id);

alter table public.threads enable row level security;
alter table public.thread_contacts enable row level security;
revoke all on public.threads, public.thread_contacts from anon;

create policy threads_org on public.threads for all to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
create policy thread_contacts_org on public.thread_contacts for all to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));

-- A thread's job and customer, and a member's thread and contact, are on the thread's org.
create or replace function public.sc_threads_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'threads' then
    if new.job_id is not null and not exists (select 1 from jobs where id = new.job_id and org_id = new.org_id) then
      raise exception 'job not found';
    end if;
    if new.customer_id is not null and not exists (select 1 from customers where id = new.customer_id and org_id = new.org_id) then
      raise exception 'customer not found';
    end if;
    new.updated_at := now();
  else
    if not exists (select 1 from threads where id = new.thread_id and org_id = new.org_id) then raise exception 'thread not found'; end if;
    if not exists (select 1 from contacts where id = new.contact_id and org_id = new.org_id) then raise exception 'contact not found'; end if;
  end if;
  return new;
end $$;
revoke all on function public.sc_threads_guard() from public, anon, authenticated;
create trigger threads_guard before insert or update on public.threads
  for each row execute function public.sc_threads_guard();
create trigger thread_contacts_guard before insert or update on public.thread_contacts
  for each row execute function public.sc_threads_guard();

-- Everyone on a job: its contact, its customer's people, its crew & suppliers. Invoker.
create or replace function public.sc_job_people(p_job uuid)
returns table (contact_id uuid)
language sql stable security invoker set search_path = public as $$
  select j.contact_id from jobs j where j.id = p_job and j.contact_id is not null
  union
  select c.id from jobs j join contacts c on c.customer_id = j.customer_id and c.merged_into_contact_id is null
   where j.id = p_job and j.customer_id is not null and c.archived_at is null
  union
  select v.contact_id from job_vendors v where v.job_id = p_job;
$$;
revoke all on function public.sc_job_people(uuid) from public, anon;
grant execute on function public.sc_job_people(uuid) to authenticated;

-- Job threads follow their job: add anyone now on it (never removes).
create or replace function public.sc_sync_job_threads(p_job uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into thread_contacts (thread_id, contact_id, org_id, added_by)
  select t.id, p.contact_id, t.org_id, 'job-sync'
    from threads t cross join lateral sc_job_people(t.job_id) p
   where t.job_id = p_job and t.source = 'job' and t.archived_at is null
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.sc_sync_job_threads(uuid) from public, anon, authenticated;

create or replace function public.sc_job_threads_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'job_vendors' then
    perform sc_sync_job_threads(new.job_id);
  elsif tg_table_name = 'jobs' then
    perform sc_sync_job_threads(new.id);
  elsif tg_table_name = 'contacts' then
    perform sc_sync_job_threads(j.id) from jobs j where j.customer_id = new.customer_id;
    insert into thread_contacts (thread_id, contact_id, org_id, added_by)
    select t.id, new.id, t.org_id, 'customer-sync' from threads t
     where t.customer_id = new.customer_id and t.source = 'customer' and t.archived_at is null
    on conflict do nothing;
  elsif tg_table_name = 'threads' then
    if new.job_id is not null and new.source = 'job' then perform sc_sync_job_threads(new.job_id); end if;
    if new.customer_id is not null and new.source = 'customer' then
      insert into thread_contacts (thread_id, contact_id, org_id, added_by)
      select new.id, c.id, new.org_id, 'customer-sync' from contacts c
       where c.customer_id = new.customer_id and c.merged_into_contact_id is null and c.archived_at is null
      on conflict do nothing;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.sc_job_threads_follow() from public, anon, authenticated;

create trigger job_vendors_threads after insert on public.job_vendors
  for each row execute function public.sc_job_threads_follow();
create trigger jobs_threads after update of contact_id, customer_id on public.jobs
  for each row execute function public.sc_job_threads_follow();
create trigger contacts_threads after update of customer_id on public.contacts
  for each row when (new.customer_id is not null and new.customer_id is distinct from old.customer_id)
  execute function public.sc_job_threads_follow();
create trigger threads_follow_job after insert on public.threads
  for each row execute function public.sc_job_threads_follow();
