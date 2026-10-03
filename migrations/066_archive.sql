-- 066 — Archive and delete, restorable (Coy, 2026-10-03: "I need to be able to
-- archive these threads … in bulk … there needs to be a way to delete customers
-- and vendors and jobs. Also Dusty needs the ability to do all of it").
--
-- Coy's answers: Delete removes from every list and is restorable (calls, texts
-- and files stay on record); an archived number that gets in touch again comes
-- back, like email.
--
--   * contacts.archived_at / archived_by / archived_reason — a thread archived
--     (or a vendor, or a customer's person, deleted). The thread list hides it
--     until they call or text after archived_at (worked out when read; no
--     trigger writes anything).
--   * customers.archived_at / archived_by / archived_reason — a deleted customer.
--   * jobs.archived_by — who; jobs already have archived_at / archived_reason.
--   * archive_log — one row per tap (or per Dusty plan step Coy applied): what
--     was archived, the stamp it was given, and undone_at. Undo puts back only
--     rows still carrying that stamp, so a later change is never reverted.
--
-- Additive. Member RLS by get_user_org_ids(); members may insert and set
-- undone_at on their org's rows; anon has nothing.

alter table public.contacts
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_reason text check (archived_reason is null or length(archived_reason) <= 200);
create index if not exists contacts_archived_idx on public.contacts (org_id, archived_at) where archived_at is not null;

alter table public.customers
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_reason text check (archived_reason is null or length(archived_reason) <= 200);
create index if not exists customers_archived_idx on public.customers (org_id, archived_at) where archived_at is not null;

alter table public.jobs
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create table if not exists public.archive_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  kind text not null check (kind in ('contact', 'customer', 'job')),
  action text not null check (action in ('archive', 'delete', 'restore')),
  -- The stamp given to every row it touched, and their ids by table:
  -- {"stamp": "...", "contacts": [...], "customers": [...], "jobs": [...]}
  undo jsonb not null default '{}'::jsonb,
  label text check (label is null or length(label) <= 300),
  via text not null default 'coy' check (via in ('coy', 'dusty')),
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists archive_log_org_idx on public.archive_log (org_id, created_at desc);

alter table public.archive_log enable row level security;
-- Supabase's default privileges give new tables full rights to anon and
-- authenticated; take them back, then grant only what members use.
revoke all on public.archive_log from anon, authenticated;
grant select, insert on public.archive_log to authenticated;
grant update (undone_at) on public.archive_log to authenticated;

create policy archive_log_member_select on public.archive_log for select to authenticated
  using (org_id = any (get_user_org_ids()));
create policy archive_log_member_insert on public.archive_log for insert to authenticated
  with check (org_id = any (get_user_org_ids()) and user_id = auth.uid());
create policy archive_log_member_update on public.archive_log for update to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
