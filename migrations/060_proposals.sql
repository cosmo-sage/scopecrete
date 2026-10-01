-- 060 — Proposals (Coy, 2026-10-01: "Go ahead with the proposals"; Claude
-- Design, design/proposal).
--
--   * org_project_types — Residential / Commercial / Government (and any Coy
--     adds): each type's O.H. and margin defaults (a new budget copies them),
--     what the proposal shows (item prices, qty · unit, the tax line), the
--     default draw schedule, and which warranty and contract load. Edited in
--     Price book → Defaults (Coy: defaults live there, per type).
--   * doc_templates — warranty and contract text, by project type. Seeded
--     from the handoff's text (written from Coy's won quotes) as STARTER text
--     — "{org}" stands for the org's name, a made-up license number is a
--     blank — marked starter until Coy saves his own.
--   * job_proposals — a job's proposal: which tier, what is shown or hidden,
--     the draws, the warranty and terms as edited, the cover photo, the
--     internal sub split. One draft per job; "final" freezes the priced
--     document in `snapshot` and the next version starts a new draft.
--
-- Additive. Member RLS by get_user_org_ids(); anon has nothing.

create table if not exists public.doc_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  kind text not null check (kind in ('warranty', 'terms')),
  name text not null check (length(btrim(name)) between 1 and 80),
  project_types text[] not null default '{}',
  title text check (title is null or length(title) <= 160),
  body text check (body is null or length(body) <= 20000),
  clauses jsonb check (clauses is null or (jsonb_typeof(clauses) = 'array' and jsonb_array_length(clauses) <= 60)),
  starter boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, kind, name)
);

create table if not exists public.org_project_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{1,30}$'),
  label text not null check (length(btrim(label)) between 1 and 40),
  overhead_pct numeric check (overhead_pct is null or (overhead_pct >= 0 and overhead_pct <= 200)),
  margin_pct numeric check (margin_pct is null or (margin_pct >= 0 and margin_pct < 100)),
  show_item_prices boolean not null default false,
  show_qty boolean not null default false,
  show_tax_line boolean not null default false,
  draws jsonb not null default '[]'::jsonb check (jsonb_typeof(draws) = 'array' and jsonb_array_length(draws) <= 20),
  warranty_template_id uuid references public.doc_templates(id) on delete set null,
  terms_template_id uuid references public.doc_templates(id) on delete set null,
  cover text not null default 'photo' check (cover in ('photo', 'none')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create table if not exists public.job_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  status text not null default 'draft' check (status in ('draft', 'final')),
  option_id uuid references public.estimate_options(id) on delete set null,
  project_type text,
  display jsonb not null default '{}'::jsonb check (jsonb_typeof(display) = 'object'),
  draws jsonb not null default '[]'::jsonb check (jsonb_typeof(draws) = 'array' and jsonb_array_length(draws) <= 20),
  warranty jsonb not null default '{}'::jsonb check (jsonb_typeof(warranty) = 'object'),
  terms jsonb not null default '{}'::jsonb check (jsonb_typeof(terms) = 'object'),
  scope_intro text check (scope_intro is null or length(scope_intro) <= 4000),
  cover_file_id uuid references public.job_files(id) on delete set null,
  split text not null default 'none' check (split in ('none', '20_80', '30_70')),
  snapshot jsonb,
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, version),
  check (status = 'draft' or snapshot is not null)
);
create unique index if not exists job_proposals_one_draft on public.job_proposals (job_id) where status = 'draft';
create index if not exists job_proposals_org_idx on public.job_proposals (org_id, updated_at desc);

-- A final proposal is what the customer was shown: it never changes again.
create or replace function public.sc_job_proposal_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status = 'final' then
    raise exception 'a final proposal does not change — start a new version';
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;
drop trigger if exists job_proposals_guard on public.job_proposals;
create trigger job_proposals_guard before update on public.job_proposals
  for each row execute function public.sc_job_proposal_guard();

alter table public.doc_templates enable row level security;
alter table public.org_project_types enable row level security;
alter table public.job_proposals enable row level security;
drop policy if exists doc_templates_member on public.doc_templates;
create policy doc_templates_member on public.doc_templates for all to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
drop policy if exists org_project_types_member on public.org_project_types;
create policy org_project_types_member on public.org_project_types for all to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
drop policy if exists job_proposals_member on public.job_proposals;
create policy job_proposals_member on public.job_proposals for all to authenticated
  using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
revoke all on public.doc_templates, public.org_project_types, public.job_proposals from anon;
grant select, insert, update, delete on public.doc_templates, public.org_project_types, public.job_proposals to authenticated;

-- Seed every org: the starter templates, then the three types pointing at them.
insert into public.doc_templates (org_id, kind, name, project_types, title, body, clauses, starter)
select o.id, t.kind, t.name, t.types, t.title, t.body, t.clauses, true
from public.orgs o cross join (values
    ('warranty', '1-yr limited concrete', array['residential','commercial','public'], 'Limited warranty — concrete work', '{org} warrants its workmanship and Contractor-supplied materials to be free from defects for 1 year from Substantial Completion. Covered: major scaling, spalling or pop-outs affecting structural integrity; settlement or heaving over ¾" across 10 ft from improper subgrade by Contractor; reinforcement failing to stay in position. Not covered: cracking of any kind, surface conditions (crazing, discoloration, efflorescence), weather and ground movement, owner or third-party actions, tie-ins to existing concrete, and manufacturer products. Remedy at Contractor''s option: repair, replace or pro-rata credit. Written notice within 30 days of discovery.', null::jsonb),
    ('warranty', '5-yr general (legacy)', array['residential'], 'General warranty', 'We, {org} (Contractor), guarantee that all labor and materials furnished and work performed for the above project are in accordance with Code standards and the Contract Documents, and will be free from defects due to defective materials or workmanship for 5 years from Substantial Completion. Should Contractor fail to correct defective work within 60 days of written notice, Owner may correct and charge Contractor.', null),
    ('warranty', 'Owner spec warranty', array['commercial'], 'Warranty per owner specification', 'Contractor provides the warranty required by Division 01 of the project specifications, not less than one (1) year from Substantial Completion, and passes through all manufacturer warranties for ready-mix, admixtures, sealers and curing compounds.', null),
    ('warranty', 'Per contract documents', array['public'], 'Warranty', 'Warranty term, coverage and notice provisions are as set out in the Contract Documents and the General Conditions of the awarding authority. Nothing in this proposal reduces those obligations.', null),
    ('terms', 'Residential home-improvement (LA)', array['residential'], 'Residential home-improvement (LA)', null, '[{"h": "Payment", "b": "A 10% deposit is due before scheduling. Balance per the payment schedule; final payment before the crew leaves the site. Returned checks $35. Accounts 10 days past due accrue 1.5% per month."}, {"h": "Scope", "b": "This proposal covers only the work described. Unforeseen conditions — buried debris, unstable subgrade, unmarked utilities — are quoted separately before work proceeds."}, {"h": "Site access & 811", "b": "Owner provides clear access. Contractor is not responsible for unmarked irrigation, cable or private utilities; Owner calls 811 where required."}, {"h": "Weather", "b": "Concrete placement is weather dependent. Contractor may reschedule for rain, freeze or heat with notice."}, {"h": "Right to cancel", "b": "Owner may cancel in writing within three business days of signing (LA R.S. 9:3538)."}]'::jsonb),
    ('terms', 'Simple T&C', array['residential'], 'Simple T&C', null, '[{"h": "Payment", "b": "Per the schedule above."}, {"h": "Changes", "b": "Written change orders only."}, {"h": "Weather", "b": "Delays due to weather are possible."}]'::jsonb),
    ('terms', 'Commercial subcontract', array['commercial'], 'Commercial subcontract', null, '[{"h": "Agreement", "b": "Work is performed under the Subcontract Agreement between General Contractor and {org}; this proposal becomes Exhibit A (scope and price) on execution."}, {"h": "Payment", "b": "Progress billing monthly on AIA G702/G703; net 30 from GC receipt of Owner payment; retainage not to exceed 10%, released at substantial completion of Contractor''s work."}, {"h": "Schedule", "b": "Mobilization within 5 working days of notice to proceed and a released, graded pad. Delay by others extends time, not price, except standby at $185/hr per crew."}, {"h": "Exclusions", "b": "Layout beyond control points, testing and inspections, permits, dewatering, rock excavation, winter protection, bonds unless listed."}, {"h": "Insurance", "b": "GL $1M/$2M, auto $1M, WC statutory, umbrella $2M; GC named additional insured."}]'::jsonb),
    ('terms', 'Owner-direct commercial', array['commercial'], 'Owner-direct commercial', null, '[{"h": "Payment", "b": "Net 30 from invoice, progress billed monthly."}, {"h": "Changes", "b": "Written change orders priced at cost plus 15% overhead and 10% profit."}, {"h": "Exclusions", "b": "Permits, testing, dewatering, rock, bonds unless listed."}]'::jsonb),
    ('terms', 'Public works · LA R.S. 38', array['public'], 'Public works · LA R.S. 38', null, '[{"h": "Bid form", "b": "This proposal is submitted on the awarding authority''s bid form and incorporates the Instructions to Bidders, General Conditions and Addenda 1–2 acknowledged herein."}, {"h": "Bonds", "b": "Bid bond 5% enclosed. Performance and payment bonds at 100% of contract price furnished on award (LA R.S. 38:2219)."}, {"h": "Wages", "b": "Prevailing wage rates per the wage decision in the contract documents; certified payroll submitted weekly."}, {"h": "Retainage & payment", "b": "Retainage per LA R.S. 38:2248; payment within 45 days of approved estimate; final payment 45 days after acceptance and clear lien period."}, {"h": "Contractor license", "b": "Louisiana State Licensing Board for Contractors #________ (your license number), Building Construction."}]'::jsonb),
    ('terms', 'Federal · FAR 52 clauses', array['public'], 'Federal · FAR 52 clauses', null, '[{"h": "Clauses", "b": "FAR 52.222-6 Davis-Bacon, 52.236-5 Material and Workmanship, 52.243-4 Changes, 52.249-10 Default incorporated by reference."}, {"h": "Payment", "b": "Per FAR 52.232-5 progress payments; retainage at CO discretion."}]'::jsonb)
) as t(kind, name, types, title, body, clauses)
on conflict (org_id, kind, name) do nothing;

insert into public.org_project_types (org_id, key, label, overhead_pct, margin_pct, show_item_prices, show_qty, show_tax_line, draws, warranty_template_id, terms_template_id, cover, sort_order)
select o.id, v.key, v.label, m.default_overhead_pct, m.default_margin_pct, v.items, v.qty, v.tax, v.draws::jsonb,
  (select id from public.doc_templates d where d.org_id = o.id and d.kind = 'warranty' and d.name = v.warranty),
  (select id from public.doc_templates d where d.org_id = o.id and d.kind = 'terms' and d.name = v.terms),
  v.cover, v.sort
from public.orgs o
left join public.org_money_settings m on m.org_id = o.id
cross join (values
  ('residential', 'Residential', false, false, false,
   '[{"pct":10,"when":"Deposit — on signing, holds your date"},{"pct":50,"when":"Materials on site and old concrete removed"},{"pct":40,"when":"Completion per the scope above"}]',
   '1-yr limited concrete', 'Residential home-improvement (LA)', 'photo', 0),
  ('commercial', 'Commercial', true, true, true,
   '[{"pct":90,"when":"Progress billing monthly, AIA G702/G703, net 30"},{"pct":10,"when":"Retainage released at substantial completion"}]',
   'Owner spec warranty', 'Commercial subcontract', 'photo', 1),
  ('public', 'Government', true, true, true,
   '[{"pct":95,"when":"Monthly estimates per the contract"},{"pct":5,"when":"Retainage per LA R.S. 38:2248"}]',
   'Per contract documents', 'Public works · LA R.S. 38', 'none', 2)
) as v(key, label, items, qty, tax, draws, warranty, terms, cover, sort)
on conflict (org_id, key) do nothing;
