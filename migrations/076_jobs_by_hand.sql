-- 076 — no automatic job for a customer Dusty filed (Coy, 2026-10-04, on the
-- Jobs board: "if the job is suggested but not counted. I don't want to
-- automatically create the job. Later, once the system is working correctly we
-- can automatically create jobs, but for now i'll create it manually. Or I can
-- ask dusty to create it; he should have that ability.").
--
-- sc_customer_job_for() (migration 038, 068) made a New-lead job whenever a
-- named person became a customer — counted when Coy filed them, an uncounted
-- suggestion with Accept when Dusty did. Now it makes (and restores) a job only
-- when Coy filed the customer himself (classification_confirmed_at). A
-- customer Dusty filed gets none; Coy makes it with + New job, or asks Dusty,
-- whose plan step `new_job` goes through the same POST /api/jobs on Coy's tap.
-- Coy's own filing still makes one (Keep on an auto-filed customer is Coy's
-- filing) — but only with a proper name (Coy, same day: "as long as the job is
-- named properly"): Dusty's job title or the kind of work, never "New job".
--
-- The suggestions already on the board that nobody worked (New lead, no
-- sections, budget lines or files — 7 on 2026-10-04) are archived with
-- archived_reason = 'suggested — make jobs by hand', listed on Archived &
-- deleted with Restore. Worked ones are left as they are. Nothing is deleted.

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
  n int;
begin
  update jobs set flag_reason = null
  where org_id = c.org_id and contact_id = c.id and flag_reason like 'Customer is now filed as %';

  -- No name, no job (Coy, 2026-10-03). Named later → contacts_named_jobs calls this again.
  if not sc_contact_has_name(c) then
    return null;
  end if;

  -- Jobs by hand (Coy, 2026-10-04): only Coy's own filing makes or restores one.
  if not coy then
    return null;
  end if;

  update jobs set archived_at = null, archived_reason = null,
                  confirmed_at = coalesce(confirmed_at, now()),
                  confirmed_by = coalesce(confirmed_by, c.classification_confirmed_by)
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
  -- Named properly or not at all (Coy, 2026-10-04: "you can still create a job for a customer that I
  -- create as long as the job is named properly"): Dusty's job title, else the kind of work — never
  -- "New job". The customer's name goes in front (migration 067).
  if nullif(btrim(p.job_title), '') is null and (p.project_type is null or p.project_type = 'other') then
    return null;
  end if;

  select l.default_lead_source into v_source
  from messages m join org_phone_numbers l on l.id = m.phone_number_id
  where m.org_id = c.org_id and m.contact_id = c.id
  order by m.occurred_at asc limit 1;

  insert into jobs (org_id, contact_id, customer_id, title, address, description, job_type, status, origin,
                    created_from_message_id, lead_source, stage_changed_at, confirmed_at, confirmed_by)
  values (c.org_id, c.id, c.customer_id,
          coalesce(nullif(btrim(p.job_title), ''), initcap(p.project_type)),
          p.site_hint, left(p.scope_summary, 200), c.job_type_hint, 'lead', 'classification',
          p.evidence_message_id, v_source, now(), now(), c.classification_confirmed_by)
  returning id into v_id;
  return v_id;
end;
$function$;

-- The unworked suggestions already on the board.
update jobs j set archived_at = now(), archived_reason = 'suggested — make jobs by hand'
where j.archived_at is null and j.confirmed_at is null and j.origin = 'classification'
  and j.status in ('lead', 'invited')
  and not exists (select 1 from job_sections s where s.job_id = j.id)
  and not exists (select 1 from estimate_line_items l join estimates e on e.id = l.estimate_id where e.job_id = j.id)
  and not exists (select 1 from files f where f.job_id = j.id and f.deleted_at is null);
