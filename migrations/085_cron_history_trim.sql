-- 085 — keep a week of cron history (2026-10-06, "what's using up my quota on supabase").
--
-- pg_cron writes a row to cron.job_run_details for every run and never deletes
-- one. Five jobs (three every minute) add ~4,600 rows a day: measured that day,
-- 32,134 rows since 2026-09-27, 23 MB — a quarter of the 96 MB database, and
-- ~75 MB more a month against the free plan's 500 MB. Nothing in the app reads
-- the history; the workers' health is sc_worker_heartbeats (§2b).
--
-- A nightly job (04:17 UTC, quiet) deletes runs older than seven days. Only
-- cron's own log rows; no app data, no grants, no policies.

select cron.schedule(
  'trim-cron-history',
  '17 4 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);

-- Undo: select cron.unschedule('trim-cron-history');
