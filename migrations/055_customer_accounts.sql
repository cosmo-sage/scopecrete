-- 055 — A customer is not a contact (Claude Design handoff, 2026-09-30;
-- Coy on Vercel: "Amber is the contact for this commercial customer. The
-- customer is a business: Art Apartments. Every customer should have a
-- separate contact list").
--
-- The pieces already exist: `customers` (one row per contact, made by
-- sc_classify_contact, carrying `relation` for the quo-intake lead guard),
-- `contacts.customer_id`, `contacts.role`, `jobs.customer_id`. What was
-- missing: the customer's own facts and address, several contacts under one
-- customer, and a way to move a contact that can be undone.
--
--   * customers: customer_type (residential | commercial | public), subtype,
--     lead_source, status, since, primary_contact_id, and the address (line,
--     city, state, zip, formatted, lat/lng + when geocoded, where it came
--     from). The address belongs to the CUSTOMER; a job may have its own site.
--   * contact_phones.can_text; contact_notes.message_id (a note on one call).
--   * customer_contact_moves + sc_attach_contact / sc_detach_contact /
--     sc_undo_contact_move: SECURITY DEFINER with an explicit membership
--     check (like the merge functions, §2c), execute for authenticated only.
--     A contact's own jobs move with it; every moved id is recorded so undo
--     puts back exactly those still where the move left them.
--   * sc_classify_contact: a contact that SHARES its customer with others and
--     is filed as vendor / personal / spam is first given a customer of its
--     own — one person's filing must never flip a whole company's `relation`
--     (which the lead guard reads).
--   * Backfill: primary contact, address copied from the contact (source
--     'contact'), since = first won job, jobs.customer_id from their contact.
--
-- Additive: new columns, one table, functions. Nothing dropped or widened.

alter table public.customers
  add column if not exists customer_type text check (customer_type in ('residential', 'commercial', 'public')),
  add column if not exists subtype text,
  add column if not exists lead_source text,
  add column if not exists status text,
  add column if not exists since timestamptz,
  add column if not exists primary_contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists address_line1 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text,
  add column if not exists address_formatted text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists address_source text check (address_source in ('contact', 'coy', 'geocode'));

alter table public.contact_phones add column if not exists can_text boolean;
alter table public.contact_notes add column if not exists message_id uuid references public.messages(id) on delete set null;
create index if not exists contact_notes_message_idx on public.contact_notes (message_id) where message_id is not null;
create index if not exists contacts_customer_idx on public.contacts (customer_id) where customer_id is not null;

create table if not exists public.customer_contact_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  from_customer_id uuid references public.customers(id) on delete set null,
  to_customer_id uuid references public.customers(id) on delete set null,
  job_ids uuid[] not null default '{}',
  moved_by uuid default auth.uid(),
  moved_at timestamptz not null default now(),
  undone_at timestamptz
);
alter table public.customer_contact_moves enable row level security;
drop policy if exists customer_contact_moves_read on public.customer_contact_moves;
create policy customer_contact_moves_read on public.customer_contact_moves
  for select to authenticated using (org_id = any (get_user_org_ids()));
revoke all on public.customer_contact_moves from anon;
grant select on public.customer_contact_moves to authenticated;

-- ------------------------------------------------------------------ backfill

update public.customers cu set primary_contact_id = (
  select c.id from public.contacts c
   where c.customer_id = cu.id and c.merged_into_contact_id is null
   order by c.is_primary desc nulls last, c.created_at limit 1)
 where cu.primary_contact_id is null;

update public.customers cu set
  address_line1 = c.address, city = c.city, state = c.state, zip = c.zip,
  address_formatted = concat_ws(', ', nullif(btrim(c.address), ''), nullif(btrim(c.city), ''),
                                nullif(btrim(concat_ws(' ', nullif(btrim(c.state), ''), nullif(btrim(c.zip), ''))), '')),
  address_source = 'contact'
  from public.contacts c
 where c.id = cu.primary_contact_id and cu.address_line1 is null
   and nullif(btrim(coalesce(c.address, '')), '') is not null;

update public.jobs j set customer_id = c.customer_id
  from public.contacts c
 where j.customer_id is null and j.contact_id = c.id and c.customer_id is not null;

update public.customers cu set since = x.first_won
  from (select customer_id, min(won_at) as first_won from public.jobs
         where customer_id is not null and won_at is not null group by customer_id) x
 where x.customer_id = cu.id and cu.since is null;

-- ------------------------------------------------------------------ moves

create or replace function public.sc_attach_contact(p_contact uuid, p_customer uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c record;
  cu record;
  v_jobs uuid[];
  v_move uuid;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select id, org_id, customer_id into c from contacts
   where id = p_contact and merged_into_contact_id is null;
  if not found or not (c.org_id = any (get_user_org_ids())) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  select id, org_id, primary_contact_id into cu from customers
   where id = p_customer and merged_into_customer_id is null;
  if not found or cu.org_id <> c.org_id then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;
  if c.customer_id = cu.id then return null; end if;

  select coalesce(array_agg(id), '{}') into v_jobs from jobs
   where contact_id = c.id and org_id = c.org_id
     and (customer_id is null or customer_id = c.customer_id);
  update jobs set customer_id = cu.id where id = any (v_jobs);
  -- contacts_one_primary: at most one is_primary per customer. The mover
  -- arrives as primary only when the customer has none.
  update contacts set customer_id = cu.id,
    is_primary = not exists (select 1 from contacts o where o.customer_id = cu.id and o.is_primary and o.id <> c.id)
   where id = c.id;
  if cu.primary_contact_id is null then
    update customers set primary_contact_id = c.id where id = cu.id;
  end if;
  -- The customer it left keeps its row; hand its primary role on if needed.
  if c.customer_id is not null then
    update customers set primary_contact_id = (
      select x.id from contacts x where x.customer_id = c.customer_id and x.merged_into_contact_id is null
       order by x.created_at limit 1)
     where id = c.customer_id and primary_contact_id = c.id;
  end if;
  insert into customer_contact_moves (org_id, contact_id, from_customer_id, to_customer_id, job_ids, moved_by)
  values (c.org_id, c.id, c.customer_id, cu.id, v_jobs, v_uid) returning id into v_move;
  return v_move;
end $$;

create or replace function public.sc_detach_contact(p_contact uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c record;
  v_new uuid;
  v_rel text;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select id, org_id, customer_id, name, phone, contact_type into c from contacts
   where id = p_contact and merged_into_contact_id is null;
  if not found or not (c.org_id = any (get_user_org_ids())) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  select relation into v_rel from customers where id = c.customer_id;
  insert into customers (org_id, name, kind, relation, relation_source)
  values (c.org_id, coalesce(nullif(btrim(c.name), ''), c.phone), 'person', coalesce(v_rel, 'customer'), 'default')
  returning id into v_new;
  return public.sc_attach_contact(c.id, v_new);
end $$;

create or replace function public.sc_undo_contact_move(p_move uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m record;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into m from customer_contact_moves where id = p_move;
  if not found or not (m.org_id = any (get_user_org_ids())) then
    raise exception 'move not found' using errcode = 'P0002';
  end if;
  if m.undone_at is not null then raise exception 'this move has already been undone' using errcode = '22023'; end if;
  -- Only what is still where the move left it goes back.
  update contacts set customer_id = m.from_customer_id,
    is_primary = not exists (select 1 from contacts o where o.customer_id = m.from_customer_id and o.is_primary and o.id <> m.contact_id)
   where id = m.contact_id and customer_id = m.to_customer_id;
  update jobs set customer_id = m.from_customer_id where id = any (m.job_ids) and customer_id = m.to_customer_id;
  update customers set primary_contact_id = (
    select x.id from contacts x where x.customer_id = m.to_customer_id and x.merged_into_contact_id is null
     order by x.created_at limit 1)
   where id = m.to_customer_id and primary_contact_id = m.contact_id;
  update customers set primary_contact_id = m.contact_id
   where id = m.from_customer_id and primary_contact_id is null;
  update customer_contact_moves set undone_at = now() where id = m.id;
end $$;

revoke all on function public.sc_attach_contact(uuid, uuid) from public, anon;
revoke all on function public.sc_detach_contact(uuid) from public, anon;
revoke all on function public.sc_undo_contact_move(uuid) from public, anon;
grant execute on function public.sc_attach_contact(uuid, uuid) to authenticated;
grant execute on function public.sc_detach_contact(uuid) to authenticated;
grant execute on function public.sc_undo_contact_move(uuid) to authenticated;

-- ------------------------------------------------ classify: the shared guard

create or replace function public.sc_classify_contact(p_contact uuid, p_bucket text, p_subtype text DEFAULT NULL::text)
 RETURNS TABLE(bucket text, subtype text, relation text, customer_created boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

  -- 055: a contact that shares its customer with other people and is filed
  -- anything but customer gets a customer of its own first, so one person's
  -- filing never changes the company's relation (the lead guard reads it).
  if c.customer_id is not null and coalesce(p_bucket, '') <> 'customer' and exists (
    select 1 from public.contacts o where o.customer_id = c.customer_id and o.id <> c.id and o.merged_into_contact_id is null) then
    perform public.sc_detach_contact(c.id);
    select customer_id into c.customer_id from public.contacts where id = c.id;
  end if;

  if p_bucket is null then
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

  v_rel := case
    when p_bucket = 'customer' then 'customer'
    when p_bucket = 'vendor' and p_subtype in ('subcontractor', 'looking_for_work') then 'sub'
    when p_bucket = 'vendor' then 'vendor'
  end;
  v_cust := c.customer_id;
  if v_rel is not null then
    if v_cust is null then
      insert into public.customers (org_id, name, kind, relation, relation_source, relation_confirmed_at, relation_confirmed_by, primary_contact_id)
      values (c.org_id, coalesce(nullif(btrim(c.name), ''), c.phone), 'person', v_rel, 'manual', now(), v_uid, c.id)
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
end $function$;
