-- 094 — job costing: what a job actually cost (Coy, 2026-10-09: "actual cost
-- will be job costing where receipts and bills are processed for the job";
-- Claude Design, Budget v3 → Actual costs).
--
-- job_costs: one row per cost filed on a job — a receipt or bill (a file Dusty
-- read, files.category 'receipt'), crew time (man-hours × a rate), or an amount
-- typed by hand. line_id puts it on a line of the job's budget; none = a cost
-- the budget didn't have ("not on the budget"). A line's actual cost is the sum
-- of its rows, worked out on read; nothing is copied onto the line, so a line
-- with no rows is "not filed" and is held at its budget in the totals.
-- paid_at marks a bill paid.
--
-- change_orders: work added after the proposal — its price to the customer and
-- its cost — signed or not.
--
-- jobs.actual_days / actual_crew_size / actual_hours: how the crew actually ran
-- (093 holds the budgeted crew).
--
-- market_lookups: the Market rate tab's going-rate searches, kept per job so
-- the page reads the last one instead of searching on every visit (each row is
-- what src/lib/draft/rates.ts kept: the rates, their pages, quotes and date).
--
-- Additive only. RLS by get_user_org_ids() (members; onsite estimators read
-- none of it); anon nothing; a guard keeps the job, the line and the file on
-- one org and the line and file on the same job. Until this is applied the
-- Actual costs tab says it waits for 094 and shows the budget alone.

alter table public.jobs
  add column if not exists actual_days numeric(5,1),
  add column if not exists actual_crew_size smallint,
  add column if not exists actual_hours numeric(4,1);
alter table public.jobs add constraint jobs_actual_days_range
  check (actual_days is null or (actual_days > 0 and actual_days <= 999)) not valid;
alter table public.jobs add constraint jobs_actual_crew_range
  check (actual_crew_size is null or actual_crew_size between 1 and 99) not valid;
alter table public.jobs add constraint jobs_actual_hours_range
  check (actual_hours is null or (actual_hours > 0 and actual_hours <= 24)) not valid;
alter table public.jobs validate constraint jobs_actual_days_range;
alter table public.jobs validate constraint jobs_actual_crew_range;
alter table public.jobs validate constraint jobs_actual_hours_range;

create table if not exists public.job_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  line_id uuid references public.estimate_line_items(id) on delete set null,
  file_id uuid references public.files(id) on delete set null,
  kind text not null check (kind in ('receipt', 'bill', 'time_log', 'typed')),
  vendor text check (vendor is null or length(vendor) <= 120),
  amount numeric(12,2) not null check (amount > -1000000 and amount < 10000000),
  man_hours numeric(7,2) check (man_hours is null or (man_hours > 0 and man_hours < 100000)),
  rate numeric(9,2) check (rate is null or (rate >= 0 and rate < 100000)),
  note text check (note is null or length(note) <= 500),
  spent_on date,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists job_costs_job_idx on public.job_costs (org_id, job_id, created_at desc);
create index if not exists job_costs_line_idx on public.job_costs (line_id) where line_id is not null;
create unique index if not exists job_costs_one_file on public.job_costs (job_id, file_id) where file_id is not null;

create table if not exists public.change_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  note text check (note is null or length(note) <= 500),
  price numeric(12,2) not null default 0 check (price > -10000000 and price < 10000000),
  cost numeric(12,2) not null default 0 check (cost > -10000000 and cost < 10000000),
  signed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists change_orders_job_idx on public.change_orders (org_id, job_id, created_at);

create table if not exists public.market_lookups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  lookup jsonb not null check (jsonb_typeof(lookup) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists market_lookups_job_idx on public.market_lookups (org_id, job_id, created_at desc);

-- The job, the budget line and the file all on one org, and the line and file on that job.
create or replace function public.sc_job_cost_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'that job is not in this org';
  end if;
  if tg_table_name = 'job_costs' then
    if new.line_id is not null and not exists (
      select 1 from estimate_line_items l join estimates e on e.id = l.estimate_id
      where l.id = new.line_id and e.job_id = new.job_id and e.org_id = new.org_id) then
      raise exception 'that budget line is not on this job';
    end if;
    if new.file_id is not null and not exists (
      select 1 from files f where f.id = new.file_id and f.org_id = new.org_id and (f.job_id = new.job_id or f.job_id is null)) then
      raise exception 'that file is not on this job';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists job_costs_guard on public.job_costs;
create trigger job_costs_guard before insert or update of org_id, job_id, line_id, file_id on public.job_costs
  for each row execute function public.sc_job_cost_guard();
drop trigger if exists change_orders_guard on public.change_orders;
create trigger change_orders_guard before insert or update of org_id, job_id on public.change_orders
  for each row execute function public.sc_job_cost_guard();
drop trigger if exists market_lookups_guard on public.market_lookups;
create trigger market_lookups_guard before insert or update of org_id, job_id on public.market_lookups
  for each row execute function public.sc_job_cost_guard();

alter table public.job_costs enable row level security;
alter table public.change_orders enable row level security;
alter table public.market_lookups enable row level security;
revoke all on public.market_lookups from anon, authenticated;
grant select, insert on public.market_lookups to authenticated;
create policy market_lookups_member_read on public.market_lookups
  for select to authenticated using (org_id = any (public.get_user_org_ids()));
create policy market_lookups_member_insert on public.market_lookups
  for insert to authenticated with check (org_id = any (public.get_user_org_ids()));
revoke all on public.job_costs, public.change_orders from anon, authenticated;
grant select, insert, update, delete on public.job_costs, public.change_orders to authenticated;

create policy job_costs_member on public.job_costs
  for all to authenticated using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));
create policy change_orders_member on public.change_orders
  for all to authenticated using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));
