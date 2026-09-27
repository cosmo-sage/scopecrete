-- 030 — run the background enricher every five minutes (see 029).
--
-- The call carries the vault token enrich_worker_token; nothing about it is
-- typed or stored anywhere else. The worker answers 202 at once and finishes
-- in the background, so the 10-second timeout here is only for the handshake.
-- Until HERMES_API_KEY is set in the Edge Function secrets, each tick records
-- 'not_configured' in sc_worker_heartbeats and claims nobody.
--
-- Pause:   select cron.unschedule('enrich-contacts');
-- History: select * from cron.job_run_details order by start_time desc limit 20;

select cron.schedule(
  'enrich-contacts',
  '*/5 * * * *',
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
