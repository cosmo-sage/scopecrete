-- 032 — one classification: four buckets on the contact.
--
-- Coy, 2026-09-27: Threads sorts PEOPLE into four buckets — customer, vendor,
-- personal, spam (synopsis §5.3: buckets are code, subtypes are data). Job
-- stages move to the Jobs board. People looking for work go under vendor.
--
-- Until now there were two systems: contacts.contact_type (+ subtype) and
-- customers.relation (the quo-intake lead guard reads that one). Measured
-- today: nothing is confirmed in either. From here contacts.contact_type is
-- the truth, and sc_classify_contact() is the one writer: it sets the bucket
-- AND keeps customers.relation in step so the lead guard keeps working
-- unchanged (vendor bucket -> 'vendor', or 'sub' for subcontractor / looking
-- for work; customer -> 'customer').
--
-- What shows as a bucket (the app enforces this, DECISIONS §2b):
--   classification_confirmed_at set  -> Coy put them there
--   auto_classified_at set           -> Dusty filed them (spam only), with Undo
--   neither                          -> Unsorted. The 190 legacy 'customer'
--                                       defaults are NOT shown as customers.
--
-- Additive: two columns, one subtype row per org, one function, one widened
-- CHECK on contact_enrich_runs (this migration series' own table).

alter table public.contacts
  add column if not exists auto_classified_at timestamptz,
  add column if not exists auto_classified_reason text,
  -- Coy said "not that" to an automatic bucket: never auto-file this contact again.
  add column if not exists auto_classify_blocked_at timestamptz;

insert into public.org_contact_subtypes (org_id, bucket, slug, label, sort_order, active)
select o.id, 'vendor', 'looking_for_work', 'Looking for work', 7, true
from public.orgs o
where not exists (
  select 1 from public.org_contact_subtypes s
  where s.org_id = o.id and s.bucket = 'vendor' and s.slug = 'looking_for_work'
);

alter table public.contact_enrich_runs drop constraint if exists contact_enrich_runs_outcome_check;
alter table public.contact_enrich_runs add constraint contact_enrich_runs_outcome_check
  check (outcome in ('running', 'proposed', 'named', 'filed', 'unchanged', 'no_words',
                     'model_error', 'failed', 'abandoned', 'skipped'));

-- ---------------------------------------------------------------------------
-- Coy puts a contact in a bucket (or back to Unsorted with p_bucket null).
-- Invoker: RLS on contacts and customers decides what the caller may touch.
-- ---------------------------------------------------------------------------
create or replace function public.sc_classify_contact(p_contact uuid, p_bucket text, p_subtype text default null)
returns table (bucket text, subtype text, relation text, customer_created boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  c record;
  v_uid uuid := auth.uid();
  v_rel text;
  v_cust uuid;
  v_created boolean := false;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_bucket is not null and p_bucket not in ('customer', 'vendor', 'personal', 'spam') then
    raise exception 'bucket must be customer, vendor, personal or spam' using errcode = '22023';
  end if;

  select id, org_id, customer_id, name, phone into c
  from public.contacts where id = p_contact and merged_into_contact_id is null;
  if not found then raise exception 'contact not found' using errcode = 'P0002'; end if;

  if p_subtype is not null and (p_bucket is null or not exists (
    select 1 from public.org_contact_subtypes s
    where s.org_id = c.org_id and s.bucket = p_bucket and s.slug = p_subtype and s.active)) then
    raise exception 'subtype % is not a % type', p_subtype, coalesce(p_bucket, 'bucket') using errcode = '22023';
  end if;

  if p_bucket is null then
    -- Back to Unsorted. Also the Undo of an automatic filing: blocked from
    -- being filed automatically again.
    update public.contacts set
      contact_type = 'customer', contact_subtype = null,
      classification_source = 'default', classification_confirmed_at = null, classification_confirmed_by = null,
      auto_classify_blocked_at = case when auto_classified_at is not null then now() else auto_classify_blocked_at end,
      auto_classified_at = null, auto_classified_reason = null
    where id = c.id;
    if c.customer_id is not null then
      update public.customers set relation = 'customer', relation_source = 'default',
        relation_confirmed_at = null, relation_confirmed_by = null
      where id = c.customer_id;
    end if;
    return query select null::text, null::text, null::text, false;
    return;
  end if;

  update public.contacts set
    contact_type = p_bucket, contact_subtype = p_subtype,
    classification_source = 'human', classification_confirmed_at = now(), classification_confirmed_by = v_uid,
    auto_classified_at = null, auto_classified_reason = null
  where id = c.id;

  -- Keep the lead guard's input in step. Personal and spam leave the relation
  -- unconfirmed: the guard only ever suppresses a confirmed vendor or sub.
  v_rel := case
    when p_bucket = 'customer' then 'customer'
    when p_bucket = 'vendor' and p_subtype in ('subcontractor', 'looking_for_work') then 'sub'
    when p_bucket = 'vendor' then 'vendor'
  end;
  v_cust := c.customer_id;
  if v_rel is not null then
    if v_cust is null then
      insert into public.customers (org_id, name, kind, relation, relation_source, relation_confirmed_at, relation_confirmed_by)
      values (c.org_id, coalesce(nullif(btrim(c.name), ''), c.phone), 'person', v_rel, 'manual', now(), v_uid)
      returning id into v_cust;
      update public.contacts set customer_id = v_cust where id = c.id;
      v_created := true;
    else
      update public.customers set relation = v_rel, relation_source = 'manual',
        relation_confirmed_at = now(), relation_confirmed_by = v_uid
      where id = v_cust;
    end if;
  elsif v_cust is not null then
    update public.customers set relation = 'customer', relation_source = 'default',
      relation_confirmed_at = null, relation_confirmed_by = null
    where id = v_cust;
  end if;

  return query select p_bucket, p_subtype, v_rel, v_created;
end $$;

revoke all on function public.sc_classify_contact(uuid, text, text) from public, anon;
grant execute on function public.sc_classify_contact(uuid, text, text) to authenticated;
