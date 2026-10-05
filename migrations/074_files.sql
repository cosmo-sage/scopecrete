-- 074 — one name for files (Coy, 2026-10-03: "documents really needs to be
-- renamed 'files' across the board for continuity even in the database. The
-- idea is there is one place for documents and files and there is a badass
-- search filter system to get anything anytime.")
--
-- Every upload — photos, plans, specs, bids, quotes, receipts, emailed and
-- texted files — lives in ONE table, until now called `job_files` though it
-- long since holds people's, customers' and emails' files too. It is renamed
-- `files`. Nothing moves: rows, policies, triggers, indexes and foreign keys
-- follow a rename.
--
-- `job_files` stays as a view of `files` (security_invoker, so RLS is the
-- table's) so the deployed edge functions — read-files, email-intake,
-- bid-intake — keep working until each is redeployed with the new name; the
-- view goes once nothing reads it. The four database functions that named the
-- table are re-pointed. The storage bucket keeps its id (`job-files`): bucket
-- ids can't be renamed, and nobody sees it.
--
-- Not touched: `documents` / `document_events` (empty — a placeholder for
-- sending quotes and invoices to customers, not files) and `doc_templates`
-- (the proposal's warranty and contract text).

alter table public.job_files rename to files;

create view public.job_files with (security_invoker = true) as select * from public.files;
revoke all on public.job_files from anon, public;
grant select, insert, update, delete on public.job_files to authenticated, service_role;
comment on view public.job_files is 'Old name of public.files (migration 074) for edge functions not yet redeployed. Goes when nothing reads it.';

-- The functions that named the table.
do $$
declare r record; def text;
begin
  for r in select p.oid, p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('sc_files_claim', 'sc_plan_sheet_same_job', 'sc_search', 'sc_undo_bid') loop
    def := pg_get_functiondef(r.oid);
    def := replace(def, 'public.job_files', 'public.files');
    def := replace(def, 'from job_files f', 'from public.files f');            -- sc_search (its CTE is also called "files")
    def := replace(def, 'from job_files where', 'from public.files where');    -- sc_plan_sheet_same_job
    if def ~ '\mjob_files\M' then raise exception 'still names job_files: %', r.proname; end if;
    execute def;
  end loop;
end $$;
