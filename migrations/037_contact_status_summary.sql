-- 037 — Dusty's one-line "where things stand", for every person on Threads.
--
-- Coy, 2026-09-28: the collapsed Threads row should say where this customer is
-- at — or the latest with a vendor — in a sentence, not echo the last text.
-- Expanded, a short summary of the latest conversations. The enricher writes
-- both (enrich-contacts v8), with a job-type hint for customers.
--
-- These are a DISPLAY CACHE of a machine summary, like messages.summary: shown
-- as Dusty's words, never a classification, never a name. They decide nothing.
--
-- Additive: four columns on contacts, one widened CHECK on this series' own
-- table, and sc_enrich_due re-read:
--   * named and sorted people are now read too (the summary is for everyone),
--     the name step still only touches the unnamed;
--   * our own messages count as a change (a quote sent changes where things
--     stand), though only THEIR words make someone worth reading;
--   * everyone last read before this migration is read once more, so the
--     summaries backfill without waiting for new traffic.
--
-- Applied in two parts on 2026-09-28: 037a (columns, CHECK) before
-- enrich-contacts v8 was deployed, 037b (the view) after, with the backfill
-- cutoff set to that moment, so the v7 reader could not consume the backfill.

alter table public.contacts
  add column if not exists status_summary text,
  add column if not exists recent_summary text,
  add column if not exists job_type_hint text
    check (job_type_hint is null or job_type_hint in ('residential', 'commercial', 'public')),
  add column if not exists status_summary_at timestamptz;

alter table public.contact_enrich_runs drop constraint if exists contact_enrich_runs_outcome_check;
alter table public.contact_enrich_runs add constraint contact_enrich_runs_outcome_check
  check (outcome in ('running', 'proposed', 'named', 'filed', 'summarized', 'unchanged', 'no_words',
                     'model_error', 'failed', 'abandoned', 'skipped'));

create or replace view public.sc_enrich_due with (security_invoker = true) as
with activity as (
  select m.contact_id,
         max(greatest(m.created_at, coalesce(a.created_at, m.created_at))) as changed_at,
         max(m.occurred_at) as last_at,
         sum(case when m.channel <> 'call' and m.direction = 'inbound'
                  then length(coalesce(m.body_text, '')) else 0 end)
           + 100 * count(a.id)
           + sum(case when m.channel = 'call' then length(coalesce(m.summary, '')) else 0 end) as words
  from public.messages m
  left join public.call_artifacts a
    on a.message_id = m.id and a.kind in ('transcript', 'summary')
  where m.contact_id is not null
  group by m.contact_id
), last_run as (
  select distinct on (r.contact_id) r.contact_id, r.started_at, r.outcome
  from public.contact_enrich_runs r
  order by r.contact_id, r.started_at desc
)
select c.org_id, c.id as contact_id, a.last_at, a.changed_at
from public.contacts c
join activity a on a.contact_id = c.id
left join last_run r on r.contact_id = c.id
where c.merged_into_contact_id is null
  and not (c.contact_type = 'spam' and (c.classification_confirmed_at is not null or c.auto_classified_at is not null))
  and a.words >= 15
  and a.changed_at < now() - interval '3 minutes'
  and (r.contact_id is null
       or (r.outcome <> 'running' and a.changed_at > r.started_at)
       -- one backfill read for everyone read before summaries existed
       or (r.outcome <> 'running' and c.status_summary_at is null
           and r.started_at < timestamptz '2026-09-28 00:15:00+00')
       or (r.outcome in ('model_error', 'failed', 'abandoned')
           and r.started_at < now() - interval '30 minutes'));
