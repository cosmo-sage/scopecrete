-- 116 — Vendor accounts keep their people (2026-10-21).
--
-- Coy, answering the database-vs-UI audit: "Yes a vendor account will have contacts inside
-- it just like a customer account."
--
-- A vendor already HAS an account: filing someone vendor (sc_classify_contact, 032) makes
-- them a customers row with relation 'vendor' or 'sub' (measured 2026-10-21: 32 such rows,
-- one person each). The vendor page now lists that row's people and puts more on it with the
-- customer page's own sc_attach_contact. What stops a second person staying there is one rule
-- in sc_classify_contact: a contact that shares its customer with someone else is first given
-- a customer of its own whenever it is filed anything but customer (§2f — "one person's filing
-- never flips a company"). For a vendor's second person that split them off their vendor.
--
-- The only change: that split is skipped when the person is filed vendor and the account
-- they share is already a CONFIRMED vendor or sub (relation in ('vendor','sub') and
-- relation_confirmed_at set). Filing them personal or spam, or vendor on an account that is a
-- customer, splits them off exactly as before, so the lead guard (§2b) is unchanged.
--
-- The body below is the live function (md5 025366dbdb9a8818e4872be203455add, read
-- 2026-10-21) with that one condition added. No table, column or grant changes.

CREATE OR REPLACE FUNCTION public.sc_classify_contact(p_contact uuid, p_bucket text, p_subtype text DEFAULT NULL::text)
 RETURNS TABLE(bucket text, subtype text, relation text, customer_created boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare c record; v_uid uuid := auth.uid(); v_rel text; v_cust uuid; v_created boolean := false;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_bucket is not null and p_bucket not in ('customer', 'vendor', 'personal', 'spam') then raise exception 'bucket must be customer, vendor, personal or spam' using errcode = '22023'; end if;
  select id, org_id, customer_id, name, phone into c from public.contacts where id = p_contact and merged_into_contact_id is null;
  if not found then raise exception 'contact not found' using errcode = 'P0002'; end if;
  if p_subtype is not null and (p_bucket is null or not exists (select 1 from public.org_contact_subtypes s where s.org_id = c.org_id and s.bucket = p_bucket and s.slug = p_subtype and s.active)) then
    raise exception 'subtype % is not a % type', p_subtype, coalesce(p_bucket, 'bucket') using errcode = '22023';
  end if;
  if c.customer_id is not null and coalesce(p_bucket, '') <> 'customer'
     and exists (select 1 from public.contacts o where o.customer_id = c.customer_id and o.id <> c.id and o.merged_into_contact_id is null)
     -- 116: a vendor's person filed vendor stays on the vendor's account.
     and not (p_bucket = 'vendor' and exists (select 1 from public.customers a where a.id = c.customer_id
              and a.relation in ('vendor', 'sub') and a.relation_confirmed_at is not null)) then
    perform public.sc_detach_contact(c.id);
    select customer_id into c.customer_id from public.contacts where id = c.id;
  end if;
  if p_bucket is null then
    update public.contacts set contact_type = 'customer', contact_subtype = null, classification_source = 'default', classification_confirmed_at = null, classification_confirmed_by = null,
      auto_classify_blocked_at = case when auto_classified_at is not null then now() else auto_classify_blocked_at end, auto_classified_at = null, auto_classified_reason = null where id = c.id;
    if c.customer_id is not null then update public.customers set relation = 'customer', relation_source = 'default', relation_confirmed_at = null, relation_confirmed_by = null where id = c.customer_id; end if;
    return query select null::text, null::text, null::text, false; return;
  end if;
  update public.contacts set contact_type = p_bucket, contact_subtype = p_subtype, classification_source = 'human', classification_confirmed_at = now(), classification_confirmed_by = v_uid, auto_classified_at = null, auto_classified_reason = null where id = c.id;
  v_rel := case when p_bucket = 'customer' then 'customer' when p_bucket = 'vendor' and p_subtype in ('subcontractor', 'looking_for_work') then 'sub' when p_bucket = 'vendor' then 'vendor' end;
  v_cust := c.customer_id;
  if v_rel is not null then
    if v_cust is null then
      insert into public.customers (org_id, name, kind, relation, relation_source, relation_confirmed_at, relation_confirmed_by, primary_contact_id) values (c.org_id, coalesce(nullif(btrim(c.name), ''), c.phone), 'person', v_rel, 'manual', now(), v_uid, c.id) returning id into v_cust;
      update public.contacts set customer_id = v_cust where id = c.id; v_created := true;
    else
      update public.customers set relation = v_rel, relation_source = 'manual', relation_confirmed_at = now(), relation_confirmed_by = v_uid where id = v_cust;
    end if;
  elsif v_cust is not null then
    update public.customers set relation = 'customer', relation_source = 'default', relation_confirmed_at = null, relation_confirmed_by = null where id = v_cust;
  end if;
  return query select p_bucket, p_subtype, v_rel, v_created;
end $function$;
