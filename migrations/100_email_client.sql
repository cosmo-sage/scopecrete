-- 100 — Email in Threads: conversations, sending, drafts (Claude Design
-- "Email Client v2", Coy 2026-10-10: "UI design … to be able to send and
-- manage emails inside of threads").
--
-- Until now the mirror (061) only took mail IN: one row per message, nothing
-- grouped it into a conversation and nothing went out. This adds:
--
--   * emails.direction — 'in' (mirrored, as before) or 'out' (sent from
--     ScopeCrete through AgentMail by a member's tap).
--   * emails.thread_id — AgentMail's thread for the message (read from the raw
--     log, email_events, so email-intake needs no redeploy);
--     emails.conversation — what Threads groups by. A reply to something we
--     sent arrives on our message's AgentMail thread and joins its
--     conversation; a reply we send to a forwarded email (a new AgentMail
--     thread, since the writer never wrote to our inbox) is put in the
--     forward's conversation by the app.
--   * to / cc / in_reply_to read off the raw log; file_ids, sent_by and
--     reply_to_email_id on what we send.
--   * A reply that comes back into a conversation we sent from is not a
--     stranger's mail: it is not quarantined, it takes the conversation's
--     filing, and its files are fetched (trigger on email_attachments).
--   * email_conversations — per conversation: Dusty's read (summary, asks,
--     needs reply or FYI), archived, last read. Members read and write their
--     org's rows.
--   * email_drafts — a message being written (by a member, or Dusty's draft a
--     member asked for), shared with the org; nothing in it is ever sent on
--     its own.
--   * sc_record_sent_email(jsonb) — the one way a member's sent message is
--     recorded: SECURITY DEFINER with a membership check (members still have
--     no insert on emails), the inbox must be the org's.
--
-- Additive. RLS by get_user_org_ids(); anon has nothing.
--
-- Rehearsed 2026-10-10 (rolled back) on the live data: all 10 mirrored emails
-- got their thread, recipients and conversation; a member recorded a sent
-- reply (filed, sent_by set); a quarantined reply on that AgentMail thread
-- came in filed on the conversation's customer with its held file released;
-- a stranger saw no emails or conversations. The connector's approval gate
-- times out on `drop`, so the rehearsal ran without the `drop … if exists`
-- lines (nothing existed to drop).

set lock_timeout = '8s';

alter table public.emails
  add column if not exists direction text not null default 'in' check (direction in ('in', 'out')),
  add column if not exists thread_id text,
  add column if not exists conversation text,
  add column if not exists to_addresses text[],
  add column if not exists cc_addresses text[],
  add column if not exists in_reply_to text,
  add column if not exists reply_to_email_id uuid references public.emails(id) on delete set null,
  add column if not exists file_ids uuid[] check (file_ids is null or cardinality(file_ids) <= 20),
  add column if not exists sent_by uuid references auth.users(id) on delete set null;
create index if not exists emails_conversation_idx on public.emails (org_id, conversation, created_at);
create index if not exists emails_thread_idx on public.emails (org_id, thread_id) where thread_id is not null;

-- "Name <a@b.c>" or "a@b.c" → a@b.c, lower case; anything else → null.
create or replace function public.sc_email_address(raw text)
returns text language sql immutable set search_path = public as $$
  select case when x ~ '^[^@\s<>]+@[^@\s<>]+$' then x end
  from (select lower(trim(coalesce(substring(raw from '<([^>]+)>'), raw))) as x) s
$$;

create or replace function public.sc_email_addresses(j jsonb)
returns text[] language sql immutable set search_path = public as $$
  select nullif(array(select a from (select public.sc_email_address(v) a from jsonb_array_elements_text(
    case jsonb_typeof(j) when 'array' then j when 'string' then jsonb_build_array(j) else '[]'::jsonb end) v) s where a is not null), '{}')
$$;

-- Fill a new row's thread, recipients and conversation; a reply into a
-- conversation we sent from takes its filing.
create or replace function public.sc_email_thread_fill()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb;
  f record;
begin
  if new.event_id is not null and (new.thread_id is null or new.to_addresses is null) then
    select raw_payload -> 'message' into m from email_events where id = new.event_id;
    if m is not null then
      new.thread_id := coalesce(new.thread_id, m ->> 'thread_id');
      new.to_addresses := coalesce(new.to_addresses, sc_email_addresses(m -> 'to'));
      new.cc_addresses := coalesce(new.cc_addresses, sc_email_addresses(m -> 'cc'));
      new.in_reply_to := coalesce(new.in_reply_to, m ->> 'in_reply_to');
    end if;
  end if;
  if new.conversation is null then
    if new.thread_id is not null then
      select e.conversation into new.conversation from emails e
       where e.org_id = new.org_id and e.thread_id = new.thread_id and e.conversation is not null and e.id <> new.id
       order by e.created_at limit 1;
    end if;
    new.conversation := coalesce(new.conversation, new.thread_id, new.id::text);
  end if;
  if new.direction = 'in' and new.status in ('quarantined', 'unfiled')
     and exists (select 1 from emails o where o.org_id = new.org_id and o.conversation = new.conversation and o.direction = 'out') then
    select e.customer_id, e.contact_id, e.job_id into f from emails e
     where e.org_id = new.org_id and e.conversation = new.conversation and e.status = 'filed'
     order by e.created_at desc limit 1;
    if found and (f.customer_id is not null or f.contact_id is not null or f.job_id is not null) then
      new.customer_id := coalesce(new.customer_id, f.customer_id);
      new.contact_id := coalesce(new.contact_id, f.contact_id);
      new.job_id := coalesce(new.job_id, f.job_id);
      new.status := 'filed';
      new.filed_at := coalesce(new.filed_at, now());
    else
      new.status := 'unfiled';
    end if;
    new.match_note := left('a reply in a conversation sent from ScopeCrete' || coalesce(' · ' || new.match_note, ''), 500);
  end if;
  return new;
end $$;
drop trigger if exists emails_thread_fill on public.emails;
create trigger emails_thread_fill before insert on public.emails
  for each row execute function public.sc_email_thread_fill();

-- email-intake holds a stranger's files; a reply it doesn't know is ours gets them fetched.
create or replace function public.sc_email_attachment_release()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fetch_state = 'held' and exists (select 1 from emails e where e.id = new.email_id and e.status <> 'quarantined') then
    new.fetch_state := 'waiting';
  end if;
  return new;
end $$;
drop trigger if exists email_attachments_release on public.email_attachments;
create trigger email_attachments_release before insert on public.email_attachments
  for each row execute function public.sc_email_attachment_release();

-- Backfill what is already mirrored (10 emails on 2026-10-10).
update public.emails e set
  thread_id = coalesce(e.thread_id, ev.raw_payload -> 'message' ->> 'thread_id'),
  to_addresses = coalesce(e.to_addresses, public.sc_email_addresses(ev.raw_payload -> 'message' -> 'to')),
  cc_addresses = coalesce(e.cc_addresses, public.sc_email_addresses(ev.raw_payload -> 'message' -> 'cc')),
  in_reply_to = coalesce(e.in_reply_to, ev.raw_payload -> 'message' ->> 'in_reply_to')
from public.email_events ev
where ev.id = e.event_id and e.thread_id is null;
update public.emails set conversation = coalesce(thread_id, id::text) where conversation is null;

-- Per conversation: Dusty's read, archive, last read.
create table if not exists public.email_conversations (
  org_id uuid not null references public.orgs(id) on delete cascade,
  conversation text not null check (length(conversation) <= 200),
  summary text check (summary is null or length(summary) <= 2000),
  asks jsonb not null default '[]'::jsonb check (jsonb_typeof(asks) = 'array'),
  triage text check (triage in ('reply', 'fyi')),
  read_for integer,
  read_by_dusty_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  last_read_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (org_id, conversation)
);
alter table public.email_conversations enable row level security;
drop policy if exists email_conversations_member on public.email_conversations;
create policy email_conversations_member on public.email_conversations for all to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
revoke all on public.email_conversations from anon, authenticated;
grant select, insert, update on public.email_conversations to authenticated;

-- Drafts.
create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  conversation text check (conversation is null or length(conversation) <= 200),
  reply_to_email_id uuid references public.emails(id) on delete set null,
  mode text not null default 'new' check (mode in ('new', 'reply', 'reply_all', 'forward')),
  to_addresses text[] not null default '{}' check (cardinality(to_addresses) <= 20),
  cc_addresses text[] not null default '{}' check (cardinality(cc_addresses) <= 20),
  subject text check (subject is null or length(subject) <= 300),
  body text check (body is null or length(body) <= 50000),
  file_ids uuid[] not null default '{}' check (cardinality(file_ids) <= 10),
  by text not null default 'coy' check (by in ('coy', 'dusty')),
  contact_id uuid references public.contacts(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_drafts_org_idx on public.email_drafts (org_id, updated_at desc);
alter table public.email_drafts enable row level security;
drop policy if exists email_drafts_member on public.email_drafts;
create policy email_drafts_member on public.email_drafts for all to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
revoke all on public.email_drafts from anon, authenticated;
grant select, insert, update, delete on public.email_drafts to authenticated;

-- A draft's customer, person, job and reply are in its org.
create or replace function public.sc_email_draft_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.customer_id is not null and not exists (select 1 from customers c where c.id = new.customer_id and c.org_id = new.org_id) then raise exception 'customer not found'; end if;
  if new.contact_id is not null and not exists (select 1 from contacts c where c.id = new.contact_id and c.org_id = new.org_id) then raise exception 'contact not found'; end if;
  if new.job_id is not null and not exists (select 1 from jobs j where j.id = new.job_id and j.org_id = new.org_id) then raise exception 'job not found'; end if;
  if new.reply_to_email_id is not null and not exists (select 1 from emails e where e.id = new.reply_to_email_id and e.org_id = new.org_id) then raise exception 'email not found'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists email_drafts_guard on public.email_drafts;
create trigger email_drafts_guard before insert or update on public.email_drafts
  for each row execute function public.sc_email_draft_guard();

-- Record a message a member just sent through AgentMail (the app calls this
-- after AgentMail took it). Members have no insert on emails; this is the door.
create or replace function public.sc_record_sent_email(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := (p ->> 'org_id')::uuid;
  v_inbox text := lower(p ->> 'inbox');
  v_id uuid;
  v_filed boolean := coalesce(p ->> 'customer_id', p ->> 'contact_id', p ->> 'job_id') is not null;
begin
  if auth.uid() is null or not (v_org = any (get_user_org_ids())) then raise exception 'org not found'; end if;
  if not exists (select 1 from org_inbound_addresses a where a.org_id = v_org and a.address = v_inbox) then raise exception 'inbox not found'; end if;
  if coalesce(p ->> 'provider_message_id', '') = '' then raise exception 'no message id'; end if;
  if (p ->> 'reply_to_email_id') is not null and not exists (select 1 from emails e where e.id = (p ->> 'reply_to_email_id')::uuid and e.org_id = v_org) then
    raise exception 'email not found';
  end if;
  insert into emails (org_id, provider, provider_message_id, inbox, direction, from_address, from_name, subject, text_body, sent_at,
                      thread_id, conversation, to_addresses, cc_addresses, in_reply_to, reply_to_email_id, file_ids, sent_by,
                      customer_id, contact_id, job_id, match, status, filed_at, filed_by)
  values (v_org, 'agentmail', p ->> 'provider_message_id', v_inbox, 'out', v_inbox, left(p ->> 'from_name', 200),
          left(p ->> 'subject', 1000), left(p ->> 'text_body', 200000), now(),
          p ->> 'thread_id', left(p ->> 'conversation', 200),
          array(select public.sc_email_address(x) from jsonb_array_elements_text(coalesce(p -> 'to', '[]')) x),
          array(select public.sc_email_address(x) from jsonb_array_elements_text(coalesce(p -> 'cc', '[]')) x),
          p ->> 'in_reply_to', (p ->> 'reply_to_email_id')::uuid,
          array(select x::uuid from jsonb_array_elements_text(coalesce(p -> 'file_ids', '[]')) x), auth.uid(),
          (p ->> 'customer_id')::uuid, (p ->> 'contact_id')::uuid, (p ->> 'job_id')::uuid,
          case when v_filed then 'coy' else 'none' end, case when v_filed then 'filed' else 'unfiled' end,
          case when v_filed then now() end, case when v_filed then auth.uid() end)
  on conflict (provider, provider_message_id) do update set direction = 'out', sent_by = excluded.sent_by
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.sc_record_sent_email(jsonb) from public, anon;
grant execute on function public.sc_record_sent_email(jsonb) to authenticated;
revoke all on function public.sc_email_thread_fill(), public.sc_email_attachment_release() from public, anon, authenticated;
