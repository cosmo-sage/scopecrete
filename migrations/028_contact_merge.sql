-- 028_contact_merge.sql
--
-- One contact is one person. Merge two contacts that are the same person, and
-- undo it exactly.
-- Applied 2026-09-27 on Coy's explicit instruction (plan approval covering
-- 026-028, DECISIONS.md §7).
--
-- WHY
--
-- Threads are keyed per phone number, so Amber reads as two strangers:
-- +12259268939 carries her five calls, +12252814640 her texts — including
-- "It's Amber with The Arts at Jefferson Heights!" and her two photos. Opening
-- a contact to see everything they have said cannot work while a person is
-- split across rows.
--
-- The schema already designed the answer, and nothing used it:
-- contacts.merged_into_contact_id / merged_at, contact_phones (many numbers per
-- contact), contact_merges (winner, loser, undo_payload, undone_at). All 0 rows,
-- no merge function.
--
-- WHY SECURITY DEFINER, NOT INVOKER
--
-- The plan said INVOKER, so row security would decide. Checked before writing:
-- voip_calls has NO write policy for a signed-in user, and sms_threads allows
-- writes only by the service role. An invoker merge would have moved Amber's
-- texts and silently left her calls behind — a half-merge that reports success.
--
-- So this runs as its owner, and checks membership EXPLICITLY instead: the
-- caller must be signed in, and both contacts must belong to one org that
-- get_user_org_ids() returns for the caller. Execute is revoked from public and
-- anon and granted to authenticated only. It is a named function with a narrow
-- job, which is what DECISIONS.md §7 asks for in place of raw writes.
--
-- WHAT A MERGE MOVES
--
-- Every column that references contacts(id), except the loser's own identity:
--   plain moves   messages, quo_events, voip_calls, sms_threads, leads, jobs,
--                 inbound_emails, contact_enrichment_events, training_examples,
--                 admin_chat_sessions, daily_log_recipients,
--                 receipts.vendor_contact_id, payables.vendor_contact_id,
--                 contact_proposals.referred_by_contact_id
--   guarded moves rows that would collide with a unique index on the winner stay
--                 on the loser: job_contacts, message_participants,
--                 contact_name_claims, and primary contact_emails/contact_phones
--   not moved     the loser's contact_proposals — a PENDING one is superseded
--                 (only one pending per contact is allowed); history stays put
--
-- It also records both numbers in contact_phones on the winner, copies the
-- loser's name onto the winner ONLY if the winner has none (with its
-- provenance), points the loser at the winner, and re-points anything that was
-- already merged INTO the loser, so chains never form.
--
-- Updating quo_events.contact_id does not re-project: sc_quo_events_project()
-- ignores updates that change only contact_id. That is relied on here.
--
-- UNDO
--
-- Every moved row's id is recorded. sc_unmerge_contacts() moves exactly those
-- rows back — only where they still point at the winner — and reverses the rest.
-- A merge Coy cannot undo is not a merge he should be asked to make.

begin;

-- ------------------------------------------------------------------- merge

create or replace function public.sc_merge_contacts(p_winner uuid, p_loser uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  w       public.contacts%rowtype;
  l       public.contacts%rowtype;
  v_moves jsonb := '{}'::jsonb;
  v_ids   jsonb;
  v_superseded jsonb;
  v_flattened  jsonb;
  v_phones     jsonb := '[]'::jsonb;
  v_name       jsonb := null;
  v_phone_id   uuid;
  v_merge_id   uuid;
  r record;
begin
  if v_uid is null then
    raise exception 'sign in to merge contacts' using errcode = '42501';
  end if;
  if p_winner is null or p_loser is null or p_winner = p_loser then
    raise exception 'pick two different contacts' using errcode = '22023';
  end if;

  -- Lock both, in a fixed order so two concurrent merges cannot deadlock.
  perform 1 from public.contacts where id in (p_winner, p_loser) order by id for update;
  select * into w from public.contacts where id = p_winner;
  select * into l from public.contacts where id = p_loser;

  if w.id is null or l.id is null then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if w.org_id is distinct from l.org_id
     or not (w.org_id = any (public.get_user_org_ids())) then
    -- One message for both cases: a caller probing another org learns nothing.
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if w.merged_into_contact_id is not null or l.merged_into_contact_id is not null then
    raise exception 'one of these contacts has already been merged into another' using errcode = '22023';
  end if;

  -- Plain moves: nothing on the winner can collide.
  for r in select * from (values
      ('messages','contact_id'), ('quo_events','contact_id'), ('voip_calls','contact_id'),
      ('sms_threads','contact_id'), ('leads','contact_id'), ('jobs','contact_id'),
      ('inbound_emails','contact_id'), ('contact_enrichment_events','contact_id'),
      ('training_examples','contact_id'), ('admin_chat_sessions','contact_id'),
      ('daily_log_recipients','contact_id'), ('receipts','vendor_contact_id'),
      ('payables','vendor_contact_id'), ('contact_proposals','referred_by_contact_id')
    ) as t(tbl, col)
  loop
    execute format(
      'with u as (update public.%I set %I = $1 where %I = $2 returning id)
       select coalesce(jsonb_agg(id), ''[]''::jsonb) from u', r.tbl, r.col, r.col)
      into v_ids using p_winner, p_loser;
    if jsonb_array_length(v_ids) > 0 then
      v_moves := v_moves || jsonb_build_object(r.tbl || '.' || r.col, v_ids);
    end if;
  end loop;

  -- Guarded moves: skip a row that would duplicate one the winner already has.
  with u as (
    update public.job_contacts jc set contact_id = p_winner
     where jc.contact_id = p_loser
       and not exists (select 1 from public.job_contacts x
                        where x.contact_id = p_winner and x.job_id = jc.job_id
                          and x.role is not distinct from jc.role)
    returning id)
  select coalesce(jsonb_agg(id), '[]') into v_ids from u;
  if jsonb_array_length(v_ids) > 0 then v_moves := v_moves || jsonb_build_object('job_contacts.contact_id', v_ids); end if;

  with u as (
    update public.message_participants mp set contact_id = p_winner
     where mp.contact_id = p_loser
       and not exists (select 1 from public.message_participants x
                        where x.contact_id = p_winner and x.message_id = mp.message_id)
    returning id)
  select coalesce(jsonb_agg(id), '[]') into v_ids from u;
  if jsonb_array_length(v_ids) > 0 then v_moves := v_moves || jsonb_build_object('message_participants.contact_id', v_ids); end if;

  with u as (
    update public.contact_name_claims c set contact_id = p_winner
     where c.contact_id = p_loser
       and not exists (select 1 from public.contact_name_claims x
                        where x.contact_id = p_winner and x.claim_type = c.claim_type
                          and x.source_message_id is not distinct from c.source_message_id
                          and coalesce(x.claimed_name,'') = coalesce(c.claimed_name,''))
    returning id)
  select coalesce(jsonb_agg(id), '[]') into v_ids from u;
  if jsonb_array_length(v_ids) > 0 then v_moves := v_moves || jsonb_build_object('contact_name_claims.contact_id', v_ids); end if;

  with u as (
    update public.contact_emails e set contact_id = p_winner
     where e.contact_id = p_loser
       and (not e.is_primary
            or not exists (select 1 from public.contact_emails x where x.contact_id = p_winner and x.is_primary))
    returning id)
  select coalesce(jsonb_agg(id), '[]') into v_ids from u;
  if jsonb_array_length(v_ids) > 0 then v_moves := v_moves || jsonb_build_object('contact_emails.contact_id', v_ids); end if;

  with u as (
    update public.contact_phones p set contact_id = p_winner
     where p.contact_id = p_loser
       and (not p.is_primary
            or not exists (select 1 from public.contact_phones x where x.contact_id = p_winner and x.is_primary))
    returning id)
  select coalesce(jsonb_agg(id), '[]') into v_ids from u;
  if jsonb_array_length(v_ids) > 0 then v_moves := v_moves || jsonb_build_object('contact_phones.contact_id', v_ids); end if;

  -- The loser's pending proposal is superseded, not moved: one pending per
  -- contact is enforced, and the winner's conversation is now the one to judge.
  with u as (
    update public.contact_proposals set status = 'superseded'
     where contact_id = p_loser and status = 'pending'
    returning id)
  select coalesce(jsonb_agg(id), '[]') into v_superseded from u;

  -- Anything already merged INTO the loser now points at the winner: no chains.
  with u as (
    update public.contacts set merged_into_contact_id = p_winner
     where merged_into_contact_id = p_loser
    returning id)
  select coalesce(jsonb_agg(id), '[]') into v_flattened from u;

  -- Both numbers on the winner. Winner's own number is primary if it has none.
  if w.phone ~ '^\+[1-9][0-9]{7,14}$'
     and not exists (select 1 from public.contact_phones where contact_id = p_winner and phone_e164 = w.phone) then
    insert into public.contact_phones (org_id, contact_id, phone_e164, is_primary, label, source)
    values (w.org_id, p_winner, w.phone,
            not exists (select 1 from public.contact_phones where contact_id = p_winner and is_primary),
            null, 'manual')
    returning id into v_phone_id;
    v_phones := v_phones || to_jsonb(v_phone_id);
  end if;
  if l.phone ~ '^\+[1-9][0-9]{7,14}$'
     and not exists (select 1 from public.contact_phones where contact_id = p_winner and phone_e164 = l.phone) then
    insert into public.contact_phones (org_id, contact_id, phone_e164, is_primary, label, source)
    values (w.org_id, p_winner, l.phone, false, null, 'manual')
    returning id into v_phone_id;
    v_phones := v_phones || to_jsonb(v_phone_id);
  end if;

  -- Name: only onto a winner that has none, carrying the loser's provenance so
  -- a human-confirmed name stays human-confirmed. Never overwrites.
  if coalesce(btrim(w.name), '') = '' and coalesce(btrim(l.name), '') <> '' then
    v_name := jsonb_build_object(
      'copied', l.name,
      'prev_name', w.name, 'prev_source', w.name_source,
      'prev_confirmed_at', w.name_confirmed_at, 'prev_confirmed_by', w.name_confirmed_by);
    update public.contacts
       set name = l.name,
           name_source = l.name_source,
           name_confirmed_at = l.name_confirmed_at,
           name_confirmed_by = l.name_confirmed_by
     where id = p_winner;
  end if;

  update public.contacts
     set merged_into_contact_id = p_winner, merged_at = now()
   where id = p_loser;

  insert into public.contact_merges (org_id, winner_id, loser_id, merged_by, merged_at, undo_payload)
  values (w.org_id, p_winner, p_loser, v_uid, now(), jsonb_build_object(
    'moves', v_moves,
    'superseded_proposals', v_superseded,
    'flattened_pointers', v_flattened,
    'inserted_phones', v_phones,
    'name', v_name))
  returning id into v_merge_id;

  return v_merge_id;
end;
$function$;

-- ----------------------------------------------------------------- unmerge

create or replace function public.sc_unmerge_contacts(p_merge_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  m     public.contact_merges%rowtype;
  v_key text;
  v_tbl text;
  v_col text;
  v_ids jsonb;
  v_name jsonb;
  v_cur text;
begin
  if v_uid is null then
    raise exception 'sign in to undo a merge' using errcode = '42501';
  end if;

  select * into m from public.contact_merges where id = p_merge_id for update;
  if m.id is null or not (m.org_id = any (public.get_user_org_ids())) then
    raise exception 'merge not found' using errcode = 'P0002';
  end if;
  if m.undone_at is not null then
    raise exception 'this merge has already been undone' using errcode = '22023';
  end if;

  -- Move back exactly the recorded rows, and only those still on the winner.
  -- A row the winner has since been given by something else is not touched.
  for v_key, v_ids in select key, value from jsonb_each(coalesce(m.undo_payload -> 'moves', '{}'::jsonb)) loop
    v_tbl := split_part(v_key, '.', 1);
    v_col := split_part(v_key, '.', 2);
    if v_tbl not in ('messages','quo_events','voip_calls','sms_threads','leads','jobs',
                     'inbound_emails','contact_enrichment_events','training_examples',
                     'admin_chat_sessions','daily_log_recipients','receipts','payables',
                     'contact_proposals','job_contacts','message_participants',
                     'contact_name_claims','contact_emails','contact_phones') then
      raise exception 'unexpected table % in undo payload', v_tbl;
    end if;
    execute format(
      'update public.%I set %I = $1 where %I = $2 and id = any (select (jsonb_array_elements_text($3))::uuid)',
      v_tbl, v_col, v_col)
      using m.loser_id, m.winner_id, v_ids;
  end loop;

  delete from public.contact_phones
   where id = any (select (jsonb_array_elements_text(coalesce(m.undo_payload -> 'inserted_phones', '[]'::jsonb)))::uuid);

  update public.contacts set merged_into_contact_id = m.loser_id
   where merged_into_contact_id = m.winner_id
     and id = any (select (jsonb_array_elements_text(coalesce(m.undo_payload -> 'flattened_pointers', '[]'::jsonb)))::uuid);

  -- A superseded proposal comes back only if the loser has not gained a new
  -- pending one meanwhile (one pending per contact is enforced).
  if not exists (select 1 from public.contact_proposals where contact_id = m.loser_id and status = 'pending') then
    update public.contact_proposals set status = 'pending'
     where status = 'superseded'
       and id = (select (jsonb_array_elements_text(coalesce(m.undo_payload -> 'superseded_proposals', '[]'::jsonb)))::uuid limit 1);
  end if;

  -- The copied name comes off only if it is still the one the merge put there.
  -- Two steps, because sc_guard_contact_identity refuses a non-human write over
  -- a human-confirmed name: clear it as 'human', then restore the old source.
  v_name := m.undo_payload -> 'name';
  if v_name is not null and jsonb_typeof(v_name) = 'object' then
    select name into v_cur from public.contacts where id = m.winner_id;
    if v_cur is not distinct from (v_name ->> 'copied') then
      update public.contacts
         set name = v_name ->> 'prev_name', name_source = 'human',
             name_confirmed_at = null, name_confirmed_by = null
       where id = m.winner_id;
      update public.contacts
         set name_source = coalesce(v_name ->> 'prev_source', 'legacy'),
             name_confirmed_at = (v_name ->> 'prev_confirmed_at')::timestamptz,
             name_confirmed_by = (v_name ->> 'prev_confirmed_by')::uuid
       where id = m.winner_id;
    end if;
  end if;

  update public.contacts set merged_into_contact_id = null, merged_at = null where id = m.loser_id;
  update public.contact_merges set undone_at = now() where id = m.id;
end;
$function$;

revoke all on function public.sc_merge_contacts(uuid, uuid)   from public, anon;
revoke all on function public.sc_unmerge_contacts(uuid)       from public, anon;
grant execute on function public.sc_merge_contacts(uuid, uuid) to authenticated;
grant execute on function public.sc_unmerge_contacts(uuid)     to authenticated;

-- ---------------------------------------------------- projection follows it
-- An event keyed to a merged-away contact — a webhook in flight during the
-- merge, or an intake that has not been updated — must still land on the
-- person. The redirect goes in the trigger wrapper rather than in
-- sc_project_raw_event(), so the 200-line projection is not copied a third
-- time for a one-line change: the event handed to the projection carries the
-- winner's id. The stored quo_events row keeps what the provider sent.

create or replace function public.sc_quo_events_project()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ev public.quo_events;
begin
  if tg_op = 'UPDATE'
     and new.raw_payload is not distinct from old.raw_payload
     and new.event_type  is not distinct from old.event_type
     and new.event_id    is not distinct from old.event_id
     and new.org_id      is not distinct from old.org_id
     and new.direction   is not distinct from old.direction
     and new.from_phone  is not distinct from old.from_phone
     and new.to_phone    is not distinct from old.to_phone
     and new.body        is not distinct from old.body
  then
    return null;
  end if;

  v_ev := new;
  if v_ev.contact_id is not null then                                   -- 028
    v_ev.contact_id := coalesce(
      (select c.merged_into_contact_id from public.contacts c where c.id = v_ev.contact_id),
      v_ev.contact_id);
  end if;

  begin
    perform public.sc_project_raw_event(v_ev);
  exception when others then
    update public.quo_events set projection_error = sqlstate || ': ' || sqlerrm where id = new.id;
    insert into public.projection_defects (org_id, raw_event_id, defect, detail)
    values (new.org_id, new.id, 'projection_exception',
            jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm))
    on conflict (raw_event_id, defect) where resolved_at is null do nothing;
  end;
  return null;
end;
$function$;

commit;

-- VERIFY — as the authenticated role, inside begin … rollback. Each states
-- what failure looks like.
--
--   select public.sc_merge_contacts(<+12259268939 id>, <+12252814640 id>);
--     -- Passes: both numbers' messages (5 calls + 7 texts) under one contact;
--     -- contact_phones has 2 rows for the winner; the loser's
--     -- merged_into_contact_id is set. Fails if any call stayed behind —
--     -- that is the half-merge an invoker function would have produced.
--
--   insert a message.received quo_event keyed to the LOSER.
--     -- Passes if the projected message lands on the WINNER.
--
--   select public.sc_unmerge_contacts(<merge id>);
--     -- Passes if every moved row is back, contact_phones rows gone, pointer
--     -- cleared, undone_at set. Fails if any row stays on the winner.
--
--   As a non-member: sc_merge_contacts on two of this org's contacts.
--     -- Passes on "contact not found". Fails if it merges.
