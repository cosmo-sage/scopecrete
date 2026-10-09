-- 093 — the crew on a job (Coy, 2026-10-08: "estimate how many days it will
-- take with what size crew. And how much gross profit and net profit are
-- figured per day").
--
-- A job already has its days (jobs.duration_days, migration 057). The budget's
-- Cost Analysis also needs how many people and how many hours a day, to work
-- out man-days, man-hours, labor per man-hour and profit per man-day. Both are
-- Coy's to type; blank means not set (hours read as 8 until set). Nothing is
-- priced from them — the job minimum is still the day minimum × days.
--
-- Additive only: two nullable columns, checked, no default, no grant or policy
-- change (jobs' RLS by get_user_org_ids() covers them). Until this is applied
-- the Cost Analysis says crew size waits for 093 and works from days alone.

alter table public.jobs
  add column if not exists crew_size smallint,
  add column if not exists crew_hours numeric(4,1);

alter table public.jobs add constraint jobs_crew_size_range
  check (crew_size is null or crew_size between 1 and 99) not valid;
alter table public.jobs add constraint jobs_crew_hours_range
  check (crew_hours is null or (crew_hours > 0 and crew_hours <= 24)) not valid;
alter table public.jobs validate constraint jobs_crew_size_range;
alter table public.jobs validate constraint jobs_crew_hours_range;
