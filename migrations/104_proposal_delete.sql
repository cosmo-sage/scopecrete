-- 104_proposal_delete.sql
-- Coy, 2026-10-12: "How do I delete proposals?"
--
-- A proposal's number (SE-26-0008-D) is worked out on read from every row of
-- job_proposals: the job's place in the year comes from its FIRST proposal.
-- Taking a row out would renumber other jobs, so a sent (final) version is
-- never removed — it is marked deleted and left out of every list. A draft
-- with an earlier version under it is deleted outright by the app (no change
-- here); a job's only draft is reset with Start over instead.
--
-- Additive:
--   * job_proposals.deleted_at / deleted_by;
--   * sc_job_proposal_guard(): a final still never changes, except to set or
--     clear deleted_at / deleted_by — and never on a version the customer
--     signed (a signed link on it); a final is never DELETEd (only marked).
-- RLS and grants unchanged.

alter table public.job_proposals
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create or replace function public.sc_job_proposal_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'final' then
      raise exception 'a sent version is not removed — it is marked deleted';
    end if;
    return old;
  end if;
  if old.status = 'final' then
    if (to_jsonb(new) - 'deleted_at' - 'deleted_by' - 'updated_at') is distinct from (to_jsonb(old) - 'deleted_at' - 'deleted_by' - 'updated_at') then
      raise exception 'a final proposal does not change — start a new version';
    end if;
    if new.deleted_at is not null and old.deleted_at is null
       and exists (select 1 from documents d where d.proposal_id = old.id and d.signed_at is not null) then
      raise exception 'the customer signed this version — it stays';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace trigger job_proposals_guard before update or delete on public.job_proposals
  for each row execute function public.sc_job_proposal_guard();
