-- 040 — Dusty names the job in 1–3 words (Coy, 2026-09-28: "a 1-3 word
-- summary should be the job title"). enrich-contacts v11 writes it with each
-- suggestion; an automatic job takes it, falling back to the kind of work.
-- Additive: one nullable column, one function body.

alter table public.contact_proposals add column if not exists job_title text
  check (job_title is null or length(job_title) <= 40);

create or replace function public.sc_customer_job_for(c public.contacts)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  coy boolean := c.classification_confirmed_at is not null;
  p record;
  v_source text;
  v_id uuid;
  n int;
begin
  update jobs set flag_reason = null
  where org_id = c.org_id and contact_id = c.id and flag_reason like 'Customer is now filed as %';

  update jobs set archived_at = null, archived_reason = null,
                  confirmed_at = case when coy then coalesce(confirmed_at, now()) else confirmed_at end,
                  confirmed_by = case when coy then coalesce(confirmed_by, c.classification_confirmed_by) else confirmed_by end
  where org_id = c.org_id and contact_id = c.id and origin = 'classification'
    and archived_at is not null and archived_reason like 'moved to %';
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

  -- Title: the work, one word or two. Site: the address. What they asked
  -- for: the description under the customer.
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
$$;

revoke all on function public.sc_customer_job_for(public.contacts) from public, anon, authenticated;
