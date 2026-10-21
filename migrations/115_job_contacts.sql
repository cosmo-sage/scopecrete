-- 115 — A job's own contacts (2026-10-21).
--
-- Coy, answering the database-vs-UI audit: "When the job is created, the contact for the
-- job is defaulted to the contact for the customer account if there is one contact. But
-- if there is multiple contacts with a customer (in the case of a GC company), i want to
-- be able to select the contacts for that customer/job. Often times, if I forward an email
-- to dusty from a GC bid request, the contact for that job that should be selected will be
-- in the email; often the footer."
--
-- Until now a job's contacts were worked out: its person (jobs.contact_id), every person of
-- its customer and its crew (job_vendors), so putting someone on a GC showed them on every
-- one of its jobs. job_contacts is who is on THIS job, each tagged by the side they work
-- for (customer, owner, vendor, other), one of them primary.
--
-- Filled by default: a job made with a person gets them; a job made with only a customer
-- that has exactly one person gets that person (and jobs.contact_id when it was empty); a
-- job whose person changes gets the new one too (nobody is taken off by a trigger). The
-- job's existing person is backfilled on every job. Coy picks the rest; bid intake will
-- pre-select the estimator it reads off the forwarded email (source 'bid').
--
-- Additive: one new table and two triggers on jobs that only ADD rows. RLS by
-- get_user_org_ids(), members insert, read, update and delete their org's rows; anon nothing.

create table if not exists public.job_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  side text not null default 'customer' check (side in ('customer', 'owner', 'vendor', 'other')),
  is_primary boolean not null default false,
  role text check (role is null or length(role) <= 60),
  source text not null default 'coy' check (source in ('default', 'coy', 'bid', 'dusty')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (job_id, contact_id)
);
create index if not exists job_contacts_contact_idx on public.job_contacts (contact_id);
create unique index if not exists job_contacts_one_primary on public.job_contacts (job_id) where is_primary;

create or replace function public.sc_job_contact_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'that job is not in this org';
  end if;
  if not exists (select 1 from contacts c where c.id = new.contact_id and c.org_id = new.org_id) then
    raise exception 'that person is not in this org';
  end if;
  return new;
end $$;
create trigger job_contacts_guard before insert or update on public.job_contacts
  for each row execute function public.sc_job_contact_guard();

alter table public.job_contacts enable row level security;
revoke all on public.job_contacts from anon, authenticated;
grant select, insert, update, delete on public.job_contacts to authenticated;
create policy job_contacts_member on public.job_contacts
  for all to authenticated using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));

-- A new job: its customer's only person when it was made with none.
create or replace function public.sc_job_default_contact() returns trigger
language plpgsql security invoker set search_path = public as $$
declare v_only uuid;
begin
  if new.contact_id is null and new.customer_id is not null then
    select min(c.id::text)::uuid into v_only from contacts c
     where c.customer_id = new.customer_id and c.org_id = new.org_id
       and c.merged_into_contact_id is null and c.archived_at is null
    having count(*) = 1;
    if v_only is not null then new.contact_id := v_only; end if;
  end if;
  return new;
end $$;
create trigger jobs_default_contact before insert on public.jobs
  for each row execute function public.sc_job_default_contact();

-- The job's person is on the job (added, never removed).
create or replace function public.sc_job_contact_follow() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.contact_id is not null and (tg_op = 'INSERT' or new.contact_id is distinct from old.contact_id) then
    insert into job_contacts (org_id, job_id, contact_id, side, is_primary, source, created_by)
    values (new.org_id, new.id, new.contact_id, 'customer',
            not exists (select 1 from job_contacts x where x.job_id = new.id and x.is_primary), 'default', auth.uid())
    on conflict (job_id, contact_id) do nothing;
  end if;
  return new;
end $$;
create trigger jobs_contact_follow after insert or update of contact_id on public.jobs
  for each row execute function public.sc_job_contact_follow();

-- Backfill: every job's person, primary.
insert into public.job_contacts (org_id, job_id, contact_id, side, is_primary, source, created_by)
select j.org_id, j.id, j.contact_id, 'customer', true, 'default', null
from public.jobs j join public.contacts c on c.id = j.contact_id and c.org_id = j.org_id
on conflict (job_id, contact_id) do nothing;
