-- 097 — the customer approves and signs the proposal on its link, and the job is won
-- (Coy, 2026-10-09: "one of the ways that a job is won is a customer approves a
-- proposal, and we need a kind of approval button and the ability to do digital
-- signatures on proposals").
--
-- A proposal link (075) is one `documents` row on a FINAL `job_proposals`
-- version. Signing it is written on that row: the name they typed, the
-- signature they drew (a PNG data URL, as drawn), that they agreed to sign
-- electronically, when, a hashed IP and the browser — and what they signed:
-- the proposal's number, version and total as their copy showed it. The
-- document status becomes 'accepted' (075's own word) and a 'accepted' event is
-- logged. Finals never change (sc_job_proposal_guard), so the version signed is
-- the contract.
--
-- The customer isn't signed in. `sc_accept_proposal()` is their second door,
-- beside sc_shared_proposal(): SECURITY DEFINER, it takes only a live link,
-- refuses a reader who is a member of the org (Coy can't sign for his
-- customer), a blank name or no signature, and a link already signed. Then:
--   · the job is won — any status before won (or lost) becomes 'won',
--     won_at stamped if empty, its stage time reset;
--   · an internal note on the job's person (or their customer's primary)
--     says who signed what and for how much, so Coy, Threads and Dusty see it.
-- Nothing is sent to anyone (§10).
--
-- A signed link stays: members can't change, void, turn off or delete a signed row,
-- and nobody but these functions writes the signature columns
-- (sc_documents_signed_guard). A newer version's link leaves it alone (the
-- app's void skips 'accepted').
--
-- sc_shared_proposal() is replaced to return the signature with the copy, so
-- the customer sees what they signed; and a signed link is never 'gone'.

alter table public.documents
  add column if not exists signature_image text,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_ip_hash text,
  add column if not exists signed_ua text,
  add column if not exists signed_consent text,
  add column if not exists signed_total numeric,
  add column if not exists signed_number text;

alter table public.documents
  add constraint documents_signature_shape check (
    signature_image is null
    or (signature_image like 'data:image/png;base64,%' and length(signature_image) <= 300000));

-- Signature columns are the functions' alone; a signed row is fixed.
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
       or new.signed_ua is distinct from old.signed_ua then
      raise exception 'Only the customer signs a proposal, from its link.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger documents_signed_guard before update or delete on public.documents
  for each row execute function public.sc_documents_signed_guard();

create or replace function public.sc_documents_signed_insert() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and (new.signature_image is not null or new.signed_at is not null) then
    raise exception 'Only the customer signs a proposal, from its link.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger documents_signed_insert before insert on public.documents
  for each row execute function public.sc_documents_signed_insert();

-- The customer's door, now with the signature.
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
      'total', d.signed_total, 'number', d.signed_number);
  end if;
  return jsonb_build_object('gone', false, 'own', own, 'org_name', org_name, 'version', p.version,
    'shown', d.shown, 'assets', d.assets, 'sent_at', d.sent_at, 'signature', sig);
end $$;
revoke all on function public.sc_shared_proposal(text, text, text) from public;
grant execute on function public.sc_shared_proposal(text, text, text) to anon, authenticated;

-- Approve and sign.
create or replace function public.sc_accept_proposal(p_token text, p_name text, p_signature text, p_consent text,
  p_ip_hash text default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d documents; p job_proposals; j jobs; v_name text; v_total numeric; v_number text; v_contact uuid; v_won boolean := false;
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
  v_number := coalesce(d.shown ->> 'number', p.snapshot ->> 'number');
  begin v_total := nullif(d.shown -> 'price' ->> 'total', '')::numeric; exception when others then v_total := null; end;

  update documents set status = 'accepted', decided_at = now(), decided_name = v_name,
    signature_image = p_signature, signed_at = now(), signed_ip_hash = left(p_ip_hash, 80), signed_ua = left(p_ua, 300),
    signed_consent = left(btrim(p_consent), 500), signed_total = v_total, signed_number = v_number
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
        insert into contact_notes (org_id, contact_id, job_id, body) values (d.org_id, v_contact, j.id, left(
          'Proposal ' || coalesce(v_number, 'v' || p.version) || ' signed by ' || v_name
          || coalesce(' — ' || to_char(v_total, 'FM$999,999,990.00'), '')
          || ' on ' || to_char(now() at time zone 'America/Chicago', 'Mon DD, YYYY HH12:MI AM') || ' (Central), from the link.'
          || case when v_won then ' The job is won.' else '' end, 3000));
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'at', now(), 'won', v_won);
end $$;
revoke all on function public.sc_accept_proposal(text, text, text, text, text, text) from public;
grant execute on function public.sc_accept_proposal(text, text, text, text, text, text) to anon, authenticated;
