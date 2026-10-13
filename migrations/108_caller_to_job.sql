-- 108 — a new caller becomes a customer and a job on their own (Coy,
-- 2026-10-13, on Brittany LaRochelle's thread: "between the transcribed
-- voicemail, the text messages, and my responses, the system should have had
-- enough information to enrich the contact with her name, email, address. then
-- create a customer with that information (same as the contact) then create a
-- job and pull in the photos and prompt me for what was next to finish scoping
-- and estimating the job. But none of it happened without me.").
--
-- This reverses 076 ("jobs by hand") on Coy's word: Coy said then "Later, once
-- the system is working correctly we can automatically create jobs".
--
-- What changes, all in sc_customer_job_for() (called when a person becomes a
-- customer, and again when an unnamed customer is named — 038, 068):
--   * A customer Dusty filed gets its job too, as before 076: an uncounted
--     suggestion (confirmed_at null) with Accept on the board, counted once
--     Coy keeps the customer (sc_contacts_bucket_jobs already confirms it).
--     The rules that make one are unchanged: a name, and Dusty's read naming
--     the work with a proper title — never "New job".
--   * A person Dusty filed customer who has no customer row gets one, named as
--     the person, relation 'customer' left UNCONFIRMED (relation_source
--     'default') — so §2b holds: nothing about the lead guard moves. Their
--     texted or heard address follows onto it (contacts_customer_address, 071).
--     Coy's own filing still makes its customer in sc_classify_contact, so this
--     is skipped when he filed them.
--   * Each job made here leaves Coy one next step on the person, due that day,
--     linked to the job: what is left to scope and price it.
-- And a new trigger: when a person is put on a customer, their open jobs with
-- no customer take it (Brittany's job, made by hand before she was filed, had
-- none). Backfilled once.
--
-- Additive in effect; nothing deleted.

create or replace function public.sc_customer_job_for(c contacts)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  coy boolean := c.classification_confirmed_at is not null;
  p record;
  v_source text;
  v_id uuid;
  v_cust uuid := c.customer_id;
  v_title text;
  n int;
begin
  update jobs set flag_reason = null
  where org_id = c.org_id and contact_id = c.id and flag_reason like 'Customer is now filed as %';

  -- No name, no job (Coy, 2026-10-03). Named later → contacts_named_jobs calls this again.
  if not sc_contact_has_name(c) then
    return null;
  end if;

  -- Coy's filing confirms; Dusty's only restores an uncounted suggestion.
  update jobs set archived_at = null, archived_reason = null,
                  confirmed_at = case when coy then coalesce(confirmed_at, now()) else confirmed_at end,
                  confirmed_by = case when coy then coalesce(confirmed_by, c.classification_confirmed_by) else confirmed_by end
  where org_id = c.org_id and contact_id = c.id and origin = 'classification'
    and archived_at is not null and (archived_reason like 'moved to %' or archived_reason = 'waiting for a name');
  get diagnostics n = row_count;
  if n > 0 then
    select id into v_id from jobs where org_id = c.org_id and contact_id = c.id and origin = 'classification'
      and archived_at is null order by created_at desc limit 1;
    return v_id;
  end if;

  if exists (select 1 from jobs where org_id = c.org_id and contact_id = c.id
             and archived_at is null and status not in ('lost', 'closed', 'complete')) then
    return null;
  end if;

  select pr.project_type, pr.scope_summary, pr.site_hint, pr.sqft_stated, pr.length_ft, pr.evidence_message_id, pr.job_title
    into p
  from contact_proposals pr
  where pr.org_id = c.org_id and pr.contact_id = c.id
  order by pr.created_at desc limit 1;
  if not found or (p.project_type is null and p.scope_summary is null and p.site_hint is null
                   and p.sqft_stated is null and p.length_ft is null) then
    return null;
  end if;
  -- Named properly or not at all (Coy, 2026-10-04): Dusty's job title, else the kind of work — never "New job".
  if nullif(btrim(p.job_title), '') is null and (p.project_type is null or p.project_type = 'other') then
    return null;
  end if;

  -- Dusty filed them and they have no customer yet: one, named as the person,
  -- relation left unconfirmed (§2b). Coy's filing makes its own in sc_classify_contact.
  if v_cust is null and not coy and coalesce(c.name, '') ~ '[A-Za-z]' then
    insert into customers (org_id, name, kind, relation, relation_source, primary_contact_id)
    values (c.org_id, btrim(c.name), 'person', 'customer', 'default', c.id)
    returning id into v_cust;
    update contacts set customer_id = v_cust, is_primary = true where id = c.id and customer_id is null;
  end if;

  select l.default_lead_source into v_source
  from messages m join org_phone_numbers l on l.id = m.phone_number_id
  where m.org_id = c.org_id and m.contact_id = c.id
  order by m.occurred_at asc limit 1;

  insert into jobs (org_id, contact_id, customer_id, title, address, description, job_type, status, origin,
                    created_from_message_id, lead_source, stage_changed_at, confirmed_at, confirmed_by)
  values (c.org_id, c.id, v_cust,
          coalesce(nullif(btrim(p.job_title), ''), initcap(p.project_type)),
          p.site_hint, left(p.scope_summary, 200), c.job_type_hint, 'lead', 'classification',
          p.evidence_message_id, v_source, now(),
          case when coy then now() end, case when coy then c.classification_confirmed_by end)
  returning id, title into v_id, v_title;

  -- What's left, as a next step on the person (the activity line's reminders, their page, Dusty).
  insert into contact_tasks (org_id, contact_id, job_id, title, due_on, source, status, evidence_quote)
  select c.org_id, c.id, v_id,
         left('Finish scoping ' || v_title || ': check their photos, measure it, then build the budget', 200),
         (now() at time zone 'America/Chicago')::date, 'dusty', 'open',
         'A job was made from their calls and texts'
  where not exists (select 1 from contact_tasks t where t.org_id = c.org_id and t.contact_id = c.id and t.job_id = v_id);
  return v_id;
end;
$function$;

-- A person put on a customer: their open jobs with no customer take it.
create or replace function public.sc_contacts_jobs_customer()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update jobs set customer_id = new.customer_id
  where org_id = new.org_id and contact_id = new.id and customer_id is null and archived_at is null;
  return new;
end;
$function$;

revoke all on function public.sc_contacts_jobs_customer() from public, anon, authenticated;

create trigger contacts_jobs_customer
  after update of customer_id on public.contacts
  for each row when (new.customer_id is not null and new.customer_id is distinct from old.customer_id)
  execute function public.sc_contacts_jobs_customer();

-- Once: open jobs whose person is on a customer but the job isn't.
update jobs j set customer_id = c.customer_id
from contacts c
where c.id = j.contact_id and c.org_id = j.org_id and j.customer_id is null
  and c.customer_id is not null and j.archived_at is null;
