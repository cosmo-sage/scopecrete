-- 110 — appointments on a job and a person (Coy, 2026-10-13: "I need a way for
-- Dusty to keep track of my schedule for each job and customer contact lead.
-- For example, I called and scheduled an appointment with … Wilson for an
-- on-site consultation as the preliminary estimate for this Thursday between 12
-- and 1 p.m. It would be nice if I had the ability to add that to my calendar
-- through Scopecrete and to send confirmation text messages through Scopecrete
-- via AI.").
--
-- One row per appointment: when (starts_at, ends_at — stored in UTC, entered
-- and shown in Central time), what kind (site visit, consultation, pour, meeting,
-- other), on which job and/or which person (at least one), where, a note, and
-- its state: scheduled → confirmed (the customer said yes) → done, or canceled.
-- Never deleted: a canceled one stays with its reason.
--
-- The calendar: each appointment has Add to calendar (a Google Calendar link,
-- or an .ics file a phone's calendar opens) — nothing is synced back. A
-- confirmation text is Dusty's draft and Coy's tap through Quo (§6, §10).
--
-- Additive only. RLS by get_user_org_ids() (members; onsite estimators read
-- none of it); anon nothing; a guard keeps the job, the person and the customer
-- on the row's org.

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  kind text not null default 'site_visit'
    check (kind in ('site_visit', 'consultation', 'pour', 'meeting', 'other')),
  title text not null check (length(title) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz,
  address text check (address is null or length(address) <= 200),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'done', 'canceled')),
  confirmed_at timestamptz,
  canceled_reason text check (canceled_reason is null or length(canceled_reason) <= 300),
  source text not null default 'coy' check (source in ('coy', 'dusty')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_on_something check (job_id is not null or contact_id is not null or customer_id is not null),
  constraint appointments_end_after check (ends_at is null or (ends_at > starts_at and ends_at <= starts_at + interval '7 days'))
);
create index if not exists appointments_org_start_idx on public.appointments (org_id, starts_at);
create index if not exists appointments_job_idx on public.appointments (job_id, starts_at) where job_id is not null;
create index if not exists appointments_contact_idx on public.appointments (contact_id, starts_at) where contact_id is not null;

-- The job, the person and the customer all on the row's org.
create or replace function public.sc_appointment_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.job_id is not null and not exists (select 1 from jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'that job is not in this org';
  end if;
  if new.contact_id is not null and not exists (select 1 from contacts c where c.id = new.contact_id and c.org_id = new.org_id) then
    raise exception 'that person is not in this org';
  end if;
  if new.customer_id is not null and not exists (select 1 from customers c where c.id = new.customer_id and c.org_id = new.org_id) then
    raise exception 'that customer is not in this org';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger appointments_guard before insert or update on public.appointments
  for each row execute function public.sc_appointment_guard();

alter table public.appointments enable row level security;
revoke all on public.appointments from anon, authenticated;
grant select, insert, update on public.appointments to authenticated;
create policy appointments_member on public.appointments
  for all to authenticated using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));
