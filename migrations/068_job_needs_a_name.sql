-- 068 — No automatic job for a person with no name (Coy, 2026-10-03: "A job
-- should not be created if the person doesn't have a name. In order to identify
-- a person as a customer, we need to have a name or a scope of some kind. So I
-- would rather not create a job if I don't at least have the person identified
-- as a customer with a name.").
--
--   * sc_customer_job_for() (migration 038, the jobs-follow-the-bucket trigger)
--     makes nothing — and restores nothing — for a customer whose person and
--     customer both have no name (a name that is only a phone number is no
--     name). It still needs Dusty's read to name the work, site or size.
--   * When that person IS named later (by their own introduction, Coy's pencil
--     or a bid), a new trigger makes the job then — contacts_named_jobs.
--   * Existing: open automatic jobs of unnamed people that nobody has worked
--     (New lead, no sections, no budget lines, no files) are archived with
--     archived_reason 'waiting for a name', and come back on their own when the
--     person is named. A worked job is never touched.
--
-- Additive: function bodies replaced, one new trigger, one backfill update. RLS
-- unchanged. No drop.

create or replace function public.sc_contact_has_name(c contacts)
returns boolean language sql stable set search_path = public as $$
  select coalesce(c.name, '') ~ '[A-Za-z]'
      or exists (select 1 from customers cu where cu.id = c.customer_id and coalesce(cu.name, '') ~ '[A-Za-z]');
$$;

create or replace function public.sc_customer_job_for(c contacts)
returns uuid language plpgsql security definer set search_path = public as $function$
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

  select l.default_lead_source into v_source
  from messages m join org_phone_numbers l on l.id = m.phone_number_id
  where m.org_id = c.org_id and m.contact_id = c.id
  order by m.occurred_at asc limit 1;

  insert into jobs (org_id, contact_id, customer_id, title, address, description, job_type, status, origin,
                    created_from_message_id, lead_source, stage_changed_at, confirmed_at, confirmed_by)
  values (c.org_id, c.id, c.customer_id,
          coalesce(nullif(btrim(p.job_title), ''),
                   case when p.project_type is null or p.project_type = 'other' then 'New job' else initcap(p.project_type) end),
          p.site_hint, left(p.scope_summary, 200), c.job_type_hint, 'lead', 'classification',
          p.evidence_message_id, v_source, now(),
          case when coy then now() end, case when coy then c.classification_confirmed_by end)
  returning id into v_id;
  return v_id;
end;
$function$;

-- A customer who gets a name: their job now (or the one waiting for it comes back).
create or replace function public.sc_contacts_named_jobs()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(old.name, '') !~ '[A-Za-z]' and coalesce(new.name, '') ~ '[A-Za-z]'
     and new.merged_into_contact_id is null and sc_is_shown_customer(new) then
    perform sc_customer_job_for(new);
  end if;
  return new;
end;
$$;
create trigger contacts_named_jobs after update of name on public.contacts
  for each row execute function public.sc_contacts_named_jobs();

revoke execute on function public.sc_contact_has_name(contacts) from anon;

-- Existing (Coy's go): unworked automatic jobs of people with no name wait for one.
update jobs j set archived_at = now(), archived_reason = 'waiting for a name'
from contacts c
where c.id = j.contact_id and j.origin = 'classification' and j.archived_at is null and j.status = 'lead'
  and not sc_contact_has_name(c)
  and not exists (select 1 from job_sections s where s.job_id = j.id)
  and not exists (select 1 from estimates e join estimate_line_items l on l.estimate_id = e.id where e.job_id = j.id)
  and not exists (select 1 from job_files f where f.job_id = j.id and f.deleted_at is null);
