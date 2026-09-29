-- 045 — Files Coy uploads, and the columns Dusty's reader fills (Coy,
-- 2026-09-29: "I need to be able to upload documents and photos for Dusty to
-- parse").
--
-- job_files already existed (written for plan sets, 0 rows). It gains:
--   * what a file belongs to beyond a job: a person (contact_id) and an area
--     of the job (section_id);
--   * what it is to Coy (category), where it came from (source), a note,
--     tags, whether it goes on the proposal, and a soft delete;
--   * Dusty's read: read_state, summary, facts (suggestions only — §2b),
--     extracted_text for search, page_count.
-- A private bucket, job-files, keyed {org_id}/…, with select / insert /
-- delete policies on the caller's own org folder — the message-media pattern.
--
-- Additive, plus one RESTRICTIVE change: anon's grants on job_files are
-- revoked (RLS already refused it; the grants should never have been there).

alter table public.job_files
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists section_id uuid references public.job_sections(id) on delete set null,
  add column if not exists category text check (category is null or category in
    ('photo', 'plan', 'spec', 'bid', 'vendor_quote', 'receipt', 'contract', 'other')),
  add column if not exists source text not null default 'upload' check (source in ('upload', 'text', 'email')),
  add column if not exists note text check (note is null or length(note) <= 2000),
  add column if not exists tags text[] not null default '{}',
  add column if not exists show_on_proposal boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists page_count integer,
  add column if not exists read_state text check (read_state is null or read_state in
    ('waiting', 'reading', 'read', 'failed', 'skipped')),
  add column if not exists read_at timestamptz,
  add column if not exists read_attempts integer not null default 0,
  add column if not exists read_error text,
  add column if not exists summary text,
  add column if not exists facts jsonb,
  add column if not exists extracted_text text;

alter table public.job_files drop constraint if exists job_files_kind_check;
alter table public.job_files add constraint job_files_kind_check
  check (kind = any (array['pdf', 'image', 'video', 'doc', 'sheet', 'other']));

create index if not exists job_files_job_idx on public.job_files (org_id, job_id, created_at desc) where deleted_at is null;
create index if not exists job_files_contact_idx on public.job_files (org_id, contact_id, created_at desc) where deleted_at is null;
create index if not exists job_files_read_idx on public.job_files (read_state, created_at) where deleted_at is null;

revoke all on public.job_files from anon;

-- ------------------------------------------------------------------ bucket

insert into storage.buckets (id, name, public, file_size_limit)
values ('job-files', 'job-files', false, 104857600)   -- 100 MB
on conflict (id) do nothing;

drop policy if exists job_files_objects_select on storage.objects;
create policy job_files_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'job-files'
         and (storage.foldername(name))[1] = any (array(select x::text from unnest(public.get_user_org_ids()) x)));

drop policy if exists job_files_objects_insert on storage.objects;
create policy job_files_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'job-files'
              and (storage.foldername(name))[1] = any (array(select x::text from unnest(public.get_user_org_ids()) x)));

drop policy if exists job_files_objects_delete on storage.objects;
create policy job_files_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'job-files'
         and (storage.foldername(name))[1] = any (array(select x::text from unnest(public.get_user_org_ids()) x)));
