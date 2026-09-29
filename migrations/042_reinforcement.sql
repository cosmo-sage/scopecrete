-- 042 — Reinforcement, priced by its own unit, with defaults per category.
--
-- Coy, 2026-09-28 (Vercel, on the section card): "Where do I set the
-- reinforcement? It should be in the materials section and I can have default
-- settings for different categories: residential driveways are 6x6 10 gauge
-- wire mesh, for example." And: priced by its own unit — mesh by the sheet,
-- rebar by the stick or the foot, fiber per yard.
--
--   * org_reinforcement_types — Coy's list, each with the numbers its quantity
--     rule needs (src/lib/engine reinforcementQty). Nothing is defaulted: a
--     missing number blocks the price and is named.
--   * org_reinforcement_defaults — job type × work type → a type. A new
--     section takes it, labelled as the default; Coy can change it.
--   * job_sections.reinforcement_type_id / reinforcement_source — what the
--     section uses and whether Coy picked it ('set') or it came from the
--     defaults ('default'). The old free-text `rebar` column stays as a note.
--
-- Additive: two tables with member policies, two nullable columns.

create table if not exists public.org_reinforcement_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('mesh', 'rebar', 'fiber', 'other')),
  unit text not null check (unit in ('sheet', 'stick', 'lf', 'lb', 'bag', 'sqft')),
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  sheet_sqft numeric check (sheet_sqft is null or sheet_sqft > 0),
  spacing_in numeric check (spacing_in is null or spacing_in > 0),
  stick_ft numeric check (stick_ft is null or stick_ft > 0),
  lap_pct numeric check (lap_pct is null or (lap_pct >= 0 and lap_pct <= 100)),
  per_cy numeric check (per_cy is null or per_cy > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists org_reinforcement_types_org_idx on public.org_reinforcement_types (org_id);

create table if not exists public.org_reinforcement_defaults (
  org_id uuid not null references public.orgs(id) on delete cascade,
  job_type text not null check (job_type in ('residential', 'commercial', 'public')),
  work_type text not null,
  reinforcement_type_id uuid not null references public.org_reinforcement_types(id) on delete cascade,
  primary key (org_id, job_type, work_type)
);

alter table public.job_sections
  add column if not exists reinforcement_type_id uuid references public.org_reinforcement_types(id) on delete set null,
  add column if not exists reinforcement_source text check (reinforcement_source is null or reinforcement_source in ('set', 'default'));

alter table public.org_reinforcement_types enable row level security;
alter table public.org_reinforcement_defaults enable row level security;

drop policy if exists org_reinforcement_types_member on public.org_reinforcement_types;
create policy org_reinforcement_types_member on public.org_reinforcement_types
  for all to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
drop policy if exists org_reinforcement_defaults_member on public.org_reinforcement_defaults;
create policy org_reinforcement_defaults_member on public.org_reinforcement_defaults
  for all to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));

revoke all on public.org_reinforcement_types, public.org_reinforcement_defaults from anon;
