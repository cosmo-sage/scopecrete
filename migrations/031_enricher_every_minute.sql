-- 031 — run the background enricher every minute instead of every five.
--
-- Coy, 2026-09-27: a 60-contact backlog at 6 per 5 minutes took an hour. The
-- worker (enrich-contacts v5) now keeps 4 readers going and claims contacts
-- until the queue is empty or 80 s have passed, so each run clears ~10-15 and
-- a backlog drains in minutes. With nothing due, a run is one /health ping and
-- one empty claim. Overlapping runs are safe: contact_enrich_runs_one_running
-- makes a double claim impossible.

select cron.schedule(
  'enrich-contacts',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://cxiusuewtrvcpqequueh.supabase.co/functions/v1/enrich-contacts',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'enrich_worker_token')
    ),
    timeout_milliseconds := 10000
  );
  $cron$
);
