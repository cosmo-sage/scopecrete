-- 061 — The email mirror (Coy, 2026-10-01). Coy forwards bid emails from
-- admin@saccobuilt.com to intake-concrete@agentmail.to; his own Hermes agent
-- reads them for scopes. ScopeCrete only MIRRORS that inbox: each email is
-- kept, its attachments become the org's files, and it is filed on the right
-- customer. Nothing is extracted here.
--
-- The §2a shape, for email:
--
--   AgentMail webhook -> email-intake (signature checked) -> email_events (RAW LOG)
--                                                         -> emails (SPINE) -> email_attachments -> job_files
--
--   * email_events — every signed delivery, untouched, before anything parses
--     it. Service role writes; members read their org's rows.
--   * emails — one per message: who forwarded it, the ORIGINAL sender read
--     from the forwarded block, subject, text, and where it is filed
--     (customer / contact / job). `match` says how: exact (the original
--     sender's address is on a contact), domain_suggested (one customer has
--     that domain — a suggestion, never filed on its own), coy (Coy filed it),
--     none. Members may change only the filing columns.
--   * email_attachments — each file; fetched into job-files by the function.
--     A quarantined email's files are HELD and fetched only once Coy files it.
--   * org_inbound_addresses — which inbox belongs to which org.
--   * org_inbound_senders — whose forwards count; anything else is kept as
--     quarantined, files held.
--   * job_files.email_id — the email a file came with (source = 'email').
--
-- Additive. Member RLS by get_user_org_ids(); anon has nothing.

-- Fail fast rather than queue behind the file reader on job_files.
set lock_timeout = '8s';

create table if not exists public.org_inbound_addresses (
  address text primary key check (address = lower(address) and address ~ '^[^@\s]+@[^@\s]+$'),
  org_id uuid not null references public.orgs(id) on delete cascade,
  provider text not null default 'agentmail',
  created_at timestamptz not null default now()
);

create table if not exists public.org_inbound_senders (
  org_id uuid not null references public.orgs(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$'),
  created_at timestamptz not null default now(),
  primary key (org_id, email)
);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs(id) on delete cascade,
  provider text not null default 'agentmail',
  provider_event_id text not null,
  event_type text,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  verified boolean not null default false,
  projected_at timestamptz,
  projection_error text,
  attempts integer not null default 0,
  unique (provider, provider_event_id)
);
create index if not exists email_events_unprojected_idx on public.email_events (received_at) where projected_at is null;

create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  event_id uuid references public.email_events(id) on delete set null,
  provider text not null default 'agentmail',
  provider_message_id text not null,
  inbox text,
  from_address text,
  from_name text,
  original_from_address text,
  original_from_name text,
  subject text check (subject is null or length(subject) <= 1000),
  text_body text check (text_body is null or length(text_body) <= 200000),
  sent_at timestamptz,
  customer_id uuid references public.customers(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  suggested_customer_id uuid references public.customers(id) on delete set null,
  match text not null default 'none' check (match in ('exact', 'domain_suggested', 'coy', 'none')),
  match_note text,
  status text not null default 'unfiled' check (status in ('filed', 'unfiled', 'quarantined')),
  filed_at timestamptz,
  filed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (to_tsvector('english',
    coalesce(subject, '') || ' ' || coalesce(original_from_name, '') || ' ' || coalesce(original_from_address, '') || ' ' ||
    left(coalesce(text_body, ''), 100000))) stored,
  unique (provider, provider_message_id)
);
create index if not exists emails_org_idx on public.emails (org_id, sent_at desc nulls last, created_at desc);
create index if not exists emails_customer_idx on public.emails (customer_id) where customer_id is not null;
create index if not exists emails_job_idx on public.emails (job_id) where job_id is not null;
create index if not exists emails_search_idx on public.emails using gin (search_tsv);

create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  email_id uuid not null references public.emails(id) on delete cascade,
  provider_attachment_id text not null,
  name text not null,
  mime_type text,
  byte_size bigint,
  inline boolean not null default false,
  file_id uuid references public.job_files(id) on delete set null,
  fetch_state text not null default 'waiting' check (fetch_state in ('waiting', 'held', 'fetched', 'failed', 'skipped')),
  fetch_error text,
  attempts integer not null default 0,
  last_try_at timestamptz,
  created_at timestamptz not null default now(),
  unique (email_id, provider_attachment_id)
);
create index if not exists email_attachments_due_idx on public.email_attachments (fetch_state, last_try_at) where fetch_state in ('waiting', 'failed');

alter table public.job_files add column if not exists email_id uuid references public.emails(id) on delete set null;
create index if not exists job_files_email_idx on public.job_files (email_id) where email_id is not null;

-- Filing stays inside the org: a customer, contact or job from elsewhere is refused.
-- SECURITY DEFINER so filing can release the email's held attachments (members
-- have no write on email_attachments); it touches only that email's rows.
create or replace function public.sc_email_filing_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is not null and not exists (select 1 from customers c where c.id = new.customer_id and c.org_id = new.org_id) then
    raise exception 'customer not found';
  end if;
  if new.contact_id is not null and not exists (select 1 from contacts c where c.id = new.contact_id and c.org_id = new.org_id) then
    raise exception 'contact not found';
  end if;
  if new.job_id is not null and not exists (select 1 from jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'job not found';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    -- Filing a quarantined email releases its held files for fetching.
    if old.status = 'quarantined' and new.status <> 'quarantined' then
      update email_attachments set fetch_state = 'waiting', attempts = 0 where email_id = new.id and fetch_state = 'held';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists emails_filing_guard on public.emails;
create trigger emails_filing_guard before insert or update on public.emails
  for each row execute function public.sc_email_filing_guard();

-- A file's email is in the file's org.
create or replace function public.sc_job_file_email_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.email_id is not null and not exists (select 1 from emails e where e.id = new.email_id and e.org_id = new.org_id) then
    raise exception 'email not found';
  end if;
  return new;
end $$;
drop trigger if exists job_files_email_guard on public.job_files;
create trigger job_files_email_guard before insert or update of email_id on public.job_files
  for each row execute function public.sc_job_file_email_guard();

alter table public.org_inbound_addresses enable row level security;
alter table public.org_inbound_senders enable row level security;
alter table public.email_events enable row level security;
alter table public.emails enable row level security;
alter table public.email_attachments enable row level security;

drop policy if exists org_inbound_addresses_read on public.org_inbound_addresses;
create policy org_inbound_addresses_read on public.org_inbound_addresses for select to authenticated using (org_id = any (get_user_org_ids()));
drop policy if exists org_inbound_senders_read on public.org_inbound_senders;
create policy org_inbound_senders_read on public.org_inbound_senders for select to authenticated using (org_id = any (get_user_org_ids()));
drop policy if exists email_events_read on public.email_events;
create policy email_events_read on public.email_events for select to authenticated using (org_id = any (get_user_org_ids()));
drop policy if exists emails_read on public.emails;
create policy emails_read on public.emails for select to authenticated using (org_id = any (get_user_org_ids()));
drop policy if exists emails_file on public.emails;
create policy emails_file on public.emails for update to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
drop policy if exists email_attachments_read on public.email_attachments;
create policy email_attachments_read on public.email_attachments for select to authenticated using (org_id = any (get_user_org_ids()));

revoke all on public.org_inbound_addresses, public.org_inbound_senders, public.email_events, public.emails, public.email_attachments from anon, authenticated;
grant select on public.org_inbound_addresses, public.org_inbound_senders, public.email_events, public.emails, public.email_attachments to authenticated;
-- Coy's filing: only these columns.
grant update (customer_id, contact_id, job_id, match, match_note, status, filed_at, filed_by) on public.emails to authenticated;

-- Seed: the inbox and the forwarders, for the org Coy owns.
insert into public.org_inbound_addresses (address, org_id)
select 'intake-concrete@agentmail.to', m.org_id
from public.org_members m join auth.users u on u.id = m.user_id
where lower(u.email) = 'coysacco@gmail.com' and m.role = 'owner'
limit 1
on conflict (address) do nothing;

insert into public.org_inbound_senders (org_id, email)
select a.org_id, s.email
from public.org_inbound_addresses a
cross join (values ('admin@saccobuilt.com'), ('coysacco@gmail.com')) as s(email)
where a.address = 'intake-concrete@agentmail.to'
on conflict do nothing;

-- Fetch retries: every 5 minutes the function fetches attachments still
-- waiting (released from hold) or failed (up to three tries).
select cron.unschedule('email-intake-retry') where exists (select 1 from cron.job where jobname = 'email-intake-retry');
select cron.schedule(
  'email-intake-retry',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://cxiusuewtrvcpqequueh.supabase.co/functions/v1/email-intake',
    body := '{"retry": true}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'enrich_worker_token')
    ),
    timeout_milliseconds := 10000
  );
  $cron$
);
