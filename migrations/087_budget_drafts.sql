-- 087 — A draft budget from the job's own calls and texts (Coy's handoff,
-- 2026-10-07: "It is easier to approve a budget than build one in the
-- field").
--
-- The draft writes into what already exists — the job's areas (job_sections)
-- and its one working budget (estimates / estimate_line_items, filled by
-- Coy's assemblies). This migration adds only what has nowhere to live yet:
--
--   budget_runs       one row per build: what was read, what it came to
--                     (ready for review / needs information / manual review),
--                     what it made, and its error. `idem_key` is the job +
--                     what it read + the recipe, so the same input never
--                     builds twice; one queued or running build per job.
--   budget_approvals  Coy's approved budget, frozen (lines, prices, totals as
--                     he approved them). Insert only: nobody edits or removes
--                     an approval. Approving is internal — it sends nothing.
--   estimates.recipe_exclusions   steps Coy left off this job and why
--                     ({"haul": "he's keeping the broken concrete"}).
--   job_sections.origin 'draft'   an area the draft made (beside 'bid').
--
-- RLS by get_user_org_ids() (onsite estimators: none). Anon nothing.
-- Additive. Undo:
--   drop table public.budget_approvals; drop table public.budget_runs;
--   alter table public.estimates drop column recipe_exclusions;
--   alter table public.job_sections drop constraint job_sections_origin_check;
--   alter table public.job_sections add constraint job_sections_origin_check check (origin is null or origin in ('bid'));

create table if not exists public.budget_runs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  job_id         uuid not null references public.jobs(id) on delete cascade,
  trigger        text not null check (trigger in ('manual', 'job_created')),
  idem_key       text not null check (length(idem_key) <= 200),
  input_hash     text not null check (length(input_hash) <= 100),
  status         text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  outcome        text check (outcome in ('ready_for_review', 'needs_information', 'manual_review')),
  recipe_version text,
  reader         text,
  reading        jsonb,
  made           jsonb,
  suggestions    jsonb,
  error          text check (error is null or length(error) <= 500),
  attempts       integer not null default 0,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  unique (org_id, idem_key)
);

create index if not exists budget_runs_job on public.budget_runs (job_id, created_at desc);
create unique index if not exists budget_runs_one_active on public.budget_runs (job_id) where status in ('queued', 'running');

alter table public.budget_runs enable row level security;
revoke all on public.budget_runs from anon, authenticated;
grant select, insert, update on public.budget_runs to authenticated;

create policy budget_runs_member_read on public.budget_runs
  for select to authenticated using (org_id = any (public.get_user_org_ids()));
create policy budget_runs_member_insert on public.budget_runs
  for insert to authenticated with check (org_id = any (public.get_user_org_ids()));
create policy budget_runs_member_update on public.budget_runs
  for update to authenticated using (org_id = any (public.get_user_org_ids()))
  with check (org_id = any (public.get_user_org_ids()));

create table if not exists public.budget_approvals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  estimate_id  uuid not null references public.estimates(id) on delete cascade,
  run_id       uuid references public.budget_runs(id) on delete set null,
  snapshot     jsonb not null,
  total        numeric,
  cost         numeric,
  approved_by  uuid,
  approved_at  timestamptz not null default now()
);

create index if not exists budget_approvals_job on public.budget_approvals (job_id, approved_at desc);

alter table public.budget_approvals enable row level security;
revoke all on public.budget_approvals from anon, authenticated;
grant select, insert on public.budget_approvals to authenticated;

create policy budget_approvals_member_read on public.budget_approvals
  for select to authenticated using (org_id = any (public.get_user_org_ids()));
create policy budget_approvals_member_insert on public.budget_approvals
  for insert to authenticated with check (
    org_id = any (public.get_user_org_ids())
    and exists (select 1 from public.estimates e where e.id = estimate_id and e.job_id = budget_approvals.job_id and e.org_id = budget_approvals.org_id)
  );

alter table public.estimates add column if not exists recipe_exclusions jsonb not null default '{}'::jsonb;

alter table public.job_sections drop constraint if exists job_sections_origin_check;
alter table public.job_sections add constraint job_sections_origin_check check (origin is null or origin in ('bid', 'draft'));
