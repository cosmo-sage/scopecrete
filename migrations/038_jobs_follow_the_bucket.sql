-- 038 — jobs follow the bucket; vendors on jobs; the next-steps checklist.
--
-- Coy, 2026-09-28:
--   * "If a contact is categorized as a customer because there is context for
--     a job like Amber, then the job should automatically be created." And if
--     that was a mistake, "when that customer is moved to the correct bucket,
--     the job needs to be deleted or archived."
--   * "Jobs should be connected to vendors."
--   * A checklist of next steps, "seeded by Dusty, but I need the ability to
--     add to do items that Dusty can read and remind me about."
--   * jobs.job_type may be empty: an automatic job takes Dusty's guess at the
--     type, and with no guess it shows "Type?" rather than silently becoming
--     residential (his call, pending since 034, approved with this plan).
--
-- Additive: columns, two tables, one widened CHECK (origin), one dropped NOT
-- NULL/default, one trigger. Nothing is deleted: archiving is reversible.

-- ---------------------------------------------------------------- jobs

alter table public.jobs
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text,
  -- Something changed underneath a job Coy has worked (its customer was
  -- re-filed). Shown on the board with Archive / Keep; never acted on alone.
  add column if not exists flag_reason text;

alter table public.jobs alter column job_type drop not null;
alter table public.jobs alter column job_type drop default;

alter table public.jobs drop constraint if exists jobs_origin_chk;
alter table public.jobs add constraint jobs_origin_chk
  check (origin = any (array['machine', 'manual', 'classification']));

create index if not exists jobs_org_contact_active on public.jobs (org_id, contact_id) where archived_at is null;

-- ---------------------------------------------------------------- job_vendors

-- Subs, suppliers, equipment: who worked on or supplied a job. `role` is the
-- vendor subtype slug at the time (org_contact_subtypes), free text so a
-- renamed subtype does not orphan history.
create table if not exists public.job_vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (job_id, contact_id)
);
create index if not exists job_vendors_contact on public.job_vendors (org_id, contact_id);
alter table public.job_vendors enable row level security;
create policy job_vendors_member_select on public.job_vendors for select to authenticated using (org_id = any (get_user_org_ids()));
create policy job_vendors_member_insert on public.job_vendors for insert to authenticated with check (org_id = any (get_user_org_ids()));
create policy job_vendors_member_update on public.job_vendors for update to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
create policy job_vendors_member_delete on public.job_vendors for delete to authenticated using (org_id = any (get_user_org_ids()));
revoke all on public.job_vendors from anon;

-- ---------------------------------------------------------------- contact_tasks

-- The next-steps checklist on a customer or vendor page. Dusty seeds items
-- (source 'dusty', with the line that prompted it); Coy adds his own ('coy').
-- A task changes what Coy is ASKED, never what is decided (§2b). A dismissed
-- Dusty item is never re-added (the worker checks title_key).
create table if not exists public.contact_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 200),
  -- lower-case letters and digits only: how "the same item" is recognised
  title_key text generated always as (regexp_replace(lower(title), '[^a-z0-9]+', '', 'g')) stored,
  due_on date,
  source text not null default 'coy' check (source in ('coy', 'dusty')),
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  evidence_quote text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists contact_tasks_open on public.contact_tasks (org_id, contact_id) where status = 'open';
create index if not exists contact_tasks_due on public.contact_tasks (org_id, due_on) where status = 'open';
alter table public.contact_tasks enable row level security;
create policy contact_tasks_member_select on public.contact_tasks for select to authenticated using (org_id = any (get_user_org_ids()));
create policy contact_tasks_member_insert on public.contact_tasks for insert to authenticated with check (org_id = any (get_user_org_ids()));
create policy contact_tasks_member_update on public.contact_tasks for update to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
create policy contact_tasks_member_delete on public.contact_tasks for delete to authenticated using (org_id = any (get_user_org_ids()));
revoke all on public.contact_tasks from anon;

-- ---------------------------------------------------------------- the trigger

-- Is this contact SHOWN as a customer — Coy put them there, or Dusty did?
create or replace function public.sc_is_shown_customer(c public.contacts)
returns boolean language sql immutable as $$
  select c.contact_type = 'customer'
     and (c.classification_confirmed_at is not null or c.auto_classified_at is not null)
     and c.merged_into_contact_id is null
$$;

-- Filed as a customer: bring back a job archived by mistake, or make one if
-- Dusty's latest read names work and there is no live job. Returns the job id
-- touched, or null. Shared by the trigger and the backfill below.
create or replace function public.sc_customer_job_for(c public.contacts)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  coy boolean := c.classification_confirmed_at is not null;
  p record;
  v_title text;
  v_source text;
  v_id uuid;
  n int;
begin
  -- Anything flagged when they left Customer is no longer in question.
  update jobs set flag_reason = null
  where org_id = c.org_id and contact_id = c.id and flag_reason like 'Customer is now filed as %';

  -- Back into Customer after a mistake: bring back what was archived.
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

  -- Already has live work: nothing to create.
  if exists (select 1 from jobs where org_id = c.org_id and contact_id = c.id
             and archived_at is null and status not in ('lost', 'closed', 'complete')) then
    return null;
  end if;

  -- Job context: Dusty's latest read of them names the work, where, or how big.
  select pr.project_type, pr.scope_summary, pr.site_hint, pr.sqft_stated, pr.length_ft, pr.evidence_message_id
    into p
  from contact_proposals pr
  where pr.org_id = c.org_id and pr.contact_id = c.id
  order by pr.created_at desc limit 1;
  if not found or (p.project_type is null and p.scope_summary is null and p.site_hint is null
                   and p.sqft_stated is null and p.length_ft is null) then
    return null;
  end if;

  v_title := coalesce(
    nullif(concat_ws(' — ', initcap(p.project_type), p.site_hint), ''),
    left(p.scope_summary, 80),
    'New lead');
  -- How it reached us: the line of their first message, when that line has a default.
  select l.default_lead_source into v_source
  from messages m join org_phone_numbers l on l.id = m.phone_number_id
  where m.org_id = c.org_id and m.contact_id = c.id
  order by m.occurred_at asc limit 1;

  -- Coy filed them: the job counts. Dusty filed them: Accept on the board.
  insert into jobs (org_id, contact_id, customer_id, title, job_type, status, origin,
                    created_from_message_id, lead_source, stage_changed_at, confirmed_at, confirmed_by)
  values (c.org_id, c.id, c.customer_id, v_title, c.job_type_hint, 'lead', 'classification',
          p.evidence_message_id, v_source, now(),
          case when coy then now() end, case when coy then c.classification_confirmed_by end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.sc_contacts_bucket_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  now_cust boolean := sc_is_shown_customer(new);
  was_cust boolean := sc_is_shown_customer(old);
  gone_to text;
begin
  if now_cust and not was_cust then
    perform sc_customer_job_for(new);
    return new;
  end if;

  -- Dusty filed them, Coy kept it: the job Dusty's filing made now counts.
  if now_cust and was_cust and new.classification_confirmed_at is not null and old.classification_confirmed_at is null then
    update jobs set confirmed_at = now(), confirmed_by = new.classification_confirmed_by
    where org_id = new.org_id and contact_id = new.id and origin = 'classification'
      and archived_at is null and confirmed_at is null;
    return new;
  end if;

  if was_cust and not now_cust then
    gone_to := case when new.merged_into_contact_id is not null then 'merged'
                    when new.classification_confirmed_at is not null or new.auto_classified_at is not null then new.contact_type
                    else 'unsorted' end;
    -- Filed as a customer by mistake. The automatic job goes if nobody has
    -- worked it (still New lead, no sections)…
    update jobs j set archived_at = now(), archived_reason = 'moved to ' || gone_to
    where j.org_id = new.org_id and j.contact_id = new.id and j.origin = 'classification'
      and j.archived_at is null and j.status = 'lead'
      and not exists (select 1 from job_sections s where s.job_id = j.id);
    -- …and anything worked is flagged for Coy, never touched on its own.
    -- (A merge moves jobs to the person it merged into; nothing to flag.)
    if gone_to <> 'merged' then
      update jobs j set flag_reason = 'Customer is now filed as ' || gone_to || ' — archive this job?'
      where j.org_id = new.org_id and j.contact_id = new.id and j.archived_at is null
        and j.status not in ('lost', 'closed', 'complete');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sc_contacts_bucket_jobs() from public, anon, authenticated;
revoke all on function public.sc_customer_job_for(public.contacts) from public, anon, authenticated;

drop trigger if exists contacts_bucket_jobs on public.contacts;
create trigger contacts_bucket_jobs
  after update of contact_type, classification_confirmed_at, auto_classified_at, merged_into_contact_id
  on public.contacts
  for each row execute function public.sc_contacts_bucket_jobs();

-- ---------------------------------------------------------------- backfill

-- Customers filed before this trigger existed (Amber and one other on
-- 2026-09-28) get their job the same way.
select public.sc_customer_job_for(c) from public.contacts c where public.sc_is_shown_customer(c);
