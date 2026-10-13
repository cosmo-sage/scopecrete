-- 109 — who the work is for, apart from who pays (Claude Design "Job Summary",
-- 2026-10-13; Coy: "we have some updates to the job summary page").
--
-- A job's customer (jobs.customer_id) is who it is billed to: the homeowner,
-- or the GC when Sacco is the sub. The design adds the OWNER: who the work is
-- actually for (Gulfline Paving is the customer, Eye Care Center the owner).
-- Null means the same as the customer, which is every residential job.
--
-- The owner is a row of `customers` (the design's "reuse customers with a
-- role"): it has a name, a type, an address and people of its own, and the
-- Summary's contacts are the job's person plus both sides' people, each tagged
-- with the side they work for. No other table, no change to who pays.
--
-- Additive: one nullable column and a same-org guard. RLS on jobs is unchanged;
-- members already update jobs under get_user_org_ids().

alter table public.jobs
  add column if not exists owner_customer_id uuid references public.customers(id) on delete set null;

create index if not exists jobs_owner_customer_idx on public.jobs (owner_customer_id) where owner_customer_id is not null;

-- The owner must be a customer of the job's own org, and not the job's customer
-- itself (that is what null means).
create or replace function public.sc_job_owner_guard() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.owner_customer_id is null then return new; end if;
  if new.owner_customer_id = new.customer_id then
    new.owner_customer_id := null;
    return new;
  end if;
  if not exists (select 1 from public.customers c where c.id = new.owner_customer_id and c.org_id = new.org_id) then
    raise exception 'owner is not a customer of this organization';
  end if;
  return new;
end $$;

create trigger jobs_owner_guard
  before insert or update of owner_customer_id, customer_id on public.jobs
  for each row execute function public.sc_job_owner_guard();
