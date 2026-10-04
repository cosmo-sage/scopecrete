-- 050 — Step 3b (Coy, 2026-09-29: "go ahead with step 3b"). Prices come only
-- from cost cards; assemblies fill an area with Coy's default cards;
-- reinforcement is a card. Plus the clean-up of his JobTread import that he
-- chose: cost codes become groups, and only concrete cards keep the counting
-- rule the import guessed from the unit.
--
-- Additive, plus a data change to cost_items that is snapshotted first
-- (cost_items_backup_050) so it can be put back.

-- ---------------------------------------------------------------- assemblies

create table if not exists public.cost_assemblies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  job_type text check (job_type is null or job_type in ('residential', 'commercial', 'public')),
  work_type text check (work_type is null or work_type in ('slab', 'driveway', 'patio', 'sidewalk', 'footing', 'curb', 'demo', 'prep', 'other')),
  auto_load boolean not null default true,
  reinforcement_item_id uuid references public.cost_items(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One assembly fills a given kind of area on its own; others are loaded by hand.
create unique index if not exists cost_assemblies_one_auto on public.cost_assemblies
  (org_id, coalesce(job_type, '*'), coalesce(work_type, '*')) where auto_load;
alter table public.cost_assemblies enable row level security;
drop policy if exists cost_assemblies_member on public.cost_assemblies;
create policy cost_assemblies_member on public.cost_assemblies
  for all to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
revoke all on public.cost_assemblies from anon;
grant select, insert, update, delete on public.cost_assemblies to authenticated;

create table if not exists public.cost_assembly_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  assembly_id uuid not null references public.cost_assemblies(id) on delete cascade,
  cost_item_id uuid not null references public.cost_items(id) on delete cascade,
  quantity numeric check (quantity is null or quantity >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cost_assembly_items_asm_idx on public.cost_assembly_items (assembly_id, sort_order);
alter table public.cost_assembly_items enable row level security;
drop policy if exists cost_assembly_items_member on public.cost_assembly_items;
create policy cost_assembly_items_member on public.cost_assembly_items
  for all to authenticated using (org_id = any (get_user_org_ids())) with check (org_id = any (get_user_org_ids()));
revoke all on public.cost_assembly_items from anon;
grant select, insert, update, delete on public.cost_assembly_items to authenticated;

-- A line says which assembly put it there, and which one is an area's reinforcement.
alter table public.estimate_line_items
  add column if not exists assembly_id uuid references public.cost_assemblies(id) on delete set null,
  add column if not exists section_role text check (section_role is null or section_role = 'reinforcement');
create unique index if not exists estimate_line_items_one_reinforcement on public.estimate_line_items
  (estimate_id, section_id, option_id) where section_role = 'reinforcement' and option_id is not null;
create unique index if not exists estimate_line_items_one_reinforcement_shared on public.estimate_line_items
  (estimate_id, section_id) where section_role = 'reinforcement' and option_id is null;

-- ---------------------------------------------------------------- reinforcement is a card

alter table public.job_sections
  add column if not exists reinforcement_item_id uuid references public.cost_items(id) on delete set null;

-- ---------------------------------------------------------------- catalog clean-up (Coy's choices)

create table if not exists public.cost_items_backup_050 (
  id uuid primary key,
  org_id uuid not null,
  description text,
  cost_group_id uuid,
  qty_rule text,
  rule_params jsonb,
  saved_at timestamptz not null default now()
);
alter table public.cost_items_backup_050 enable row level security;
revoke all on public.cost_items_backup_050 from anon, authenticated;

insert into public.cost_items_backup_050 (id, org_id, description, cost_group_id, qty_rule, rule_params)
select id, org_id, description, cost_group_id, qty_rule, rule_params from public.cost_items
on conflict (id) do nothing;

-- One group per cost code written in a description ("… · Cost code 2800 Concrete").
with codes as (
  select distinct org_id, btrim(substring(description from 'Cost code (\d{3,5} [^·]+?)\s*$')) as code
  from public.cost_items
  where description ~ 'Cost code \d{3,5} '
)
insert into public.cost_groups (org_id, name, sort_order)
select c.org_id, c.code, row_number() over (partition by c.org_id order by c.code)
from codes c
where c.code is not null
  and not exists (select 1 from public.cost_groups g where g.org_id = c.org_id and lower(g.name) = lower(c.code));

update public.cost_items ci
set cost_group_id = g.id,
    description = nullif(btrim(regexp_replace(ci.description, '\s*(·\s*)?Cost code \d{3,5} [^·]+?\s*$', '')), ''),
    updated_at = now()
from public.cost_groups g
where ci.cost_group_id is null
  and g.org_id = ci.org_id
  and lower(g.name) = lower(btrim(substring(ci.description from 'Cost code (\d{3,5} [^·]+?)\s*$')));

-- Slab-geometry counting rules stay only on concrete cards; by the day and
-- once per job are not geometry and stay everywhere.
update public.cost_items ci
set qty_rule = 'manual', rule_params = '{}'::jsonb, updated_at = now()
where ci.qty_rule in ('per_cy', 'per_sqft', 'per_lf_perimeter', 'per_sheet', 'per_stick')
  and not exists (select 1 from public.cost_groups g where g.id = ci.cost_group_id and g.name ~* '^\d{3,5} concrete$');
