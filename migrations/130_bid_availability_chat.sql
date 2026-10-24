-- 130 — Availability and a chat on a bid request (Coy, 2026-10-24: "I need a way to request and
-- discuss availability for jobs I send bid requests to … a chat channel (which would be an
-- 'internal chat' on scopecrete) that has communications tied to each job through which i would
-- send the bid request … on a mobile friendly page and I need to at least capture tentative
-- availability with the bid request itself narrowed down to the month and week of the month. A
-- calendar with the weeks in the month listed and the next 3 months showing.")
--
-- The weeks Coy wants the work done in need no column: they ride on bid_requests.packet.weeks.
-- What the vendor answers, and what the two sides say, do:
--
--   bid_request_recipients.availability   the weeks the vendor says they could do it, as keys
--                                         'YYYY-MM-wN' (week N of the month: days 1–7, 8–14,
--                                         15–21, 22–28, 29–end), at most 20; availability_at,
--                                         availability_note (≤ 500). Only the door writes them.
--   bid_messages                          one row per message on ONE vendor's link: side 'org'
--                                         (a member, under RLS, as themselves) or 'vendor'
--                                         (only through sc_bid_message). Members read their
--                                         org's; anon has no grant. A trigger fills the request,
--                                         the vendor and checks the org from the recipient.
--   sc_bid_chat(token)                    SECURITY DEFINER, anon may run it: a live link's
--                                         messages (oldest first, the last 200) and the vendor's
--                                         availability. Nothing logged.
--   sc_bid_message(token, name, body)     SECURITY DEFINER, anon: a live link only, never the
--                                         org's own members, 1–2,000 characters, 30 a link a day.
--   sc_bid_availability(token, weeks, note) SECURITY DEFINER, anon: a live link only, never the
--                                         org's own members; keys checked one by one.
--
-- Additive: three nullable columns, one check, one table with RLS, a trigger and three
-- functions. Nothing dropped.

alter table public.bid_request_recipients
  add column if not exists availability jsonb,
  add column if not exists availability_at timestamptz,
  add column if not exists availability_note text;
alter table public.bid_request_recipients drop constraint if exists bid_recipients_availability_check;
alter table public.bid_request_recipients add constraint bid_recipients_availability_check
  check ((availability is null or (jsonb_typeof(availability) = 'array' and jsonb_array_length(availability) <= 20))
     and (availability_note is null or length(availability_note) <= 500));

create table if not exists public.bid_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  bid_request_id uuid not null references public.bid_requests(id) on delete cascade,
  recipient_id uuid not null references public.bid_request_recipients(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  side text not null check (side in ('org', 'vendor')),
  author_id uuid references auth.users(id) on delete set null,
  author_name text check (author_name is null or length(author_name) <= 80),
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists bid_messages_recipient_idx on public.bid_messages (recipient_id, created_at);
create index if not exists bid_messages_org_idx on public.bid_messages (org_id, created_at desc);

alter table public.bid_messages enable row level security;
revoke all on public.bid_messages from anon, authenticated;
grant select, insert on public.bid_messages to authenticated;
create policy bid_messages_read on public.bid_messages for select to authenticated
  using (org_id = any(get_user_org_ids()));
create policy bid_messages_write on public.bid_messages for insert to authenticated
  with check (org_id = any(get_user_org_ids()) and side = 'org' and author_id = auth.uid());

create or replace function public.sc_bid_messages_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare r bid_request_recipients;
begin
  select * into r from bid_request_recipients where id = new.recipient_id;
  if not found or r.org_id <> new.org_id then raise exception 'no such bid link'; end if;
  new.bid_request_id := r.bid_request_id;
  new.contact_id := r.contact_id;
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end $$;
revoke all on function public.sc_bid_messages_fill() from public;
drop trigger if exists bid_messages_fill on public.bid_messages;
create trigger bid_messages_fill before insert on public.bid_messages
  for each row execute function public.sc_bid_messages_fill();

create or replace function public.sc_bid_chat(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bid_request_recipients; msgs jsonb;
begin
  if p_token is null or length(p_token) < 24 then return null; end if;
  select * into r from bid_request_recipients where token = p_token;
  if not found or r.revoked_at is not null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'side', m.side, 'name', m.author_name, 'body', m.body, 'at', m.created_at)
    order by m.created_at), '[]'::jsonb) into msgs
    from (select * from bid_messages where recipient_id = r.id order by created_at desc limit 200) m;
  return jsonb_build_object('messages', msgs, 'availability', coalesce(r.availability, '[]'::jsonb),
    'availability_at', r.availability_at, 'availability_note', r.availability_note);
end $$;
revoke all on function public.sc_bid_chat(text) from public;
grant execute on function public.sc_bid_chat(text) to anon, authenticated;

create or replace function public.sc_bid_message(p_token text, p_name text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bid_request_recipients; who text; n int; m bid_messages;
begin
  if p_token is null or length(p_token) < 24 then raise exception 'not a bid link'; end if;
  select * into r from bid_request_recipients where token = p_token;
  if not found or r.revoked_at is not null then raise exception 'this bid link is turned off'; end if;
  if coalesce(r.org_id = any(get_user_org_ids()), false) then raise exception 'this is your own link — write to them from the job''s bid request'; end if;
  if p_body is null or length(btrim(p_body)) < 1 then raise exception 'write a message first'; end if;
  if length(p_body) > 2000 then raise exception 'the message is too long'; end if;
  select count(*) into n from bid_messages where recipient_id = r.id and side = 'vendor' and created_at > now() - interval '1 day';
  if n >= 30 then raise exception 'that''s a lot of messages today — call them'; end if;
  who := nullif(left(btrim(coalesce(p_name, '')), 80), '');
  if who is null then select left(coalesce(nullif(btrim(name), ''), nullif(btrim(company_name), '')), 80) into who from contacts where id = r.contact_id; end if;
  insert into bid_messages (org_id, bid_request_id, recipient_id, side, author_name, body)
    values (r.org_id, r.bid_request_id, r.id, 'vendor', who, p_body) returning * into m;
  return jsonb_build_object('id', m.id, 'at', m.created_at);
end $$;
revoke all on function public.sc_bid_message(text, text, text) from public;
grant execute on function public.sc_bid_message(text, text, text) to anon, authenticated;

create or replace function public.sc_bid_availability(p_token text, p_weeks jsonb, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bid_request_recipients; clean jsonb := '[]'::jsonb; x jsonb;
begin
  if p_token is null or length(p_token) < 24 then raise exception 'not a bid link'; end if;
  select * into r from bid_request_recipients where token = p_token for update;
  if not found or r.revoked_at is not null then raise exception 'this bid link is turned off'; end if;
  if coalesce(r.org_id = any(get_user_org_ids()), false) then raise exception 'this is your own link — the vendor picks their weeks'; end if;
  if p_note is not null and length(p_note) > 500 then raise exception 'the note is too long'; end if;
  if p_weeks is not null and jsonb_typeof(p_weeks) = 'array' then
    for x in select * from jsonb_array_elements(p_weeks) loop
      if jsonb_typeof(x) = 'string' and (x #>> '{}') ~ '^[0-9]{4}-(0[1-9]|1[0-2])-w[1-5]$'
         and not clean @> jsonb_build_array(x) then clean := clean || jsonb_build_array(x); end if;
      exit when jsonb_array_length(clean) >= 20;
    end loop;
  end if;
  update bid_request_recipients set availability = clean, availability_at = now(),
    availability_note = nullif(btrim(p_note), '') where id = r.id;
  return jsonb_build_object('ok', true, 'weeks', clean, 'at', now());
end $$;
revoke all on function public.sc_bid_availability(text, jsonb, text) from public;
grant execute on function public.sc_bid_availability(text, jsonb, text) to anon, authenticated;
