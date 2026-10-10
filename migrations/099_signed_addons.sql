-- 099 — the add-ons a customer ticks are part of what they sign.
-- Since 2026-10-10 the customer can tick an optional add-on on the proposal link and see
-- "Total with your add-ons", but 097's signature recorded the base total and kept no record of
-- which add-ons were ticked. This migration records them.
--
-- documents.signed_addons: the add-ons signed for, each as {id, name, sell}, copied from the
-- link's own customer copy (documents.shown). The sell price is what the customer saw.
-- documents.signed_addons_total: their sum. signed_total is now the base total plus that sum,
-- so the contract is the total they signed for.
--
-- sc_sign_proposal() is 097's sc_accept_proposal() with p_addons (ids from the copy). The ids
-- are checked against that copy: only items marked as add-ons count, and an unknown id is refused.
-- sc_accept_proposal() keeps its arguments and now calls sc_sign_proposal() with no add-ons,
-- so an older page still signs. Nothing is dropped.
-- The guards from 097 now cover the two new columns too.

alter table public.documents
  add column if not exists signed_addons jsonb,
  add column if not exists signed_addons_total numeric;

alter table public.documents
  add constraint documents_signed_addons_shape check (
    signed_addons is null or (jsonb_typeof(signed_addons) = 'array' and jsonb_array_length(signed_addons) <= 50));

create or replace function public.sc_documents_signed_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if old.signed_at is not null then
      raise exception 'A signed proposal can''t be changed, turned off or deleted.' using errcode = '42501';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    if new.signature_image is distinct from old.signature_image or new.signed_at is distinct from old.signed_at
       or new.signed_total is distinct from old.signed_total or new.signed_number is distinct from old.signed_number
       or new.signed_consent is distinct from old.signed_consent or new.signed_ip_hash is distinct from old.signed_ip_hash
       or new.signed_ua is distinct from old.signed_ua
       or new.signed_addons is distinct from old.signed_addons or new.signed_addons_total is distinct from old.signed_addons_total then
      raise exception 'Only the customer signs a proposal, from its link.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.sc_documents_signed_insert() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and (new.signature_image is not null or new.signed_at is not null
     or new.signed_addons is not null or new.signed_addons_total is not null) then
    raise exception 'Only the customer signs a proposal, from its link.' using errcode = '42501';
  end if;
  return new;
end $$;

-- The customer's copy now also returns the add-ons they signed for.
create or replace function public.sc_shared_proposal(p_token text, p_ip_hash text default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d documents; p job_proposals; own boolean; org_name text; sig jsonb;
begin
  if p_token is null or length(p_token) < 24 then return null; end if;
  select * into d from documents where token = p_token and doc_type = 'quote' and proposal_id is not null;
  if not found then return null; end if;
  select name into org_name from orgs where id = d.org_id;
  if d.signed_at is null and (d.revoked_at is not null or d.status = 'void' or (d.expires_at is not null and d.expires_at < now())) then
    return jsonb_build_object('gone', true, 'org_name', org_name);
  end if;
  select * into p from job_proposals where id = d.proposal_id and status = 'final';
  if not found or d.shown is null then return jsonb_build_object('gone', true, 'org_name', org_name); end if;
  own := d.org_id = any(get_user_org_ids());
  if not own then
    insert into document_events (org_id, document_id, event, ip_hash, user_agent)
      values (d.org_id, d.id, 'viewed', left(p_ip_hash, 80), left(p_ua, 300));
    update documents set view_count = view_count + 1, last_viewed_at = now(),
      first_viewed_at = coalesce(first_viewed_at, now()),
      status = case when status in ('draft', 'sent') then 'viewed' else status end
      where id = d.id;
  end if;
  if d.signed_at is not null then
    sig := jsonb_build_object('name', d.decided_name, 'at', d.signed_at, 'image', d.signature_image,
      'total', d.signed_total, 'number', d.signed_number,
      'addons', coalesce(d.signed_addons, '[]'::jsonb), 'addons_total', coalesce(d.signed_addons_total, 0));
  end if;
  return jsonb_build_object('gone', false, 'own', own, 'org_name', org_name, 'version', p.version,
    'shown', d.shown, 'assets', d.assets, 'sent_at', d.sent_at, 'signature', sig);
end $$;
revoke all on function public.sc_shared_proposal(text, text, text) from public;
grant execute on function public.sc_shared_proposal(text, text, text) to anon, authenticated;

-- Approve and sign, with the add-ons ticked.
create or replace function public.sc_sign_proposal(p_token text, p_name text, p_signature text, p_consent text,
  p_addons text[] default null, p_ip_hash text default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d documents; p job_proposals; j jobs; v_name text; v_base numeric; v_total numeric; v_number text;
  v_contact uuid; v_won boolean := false; v_ids text[]; v_items jsonb; v_addons jsonb := '[]'::jsonb;
  v_addons_total numeric := 0; v_id text; v_item jsonb; v_list text;
begin
  if p_token is null or length(p_token) < 24 then raise exception 'This link isn''t right.' using errcode = '22023'; end if;
  select * into d from documents where token = p_token and doc_type = 'quote' and proposal_id is not null for update;
  if not found then raise exception 'This link isn''t right.' using errcode = '22023'; end if;
  if d.signed_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'at', d.signed_at);
  end if;
  if d.revoked_at is not null or d.status = 'void' or (d.expires_at is not null and d.expires_at < now()) then
    raise exception 'This proposal has been replaced — ask for the latest link.' using errcode = '22023';
  end if;
  if d.org_id = any(get_user_org_ids()) then
    raise exception 'You''re signed in to the contractor''s account — the customer signs from their own phone or computer.' using errcode = '42501';
  end if;
  select * into p from job_proposals where id = d.proposal_id and status = 'final';
  if not found or d.shown is null then raise exception 'This proposal can''t be signed.' using errcode = '22023'; end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Type your full name.' using errcode = '22023'; end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) < 200 or length(p_signature) > 300000 then
    raise exception 'Draw your signature in the box.' using errcode = '22023';
  end if;
  if p_consent is null or length(btrim(p_consent)) < 10 then
    raise exception 'Tick the box to agree to sign electronically.' using errcode = '22023';
  end if;

  -- The add-ons ticked, each checked against the link's own copy.
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_addons, '{}')) x where x is not null and x <> '';
  if cardinality(v_ids) > 50 then raise exception 'Too many add-ons picked.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(i), '[]'::jsonb) into v_items
    from jsonb_array_elements(coalesce(d.shown -> 'price' -> 'groups', '[]'::jsonb)) g,
         jsonb_array_elements(coalesce(g -> 'items', '[]'::jsonb)) i
    where (i ->> 'addon')::boolean is true;
  foreach v_id in array v_ids loop
    select i into v_item from jsonb_array_elements(v_items) i where i ->> 'id' = v_id limit 1;
    if v_item is null then raise exception 'One of the add-ons picked isn''t on this proposal — reload the page.' using errcode = '22023'; end if;
    v_addons := v_addons || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_item ->> 'name',
      'sell', coalesce(nullif(v_item ->> 'sell', '')::numeric, 0)));
    v_addons_total := v_addons_total + coalesce(nullif(v_item ->> 'sell', '')::numeric, 0);
    v_item := null;
  end loop;
  v_addons_total := round(v_addons_total, 2);

  v_number := coalesce(d.shown ->> 'number', p.snapshot ->> 'number');
  begin v_base := nullif(d.shown -> 'price' ->> 'total', '')::numeric; exception when others then v_base := null; end;
  v_total := case when v_base is null then null else round(v_base + v_addons_total, 2) end;

  update documents set status = 'accepted', decided_at = now(), decided_name = v_name,
    signature_image = p_signature, signed_at = now(), signed_ip_hash = left(p_ip_hash, 80), signed_ua = left(p_ua, 300),
    signed_consent = left(btrim(p_consent), 500), signed_total = v_total, signed_number = v_number,
    signed_addons = case when cardinality(v_ids) > 0 then v_addons else null end,
    signed_addons_total = case when cardinality(v_ids) > 0 then v_addons_total else null end
    where id = d.id;
  insert into document_events (org_id, document_id, event, ip_hash, user_agent)
    values (d.org_id, d.id, 'accepted', left(p_ip_hash, 80), left(p_ua, 300));

  if d.job_id is not null then
    select * into j from jobs where id = d.job_id and org_id = d.org_id for update;
    if found then
      if j.status in ('invited', 'lead', 'consultation', 'scoping', 'quoted', 'lost') then
        update jobs set status = 'won', won_at = coalesce(won_at, now()), stage_changed_at = now() where id = j.id;
        v_won := true;
      elsif j.won_at is null then
        update jobs set won_at = now() where id = j.id;
      end if;
      v_contact := j.contact_id;
      if v_contact is null and j.customer_id is not null then
        select primary_contact_id into v_contact from customers where id = j.customer_id;
      end if;
      if v_contact is not null then
        select string_agg((a ->> 'name') || ' (' || to_char((a ->> 'sell')::numeric, 'FM$999,999,990.00') || ')', ', ')
          into v_list from jsonb_array_elements(v_addons) a;
        insert into contact_notes (org_id, contact_id, job_id, body) values (d.org_id, v_contact, j.id, left(
          'Proposal ' || coalesce(v_number, 'v' || p.version) || ' signed by ' || v_name
          || coalesce(' — ' || to_char(v_total, 'FM$999,999,990.00'), '')
          || coalesce(' with add-ons: ' || v_list, '')
          || ' on ' || to_char(now() at time zone 'America/Chicago', 'Mon DD, YYYY HH12:MI AM') || ' (Central), from the link.'
          || case when v_won then ' The job is won.' else '' end, 3000));
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'at', now(), 'won', v_won, 'total', v_total, 'addons_total', v_addons_total);
end $$;
revoke all on function public.sc_sign_proposal(text, text, text, text, text[], text, text) from public;
grant execute on function public.sc_sign_proposal(text, text, text, text, text[], text, text) to anon, authenticated;

-- 097's door keeps working: signing with no add-ons.
create or replace function public.sc_accept_proposal(p_token text, p_name text, p_signature text, p_consent text,
  p_ip_hash text default null, p_ua text default null)
returns jsonb language sql security definer set search_path = public as $$
  select public.sc_sign_proposal(p_token, p_name, p_signature, p_consent, null, p_ip_hash, p_ua);
$$;
revoke all on function public.sc_accept_proposal(text, text, text, text, text, text) from public;
grant execute on function public.sc_accept_proposal(text, text, text, text, text, text) to anon, authenticated;
