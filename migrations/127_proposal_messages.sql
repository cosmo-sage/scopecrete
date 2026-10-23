-- 127 — The customer writes back from the proposal link (Coy, 2026-10-23: "I would like to develop a
-- feature for the customer (whatever contacts the proposal was sent to) can message me back through
-- the app. This will be part of the 'internal' communications that will be apart of contact threads.")
--
-- A message from the link is an internal note on the customer's person, so it lands in their one
-- thread's Notes, in Dusty's context and on the bell, beside Coy's own notes. Two columns mark it:
--
--   contact_notes.document_id  the proposal link it was written on (null for every other note)
--   contact_notes.from_name    the name they typed
--
-- Only the door writes them: a member's insert or update that sets or changes either is refused
-- (contact_notes_customer_guard), and a customer's note can't be edited by a member — it is their words.
--
--   sc_proposal_message(token, name, body, ip_hash, ua)  SECURITY DEFINER, anon may run it. A live link
--       only (or the signed one); refuses a reader signed in to the org; a name of 2–80 characters and
--       1–2,000 of words; 20 messages a link a day. The person: the one on the job's customer whose name
--       is the name typed, else the job's person, else the customer's primary. Writes the note (job_id
--       the link's job). p_ip_hash / p_ua are taken for a later log and not stored yet.
--   sc_proposal_messages(token)  SECURITY DEFINER, anon may run it: the messages sent from THAT link
--       (name, words, when) for its page to show again. Nothing of Coy's.
--
-- Additive: two nullable columns, an index, a trigger, two functions. Nothing dropped.

alter table public.contact_notes
  add column if not exists document_id uuid references public.documents(id) on delete set null,
  add column if not exists from_name text;
alter table public.contact_notes drop constraint if exists contact_notes_from_name_len;
alter table public.contact_notes add constraint contact_notes_from_name_len
  check (from_name is null or length(from_name) between 1 and 80);
create index if not exists contact_notes_document_idx on public.contact_notes (document_id) where document_id is not null;

create or replace function public.sc_contact_notes_customer_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.document_id is not null or new.from_name is not null then
        raise exception 'Only the customer writes from their proposal link.' using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if old.document_id is not null then
        raise exception 'A customer''s message can''t be edited.' using errcode = '42501';
      end if;
      if new.document_id is not null or new.from_name is not null then
        raise exception 'Only the customer writes from their proposal link.' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists contact_notes_customer_guard on public.contact_notes;
create trigger contact_notes_customer_guard before insert or update on public.contact_notes
  for each row execute function public.sc_contact_notes_customer_guard();

create or replace function public.sc_proposal_message(p_token text, p_name text, p_body text,
  p_ip_hash text default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d documents; j jobs; v_name text; v_body text; v_contact uuid; v_note uuid; v_count int;
begin
  if p_token is null or length(p_token) < 24 then raise exception 'This link isn''t right.' using errcode = '22023'; end if;
  select * into d from documents where token = p_token and doc_type = 'quote' and proposal_id is not null;
  if not found then raise exception 'This link isn''t right.' using errcode = '22023'; end if;
  if d.signed_at is null and (d.revoked_at is not null or d.status = 'void' or (d.expires_at is not null and d.expires_at < now())) then
    raise exception 'This proposal has been replaced — ask for the latest link.' using errcode = '22023';
  end if;
  if d.org_id = any(get_user_org_ids()) then
    raise exception 'You''re signed in to the contractor''s account — the customer writes from their own phone or computer.' using errcode = '42501';
  end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'Type your name.' using errcode = '22023'; end if;
  v_body := btrim(coalesce(p_body, ''));
  if length(v_body) < 1 then raise exception 'Write a message.' using errcode = '22023'; end if;
  if length(v_body) > 2000 then raise exception 'Keep it under 2,000 characters.' using errcode = '22023'; end if;
  select count(*) into v_count from contact_notes where document_id = d.id and created_at > now() - interval '1 day';
  if v_count >= 20 then raise exception 'That''s a lot of messages today — call or text instead.' using errcode = '22023'; end if;

  if d.job_id is not null then select * into j from jobs where id = d.job_id and org_id = d.org_id; end if;
  if j.id is not null and j.customer_id is not null then
    select c.id into v_contact from contacts c
      where c.org_id = d.org_id and c.customer_id = j.customer_id and c.merged_into_contact_id is null
        and lower(btrim(c.name)) = lower(v_name)
      limit 1;
  end if;
  if v_contact is null and j.id is not null then v_contact := j.contact_id; end if;
  if v_contact is null and j.id is not null and j.customer_id is not null then
    select primary_contact_id into v_contact from customers where id = j.customer_id;
  end if;
  if v_contact is null then raise exception 'This proposal can''t take messages — call or text instead.' using errcode = '22023'; end if;

  insert into contact_notes (org_id, contact_id, job_id, body, created_by, document_id, from_name)
    values (d.org_id, v_contact, j.id, v_body, null, d.id, v_name) returning id into v_note;
  return jsonb_build_object('ok', true, 'id', v_note, 'at', now());
end $$;
revoke all on function public.sc_proposal_message(text, text, text, text, text) from public;
grant execute on function public.sc_proposal_message(text, text, text, text, text) to anon, authenticated;

create or replace function public.sc_proposal_messages(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d documents;
begin
  if p_token is null or length(p_token) < 24 then return '[]'::jsonb; end if;
  select * into d from documents where token = p_token and doc_type = 'quote' and proposal_id is not null;
  if not found then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', n.from_name, 'body', n.body, 'at', n.created_at) order by n.created_at)
    from contact_notes n where n.document_id = d.id and n.org_id = d.org_id), '[]'::jsonb);
end $$;
revoke all on function public.sc_proposal_messages(text) from public;
grant execute on function public.sc_proposal_messages(text) to anon, authenticated;
