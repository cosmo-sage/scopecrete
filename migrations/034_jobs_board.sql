-- 034 — the Jobs board: a Consultation stage, and where each job came from.
--
-- Coy, 2026-09-27: Scope becomes Jobs, a Kanban of the job's life cycle —
-- New lead · Consultation · Estimating · Follow up · W.I.P. · Complete · Lost.
-- Every stage but Consultation already has a status; 'consultation' (the site
-- visit) is added. Widening a CHECK, approved by Coy in conversation.
--
-- Who pays vs who sent it. jobs.contact_id / customer_id stay "the customer";
-- lead_source says how the job reached us, and referred_by_contact_id names
-- the person who sent it. Jeremy (Gulfline) feeding a homeowner's driveway:
-- the homeowner is the customer, lead_source='referral', referred_by=Jeremy.
-- LA Contracting's bid request: LA Contracting is the customer,
-- lead_source='gc_invite'. job_type (residential | commercial | public — shown
-- as Government) already exists.

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (status = any (array[
  'invited', 'lead', 'consultation', 'scoping', 'quoted', 'won', 'lost',
  'scheduled', 'in_progress', 'complete', 'closed']));

alter table public.jobs
  add column if not exists lead_source text
    check (lead_source is null or lead_source in
      ('website', 'referral', 'gc_invite', 'lead_gen', 'repeat', 'direct', 'other')),
  add column if not exists referred_by_contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists stage_changed_at timestamptz;

create index if not exists jobs_org_status on public.jobs (org_id, status);
