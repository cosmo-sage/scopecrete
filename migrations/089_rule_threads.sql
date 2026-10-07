-- 089 — threads made from rules (Coy, 2026-10-07: "I want ultimate flexibility
-- for the threads channels I create … a thread for all the emails coming into
-- intake-concrete@agentmail.to … todays calls from quo phone number … all my VOIP
-- numbers … bid requests sent out to vendors"; "yes build threads made from rules
-- as long as it doesn't break anything else").
--
-- Additive. A rule thread is a `threads` row with source = 'rule' and the filter
-- in `rule` (channels, lines, inboxes, window, who, direction, words — shaped by
-- src/lib/rule-threads.ts). It holds no thread_contacts: what it shows is worked
-- out from messages and emails each time it is opened, under RLS. The job and
-- customer sync triggers act only on source 'job' / 'customer', so they never
-- touch a rule thread. Existing rows keep rule null and their source; RLS and the
-- guard trigger are unchanged.

alter table public.threads add column if not exists rule jsonb;

alter table public.threads drop constraint if exists threads_source_check;
alter table public.threads add constraint threads_source_check
  check (source in ('job', 'customer', 'manual', 'rule'));

-- A rule thread has a rule (an object, under 4 KB); no other thread has one.
alter table public.threads add constraint threads_rule_shape check (
  (source = 'rule') = (rule is not null)
  and (rule is null or (jsonb_typeof(rule) = 'object' and pg_column_size(rule) < 4096))
);
