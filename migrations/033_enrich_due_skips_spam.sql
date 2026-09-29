-- 033 — don't spend model calls re-reading spam.
--
-- A contact filed as spam — by Coy (classification_confirmed_at) or by Dusty
-- (auto_classified_at, migration 032) — is no longer due a read. Undo puts it
-- back in Unsorted and it becomes due again on new traffic. Same view, one
-- more condition; still security_invoker.

create or replace view public.sc_enrich_due with (security_invoker = true) as
with activity as (
  select m.contact_id,
         max(greatest(m.created_at, coalesce(a.created_at, m.created_at))) as changed_at,
         max(m.occurred_at) as last_at,
         sum(case when m.channel <> 'call' and m.direction = 'inbound'
                  then length(coalesce(m.body_text, '')) else 0 end)
           + 100 * count(a.id) + sum(length(coalesce(m.summary, ''))) as words
  from public.messages m
  left join public.call_artifacts a
    on a.message_id = m.id and a.kind in ('transcript', 'summary')
  where m.contact_id is not null
    and (m.direction = 'inbound' or m.channel = 'call')
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
  and coalesce(btrim(c.name), '') = ''
  and c.name_source is distinct from 'human'
  and not (c.contact_type = 'spam' and (c.classification_confirmed_at is not null or c.auto_classified_at is not null))
  and a.words >= 15
  and a.changed_at < now() - interval '3 minutes'
  and (r.contact_id is null
       or (r.outcome <> 'running' and a.changed_at > r.started_at)
       or (r.outcome in ('model_error', 'failed', 'abandoned')
           and r.started_at < now() - interval '30 minutes'));
