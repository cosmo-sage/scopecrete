-- 088 — Several budgets on a job, each with a name (Coy, 2026-10-07: "save
-- and name the budget (give a name suggestion like draft 1 or draft 2). This
-- way when i click on build draft budget, it can build a new budget for me to
-- look at and I can open either one.").
--
-- A job still has ONE open budget — the estimate with status 'draft' (048's
-- unique index), the one the budget screen, the proposal, the Dashboard and
-- Dusty read. Every other budget on the job is 'saved': kept whole, with its
-- own lines, O.H., margin, tax switch and recipe exclusions, and opened again
-- with sc_open_budget(), which puts the open one aside in the same
-- transaction, so a job is never left with none open and no line is copied.
--
--   estimates.name        what Coy calls it ("Draft 1"), 1–60 characters.
--   estimates.status      gains 'saved'.
--   budget_runs.estimate_id   the budget a draft build was made into, so each
--                         budget shows its own build and the same calls and
--                         texts can be built again into a new one.
--
-- RLS unchanged (estimates under get_user_org_ids()); the function is
-- SECURITY INVOKER, so it can only touch what the caller may update.
-- Additive. Undo:
--   drop function public.sc_open_budget(uuid, uuid, text);
--   alter table public.budget_runs drop column estimate_id;
--   update public.estimates set status = 'expired' where status = 'saved';
--   alter table public.estimates drop constraint estimates_status_check;
--   alter table public.estimates add constraint estimates_status_check
--     check (status in ('draft','sent','accepted','rejected','expired'));
--   alter table public.estimates drop column name;

alter table public.estimates
  add column if not exists name text check (name is null or length(name) between 1 and 60);

alter table public.estimates drop constraint if exists estimates_status_check;
alter table public.estimates add constraint estimates_status_check
  check (status in ('draft', 'saved', 'sent', 'accepted', 'rejected', 'expired'));

create index if not exists estimates_job_saved on public.estimates (job_id, updated_at desc) where status = 'saved';

alter table public.budget_runs
  add column if not exists estimate_id uuid references public.estimates(id) on delete set null;

-- Put the job's open budget aside (named p_name when it has no name) and open
-- p_open, one of the job's saved budgets — or, with p_open null, leave none
-- open so the caller can start a new one. Returns the budget now open (null
-- when none). Refuses a budget that isn't a saved one on this job.
create or replace function public.sc_open_budget(p_job uuid, p_open uuid, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.jobs where id = p_job and org_id = any (public.get_user_org_ids());
  if v_org is null then raise exception 'job not found'; end if;
  if p_open is not null and not exists (
    select 1 from public.estimates where id = p_open and job_id = p_job and org_id = v_org and status = 'saved'
  ) then raise exception 'budget not found'; end if;

  update public.estimates
     set status = 'saved',
         name = coalesce(name, nullif(left(btrim(coalesce(p_name, '')), 60), '')),
         updated_at = now()
   where job_id = p_job and org_id = v_org and status = 'draft';

  if p_open is null then return null; end if;
  update public.estimates set status = 'draft', updated_at = now()
   where id = p_open and job_id = p_job and org_id = v_org and status = 'saved';
  return p_open;
end;
$$;

revoke all on function public.sc_open_budget(uuid, uuid, text) from public, anon;
grant execute on function public.sc_open_budget(uuid, uuid, text) to authenticated;
